import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_policyrequestconnectorsService } from '../../../../../generated/services/Cat_policyrequestconnectorsService';
import { Cat_policyrequestanswersService } from '../../../../../generated/services/Cat_policyrequestanswersService';
import { Cat_policyrequestparticipantsService } from '../../../../../generated/services/Cat_policyrequestparticipantsService';
import { Cat_powershieldcustomconnectorpatternsService } from '../../../../../generated/services/Cat_powershieldcustomconnectorpatternsService';
import type { Cat_policyrequestsBase } from '../../../../../generated/models/Cat_policyrequestsModel';
import type { Cat_policyrequestscat_status } from '../../../../../generated/models/Cat_policyrequestsModel';
import type { Cat_policyrequestenvironmentsBase } from '../../../../../generated/models/Cat_policyrequestenvironmentsModel';
import type { Cat_policyrequestconnectorsBase } from '../../../../../generated/models/Cat_policyrequestconnectorsModel';
import type { Cat_policyrequestanswersBase } from '../../../../../generated/models/Cat_policyrequestanswersModel';
import type { Cat_policyrequestparticipantsBase } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { Cat_policyrequestparticipantscat_role } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { Cat_powershieldcustomconnectorpatternsBase } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import type { Cat_powershieldcustomconnectorpatternscat_datagroup } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import { AnnotationsService } from '../../../../../generated/services/AnnotationsService';
import type { AnnotationsBase } from '../../../../../generated/models/AnnotationsModel';
import type { RequestAnswerCreate } from '../../../models/requestAnswer';
import type { ParticipantRole, RequestStatus } from '../../../models/status';
import { IN_PROGRESS_BLOCKING_STATUSES } from '../../../models/status';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import { fileToBase64 } from '../../utils/fileUtils';
import { reconcileChildRecords } from './wizardReconcileService';
import { andRequestType, assertRequestType, REQUEST_TYPE_CONNECTOR } from './requestType';

// ─────────────────────────────────────────────────────────────────────────────
// Option-set mappings
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_DOMAIN_TO_NUM: Record<RequestStatus, Cat_policyrequestscat_status> = {
  'Draft': 1, 'Submitted': 2, 'Withdrawn': 3, 'AutoRejected': 4,
  'UnderReview': 5, 'Approved': 6, 'Rejected': 7, 'Implementing': 8,
  'Implemented': 9, 'ImplementedWithErrors': 10,
} as Record<RequestStatus, Cat_policyrequestscat_status>;

const ROLE_DOMAIN_TO_NUM: Record<ParticipantRole, Cat_policyrequestparticipantscat_role> = {
  'Participant': 1,
} as Record<ParticipantRole, Cat_policyrequestparticipantscat_role>;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Participant shape used in the wizard review step and submit payload. */
export interface WizardParticipant {
  dvUserId: string;
  aadObjectId: string;
  upn: string;
  displayName: string;
  role: ParticipantRole;
}

export interface WizardEnvironment {
  environmentId: string;  // PP environment unique ID (from API value.name)
  displayName: string;    // PP environment display name (from API value.properties.displayName)
}

export interface CustomConnectorPatternCreate {
  hostUrlPattern: string;
  dataGroup: 1 | 2 | 3;
  order: number;
}

export interface WizardSubmitPayload {
  serviceTreeId: string;
  createdByAadObjectId: string;
  createdByUpn: string;
  justification: string;
  environments: WizardEnvironment[];
  connectors: Array<{ connectorId: string; displayName: string; connectorKey: string; connectorDetailsUrl?: string; connectorName?: string }>;
  /** Per-connector action overrides from the maker. Key = connectorId. */
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: CustomConnectorPatternCreate[];
  answers: RequestAnswerCreate[];
  participants: WizardParticipant[];
  supportingDocument?: File;
  /** Set when re-submitting an existing draft. Skips header creation. */
  draftRequestId?: string;
  /** Environment Group lookup (optional); persisted as cat_EnvironmentGroup on header. */
  environmentGroupId?: string;
}

export interface SaveDraftPayload {
  serviceTreeId: string;
  createdByAadObjectId: string;
  createdByUpn: string;
  justification: string;        // may be empty or < 20 chars for drafts
  environments: WizardEnvironment[];
  connectors: Array<{ connectorId: string; displayName: string; connectorKey: string; connectorDetailsUrl?: string; connectorName?: string }>;
  /** Per-connector action overrides from the maker. Key = connectorId. */
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: CustomConnectorPatternCreate[];
  answers: RequestAnswerCreate[];
  participants: WizardParticipant[];
  supportingDocument?: File;
  /** Set when re-saving an existing draft. */
  draftRequestId?: string;
  /** Environment Group lookup (optional); persisted as cat_EnvironmentGroup on header. */
  environmentGroupId?: string;
}

export interface WizardSubmitResult {
  requestId: string;
  requestNumber: string;
}

/** Thrown when the wizard submit fails after the header record was already created. */
export class WizardSubmitError extends Error {
  partialRequestId?: string;
  constructor(message: string, partialRequestId?: string) {
    super(message);
    this.name = 'WizardSubmitError';
    this.partialRequestId = partialRequestId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the first in-progress request for a Service Tree, or null if none exists.
 *
 * _cat_servicetreeid_value is the OData lookup value column — bare GUID (no quotes).
 * cat_status values are integers (option set) — no single quotes.
 *
 * @param excludeRequestId  Exclude this request ID (used in draft-edit mode to
 *                          avoid conflicting with the draft being edited).
 */
export async function checkInProgressConflict(
  serviceTreeId: string,
  excludeRequestId?: string,
): Promise<{ requestId: string; requestNumber: string } | null> {
  const statusFilter = IN_PROGRESS_BLOCKING_STATUSES
    .map((s) => `cat_status eq ${STATUS_DOMAIN_TO_NUM[s]}`)
    .join(' or ');

  let filter = `_cat_servicetreeid_value eq ${serviceTreeId} and (${statusFilter})`;

  if (excludeRequestId) {
    filter += ` and cat_policyrequestid ne ${excludeRequestId}`;
  }

  // Isolation (SC-002): a Credit request must never block a Connector request
  // (or vice versa) for the same Service Tree.
  filter = andRequestType(filter, 'Connector');

  const result = await Cat_policyrequestsService.getAll({
    filter,
    select: ['cat_policyrequestid', 'cat_policyrequestname'],
    top: 1,
  });

  const first = result.data?.[0];
  if (first) {
    console.warn('[WizardSubmit] Conflict found:', first.cat_policyrequestname, '| serviceTreeId:', serviceTreeId, '| excludeRequestId:', excludeRequestId);
  } else {
    console.log('[WizardSubmit] No conflict for serviceTreeId:', serviceTreeId, '| excludeRequestId:', excludeRequestId);
  }

  if (!first) return null;

  return {
    requestId: first.cat_policyrequestid,
    requestNumber: first.cat_policyrequestname ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Prefix used in annotation notetext to identify supporting document attachments. */
export const SUPPORTING_DOC_PREFIX = 'SUPPORTING_DOC:';

// ─────────────────────────────────────────────────────────────────────────────
// Draft child record deletion (edit mode) — with verification + retry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic helper: deletes child records by fetching IDs, deleting each, then
 * verifying none remain. Retries once if records persist after the first pass.
 * Throws if records still remain after the retry.
 */
export async function deleteChildRecordsWithVerification<T>(opts: {
  label: string;
  getAll: () => Promise<{ success?: boolean; data?: T[]; error?: { message?: string } }>;
  getId: (record: T) => string;
  deleteOne: (id: string) => Promise<void>;
}): Promise<void> {
  const { label, getAll, getId, deleteOne } = opts;

  const result = await getAll();
  if (!result.success) {
    throw new Error(`[WizardSubmit] Failed to fetch existing ${label} for deletion: ${result.error?.message ?? 'Unknown error'}`);
  }

  const records = result.data ?? [];
  console.log(`[WizardSubmit] Deleting ${label}: ${records.length} record(s) to remove`);

  for (const rec of records) {
    await deleteOne(getId(rec));
  }

  // Verify: re-query to ensure records were actually deleted
  const verify = await getAll();
  const remaining = verify.data ?? [];

  if (remaining.length > 0) {
    console.warn(`[WizardSubmit] ${label}: ${remaining.length} record(s) survived deletion — retrying`);
    for (const rec of remaining) {
      await deleteOne(getId(rec));
    }

    // Final verification after retry
    const finalCheck = await getAll();
    const stillRemaining = finalCheck.data ?? [];
    if (stillRemaining.length > 0) {
      console.error(`[WizardSubmit] ${label}: ${stillRemaining.length} record(s) still remain after retry`);
      throw new Error(`Failed to delete all ${label} for request after retry - ${stillRemaining.length} record(s) remain.`);
    }
    console.log(`[WizardSubmit] ${label}: retry succeeded — all records deleted`);
  } else {
    console.log(`[WizardSubmit] ${label}: verified — 0 records remain`);
  }
}

async function deleteExistingSupportingDocument(requestId: string): Promise<void> {
  await deleteChildRecordsWithVerification({
    label: 'supporting-documents',
    getAll: () => AnnotationsService.getAll({
      filter: `notetext eq '${SUPPORTING_DOC_PREFIX}${requestId}'`,
      select: ['annotationid'],
    }),
    getId: (a) => a.annotationid,
    deleteOne: (id) => AnnotationsService.delete(id),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared child record write helper
// ─────────────────────────────────────────────────────────────────────────────

interface ChildRecordData {
  environments: WizardEnvironment[];
  connectors: Array<{ connectorId: string; displayName: string; connectorKey: string; connectorDetailsUrl?: string; connectorName?: string }>;
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: CustomConnectorPatternCreate[];
  answers: RequestAnswerCreate[];
  participants: WizardParticipant[];
}

/**
 * Writes all child records for a request. In edit mode, uses smart
 * reconciliation (diff-based UPSERT) to only create/delete/update
 * records that actually changed. In new-record mode, bulk-creates all.
 */
async function writeChildRecords(
  requestId: string,
  data: ChildRecordData,
  isEditMode: boolean,
): Promise<void> {
  console.log(`[WizardSubmit] writeChildRecords — requestId: ${requestId} | isEditMode: ${isEditMode} | envs: ${data.environments.length} | connectors: ${data.connectors.length} | patterns: ${data.customConnectorPatterns.length} | answers: ${data.answers.length} | participants: ${data.participants.length}`);

  if (isEditMode) {
    console.log('[WizardSubmit] Edit mode — using smart reconciliation (diff-based UPSERT)');
    await reconcileChildRecords(requestId, data);
    return;
  }

  // Environments
  // cat_environmentguid = PP environment unique ID (value.name from Get-Environments API)
  // cat_environmentname = PP environment display name
  // cat_environmentid FK is deprecated; not populated.
  for (const env of data.environments) {
    await Cat_policyrequestenvironmentsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_environmentguid: env.environmentId,
      cat_environmentname: env.displayName,
    } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>);
  }

  // Connectors
  for (const conn of data.connectors) {
    const overrides = data.connectorActionOverrides[conn.connectorId] ?? {};
    await Cat_policyrequestconnectorsService.create({
      cat_policyrequestconnectorname: conn.connectorKey,
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_connectorid@odata.bind': `/cat_connectors(${conn.connectorId})`,
      cat_actionoverrides: JSON.stringify(
        Object.entries(overrides)
          .map(([actionId, behavior]) => ({ actionId, behavior }))
      ),
      cat_connectordisplayname: conn.displayName,
      ...(conn.connectorDetailsUrl ? { cat_connectorurl: conn.connectorDetailsUrl } : {}),
    } as Omit<Cat_policyrequestconnectorsBase, 'cat_policyrequestconnectorid'>);
  }

  // Custom Connector Patterns
  for (const pattern of data.customConnectorPatterns) {
    await Cat_powershieldcustomconnectorpatternsService.create({
      'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_name: pattern.hostUrlPattern,
      cat_datagroup: pattern.dataGroup as Cat_powershieldcustomconnectorpatternscat_datagroup,
      cat_order: String(pattern.order),
    } as Omit<Cat_powershieldcustomconnectorpatternsBase, 'cat_powershieldcustomconnectorpatternid'>);
  }

  // Answers
  for (const answer of data.answers) {
    await Cat_policyrequestanswersService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_questionid@odata.bind': `/cat_questions(${answer.questionId})`,
      cat_answervalue: answer.answerValue,
      cat_questiontextsnapshot: answer.questionTextSnapshot,
    } as Omit<Cat_policyrequestanswersBase, 'cat_policyrequestanswerid'>);
  }

  // Participants
  for (const p of data.participants) {
    await Cat_policyrequestparticipantsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_Participant@odata.bind': `/systemusers(${p.dvUserId})`,
      cat_participantaadobjectid: p.aadObjectId,
      cat_participantupn: p.upn,
      cat_policyrequestparticipantname: p.displayName,
      cat_role: ROLE_DOMAIN_TO_NUM[p.role],
    } as Omit<Cat_policyrequestparticipantsBase, 'cat_policyrequestparticipantid'>);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create or update header record
// ─────────────────────────────────────────────────────────────────────────────

async function createOrUpdateHeader(
  serviceTreeId: string,
  createdByAadObjectId: string,
  createdByUpn: string,
  justification: string,
  draftRequestId?: string,
  environmentGroupId?: string,
): Promise<string> {
  // Build the environment group binding (or null to clear)
  const envGroupBinding: Record<string, unknown> = environmentGroupId
    ? { 'cat_EnvironmentGroup@odata.bind': `/cat_powershieldenvironmentgroups(${environmentGroupId})` }
    : { cat_environmentgroup: null };

  if (draftRequestId) {
    // Isolation (SC-002 / FR-017): this is an edit of an existing row, so reject
    // a non-Connector draft BEFORE mutating it (a Credit id must never be
    // written through the connector wizard).
    const existing = await Cat_policyrequestsService.get(draftRequestId, {
      select: ['cat_requesttype'] as string[],
    });
    if (!existing.success || !existing.data) {
      throw new WizardSubmitError(existing.error?.message ?? 'Failed to load draft request.');
    }
    assertRequestType(existing.data.cat_requesttype, 'Connector');

    console.log(`[WizardSubmit] Updating existing header — draftRequestId: ${draftRequestId}`);
    const updateResult = await Cat_policyrequestsService.update(draftRequestId, {
      'cat_servicetreeid@odata.bind': `/cat_servicetrees(${serviceTreeId})`,
      cat_createdbyaadobjectid: createdByAadObjectId,
      cat_createdbyupn: createdByUpn,
      cat_justification: justification,
      cat_requesttype: REQUEST_TYPE_CONNECTOR, // isolation (T011): upgrade any legacy null row to an explicit Connector stamp
      ...envGroupBinding,
    });
    if (!updateResult.success) {
      throw new WizardSubmitError(
        updateResult.error?.message ?? 'Failed to update draft request.',
      );
    }
    return draftRequestId;
  }

  console.log('[WizardSubmit] Creating new header record');
  const createResult = await Cat_policyrequestsService.create({
    'cat_servicetreeid@odata.bind': `/cat_servicetrees(${serviceTreeId})`,
    cat_createdbyaadobjectid: createdByAadObjectId,
    cat_createdbyupn: createdByUpn,
    cat_justification: justification,
    cat_status: STATUS_DOMAIN_TO_NUM['Draft'],
    cat_requesttype: REQUEST_TYPE_CONNECTOR, // isolation (T011): never rely on the Dataverse default
    ...(environmentGroupId
      ? { 'cat_EnvironmentGroup@odata.bind': `/cat_powershieldenvironmentgroups(${environmentGroupId})` }
      : {}),
  } as Omit<Cat_policyrequestsBase, 'cat_policyrequestid'>);

  const newId = createResult.data?.cat_policyrequestid;
  if (!createResult.success || !newId) {
    throw new WizardSubmitError(
      createResult.error?.message ?? 'Failed to create request header.',
    );
  }
  console.log(`[WizardSubmit] Created new header — requestId: ${newId}`);
  return newId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieve request number
// ─────────────────────────────────────────────────────────────────────────────

async function fetchRequestNumber(requestId: string): Promise<string> {
  const headerResult = await Cat_policyrequestsService.get(requestId, {
    select: ['cat_policyrequestname'],
  });
  return headerResult.data?.cat_policyrequestname ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Draft
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves the current wizard state as a Draft record in Dataverse.
 * Unlike submitWizard, this does NOT transition to Submitted — the record
 * stays as Draft so the user can resume later.
 *
 * Minimum requirement: serviceTreeId + at least 1 environment.
 * All other data (answers, connectors, justification, participants) is optional.
 */
export async function saveDraft(payload: SaveDraftPayload): Promise<WizardSubmitResult> {
  const {
    serviceTreeId,
    createdByAadObjectId,
    createdByUpn,
    justification,
    environments,
    connectors,
    connectorActionOverrides,
    customConnectorPatterns,
    answers,
    participants,
    supportingDocument,
    draftRequestId,
    environmentGroupId,
  } = payload;

  const isEditMode = !!draftRequestId;
  console.log(`[WizardSubmit] saveDraft — draftRequestId: ${draftRequestId ?? '(new)'} | isEditMode: ${isEditMode} | envs: ${environments.length} | connectors: ${connectors.length} | answers: ${answers.length} | participants: ${participants.length}`);

  // Conflict check (Draft is a blocking status)
  const conflict = await checkInProgressConflict(serviceTreeId, draftRequestId);
  if (conflict) {
    throw new WizardSubmitError(
      `A request for this Service Tree is already in progress (${conflict.requestNumber}).`,
    );
  }

  // Create or update header
  const requestId = await createOrUpdateHeader(
    serviceTreeId, createdByAadObjectId, createdByUpn, justification, draftRequestId, environmentGroupId,
  );

  // Write child records (partial data is fine — empty arrays are skipped)
  try {
    await writeChildRecords(requestId, { environments, connectors, connectorActionOverrides, customConnectorPatterns, answers, participants }, isEditMode);

    // Supporting document upload (same annotation pattern as submitWizard)
    if (supportingDocument) {
      if (draftRequestId) {
        // Edit mode: replace any existing annotation before uploading the new one
        await deleteExistingSupportingDocument(requestId);
      }
      await uploadSupportingDocument(requestId, supportingDocument);
    }
  } catch (err) {
    throw new WizardSubmitError(
      err instanceof Error ? err.message : 'Failed to save draft.',
      requestId,
    );
  }

  const requestNumber = await fetchRequestNumber(requestId);
  console.log(`[WizardSubmit] saveDraft complete — requestId: ${requestId} | requestNumber: ${requestNumber}`);
  return { requestId, requestNumber };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard submit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a supporting document as an annotation linked to the request via notetext.
 * Uses the same annotation pattern as comment attachments (objectid binding to custom
 * entities is not supported by the Code App SDK).
 */
async function uploadSupportingDocument(requestId: string, file: File): Promise<void> {
  const base64 = await fileToBase64(file);

  const result = await AnnotationsService.create({
    subject: file.name,
    notetext: `${SUPPORTING_DOC_PREFIX}${requestId}`,
    filename: file.name,
    mimetype: file.type,
    documentbody: base64,
    isdocument: true as unknown as AnnotationsBase['isdocument'],
  } as Omit<AnnotationsBase, 'annotationid'>);

  if (!result.success) {
    throw new Error(result.error?.message ?? `Failed to upload supporting document "${file.name}".`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes the full wizard submit sequence (sequential — each step depends on
 * the request ID from step 2).
 *
 * Draft edit mode (draftRequestId set):
 * - Skips header creation; PATCHes header fields instead.
 * - Deletes all existing child records before re-inserting.
 *
 * On partial failure after header creation: throws WizardSubmitError with
 * partialRequestId so the caller can surface a recovery MessageBar.
 */
export async function submitWizard(payload: WizardSubmitPayload): Promise<WizardSubmitResult> {
  const {
    serviceTreeId,
    createdByAadObjectId,
    createdByUpn,
    justification,
    environments,
    connectors,
    connectorActionOverrides,
    customConnectorPatterns,
    answers,
    participants,
    draftRequestId,
    environmentGroupId,
  } = payload;

  const isEditMode = !!draftRequestId;
  console.log(`[WizardSubmit] submitWizard — draftRequestId: ${draftRequestId ?? '(new)'} | isEditMode: ${isEditMode} | envs: ${environments.length} | connectors: ${connectors.length}`);

  // Re-run conflict check (race condition guard)
  const conflict = await checkInProgressConflict(serviceTreeId, draftRequestId);
  if (conflict) {
    throw new WizardSubmitError(
      `A request for this Service Tree is already in progress (${conflict.requestNumber}).`,
    );
  }

  // Create or update the header record
  const requestId = await createOrUpdateHeader(
    serviceTreeId, createdByAadObjectId, createdByUpn, justification, draftRequestId, environmentGroupId,
  );

  // Write child records + transition to Submitted
  try {
    await writeChildRecords(requestId, { environments, connectors, connectorActionOverrides, customConnectorPatterns, answers, participants }, isEditMode);

    // Supporting document upload via annotation (File column not supported by SDK)
    if (payload.supportingDocument) {
      await uploadSupportingDocument(requestId, payload.supportingDocument);
    }

    // Transition to Submitted
    await Cat_policyrequestsService.update(requestId, {
      cat_status: STATUS_DOMAIN_TO_NUM['Submitted'],
      cat_submittedon: new Date().toISOString(),
    });
  } catch (err) {
    throw new WizardSubmitError(
      err instanceof Error ? err.message : 'Wizard submit failed.',
      requestId,
    );
  }

  const requestNumber = await fetchRequestNumber(requestId);
  return { requestId, requestNumber };
}
