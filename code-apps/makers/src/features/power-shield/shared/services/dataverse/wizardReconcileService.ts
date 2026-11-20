import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_policyrequestconnectorsService } from '../../../../../generated/services/Cat_policyrequestconnectorsService';
import { Cat_policyrequestanswersService } from '../../../../../generated/services/Cat_policyrequestanswersService';
import { Cat_policyrequestparticipantsService } from '../../../../../generated/services/Cat_policyrequestparticipantsService';
import { Cat_powershieldcustomconnectorpatternsService } from '../../../../../generated/services/Cat_powershieldcustomconnectorpatternsService';
import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import type { Cat_policyrequestenvironmentsBase } from '../../../../../generated/models/Cat_policyrequestenvironmentsModel';
import type { Cat_policyrequestconnectorsBase } from '../../../../../generated/models/Cat_policyrequestconnectorsModel';
import type { Cat_policyrequestanswersBase } from '../../../../../generated/models/Cat_policyrequestanswersModel';
import type { Cat_policyrequestparticipantsBase } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { Cat_policyrequestparticipantscat_role } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { Cat_powershieldcustomconnectorpatternsBase } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import type { Cat_powershieldcustomconnectorpatternscat_datagroup } from '../../../../../generated/models/Cat_powershieldcustomconnectorpatternsModel';
import type { RequestAnswerCreate } from '../../../models/requestAnswer';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import type { WizardEnvironment, WizardParticipant, CustomConnectorPatternCreate } from './wizardSubmitService';
import { assertRequestType } from './requestType';

// Re-use the role mapping from wizardSubmitService
import type { ParticipantRole } from '../../../models/status';
const ROLE_DOMAIN_TO_NUM: Record<ParticipantRole, Cat_policyrequestparticipantscat_role> = {
  'Participant': 1,
} as Record<ParticipantRole, Cat_policyrequestparticipantscat_role>;

// ─────────────────────────────────────────────────────────────────────────────
// Delete helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes a Dataverse record and logs the outcome.
 * Requires the 'CSK - Maker' security role to have Delete permission
 * on the target table.
 */
async function deleteRecord(
  label: string,
  id: string,
  deleteFn: (id: string) => Promise<void>,
): Promise<void> {
  try {
    await deleteFn(id);
    console.log(`[Reconcile] ${label} deleted — id: ${id}`);
  } catch (err) {
    console.error(`[Reconcile] ${label} delete FAILED — id: ${id}`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic diff utility
// ─────────────────────────────────────────────────────────────────────────────

interface DiffResult<TExisting, TDesired> {
  toCreate: TDesired[];
  toDelete: TExisting[];
  toUpdate: Array<{ existing: TExisting; desired: TDesired }>;
}

/**
 * Computes the diff between existing Dataverse records and desired wizard state.
 * Uses a natural key extractor for matching.
 *
 * Handles duplicate existing records (from prior failed save cycles):
 * - For each unique key, keeps at most one existing record
 * - Extra duplicates are added to `toDelete`
 */
function diffByKey<TExisting, TDesired>(
  existing: TExisting[],
  desired: TDesired[],
  existingKey: (e: TExisting) => string,
  desiredKey: (d: TDesired) => string,
  existingId: (e: TExisting) => string,
  hasChanged?: (existing: TExisting, desired: TDesired) => boolean,
): DiffResult<TExisting, TDesired> {
  // Group existing records by key — duplicates are common from prior save failures
  const existingGroups = new Map<string, TExisting[]>();
  for (const e of existing) {
    const key = existingKey(e);
    const group = existingGroups.get(key);
    if (group) {
      group.push(e);
    } else {
      existingGroups.set(key, [e]);
    }
  }

  const desiredMap = new Map(desired.map((d) => [desiredKey(d), d]));

  const toCreate: TDesired[] = [];
  const toDelete: TExisting[] = [];
  const toUpdate: Array<{ existing: TExisting; desired: TDesired }> = [];

  // Items in desired but not in existing → create
  // Items in desired AND existing → keep one, delete duplicates, update if changed
  for (const [key, d] of desiredMap) {
    const group = existingGroups.get(key);
    if (!group || group.length === 0) {
      toCreate.push(d);
    } else {
      // Keep the first record, schedule duplicates for deletion
      const [keeper, ...duplicates] = group;
      for (const dup of duplicates) {
        console.log(`[Reconcile] Duplicate detected — key: ${key} | deleting duplicate id: ${existingId(dup)}`);
        toDelete.push(dup);
      }
      if (hasChanged?.(keeper, d)) {
        toUpdate.push({ existing: keeper, desired: d });
      }
    }
  }

  // Items in existing but not in desired → delete ALL (including duplicates)
  for (const [key, group] of existingGroups) {
    if (!desiredMap.has(key)) {
      for (const e of group) {
        toDelete.push(e);
      }
    }
  }

  return { toCreate, toDelete, toUpdate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing record types (fetched from Dataverse for diffing)
// ─────────────────────────────────────────────────────────────────────────────

interface ExistingEnvironment {
  id: string;
  environmentGuid: string;
  environmentName: string;
}

interface ExistingConnector {
  id: string;
  connectorId: string;
  actionOverrides: string;
  displayName: string;
  connectorUrl: string;
}

interface ExistingAnswer {
  id: string;
  questionId: string;
  answerValue: string;
}

interface ExistingParticipant {
  id: string;
  aadObjectId: string;
}

interface ExistingPattern {
  id: string;
  hostUrlPattern: string;
  dataGroup: number;
  order: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch existing records
// ─────────────────────────────────────────────────────────────────────────────

async function fetchExistingEnvironments(requestId: string): Promise<ExistingEnvironment[]> {
  const result = await Cat_policyrequestenvironmentsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestenvironmentid', 'cat_environmentguid', 'cat_environmentname'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_policyrequestenvironmentid,
    environmentGuid: r.cat_environmentguid ?? '',
    environmentName: r.cat_environmentname ?? '',
  }));
}

async function fetchExistingConnectors(requestId: string): Promise<ExistingConnector[]> {
  const result = await Cat_policyrequestconnectorsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: [
      'cat_policyrequestconnectorid', '_cat_connectorid_value',
      'cat_actionoverrides', 'cat_connectordisplayname', 'cat_connectorurl',
    ],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_policyrequestconnectorid,
    connectorId: r._cat_connectorid_value ?? '',
    actionOverrides: r.cat_actionoverrides ?? '',
    displayName: r.cat_connectordisplayname ?? '',
    connectorUrl: r.cat_connectorurl ?? '',
  }));
}

async function fetchExistingAnswers(requestId: string): Promise<ExistingAnswer[]> {
  const result = await Cat_policyrequestanswersService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestanswerid', '_cat_questionid_value', 'cat_answervalue'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_policyrequestanswerid,
    questionId: r._cat_questionid_value ?? '',
    answerValue: r.cat_answervalue ?? '',
  }));
}

async function fetchExistingParticipants(requestId: string): Promise<ExistingParticipant[]> {
  const result = await Cat_policyrequestparticipantsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestparticipantid', 'cat_participantaadobjectid'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_policyrequestparticipantid,
    aadObjectId: r.cat_participantaadobjectid ?? '',
  }));
}

async function fetchExistingPatterns(requestId: string): Promise<ExistingPattern[]> {
  const result = await Cat_powershieldcustomconnectorpatternsService.getAll({
    filter: `_cat_policyrequest_value eq ${requestId}`,
    select: ['cat_powershieldcustomconnectorpatternid', 'cat_name', 'cat_datagroup', 'cat_order'],
  });
  return (result.data ?? []).map((r) => ({
    id: r.cat_powershieldcustomconnectorpatternid,
    hostUrlPattern: r.cat_name ?? '',
    dataGroup: r.cat_datagroup as number ?? 1,
    order: r.cat_order ?? '0',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-type reconciliation
// ─────────────────────────────────────────────────────────────────────────────

async function reconcileEnvironments(
  requestId: string,
  existing: ExistingEnvironment[],
  desired: WizardEnvironment[],
): Promise<void> {
  const { toCreate, toDelete, toUpdate } = diffByKey(
    existing, desired,
    (e) => e.environmentGuid,
    (d) => d.environmentId,
    (e) => e.id,
    (e, d) => e.environmentName !== d.displayName,
  );

  const matched = existing.length - toDelete.length;
  console.log(`[Reconcile] Environments — existing: ${existing.length}, desired: ${desired.length} | create: ${toCreate.length}, delete: ${toDelete.length}, update: ${toUpdate.length}, matched: ${matched}`);
  if (toCreate.length > 0) console.log(`[Reconcile]   → Creating envs:`, toCreate.map((e) => e.environmentId));
  if (toDelete.length > 0) console.log(`[Reconcile]   → Deleting envs:`, toDelete.map((e) => `${e.environmentGuid} (id: ${e.id})`));
  if (toUpdate.length > 0) console.log(`[Reconcile]   → Updating envs:`, toUpdate.map(({ existing: e }) => e.environmentGuid));

  // Deactivate removed records, then creates and updates in parallel
  for (const env of toDelete) {
    await deleteRecord('Environment', env.id,
      (id) => Cat_policyrequestenvironmentsService.delete(id));
  }

  const ops: Promise<unknown>[] = [];

  for (const env of toCreate) {
    ops.push(Cat_policyrequestenvironmentsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_environmentguid: env.environmentId,
      cat_environmentname: env.displayName,
    } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>));
  }

  for (const { existing: e, desired: d } of toUpdate) {
    ops.push(Cat_policyrequestenvironmentsService.update(e.id, {
      cat_environmentname: d.displayName,
    }));
  }

  await Promise.all(ops);
}

async function reconcileConnectors(
  requestId: string,
  existing: ExistingConnector[],
  desired: Array<{ connectorId: string; displayName: string; connectorKey: string; connectorDetailsUrl?: string }>,
  connectorActionOverrides: Record<string, ActionOverrideMap>,
): Promise<void> {
  const serializeOverrides = (overrides: ActionOverrideMap): string =>
    JSON.stringify(Object.entries(overrides).map(([actionId, behavior]) => ({ actionId, behavior })));

  const { toCreate, toDelete, toUpdate } = diffByKey(
    existing, desired,
    (e) => e.connectorId,
    (d) => d.connectorId,
    (e) => e.id,
    (e, d) => {
      const desiredOverrides = connectorActionOverrides[d.connectorId] ?? {};
      const desiredOverridesStr = serializeOverrides(desiredOverrides);
      return e.actionOverrides !== desiredOverridesStr
        || e.displayName !== d.displayName
        || e.connectorUrl !== (d.connectorDetailsUrl ?? '');
    },
  );

  const matched = existing.length - toDelete.length;
  console.log(`[Reconcile] Connectors — existing: ${existing.length}, desired: ${desired.length} | create: ${toCreate.length}, delete: ${toDelete.length}, update: ${toUpdate.length}, matched: ${matched}`);
  console.log(`[Reconcile]   → Existing keys:`, existing.map((e) => `${e.displayName} (connId: ${e.connectorId}, recId: ${e.id})`));
  console.log(`[Reconcile]   → Desired keys:`, desired.map((d) => `${d.displayName} (connId: ${d.connectorId})`));
  if (toCreate.length > 0) console.log(`[Reconcile]   → Creating:`, toCreate.map((c) => `${c.displayName} (${c.connectorId})`));
  if (toDelete.length > 0) console.log(`[Reconcile]   → Deleting:`, toDelete.map((c) => `${c.displayName} (connId: ${c.connectorId}, recId: ${c.id})`));
  if (toUpdate.length > 0) console.log(`[Reconcile]   → Updating:`, toUpdate.map(({ existing: e }) => `${e.displayName} (${e.connectorId})`));

  // Deactivate removed records, then creates and updates in parallel
  for (const conn of toDelete) {
    await deleteRecord('Connector', conn.id,
      (id) => Cat_policyrequestconnectorsService.delete(id));
  }

  const ops: Promise<unknown>[] = [];

  for (const conn of toCreate) {
    const overrides = connectorActionOverrides[conn.connectorId] ?? {};
    ops.push(Cat_policyrequestconnectorsService.create({
      cat_policyrequestconnectorname: conn.connectorKey,
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_connectorid@odata.bind': `/cat_connectors(${conn.connectorId})`,
      cat_actionoverrides: serializeOverrides(overrides),
      cat_connectordisplayname: conn.displayName,
      ...(conn.connectorDetailsUrl ? { cat_connectorurl: conn.connectorDetailsUrl } : {}),
    } as Omit<Cat_policyrequestconnectorsBase, 'cat_policyrequestconnectorid'>));
  }

  for (const { existing: e, desired: d } of toUpdate) {
    const overrides = connectorActionOverrides[d.connectorId] ?? {};
    ops.push(Cat_policyrequestconnectorsService.update(e.id, {
      cat_actionoverrides: serializeOverrides(overrides),
      cat_connectordisplayname: d.displayName,
      ...(d.connectorDetailsUrl ? { cat_connectorurl: d.connectorDetailsUrl } : {}),
    }));
  }

  await Promise.all(ops);
}

async function reconcileAnswers(
  requestId: string,
  existing: ExistingAnswer[],
  desired: RequestAnswerCreate[],
): Promise<void> {
  const { toCreate, toDelete, toUpdate } = diffByKey(
    existing, desired,
    (e) => e.questionId,
    (d) => d.questionId,
    (e) => e.id,
    (e, d) => e.answerValue !== d.answerValue,
  );

  const matched = existing.length - toDelete.length;
  console.log(`[Reconcile] Answers — existing: ${existing.length}, desired: ${desired.length} | create: ${toCreate.length}, delete: ${toDelete.length}, update: ${toUpdate.length}, matched: ${matched}`);

  // Deactivate removed records, then creates and updates in parallel
  for (const answer of toDelete) {
    await deleteRecord('Answer', answer.id,
      (id) => Cat_policyrequestanswersService.delete(id));
  }

  const ops: Promise<unknown>[] = [];

  for (const answer of toCreate) {
    ops.push(Cat_policyrequestanswersService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_questionid@odata.bind': `/cat_questions(${answer.questionId})`,
      cat_answervalue: answer.answerValue,
      cat_questiontextsnapshot: answer.questionTextSnapshot,
    } as Omit<Cat_policyrequestanswersBase, 'cat_policyrequestanswerid'>));
  }

  for (const { existing: e, desired: d } of toUpdate) {
    ops.push(Cat_policyrequestanswersService.update(e.id, {
      cat_answervalue: d.answerValue,
      cat_questiontextsnapshot: d.questionTextSnapshot,
    }));
  }

  await Promise.all(ops);
}

async function reconcileParticipants(
  requestId: string,
  existing: ExistingParticipant[],
  desired: WizardParticipant[],
): Promise<void> {
  const { toCreate, toDelete } = diffByKey(
    existing, desired,
    (e) => e.aadObjectId,
    (d) => d.aadObjectId,
    (e) => e.id,
  );

  const matched = existing.length - toDelete.length;
  console.log(`[Reconcile] Participants — existing: ${existing.length}, desired: ${desired.length} | create: ${toCreate.length}, delete: ${toDelete.length}, matched: ${matched}`);

  // Deactivate removed records, then creates in parallel
  for (const p of toDelete) {
    await deleteRecord('Participant', p.id,
      (id) => Cat_policyrequestparticipantsService.delete(id));
  }

  const ops: Promise<unknown>[] = [];

  for (const p of toCreate) {
    ops.push(Cat_policyrequestparticipantsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_Participant@odata.bind': `/systemusers(${p.dvUserId})`,
      cat_participantaadobjectid: p.aadObjectId,
      cat_participantupn: p.upn,
      cat_policyrequestparticipantname: p.displayName,
      cat_role: ROLE_DOMAIN_TO_NUM[p.role],
    } as Omit<Cat_policyrequestparticipantsBase, 'cat_policyrequestparticipantid'>));
  }

  await Promise.all(ops);
}

async function reconcilePatterns(
  requestId: string,
  existing: ExistingPattern[],
  desired: CustomConnectorPatternCreate[],
): Promise<void> {
  const { toCreate, toDelete, toUpdate } = diffByKey(
    existing, desired,
    (e) => e.hostUrlPattern,
    (d) => d.hostUrlPattern,
    (e) => e.id,
    (e, d) => (e.dataGroup as number) !== d.dataGroup || e.order !== String(d.order),
  );

  const matched = existing.length - toDelete.length;
  console.log(`[Reconcile] Patterns — existing: ${existing.length}, desired: ${desired.length} | create: ${toCreate.length}, delete: ${toDelete.length}, update: ${toUpdate.length}, matched: ${matched}`);

  // Deactivate removed records, then creates and updates in parallel
  for (const pattern of toDelete) {
    await deleteRecord('Pattern', pattern.id,
      (id) => Cat_powershieldcustomconnectorpatternsService.delete(id));
  }

  const ops: Promise<unknown>[] = [];

  for (const pattern of toCreate) {
    ops.push(Cat_powershieldcustomconnectorpatternsService.create({
      'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_name: pattern.hostUrlPattern,
      cat_datagroup: pattern.dataGroup as Cat_powershieldcustomconnectorpatternscat_datagroup,
      cat_order: String(pattern.order),
    } as Omit<Cat_powershieldcustomconnectorpatternsBase, 'cat_powershieldcustomconnectorpatternid'>));
  }

  for (const { existing: e, desired: d } of toUpdate) {
    ops.push(Cat_powershieldcustomconnectorpatternsService.update(e.id, {
      cat_datagroup: d.dataGroup as Cat_powershieldcustomconnectorpatternscat_datagroup,
      cat_order: String(d.order),
    }));
  }

  await Promise.all(ops);
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

interface ReconcileData {
  environments: WizardEnvironment[];
  connectors: Array<{ connectorId: string; displayName: string; connectorKey: string; connectorDetailsUrl?: string }>;
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: CustomConnectorPatternCreate[];
  answers: RequestAnswerCreate[];
  participants: WizardParticipant[];
}

/**
 * Smart reconciliation of child records for an existing draft request.
 * Fetches current Dataverse state, diffs against desired wizard state,
 * and performs only the necessary creates, deletes, and updates.
 */
export async function reconcileChildRecords(
  requestId: string,
  desired: ReconcileData,
): Promise<void> {
  console.log(`[Reconcile] Starting reconciliation for request ${requestId}`);

  // Isolation (SC-002 / FR-017): reconciliation only ever accepts a Connector
  // parent id. Assert the discriminator BEFORE reading or writing any children,
  // so a Credit id can never have its children rewritten by the connector wizard.
  const header = await Cat_policyrequestsService.get(requestId, {
    select: ['cat_requesttype'] as string[],
  });
  if (!header.success || !header.data) {
    throw new Error(header.error?.message ?? 'Failed to load request.');
  }
  assertRequestType(header.data.cat_requesttype, 'Connector');

  // Fetch all existing child records in parallel
  const [existingEnvs, existingConns, existingAnswers, existingParticipants, existingPatterns] = await Promise.all([
    fetchExistingEnvironments(requestId),
    fetchExistingConnectors(requestId),
    fetchExistingAnswers(requestId),
    fetchExistingParticipants(requestId),
    fetchExistingPatterns(requestId),
  ]);

  // Reconcile each type in parallel
  await Promise.all([
    reconcileEnvironments(requestId, existingEnvs, desired.environments),
    reconcileConnectors(requestId, existingConns, desired.connectors, desired.connectorActionOverrides),
    reconcileAnswers(requestId, existingAnswers, desired.answers),
    reconcileParticipants(requestId, existingParticipants, desired.participants),
    reconcilePatterns(requestId, existingPatterns, desired.customConnectorPatterns),
  ]);

  // Post-reconciliation verification: re-fetch connector count to confirm
  const verifyConns = await fetchExistingConnectors(requestId);
  if (verifyConns.length !== desired.connectors.length) {
    console.error(`[Reconcile] VERIFICATION FAILED — Connectors: expected ${desired.connectors.length}, found ${verifyConns.length}`);
    console.error(`[Reconcile]   → Remaining connectors:`, verifyConns.map((c) => `${c.displayName} (connId: ${c.connectorId}, recId: ${c.id})`));
  } else {
    console.log(`[Reconcile] Verification passed — Connectors: ${verifyConns.length} (expected ${desired.connectors.length})`);
  }

  console.log(`[Reconcile] Reconciliation complete for request ${requestId}`);
}
