import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_policyrequestconnectorsService } from '../../../../../generated/services/Cat_policyrequestconnectorsService';
import { Cat_policyrequestanswersService } from '../../../../../generated/services/Cat_policyrequestanswersService';
import { Cat_policyrequestparticipantsService } from '../../../../../generated/services/Cat_policyrequestparticipantsService';
import { Cat_powershieldcustomconnectorpatternsService } from '../../../../../generated/services/Cat_powershieldcustomconnectorpatternsService';
import { Cat_servicetreesService } from '../../../../../generated/services/Cat_servicetreesService';
import { Cat_powershieldenvironmentgroupsService } from '../../../../../generated/services/Cat_powershieldenvironmentgroupsService';
import { SystemusersService } from '../../../../../generated/services/SystemusersService';
import { AnnotationsService } from '../../../../../generated/services/AnnotationsService';
import { SUPPORTING_DOC_PREFIX } from './wizardSubmitService';
import type { Cat_policyrequests, Cat_policyrequestsBase } from '../../../../../generated/models/Cat_policyrequestsModel';
import type { Cat_policyrequestscat_status } from '../../../../../generated/models/Cat_policyrequestsModel';
import type { Cat_policyrequestenvironments, Cat_policyrequestenvironmentsBase } from '../../../../../generated/models/Cat_policyrequestenvironmentsModel';
import type { Cat_policyrequestconnectors, Cat_policyrequestconnectorsBase } from '../../../../../generated/models/Cat_policyrequestconnectorsModel';
import type { Cat_policyrequestanswers, Cat_policyrequestanswersBase } from '../../../../../generated/models/Cat_policyrequestanswersModel';
import type { Cat_policyrequestparticipants } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { Cat_powershieldcustomconnectorpatterns, Cat_powershieldcustomconnectorpatternsBase } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import type { Cat_powershieldcustomconnectorpatternscat_datagroup } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import type { PolicyRequest, PolicyRequestSummary } from '../../../models/policyRequest';
import type { RequestEnvironment } from '../../../models/requestEnvironment';
import type { RequestConnector } from '../../../models/requestConnector';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import type { RequestAnswer } from '../../../models/requestAnswer';
import type { RequestParticipant } from '../../../models/requestParticipant';
import type { RequestCustomConnectorPattern } from '../../../models/customConnectorPattern';
import { DATA_GROUP_NUM_TO_LABEL } from '../../../models/customConnectorPattern';
import type { RequestStatus, FulfillmentStatus, ParticipantRole } from '../../../models/status';
import {
  REQUEST_TYPE_CONNECTOR,
  normalizeRequestType,
  assertRequestType,
  andRequestType,
} from './requestType';

export interface RequestDetail extends PolicyRequest {
  environments: RequestEnvironment[];
  connectors: RequestConnector[];
  customConnectorPatterns: RequestCustomConnectorPattern[];
  answers: RequestAnswer[];
  participants: RequestParticipant[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Option-set mappings  (Dataverse integers ⇒ domain strings)
// cat_status, cat_fulfillmentstatus, cat_role are all integer option sets.
// Filters must use integers; API returns integers; UI domain uses strings.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_NUM_TO_DOMAIN: Record<number, RequestStatus> = {
  1: 'Draft', 2: 'Submitted', 3: 'Withdrawn', 4: 'AutoRejected',
  5: 'UnderReview', 6: 'Approved', 7: 'Rejected', 8: 'Implementing',
  9: 'Implemented', 10: 'ImplementedWithErrors',
};

const STATUS_DOMAIN_TO_NUM: Record<RequestStatus, Cat_policyrequestscat_status> = {
  'Draft': 1, 'Submitted': 2, 'Withdrawn': 3, 'AutoRejected': 4,
  'UnderReview': 5, 'Approved': 6, 'Rejected': 7, 'Implementing': 8,
  'Implemented': 9, 'ImplementedWithErrors': 10,
} as Record<RequestStatus, Cat_policyrequestscat_status>;

const FULFILLMENT_NUM_TO_DOMAIN: Record<number, FulfillmentStatus> = {
  1: 'Pending', 2: 'Succeeded', 3: 'Failed', 4: 'Skipped',
};

const ROLE_NUM_TO_DOMAIN: Record<number, ParticipantRole> = {
  1: 'Participant', 2: 'Participant',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mappers (typed generated model → domain model)
// ─────────────────────────────────────────────────────────────────────────────

/** Removes duplicate items from an array, keeping the first occurrence per key. */
function deduplicateBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toPolicyRequestSummary(r: Cat_policyrequests): PolicyRequestSummary & { _assignedAdminId?: string } {
  return {
    id: r.cat_policyrequestid,
    requestType: normalizeRequestType(r.cat_requesttype),
    requestNumber: r.cat_policyrequestname ?? '',
    serviceTreeId: r._cat_servicetreeid_value ?? '',
    serviceTreeName: undefined, // enriched via fetchServiceTreeNames after this call
    environmentGroupId: r._cat_environmentgroup_value ?? undefined,
    environmentGroupName: undefined, // enriched via fetchEnvironmentGroupNames after this call
    environmentCount: r.cat_requestenvironmentcount ? parseInt(r.cat_requestenvironmentcount, 10) : undefined,
    connectorsCount: r.cat_policyconnectorscount ? parseInt(r.cat_policyconnectorscount, 10) : undefined,
    status: STATUS_NUM_TO_DOMAIN[Number(r.cat_status)] ?? 'Draft',
    submittedOn: r.cat_submittedon,
    createdByUpn: r.cat_createdbyupn ?? '',
    createdByAadObjectId: r.cat_createdbyaadobjectid ?? undefined,
    assignedAdminName: undefined, // enriched via fetchAssignedAdminNames after this call
    _assignedAdminId: r._cat_assignedadministrator_value ?? undefined,
  };
}

function toPolicyRequest(r: Cat_policyrequests): PolicyRequest & { _assignedAdminId?: string } {
  return {
    id: r.cat_policyrequestid,
    requestType: normalizeRequestType(r.cat_requesttype),
    requestNumber: r.cat_policyrequestname ?? '',
    serviceTreeId: r._cat_servicetreeid_value ?? '',
    serviceTreeName: undefined, // enriched via fetchServiceTreeNames after this call
    createdByAadObjectId: r.cat_createdbyaadobjectid ?? '',
    createdByUpn: r.cat_createdbyupn ?? '',
    status: STATUS_NUM_TO_DOMAIN[Number(r.cat_status)] ?? 'Draft',
    justification: r.cat_justification ?? '',
    adminComment: r.cat_admincomment,
    submittedOn: r.cat_submittedon,
    decidedOn: r.cat_decidedon,
    approvedByAadObjectId: r.cat_approvedbyaadobjectid,
    dlpPolicyId: r.cat_dlppolicyid,
    dlpPolicyName: r.cat_dlppolicyname,
    lastErrorSummary: r.cat_lasterrorsummary,
    hasSupportingDocument: false, // enriched later via annotation query
    environmentGroupId: r._cat_environmentgroup_value ?? undefined,
    environmentGroupName: r.cat_environmentgroupname ?? undefined,
    assignedAdminName: undefined, // enriched via fetchAssignedAdminNames after this call
    _assignedAdminId: r._cat_assignedadministrator_value ?? undefined,
  };
}

function toRequestEnvironment(r: Cat_policyrequestenvironments): RequestEnvironment {
  return {
    id: r.cat_policyrequestenvironmentid,
    policyRequestId: r._cat_policyrequestid_value ?? '',
    environmentGuid: r.cat_environmentguid ?? '',
    environmentName: r.cat_environmentname ?? '',
    fulfillmentStatus: FULFILLMENT_NUM_TO_DOMAIN[Number(r.cat_fulfillmentstatus)] ?? 'Pending',
    fulfillmentError: r.cat_fulfillmenterror,
    fulfilledOn: r.cat_fulfilledon,
  };
}

function toRequestConnector(r: Cat_policyrequestconnectors): RequestConnector {
  let actionOverrides: ActionOverrideMap | undefined;
  if (r.cat_actionoverrides) {
    try {
      const parsed = JSON.parse(r.cat_actionoverrides) as Array<{ actionId: string; behavior: string }>;
      actionOverrides = Object.fromEntries(parsed.map(({ actionId, behavior }) => [actionId, behavior])) as ActionOverrideMap;
    } catch {
      // Ignore malformed JSON — treat as no overrides
    }
  }
  return {
    id: r.cat_policyrequestconnectorid,
    policyRequestId: r._cat_policyrequestid_value ?? '',
    connectorId: r._cat_connectorid_value ?? '',
    connectorName: r.cat_connectordisplayname || r.cat_policyrequestconnectorname || '',
    connectorKey: r.cat_policyrequestconnectorname || '',
    connectorUrl: r.cat_connectorurl || undefined,
    connectorDisplayName: r.cat_connectordisplayname || undefined,
    actionOverrides,
  };
}

function toRequestAnswer(r: Cat_policyrequestanswers): RequestAnswer {
  return {
    id: r.cat_policyrequestanswerid,
    policyRequestId: r._cat_policyrequestid_value ?? '',
    questionId: r._cat_questionid_value ?? '',
    answerValue: r.cat_answervalue ?? '',
    questionTextSnapshot: r.cat_questiontextsnapshot ?? '',
  };
}

function toRequestParticipant(r: Cat_policyrequestparticipants): RequestParticipant {
  return {
    id: r.cat_policyrequestparticipantid,
    policyRequestId: r._cat_policyrequestid_value ?? '',
    participantAadObjectId: r.cat_participantaadobjectid ?? '',
    participantUpn: r.cat_participantupn ?? '',
    role: ROLE_NUM_TO_DOMAIN[Number(r.cat_role)] ?? 'Participant',
  };
}

function toCustomConnectorPattern(r: Cat_powershieldcustomconnectorpatterns): RequestCustomConnectorPattern {
  return {
    id: r.cat_powershieldcustomconnectorpatternid,
    policyRequestId: r._cat_policyrequest_value ?? '',
    hostUrlPattern: r.cat_name,
    dataGroup: DATA_GROUP_NUM_TO_LABEL[Number(r.cat_datagroup)] ?? 'Non-business',
    order: parseInt(r.cat_order ?? '0', 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Tree Name Lookup
// cat_servicetreeidname cannot be used in $select (it is not a real OData
// property). Instead we batch-fetch cat_servicetreename from cat_servicetrees using the
// GUIDs stored in _cat_servicetreeid_value.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchServiceTreeNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `cat_servicetreeid eq ${id}`).join(' or ');
  const result = await Cat_servicetreesService.getAll({
    filter,
    select: ['cat_servicetreeid', 'cat_servicetreename'],
  });
  const map = new Map<string, string>();
  for (const st of result.data ?? []) {
    map.set(st.cat_servicetreeid, st.cat_servicetreename ?? '');
  }
  return map;
}

async function fetchEnvironmentGroupNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `cat_powershieldenvironmentgroupid eq ${id}`).join(' or ');
  const result = await Cat_powershieldenvironmentgroupsService.getAll({
    filter,
    select: ['cat_powershieldenvironmentgroupid', 'cat_name'],
  });
  const map = new Map<string, string>();
  for (const g of result.data ?? []) {
    map.set(g.cat_powershieldenvironmentgroupid, g.cat_name);
  }
  return map;
}

async function fetchAssignedAdminNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `systemuserid eq ${id}`).join(' or ');
  const result = await SystemusersService.getAll({
    filter,
    select: ['systemuserid', 'fullname'],
  });
  const map = new Map<string, string>();
  for (const u of result.data ?? []) {
    map.set(u.systemuserid, u.fullname ?? '');
  }
  return map;
}

/** Resolves creator display names from systemusers via AAD Object ID. */
async function fetchCreatorNames(aadObjectIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(aadObjectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `azureactivedirectoryobjectid eq '${id}'`).join(' or ');
  const result = await SystemusersService.getAll({
    filter,
    select: ['azureactivedirectoryobjectid', 'fullname'],
  });
  const map = new Map<string, string>();
  for (const u of result.data ?? []) {
    if (u.azureactivedirectoryobjectid) {
      map.set(u.azureactivedirectoryobjectid, u.fullname ?? '');
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request List
// ─────────────────────────────────────────────────────────────────────────────

const LIST_SELECT = [
  'cat_policyrequestid', 'cat_policyrequestname', 'cat_status', 'cat_requesttype',
  'cat_submittedon', 'cat_createdbyupn', 'cat_createdbyaadobjectid',
  '_cat_servicetreeid_value', '_cat_environmentgroup_value',
  'cat_requestenvironmentcount', 'cat_policyconnectorscount',
  '_cat_assignedadministrator_value',
];

/**
 * Retrieves request summaries for Home / My Requests screens.
 * Admin: all tenant requests (no ownership filter).
 * Maker: two-step — first fetches participant records to find all request IDs
 *   the user is a participant in (avoids unsupported navigation property filter),
 *   then combines with requests created by the user.
 * Both: capped at 100, newest first.
 */
export async function getRequestList(
  options: { isAdmin: boolean; aadObjectId: string; statusFilter?: number[] },
): Promise<PolicyRequestSummary[]> {
  const { isAdmin, aadObjectId, statusFilter } = options;

  let filter: string | undefined;

  if (!isAdmin) {
    // Step 1: find request IDs where user is a participant
    const participantResult = await Cat_policyrequestparticipantsService.getAll({
      filter: `cat_participantaadobjectid eq '${aadObjectId}'`,
      select: ['_cat_policyrequestid_value'],
    });
    const participantIds = (participantResult.data ?? [])
      .map((p) => p._cat_policyrequestid_value)
      .filter((id): id is string => Boolean(id));

    // Step 2: build combined filter (created by user OR participated in)
    filter = `cat_createdbyaadobjectid eq '${aadObjectId}'`;
    if (participantIds.length > 0) {
      const orParts = participantIds.map((id) => `cat_policyrequestid eq ${id}`).join(' or ');
      filter = `(${filter}) or (${orParts})`;
    }
  }

  // Append status filter if provided (admin review queue)
  if (statusFilter && statusFilter.length > 0) {
    const statusClause = statusFilter.map((s) => `cat_status eq ${s}`).join(' or ');
    filter = filter ? `(${filter}) and (${statusClause})` : statusClause;
  }

  // Isolation (SC-002): restrict to Connector rows (null-inclusive for legacy).
  // Applied once, after all ownership/status clauses, in both admin and maker branches.
  filter = andRequestType(filter, 'Connector');

  const result = await Cat_policyrequestsService.getAll({
    filter,
    select: LIST_SELECT,
    orderBy: ['createdon desc'],
    top: 100,
  });

  if (!result.success) throw new Error(result.error?.message ?? 'Failed to load requests.');
  const summaries = (result.data ?? []).map(toPolicyRequestSummary);

  // Enrich with service tree, environment group, assigned admin, and creator names via batch fetches
  const [stNameMap, egNameMap, adminNameMap, creatorNameMap] = await Promise.all([
    fetchServiceTreeNames(summaries.map((s) => s.serviceTreeId)),
    fetchEnvironmentGroupNames(summaries.map((s) => s.environmentGroupId ?? '')),
    fetchAssignedAdminNames(summaries.map((s) => s._assignedAdminId ?? '')),
    fetchCreatorNames(summaries.map((s) => s.createdByAadObjectId ?? '')),
  ]);
  return summaries.map(({ _assignedAdminId, ...s }) => ({
    ...s,
    serviceTreeName: stNameMap.get(s.serviceTreeId),
    environmentGroupName: s.environmentGroupId ? egNameMap.get(s.environmentGroupId) : undefined,
    assignedAdminName: _assignedAdminId ? adminNameMap.get(_assignedAdminId) : undefined,
    createdByName: s.createdByAadObjectId ? creatorNameMap.get(s.createdByAadObjectId) : undefined,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Detail
// ─────────────────────────────────────────────────────────────────────────────

const DETAIL_SELECT = [
  'cat_policyrequestid', 'cat_policyrequestname', 'cat_status', 'cat_requesttype', 'cat_justification',
  'cat_admincomment', 'cat_submittedon', 'cat_decidedon', 'cat_createdbyaadobjectid',
  'cat_createdbyupn', 'cat_approvedbyaadobjectid', 'cat_dlppolicyid', 'cat_dlppolicyname',
  'cat_lasterrorsummary', '_cat_servicetreeid_value', '_cat_environmentgroup_value',
  '_cat_assignedadministrator_value',
];

/**
 * Fetches the full request header plus all four child record types in parallel.
 * _cat_policyrequestid_value is the OData lookup value column on each child table.
 */
export async function getRequestDetail(requestId: string): Promise<RequestDetail> {
  // Isolation (SC-002): read the header and assert Connector type BEFORE touching
  // any children, so a Credit ID opened in a Connector route can never cause the
  // Connector code to read the other type's environments/comments/participants.
  const headerResult = await Cat_policyrequestsService.get(requestId, { select: DETAIL_SELECT });
  if (!headerResult.success || !headerResult.data) {
    throw new Error(headerResult.error?.message ?? 'Failed to load request detail.');
  }
  assertRequestType(headerResult.data.cat_requesttype, 'Connector');

  const childFilter = `_cat_policyrequestid_value eq ${requestId}`;

  const [envResult, conResult, ansResult, parResult, patResult, docResult] = await Promise.all([
    Cat_policyrequestenvironmentsService.getAll({
      filter: childFilter,
      select: [
        'cat_policyrequestenvironmentid', '_cat_policyrequestid_value',
        'cat_environmentguid', 'cat_environmentname',
        'cat_fulfillmentstatus', 'cat_fulfillmenterror', 'cat_fulfilledon',
      ],
    }),
    Cat_policyrequestconnectorsService.getAll({
      filter: childFilter,
      select: [
        'cat_policyrequestconnectorid', '_cat_policyrequestid_value',
        '_cat_connectorid_value', 'cat_connectordisplayname',
        'cat_policyrequestconnectorname', 'cat_connectorurl', 'cat_actionoverrides',
      ],
    }),
    Cat_policyrequestanswersService.getAll({
      filter: childFilter,
      select: [
        'cat_policyrequestanswerid', '_cat_policyrequestid_value',
        '_cat_questionid_value', 'cat_answervalue', 'cat_questiontextsnapshot',
      ],
    }),
    Cat_policyrequestparticipantsService.getAll({
      filter: childFilter,
      select: [
        'cat_policyrequestparticipantid', '_cat_policyrequestid_value',
        'cat_participantaadobjectid', 'cat_participantupn', 'cat_role',
      ],
    }),
    Cat_powershieldcustomconnectorpatternsService.getAll({
      filter: `_cat_policyrequest_value eq ${requestId}`,
      select: [
        'cat_powershieldcustomconnectorpatternid', '_cat_policyrequest_value',
        'cat_name', 'cat_datagroup', 'cat_order',
      ],
    }),
    AnnotationsService.getAll({
      filter: `notetext eq '${SUPPORTING_DOC_PREFIX}${requestId}'`,
      select: ['annotationid', 'filename', 'mimetype', 'filesize'] as string[],
    }),
  ]);

  const header = toPolicyRequest(headerResult.data);

  // Fetch service tree name, assigned admin name, creator name, and environment group in parallel
  const [nameMap, adminNameMap, creatorNameMap, environmentGroupName] = await Promise.all([
    fetchServiceTreeNames([header.serviceTreeId]),
    fetchAssignedAdminNames([header._assignedAdminId ?? '']),
    fetchCreatorNames([header.createdByAadObjectId]),
    header.environmentGroupId
      ? Cat_powershieldenvironmentgroupsService.get(
          header.environmentGroupId,
          { select: ['cat_name'] },
        ).then((r) => r.data?.cat_name)
      : Promise.resolve(undefined),
  ]);

  // Supporting document: first annotation matching the SUPPORTING_DOC prefix
  const docAnnotation = docResult.data?.[0];
  const supportingDocumentAttachment = docAnnotation
    ? {
        id: docAnnotation.annotationid,
        fileName: docAnnotation.filename ?? '',
        mimeType: docAnnotation.mimetype ?? '',
        fileSize: parseInt(docAnnotation.filesize ?? '0', 10) || 0,
      }
    : undefined;

  return {
    ...header,
    serviceTreeName: nameMap.get(header.serviceTreeId),
    assignedAdminName: header._assignedAdminId ? adminNameMap.get(header._assignedAdminId) : undefined,
    assignedAdminDvUserId: header._assignedAdminId,
    createdByName: creatorNameMap.get(header.createdByAadObjectId),
    environmentGroupName,
    hasSupportingDocument: !!supportingDocumentAttachment,
    supportingDocumentAttachment,
    // Deduplicate child records — Dataverse may contain duplicates from
    // prior save cycles where delete-then-create failed on the delete side.
    environments: deduplicateBy(
      (envResult.data ?? []).map(toRequestEnvironment),
      (e) => e.environmentGuid,
    ),
    connectors: deduplicateBy(
      (conResult.data ?? []).map(toRequestConnector),
      (c) => c.connectorId,
    ),
    customConnectorPatterns: deduplicateBy(
      (patResult.data ?? []).map(toCustomConnectorPattern),
      (p) => p.hostUrlPattern,
    ),
    answers: deduplicateBy(
      (ansResult.data ?? []).map(toRequestAnswer),
      (a) => a.questionId,
    ),
    participants: deduplicateBy(
      (parResult.data ?? []).map(toRequestParticipant),
      (p) => p.participantAadObjectId,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Mutations
// ─────────────────────────────────────────────────────────────────────────────

/** Withdraws a Draft or Submitted request. */
export async function withdrawRequest(requestId: string): Promise<void> {
  // Isolation (SC-002): pre-read the discriminator and reject a wrong-type row
  // before the (otherwise blind) status update.
  const existing = await Cat_policyrequestsService.get(requestId, { select: ['cat_requesttype'] });
  if (!existing.success || !existing.data) {
    throw new Error(existing.error?.message ?? 'Failed to load request.');
  }
  assertRequestType(existing.data.cat_requesttype, 'Connector');

  const result = await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_DOMAIN_TO_NUM['Withdrawn'],
  });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to withdraw request.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Clone Request
// ─────────────────────────────────────────────────────────────────────────────

const DATA_GROUP_LABEL_TO_NUM: Record<string, Cat_powershieldcustomconnectorpatternscat_datagroup> = {
  'Non-business': 1, 'Business': 2, 'Blocked': 3,
};

/**
 * Clones an existing policy request into a new Draft record.
 * Copies: service tree, environment group, environments, connectors (with action overrides),
 * custom connector patterns, answers, and justification.
 * Participants and supporting documents are NOT copied.
 *
 * @returns The new request's GUID.
 */
export async function cloneRequest(
  sourceId: string,
  currentUser: { aadObjectId: string; upn: string },
): Promise<string> {
  // Fetch full source detail
  const detail = await getRequestDetail(sourceId);

  // Create new parent record (Draft)
  const createResult = await Cat_policyrequestsService.create({
    'cat_servicetreeid@odata.bind': `/cat_servicetrees(${detail.serviceTreeId})`,
    cat_createdbyaadobjectid: currentUser.aadObjectId,
    cat_createdbyupn: currentUser.upn,
    cat_justification: detail.justification,
    cat_status: STATUS_DOMAIN_TO_NUM['Draft'],
    cat_requesttype: REQUEST_TYPE_CONNECTOR, // isolation: never rely on the Dataverse default
    ...(detail.environmentGroupId
      ? { 'cat_EnvironmentGroup@odata.bind': `/cat_powershieldenvironmentgroups(${detail.environmentGroupId})` }
      : {}),
  } as Omit<Cat_policyrequestsBase, 'cat_policyrequestid'>);

  const newId = createResult.data?.cat_policyrequestid;
  if (!createResult.success || !newId) {
    throw new Error(createResult.error?.message ?? 'Failed to create cloned request.');
  }

  // Create child records (environments, connectors, answers, patterns) sequentially
  // to mirror the wizardSubmitService pattern and avoid overwhelming Dataverse.
  for (const env of detail.environments) {
    await Cat_policyrequestenvironmentsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${newId})`,
      cat_environmentguid: env.environmentGuid,
      cat_environmentname: env.environmentName,
    } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>);
  }

  for (const conn of detail.connectors) {
    const overrideEntries = conn.actionOverrides
      ? Object.entries(conn.actionOverrides)
          .map(([actionId, behavior]) => ({ actionId, behavior }))
      : [];
    await Cat_policyrequestconnectorsService.create({
      cat_policyrequestconnectorname: conn.connectorKey || conn.connectorName,
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${newId})`,
      'cat_connectorid@odata.bind': `/cat_connectors(${conn.connectorId})`,
      cat_actionoverrides: JSON.stringify(overrideEntries),
      cat_connectordisplayname: conn.connectorDisplayName || conn.connectorName || '',
      ...(conn.connectorUrl ? { cat_connectorurl: conn.connectorUrl } : {}),
    } as Omit<Cat_policyrequestconnectorsBase, 'cat_policyrequestconnectorid'>);
  }

  for (const pattern of detail.customConnectorPatterns) {
    const dataGroupNum = DATA_GROUP_LABEL_TO_NUM[pattern.dataGroup] ?? 1;
    await Cat_powershieldcustomconnectorpatternsService.create({
      'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${newId})`,
      cat_name: pattern.hostUrlPattern,
      cat_datagroup: dataGroupNum as Cat_powershieldcustomconnectorpatternscat_datagroup,
      cat_order: String(pattern.order),
    } as Omit<Cat_powershieldcustomconnectorpatternsBase, 'cat_powershieldcustomconnectorpatternid'>);
  }

  for (const answer of detail.answers) {
    await Cat_policyrequestanswersService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${newId})`,
      'cat_questionid@odata.bind': `/cat_questions(${answer.questionId})`,
      cat_answervalue: answer.answerValue,
      cat_questiontextsnapshot: answer.questionTextSnapshot,
    } as Omit<Cat_policyrequestanswersBase, 'cat_policyrequestanswerid'>);
  }

  return newId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approved Requests by Service Tree (for DLP clone warning)
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses that indicate a request has been approved and may have created a DLP policy. */
const APPROVED_TERMINAL_STATUSES: RequestStatus[] = [
  'Approved', 'Implementing', 'Implemented', 'ImplementedWithErrors',
];

/**
 * Fetches all approved/implemented policy requests for a given Service Tree.
 * Used by the wizard Step 1 clone-warning dialog to show existing DLP-affecting
 * requests that the maker should consider cloning before creating a new one.
 *
 * @returns PolicyRequestSummary[] ordered by most recently created first.
 */
export async function getApprovedRequestsByServiceTree(
  serviceTreeId: string,
): Promise<PolicyRequestSummary[]> {
  const statusClause = APPROVED_TERMINAL_STATUSES
    .map((s) => `cat_status eq ${STATUS_DOMAIN_TO_NUM[s]}`)
    .join(' or ');

  const filter = andRequestType(
    `_cat_servicetreeid_value eq ${serviceTreeId} and (${statusClause})`,
    'Connector',
  );

  const result = await Cat_policyrequestsService.getAll({
    filter,
    select: LIST_SELECT,
    orderBy: ['cat_submittedon desc'],
    top: 50,
  });

  if (!result.success) throw new Error(result.error?.message ?? 'Failed to load approved requests.');
  const summaries = (result.data ?? []).map(toPolicyRequestSummary);

  const [egNameMap, creatorNameMap, stNameMap] = await Promise.all([
    fetchEnvironmentGroupNames(summaries.map((s) => s.environmentGroupId ?? '')),
    fetchCreatorNames(summaries.map((s) => s.createdByAadObjectId ?? '')),
    fetchServiceTreeNames(summaries.map((s) => s.serviceTreeId)),
  ]);

  return summaries.map(({ _assignedAdminId, ...s }) => ({
    ...s,
    serviceTreeName: stNameMap.get(s.serviceTreeId),
    environmentGroupName: s.environmentGroupId ? egNameMap.get(s.environmentGroupId) : undefined,
    createdByName: s.createdByAadObjectId ? creatorNameMap.get(s.createdByAadObjectId) : undefined,
  }));
}
