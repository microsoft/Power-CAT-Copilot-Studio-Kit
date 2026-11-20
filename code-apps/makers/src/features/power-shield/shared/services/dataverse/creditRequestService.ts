import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_policyrequestanswersService } from '../../../../../generated/services/Cat_policyrequestanswersService';
import { Cat_policyrequestparticipantsService } from '../../../../../generated/services/Cat_policyrequestparticipantsService';
import { Cat_servicetreesService } from '../../../../../generated/services/Cat_servicetreesService';
import { Cat_powershieldenvironmentgroupsService } from '../../../../../generated/services/Cat_powershieldenvironmentgroupsService';
import { SystemusersService } from '../../../../../generated/services/SystemusersService';
import { AnnotationsService } from '../../../../../generated/services/AnnotationsService';
import type {
  Cat_policyrequests,
  Cat_policyrequestsBase,
  Cat_policyrequestscat_status,
} from '../../../../../generated/models/Cat_policyrequestsModel';
import type {
  Cat_policyrequestenvironments,
  Cat_policyrequestenvironmentsBase,
} from '../../../../../generated/models/Cat_policyrequestenvironmentsModel';
import type { Cat_policyrequestanswersBase } from '../../../../../generated/models/Cat_policyrequestanswersModel';
import type {
  Cat_policyrequestparticipants,
  Cat_policyrequestparticipantsBase,
} from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { AnnotationsBase } from '../../../../../generated/models/AnnotationsModel';
import type { RequestStatus, CreditChildState, CreditRequestLabel, ParticipantRole } from '../../../models/status';
import type { RequestParticipant } from '../../../models/requestParticipant';
import type {
  CreditRequestSummary,
  CreditRequestDetail,
  CreditEnvironmentView,
  CreditDraftPayload,
  CreditSubmitPayload,
  CreditSubmitResult,
  CreditSubmitOutcome,
  CreditWizardEnvironment,
  CreditParticipantInput,
  CreditEnvDiff,
  LoadCreditDraftResult,
} from '../../../models/creditRequest';
import { fileToBase64 } from '../../utils/fileUtils';
import { parseOptionalWholeNumber } from '../../utils/parseOptionalWholeNumber';
import {
  MIN_REQUESTED_CREDITS,
  MAX_REQUESTED_CREDITS,
} from '../../utils/creditAmountRules';
import { REQUEST_TYPE_CREDITS, classifyRequestTypeStrict, andRequestType } from './requestType';

// ─────────────────────────────────────────────────────────────────────────────
// Typed credit repository (Maker slice) — the isolation seam for credit requests.
//
// Contract: contracts/creditRequests-repository.md. This module is the ONLY
// credit-side writer. It injects `cat_requesttype = Credits` on every write, and
// every ID-taking op reads the discriminator and rejects a non-Credits row with a
// strict `assertRequestType(..., 'Credits')` BEFORE touching children or sensitive
// data. List/stat reads use `andRequestType(filter, 'Credits')` (strict equality;
// null never matches), applied ONCE after the ownership predicate.
//
// Row-level ownership (T013, FR-017a, SC-007): list reads are scoped to the
// current maker via an OData filter (created-by OR participant), evaluated
// server-side — never client array filtering. Single-record ops (detail, draft
// resume, withdraw, change, comments) take only a request id per the contract;
// their ownership is enforced by Dataverse row-level security server-side, exactly
// as the connector `getRequestDetail`/`withdrawRequest` rely on it.
// ─────────────────────────────────────────────────────────────────────────────

// Header cat_status option-set integers (shared option set; see requestService.ts).
const HEADER_STATUS_DRAFT: Cat_policyrequestscat_status = 1 as Cat_policyrequestscat_status;
const HEADER_STATUS_SUBMITTED: Cat_policyrequestscat_status = 2 as Cat_policyrequestscat_status;
const HEADER_STATUS_WITHDRAWN: Cat_policyrequestscat_status = 3 as Cat_policyrequestscat_status;

// Coarse header status int → connector-domain string, used only for the summary's
// `status` field. NOTE: the credit maker LABEL is derived by deriveCreditLabel,
// NOT by this map (data-model.md §5, S6 — do not re-decode cat_status with the
// connector vocabulary for the label).
const STATUS_NUM_TO_DOMAIN: Record<number, RequestStatus> = {
  1: 'Draft', 2: 'Submitted', 3: 'Withdrawn', 4: 'AutoRejected',
  5: 'UnderReview', 6: 'Approved', 7: 'Rejected', 8: 'Implementing',
  9: 'Implemented', 10: 'ImplementedWithErrors',
};

// cat_credit_childstate option-set integers (data-model.md §8).
const CREDIT_CHILD_STATE_PENDING = 335350010;
const CREDIT_CHILD_STATE_NUM_TO_DOMAIN: Record<number, CreditChildState> = {
  335350010: 'Pending', 335350011: 'Processing', 335350012: 'Succeeded',
  335350013: 'FailedRetryable', 335350014: 'FailedPermanent',
  335350015: 'UnknownOutcome',
};

const ROLE_DOMAIN_TO_NUM: Record<ParticipantRole, number> = { Participant: 1 };

const CREDIT_LIST_SELECT = [
  'cat_policyrequestid', 'cat_policyrequestname', 'cat_status', 'cat_requesttype',
  'cat_submittedon', 'cat_decidedon', 'cat_createdbyupn', 'cat_createdbyaadobjectid',
  '_cat_servicetreeid_value', '_cat_environmentgroup_value', 'cat_requestenvironmentcount',
  '_cat_assignedadministrator_value',
];

const CREDIT_DETAIL_SELECT = [
  'cat_policyrequestid', 'cat_policyrequestname', 'cat_status', 'cat_requesttype', 'cat_justification',
  'cat_submittedon', 'cat_decidedon', 'cat_lasterrorsummary', 'cat_createdbyaadobjectid',
  'cat_createdbyupn', '_cat_servicetreeid_value', '_cat_environmentgroup_value',
];

const CREDIT_ENV_SELECT = [
  'cat_policyrequestenvironmentid', '_cat_policyrequestid_value',
  'cat_environmentguid', 'cat_environmentname', 'cat_credit_childstate', 'cat_credit_activeenvkey',
  'cat_creditrequestedamount', 'cat_credit_approvedamount', 'cat_credit_requesttenantdraw',
];

/** True when `value` is a whole number inside the allowed requested-credits range. */
function isValidRequestedAmount(value: number | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_REQUESTED_CREDITS &&
    value <= MAX_REQUESTED_CREDITS
  );
}

/** Thrown when a credit write fails; carries the partially-created request id when known. */
export class CreditRequestError extends Error {
  partialRequestId?: string;
  /** True when the failure is a wrong-type / not-a-credit-request rejection (typed not-found). */
  notFound?: boolean;
  constructor(message: string, partialRequestId?: string, opts?: { notFound?: boolean }) {
    super(message);
    this.name = 'CreditRequestError';
    this.partialRequestId = partialRequestId;
    this.notFound = opts?.notFound;
  }
}

/** Throws a CreditRequestError when a generated write result reports failure. */
function ensureOk(result: { success: boolean; error?: { message?: string } }, message: string): void {
  if (!result.success) throw new CreditRequestError(result.error?.message ?? message);
}

/** Escapes a value for safe interpolation inside a single-quoted OData string literal. */
function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

// ─────────────────────────────────────────────────────────────────────────────
// Label derivation
//
// The header has no server rollup label column (only allocationowner,
// reviewbydate and intendedduration). So this slice DERIVES the maker label
// client-side from the header status plus the child credit states, instead of
// reading an authoritative server rollup.
// The 'Returned' label is UNREACHABLE: the shared cat_status option set has
// no "returned-for-edit" value, so a returned request cannot be distinguished
// from 'Awaiting approval'.
// ─────────────────────────────────────────────────────────────────────────────

/** Derives the maker-visible credit label from header status + child credit states. */
export function deriveCreditLabel(
  statusRaw: number | string | null | undefined,
  childStates: CreditChildState[],
): CreditRequestLabel {
  const status = Number(statusRaw);
  if (status === 1) return 'Draft';
  if (status === 3) return 'Withdrawn';
  if (status === 4 || status === 7) return 'Declined';
  if (status === 2 || status === 5) return 'Awaiting approval';

  // Only the known approved/allocating header states resolve from child states.
  // Any other (or NaN/unknown) header status fails closed to an attention label
  // rather than asserting an allocation state the data does not prove (FR-032).
  const isAllocationPhase = status === 6 || status === 8 || status === 9 || status === 10;
  if (!isAllocationPhase) return 'Needs admin attention';

  if (childStates.length === 0) return 'Approved and awaiting allocation';

  // UnknownOutcome (incl. any unrecognized persisted value, mapped to UnknownOutcome
  // by the child mapper) counts as an attention state — fail closed, never optimistic.
  const anyAttention = childStates.some(
    (s) => s === 'FailedRetryable' || s === 'FailedPermanent' || s === 'UnknownOutcome',
  );
  // "Allocated" requires the data to prove every child is Succeeded (data-model.md §5).
  const allSucceeded = childStates.every((s) => s === 'Succeeded');

  // Single-environment grain (one child per request): a request is either fully
  // allocated, still working, or needs attention — there is no partial state.
  if (anyAttention) return 'Needs admin attention';
  if (allSucceeded) return 'Allocated';
  if (childStates.some((s) => s === 'Processing')) return 'Allocating';
  if (childStates.every((s) => s === 'Pending')) return 'Approved and awaiting allocation';
  return 'Allocating';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status-based environment conflict check (replaces the alt-key lookup)
//
// An environment is "taken" only while its credit request is still IN PROGRESS.
// A request stops reserving its environment the moment it reaches a terminal
// state — Draft (not submitted yet), Allocated (done), Declined, or Withdrawn —
// so a rejected or withdrawn request never blocks a fresh request again (the
// alt-key never cleared on reject, which was the old bug). This is a SOFT check:
// there is no longer a unique-key atomic guard, so it fails OPEN on a read error.
// ─────────────────────────────────────────────────────────────────────────────

/** Credit labels that release the environment; every other label still blocks. */
const NON_BLOCKING_CREDIT_LABELS: ReadonlySet<CreditRequestLabel> = new Set<CreditRequestLabel>([
  'Draft',
  'Allocated',
  'Declined',
  'Withdrawn',
]);

/** True when a request with this label still reserves its environment. */
function creditLabelBlocksNewRequest(label: CreditRequestLabel): boolean {
  return !NON_BLOCKING_CREDIT_LABELS.has(label);
}

/**
 * Returns the id of an in-progress Credits request that already owns this
 * environment, or undefined when the environment is free. Reads the environment
 * children by GUID, then the owning Credits headers, and derives each label to
 * decide whether it still blocks. Fails open (undefined) on any read error.
 */
async function findBlockingCreditRequestForEnv(environmentGuid: string): Promise<string | undefined> {
  const children = await Cat_policyrequestenvironmentsService.getAll({
    filter: `cat_environmentguid eq '${escapeODataLiteral(environmentGuid)}'`,
    select: ['_cat_policyrequestid_value', 'cat_credit_childstate', 'cat_creditrequestedamount'],
  });
  if (!children.success) return undefined; // soft check — never block on a read error

  const statesByParent = new Map<string, CreditChildState[]>();
  for (const row of children.data ?? []) {
    const parent = row._cat_policyrequestid_value;
    if (!parent) continue;
    const state =
      row.cat_credit_childstate != null
        ? CREDIT_CHILD_STATE_NUM_TO_DOMAIN[Number(row.cat_credit_childstate)] ?? 'UnknownOutcome'
        : undefined;
    const list = statesByParent.get(parent) ?? [];
    if (state) list.push(state);
    statesByParent.set(parent, list);
  }
  const parentIds = [...statesByParent.keys()];
  if (parentIds.length === 0) return undefined;

  // Restrict to Credits headers — the environment table is shared with connector
  // requests, whose rows must never count as a credit conflict.
  const idClause = parentIds.map((id) => `cat_policyrequestid eq ${id}`).join(' or ');
  const headers = await Cat_policyrequestsService.getAll({
    filter: andRequestType(`(${idClause})`, 'Credits'),
    select: ['cat_policyrequestid', 'cat_status'],
  });
  if (!headers.success) return undefined; // soft check

  for (const header of headers.data ?? []) {
    const label = deriveCreditLabel(header.cat_status, statesByParent.get(header.cat_policyrequestid) ?? []);
    if (creditLabelBlocksNewRequest(label)) return header.cat_policyrequestid;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers & shared helpers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeEnvKey(environmentGuid: string): string {
  // Canonical form for the unique alternate key: strip surrounding braces so
  // "{GUID}" and "GUID" never resolve to two different active keys, then lowercase.
  return environmentGuid.trim().replace(/^\{|\}$/g, '').toLowerCase();
}

function toCreditEnvironmentView(r: Cat_policyrequestenvironments): CreditEnvironmentView {
  return {
    id: r.cat_policyrequestenvironmentid,
    environmentGuid: r.cat_environmentguid ?? '',
    environmentName: r.cat_environmentname ?? '',
    // A null child state means "not yet stamped" (draft); an unrecognized non-null
    // value fails closed to UnknownOutcome so bad data never reads as optimistic.
    creditChildState:
      r.cat_credit_childstate != null
        ? CREDIT_CHILD_STATE_NUM_TO_DOMAIN[Number(r.cat_credit_childstate)] ?? 'UnknownOutcome'
        : undefined,
    activeEnvKey: r.cat_credit_activeenvkey ?? undefined,
    requestedAmount: parseOptionalWholeNumber(r.cat_creditrequestedamount),
    approvedAmount: parseOptionalWholeNumber(r.cat_credit_approvedamount),
    requestTenantDraw: r.cat_credit_requesttenantdraw === true,
  };
}

function toCreditParticipant(r: Cat_policyrequestparticipants): RequestParticipant {
  return {
    id: r.cat_policyrequestparticipantid,
    policyRequestId: r._cat_policyrequestid_value ?? '',
    participantAadObjectId: r.cat_participantaadobjectid ?? '',
    participantUpn: r.cat_participantupn ?? '',
    role: 'Participant',
  };
}

async function fetchServiceTreeName(serviceTreeId: string): Promise<string | undefined> {
  if (!serviceTreeId) return undefined;
  const result = await Cat_servicetreesService.get(serviceTreeId, { select: ['cat_servicetreename'] });
  return result.data?.cat_servicetreename ?? undefined;
}

async function fetchEnvironmentGroupName(groupId: string | undefined): Promise<string | undefined> {
  if (!groupId) return undefined;
  const result = await Cat_powershieldenvironmentgroupsService.get(groupId, { select: ['cat_name'] });
  return result.data?.cat_name ?? undefined;
}

/** Resolves creator display names from systemusers via AAD Object ID (batched). */
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
    if (u.azureactivedirectoryobjectid) map.set(u.azureactivedirectoryobjectid, u.fullname ?? '');
  }
  return map;
}

/** Resolves assigned-admin display names from systemusers via the lookup GUID (batched). */
async function fetchAssignedAdminNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `systemuserid eq ${id}`).join(' or ');
  const result = await SystemusersService.getAll({ filter, select: ['systemuserid', 'fullname'] });
  const map = new Map<string, string>();
  for (const u of result.data ?? []) map.set(u.systemuserid, u.fullname ?? '');
  return map;
}

/** Resolves service tree display names for a set of GUIDs (batched). */
async function fetchServiceTreeNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `cat_servicetreeid eq ${id}`).join(' or ');
  const result = await Cat_servicetreesService.getAll({
    filter,
    select: ['cat_servicetreeid', 'cat_servicetreename'],
  });
  const map = new Map<string, string>();
  for (const st of result.data ?? []) map.set(st.cat_servicetreeid, st.cat_servicetreename ?? '');
  return map;
}

/**
 * Builds the row-level ownership OData filter for the current maker (T013).
 * Two-step (mirrors connector getRequestList): resolve participant request ids,
 * then combine with created-by. Evaluated server-side; never client filtering.
 */
async function buildOwnershipFilter(aadObjectId: string): Promise<string> {
  const participantResult = await Cat_policyrequestparticipantsService.getAll({
    filter: `cat_participantaadobjectid eq '${aadObjectId}'`,
    select: ['_cat_policyrequestid_value'],
  });
  const participantIds = (participantResult.data ?? [])
    .map((p) => p._cat_policyrequestid_value)
    .filter((id): id is string => Boolean(id));

  let filter = `cat_createdbyaadobjectid eq '${aadObjectId}'`;
  if (participantIds.length > 0) {
    const orParts = participantIds.map((id) => `cat_policyrequestid eq ${id}`).join(' or ');
    filter = `(${filter}) or (${orParts})`;
  }
  return filter;
}

interface CreditChildSummary {
  states: CreditChildState[];
  /** Requested amount per child; `undefined` where a (draft) child has none. */
  amounts: (number | undefined)[];
  /** Credits added per child: the approved amount once allocation succeeded, else `undefined`. */
  added: (number | undefined)[];
  /** Environment display names (cat_environmentname) that are set. */
  names: string[];
}

/**
 * Requested credits across a header's children: the sum of the amounts that exist. A child
 * may have no amount when the maker only asked for tenant draw (spec 031, FR-015).
 */
function totalAmount(amounts: (number | undefined)[]): number | undefined {
  const present = amounts.filter((a): a is number => a !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce((sum, a) => sum + a, 0);
}

/** Total only when every child has a value, so a partly allocated header shows "-". */
function totalIfComplete(amounts: (number | undefined)[]): number | undefined {
  if (amounts.length === 0 || amounts.some((a) => a === undefined)) return undefined;
  return amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
}

/** Loads child credit states and requested amounts for a set of request ids, grouped by parent id. */
async function fetchChildStatesByRequest(requestIds: string[]): Promise<Map<string, CreditChildSummary>> {
  const map = new Map<string, CreditChildSummary>();
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const filter = ids.map((id) => `_cat_policyrequestid_value eq ${id}`).join(' or ');
  const result = await Cat_policyrequestenvironmentsService.getAll({
    filter,
    select: ['_cat_policyrequestid_value', 'cat_credit_childstate', 'cat_creditrequestedamount', 'cat_credit_approvedamount', 'cat_environmentname'],
  });
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to load credit child states.');
  }
  for (const row of result.data ?? []) {
    const parent = row._cat_policyrequestid_value;
    if (!parent) continue;
    // Unrecognized non-null option values fail closed to UnknownOutcome.
    const state =
      row.cat_credit_childstate != null
        ? CREDIT_CHILD_STATE_NUM_TO_DOMAIN[Number(row.cat_credit_childstate)] ?? 'UnknownOutcome'
        : undefined;
    const summary = map.get(parent) ?? { states: [], amounts: [], added: [], names: [] };
    if (state) summary.states.push(state);
    if (row.cat_environmentname) summary.names.push(row.cat_environmentname);
    summary.amounts.push(parseOptionalWholeNumber(row.cat_creditrequestedamount));
    summary.added.push(state === 'Succeeded' ? parseOptionalWholeNumber(row.cat_credit_approvedamount) : undefined);
    map.set(parent, summary);
  }
  return map;
}

/** Reads a header and strict-asserts it is a Credits row before any child access. */
async function assertCreditHeader(requestId: string, select: string[]): Promise<Cat_policyrequests> {
  const headerResult = await Cat_policyrequestsService.get(requestId, { select });
  if (!headerResult.success || !headerResult.data) {
    throw new CreditRequestError(headerResult.error?.message ?? 'Failed to load credit request.');
  }
  // Reject a non-Credits id as a typed not-found so callers can distinguish a
  // wrong-type route from an operational failure (SC-004). classifyRequestTypeStrict
  // throws on an unrecognized discriminator (fail-safe), which stays a hard error.
  if (classifyRequestTypeStrict(headerResult.data.cat_requesttype) !== 'Credits') {
    throw new CreditRequestError(
      'This request is not available in the Copilot Credits experience.',
      undefined,
      { notFound: true },
    );
  }
  return headerResult.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists the current maker's credit requests (row-level scoped, Credits-only).
 * Stat cards are derived by the caller from the returned `creditLabel` values, so
 * no separate stat query is needed — the same owned+typed set backs both.
 */
export async function getCreditRequestList(options: {
  aadObjectId: string;
  statusFilter?: number[];
}): Promise<CreditRequestSummary[]> {
  const { aadObjectId, statusFilter } = options;

  let filter = await buildOwnershipFilter(aadObjectId);
  if (statusFilter && statusFilter.length > 0) {
    const statusClause = statusFilter.map((s) => `cat_status eq ${s}`).join(' or ');
    filter = `(${filter}) and (${statusClause})`;
  }
  // Isolation (SC-002): strict Credits-only, applied once after ownership/status.
  filter = andRequestType(filter, 'Credits');

  const result = await Cat_policyrequestsService.getAll({
    filter,
    select: CREDIT_LIST_SELECT,
    orderBy: ['createdon desc'],
    top: 100,
  });
  if (!result.success) throw new CreditRequestError(result.error?.message ?? 'Failed to load credit requests.');

  const rows = result.data ?? [];
  const [stNameMap, creatorNameMap, egNameMap, adminNameMap, childStateMap] = await Promise.all([
    fetchServiceTreeNames(rows.map((r) => r._cat_servicetreeid_value ?? '')),
    fetchCreatorNames(rows.map((r) => r.cat_createdbyaadobjectid ?? '')),
    fetchEnvironmentGroupNames(rows.map((r) => r._cat_environmentgroup_value ?? '')),
    fetchAssignedAdminNames(rows.map((r) => r._cat_assignedadministrator_value ?? '')),
    fetchChildStatesByRequest(rows.map((r) => r.cat_policyrequestid)),
  ]);

  return rows.map((r) => {
    const serviceTreeId = r._cat_servicetreeid_value ?? '';
    const environmentGroupId = r._cat_environmentgroup_value ?? undefined;
    const children = childStateMap.get(r.cat_policyrequestid) ?? { states: [], amounts: [], added: [], names: [] };
    return {
      id: r.cat_policyrequestid,
      requestNumber: r.cat_policyrequestname ?? '',
      serviceTreeId,
      serviceTreeName: stNameMap.get(serviceTreeId),
      environmentGroupId,
      environmentGroupName: environmentGroupId ? egNameMap.get(environmentGroupId) : undefined,
      environmentCount: r.cat_requestenvironmentcount ? parseInt(r.cat_requestenvironmentcount, 10) : undefined,
      // Unknown/NaN header status fails closed to a non-actionable state ('Submitted'),
      // never 'Draft', so an unrecognized value can't wrongly expose the Resume action.
      status: STATUS_NUM_TO_DOMAIN[Number(r.cat_status)] ?? 'Submitted',
      requestedAmount: totalAmount(children.amounts),
      // After a successful allocation the target is current + approved, so the
      // approved amount is exactly what was added. Unfinished children show a dash.
      creditsAdded: totalIfComplete(children.added),
      environmentNames: children.names,
      creditLabel: deriveCreditLabel(r.cat_status, children.states),
      submittedOn: r.cat_submittedon,
      decidedOn: r.cat_decidedon ?? undefined,
      assignedAdminName: r._cat_assignedadministrator_value
        ? adminNameMap.get(r._cat_assignedadministrator_value)
        : undefined,
      createdByUpn: r.cat_createdbyupn ?? '',
      createdByAadObjectId: r.cat_createdbyaadobjectid ?? undefined,
      createdByName: r.cat_createdbyaadobjectid ? creatorNameMap.get(r.cat_createdbyaadobjectid) : undefined,
    };
  });
}

/** Resolves environment-group display names for a set of GUIDs (batched). */
async function fetchEnvironmentGroupNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const filter = uniqueIds.map((id) => `cat_powershieldenvironmentgroupid eq ${id}`).join(' or ');
  const result = await Cat_powershieldenvironmentgroupsService.getAll({
    filter,
    select: ['cat_powershieldenvironmentgroupid', 'cat_name'],
  });
  const map = new Map<string, string>();
  for (const g of result.data ?? []) map.set(g.cat_powershieldenvironmentgroupid, g.cat_name ?? '');
  return map;
}

/**
 * Loads a single credit request header + maker-safe children. Rejects a
 * non-Credits id (typed error) BEFORE reading any children.
 */
export async function getCreditRequestDetail(requestId: string): Promise<CreditRequestDetail> {
  const header = await assertCreditHeader(requestId, CREDIT_DETAIL_SELECT);

  const childFilter = `_cat_policyrequestid_value eq ${requestId}`;
  const [envResult, parResult] = await Promise.all([
    Cat_policyrequestenvironmentsService.getAll({ filter: childFilter, select: CREDIT_ENV_SELECT }),
    Cat_policyrequestparticipantsService.getAll({
      filter: childFilter,
      select: [
        'cat_policyrequestparticipantid', '_cat_policyrequestid_value',
        'cat_participantaadobjectid', 'cat_participantupn', 'cat_role',
      ],
    }),
  ]);
  // Fail the read rather than returning a partial request that could mislabel
  // (e.g. a failed environment query reading as "Approved and awaiting allocation").
  ensureOk(envResult, 'Failed to load credit request environments.');
  ensureOk(parResult, 'Failed to load credit request participants.');

  const environments = (envResult.data ?? []).map(toCreditEnvironmentView);
  const serviceTreeId = header._cat_servicetreeid_value ?? '';
  const environmentGroupId = header._cat_environmentgroup_value ?? undefined;

  const [serviceTreeName, environmentGroupName, creatorNameMap] = await Promise.all([
    fetchServiceTreeName(serviceTreeId),
    fetchEnvironmentGroupName(environmentGroupId),
    fetchCreatorNames([header.cat_createdbyaadobjectid ?? '']),
  ]);

  return {
    id: header.cat_policyrequestid,
    requestNumber: header.cat_policyrequestname ?? '',
    serviceTreeId,
    serviceTreeName,
    environmentGroupId,
    environmentGroupName,
    status: STATUS_NUM_TO_DOMAIN[Number(header.cat_status)] ?? 'Submitted',
    creditLabel: deriveCreditLabel(
      header.cat_status,
      environments.map((e) => e.creditChildState).filter((s): s is CreditChildState => Boolean(s)),
    ),
    justification: header.cat_justification ?? '',
    submittedOn: header.cat_submittedon,
    decidedOn: header.cat_decidedon,
    lastErrorSummary: header.cat_lasterrorsummary,
    createdByAadObjectId: header.cat_createdbyaadobjectid ?? '',
    createdByUpn: header.cat_createdbyupn ?? '',
    createdByName: header.cat_createdbyaadobjectid
      ? creatorNameMap.get(header.cat_createdbyaadobjectid)
      : undefined,
    environments,
    participants: (parResult.data ?? []).map(toCreditParticipant),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Child writers (private)
// ─────────────────────────────────────────────────────────────────────────────

/** Creates one Credits header row. Always stamps `cat_requesttype = Credits`. */
async function createCreditHeader(
  payload: Pick<CreditDraftPayload, 'createdByAadObjectId' | 'createdByUpn' | 'justification'>,
  status: Cat_policyrequestscat_status,
  submittedOn?: string,
): Promise<string> {
  // Credit requests leave the Service Tree and Environment Group lookups unset: both
  // columns are optional in Dataverse, but the generated model types them as required,
  // so the cast below is needed. Never send these keys (not even as null).
  const result = await Cat_policyrequestsService.create({
    cat_createdbyaadobjectid: payload.createdByAadObjectId,
    cat_createdbyupn: payload.createdByUpn,
    cat_justification: payload.justification,
    cat_status: status,
    cat_requesttype: REQUEST_TYPE_CREDITS, // isolation: never rely on the Dataverse default
    ...(submittedOn ? { cat_submittedon: submittedOn } : {}),
  } as Omit<Cat_policyrequestsBase, 'cat_policyrequestid'>);

  const newId = result.data?.cat_policyrequestid;
  if (!result.success || !newId) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to create credit request header.');
  }
  return newId;
}

/** Writes answers + participants under a header (used by draft and each submit header). */
async function writeCreditSideRecords(
  requestId: string,
  answers: CreditDraftPayload['answers'],
  participants: CreditParticipantInput[] | undefined,
): Promise<void> {
  for (const answer of answers ?? []) {
    const res = await Cat_policyrequestanswersService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_questionid@odata.bind': `/cat_questions(${answer.questionId})`,
      cat_answervalue: answer.answerValue,
      cat_questiontextsnapshot: answer.questionTextSnapshot,
    } as Omit<Cat_policyrequestanswersBase, 'cat_policyrequestanswerid'>);
    ensureOk(res, 'Failed to save credit request answer.');
  }
  for (const p of participants ?? []) {
    const res = await Cat_policyrequestparticipantsService.create({
      'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
      'cat_Participant@odata.bind': `/systemusers(${p.dvUserId})`,
      cat_participantaadobjectid: p.aadObjectId,
      cat_participantupn: p.upn,
      cat_policyrequestparticipantname: p.displayName,
      cat_role: ROLE_DOMAIN_TO_NUM.Participant,
    } as Omit<Cat_policyrequestparticipantsBase, 'cat_policyrequestparticipantid'>);
    ensureOk(res, 'Failed to save credit request participant.');
  }
}

const CREDIT_SUPPORTING_DOC_PREFIX = 'SUPPORTING_DOC:';

async function uploadCreditSupportingDocument(requestId: string, file: File): Promise<void> {
  const base64 = await fileToBase64(file);
  const result = await AnnotationsService.create({
    subject: file.name,
    notetext: `${CREDIT_SUPPORTING_DOC_PREFIX}${requestId}`,
    filename: file.name,
    mimetype: file.type,
    documentbody: base64,
    isdocument: true as unknown as AnnotationsBase['isdocument'],
  } as Omit<AnnotationsBase, 'annotationid'>);
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? `Failed to upload supporting document "${file.name}".`);
  }
}

/** Deletes all environment children under a header (used on draft re-save). */
async function deleteCreditEnvironmentChildren(requestId: string): Promise<void> {
  const existing = await Cat_policyrequestenvironmentsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestenvironmentid'],
  });
  ensureOk(existing, 'Failed to load existing credit environments.');
  for (const row of existing.data ?? []) {
    await Cat_policyrequestenvironmentsService.delete(row.cat_policyrequestenvironmentid);
  }
}

/** Deletes all answer children under a header (used on draft re-save). */
async function deleteCreditAnswerChildren(requestId: string): Promise<void> {
  const existing = await Cat_policyrequestanswersService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestanswerid'],
  });
  ensureOk(existing, 'Failed to load existing credit answers.');
  for (const row of existing.data ?? []) {
    await Cat_policyrequestanswersService.delete(row.cat_policyrequestanswerid);
  }
}

/** Deletes all participant children under a header (used on draft re-save). */
async function deleteCreditParticipantChildren(requestId: string): Promise<void> {
  const existing = await Cat_policyrequestparticipantsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: ['cat_policyrequestparticipantid'],
  });
  ensureOk(existing, 'Failed to load existing credit participants.');
  for (const row of existing.data ?? []) {
    await Cat_policyrequestparticipantsService.delete(row.cat_policyrequestparticipantid);
  }
}

/** Deletes the supporting-document annotation(s) linked to a request via notetext. */
async function deleteCreditSupportingDocument(requestId: string): Promise<void> {
  const existing = await AnnotationsService.getAll({
    filter: `notetext eq '${CREDIT_SUPPORTING_DOC_PREFIX}${escapeODataLiteral(requestId)}'`,
    select: ['annotationid'] as string[],
  });
  for (const row of existing.data ?? []) {
    await AnnotationsService.delete(row.annotationid);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft save
//
// A draft is a SINGLE Credits header (status Draft) with N environment children.
// Draft children do NOT set `cat_credit_childstate`: a draft must not imply an
// allocation state. The Pending state is stamped only at submit, when the request
// fans out to one header per environment. A draft is also excluded from the
// status-based conflict check, so it never blocks another request.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveCreditDraft(payload: CreditDraftPayload): Promise<{ requestId: string }> {
  const { draftRequestId, environments } = payload;

  let requestId: string;
  if (draftRequestId) {
    // Edit: reject a non-Credits row BEFORE mutating, and only allow editing a
    // request still in Draft (a Submitted/allocated row must not be overwritten).
    const existing = await assertCreditHeader(draftRequestId, ['cat_requesttype', 'cat_status']);
    if (Number(existing.cat_status) !== Number(HEADER_STATUS_DRAFT)) {
      throw new CreditRequestError('Only a draft credit request can be edited.');
    }
    const update = await Cat_policyrequestsService.update(draftRequestId, {
      cat_createdbyaadobjectid: payload.createdByAadObjectId,
      cat_createdbyupn: payload.createdByUpn,
      cat_justification: payload.justification,
      cat_requesttype: REQUEST_TYPE_CREDITS,
    });
    ensureOk(update, 'Failed to update credit draft.');
    requestId = draftRequestId;
    // Rebuild children from the payload so an edit can't leave stale rows behind.
    await deleteCreditEnvironmentChildren(requestId);
    await deleteCreditAnswerChildren(requestId);
    await deleteCreditParticipantChildren(requestId);
  } else {
    requestId = await createCreditHeader(payload, HEADER_STATUS_DRAFT);
  }

  try {
    for (const env of environments) {
      // Drafts keep only valid amounts; an empty or invalid box is simply not saved.
      // The tenant-draw tick is written only when set, never as `false` (spec 031).
      const amount = payload.requestedAmounts?.[env.environmentId];
      const res = await Cat_policyrequestenvironmentsService.create({
        'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
        cat_environmentguid: env.environmentId,
        cat_environmentname: env.displayName,
        ...(isValidRequestedAmount(amount) ? { cat_creditrequestedamount: amount } : {}),
        ...(payload.requestTenantDraw?.[env.environmentId] === true
          ? { cat_credit_requesttenantdraw: true }
          : {}),
      } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>);
      ensureOk(res, 'Failed to save credit draft environment.');
    }
    await writeCreditSideRecords(requestId, payload.answers, payload.participants);
    if (payload.supportingDocument) {
      // Replace any prior document so the "single optional document" rule holds.
      if (draftRequestId) await deleteCreditSupportingDocument(requestId);
      await uploadCreditSupportingDocument(requestId, payload.supportingDocument);
    }
  } catch (err) {
    if (err instanceof CreditRequestError) throw err;
    throw new CreditRequestError(err instanceof Error ? err.message : 'Failed to save credit draft.', requestId);
  }

  return { requestId };
}

/**
 * Best-effort deletes a per-environment header that was created during submit
 * fan-out but whose environment child never attached (child write failed, or a
 * post-create active-key conflict). Without this, a Submitted header with no
 * child would linger and show up as a real request awaiting approval. Cleanup
 * failures are swallowed so they never mask the original per-environment error.
 */
async function cleanupOrphanCreditHeader(requestId: string): Promise<void> {
  try {
    await deleteCreditSupportingDocument(requestId);
    await deleteCreditEnvironmentChildren(requestId);
    await deleteCreditAnswerChildren(requestId);
    await deleteCreditParticipantChildren(requestId);
    await Cat_policyrequestsService.delete(requestId);
  } catch {
    // Swallow: the original submit outcome (failed/conflict) is what the caller reports.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-submit conflict probe (Step 1 early validation)
//
// Returns the subset of `environments` that already have an IN-PROGRESS credit
// request (see findBlockingCreditRequestForEnv), so the wizard can surface the
// clash the moment the maker leaves Step 1 instead of only at submit. This is a
// SOFT check: a query failure fails OPEN (no conflict reported) so the maker is
// never blocked by a transient read error, and submit re-checks before creating.
// ─────────────────────────────────────────────────────────────────────────────

export async function findActiveCreditConflicts(
  environments: CreditWizardEnvironment[],
): Promise<CreditSubmitOutcome[]> {
  const conflicts: CreditSubmitOutcome[] = [];
  for (const env of environments) {
    const conflictParent = await findBlockingCreditRequestForEnv(env.environmentId);
    if (conflictParent) {
      conflicts.push({
        environmentGuid: env.environmentId,
        status: 'conflict',
        conflictWithRequestId: conflictParent,
      });
    }
  }
  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit (fan-out: one header per environment)
//
// Each environment gets its own Credits header (status Submitted) plus exactly one
// environment child stamped Pending. Before creating, a soft status-based check
// (findBlockingCreditRequestForEnv) surfaces an environment that already has an
// in-progress request as a per-environment `conflict` (A-5). There is no unique
// alternate key anymore, so this check is best-effort, not an atomic guard.
//
// Invariant: a submitted header must never exist without its environment child.
// Any per-environment create that fails after the header was created rolls the
// header back via cleanupOrphanCreditHeader before recording the outcome.
// ─────────────────────────────────────────────────────────────────────────────

export async function submitCreditRequest(payload: CreditSubmitPayload): Promise<CreditSubmitResult> {
  // Validate the draft shell (type + ownership via row security + Draft state)
  // BEFORE any fan-out, so a wrong-type or non-draft id can never create Credit rows.
  if (payload.draftRequestId) {
    const shell = await assertCreditHeader(payload.draftRequestId, ['cat_requesttype', 'cat_status']);
    if (Number(shell.cat_status) !== Number(HEADER_STATUS_DRAFT)) {
      throw new CreditRequestError('Only a draft credit request can be submitted.');
    }
  }

  const results: CreditSubmitOutcome[] = [];
  const submittedOn = new Date().toISOString();

  for (const env of payload.environments) {
    // Fail closed: never create a request with an invalid amount (even when ticked), or
    // with neither an amount nor a tenant-draw tick. The wizard blocks both, so reaching
    // here means a caller bug, not a maker mistake.
    const rawAmount = payload.requestedAmounts[env.environmentId];
    const amount = isValidRequestedAmount(rawAmount) ? rawAmount : undefined;
    const tenantDraw = payload.requestTenantDraw?.[env.environmentId] === true;
    if ((rawAmount !== undefined && amount === undefined) || (amount === undefined && !tenantDraw)) {
      results.push({
        environmentGuid: env.environmentId,
        status: 'failed',
        error: 'A valid requested credit amount or a tenant draw request is required.',
      });
      continue;
    }

    // Soft pre-check: skip an environment that already has an in-progress request
    // and report it as a conflict pointing at the owning request.
    const conflictParent = await findBlockingCreditRequestForEnv(env.environmentId);
    if (conflictParent) {
      results.push({ environmentGuid: env.environmentId, status: 'conflict', conflictWithRequestId: conflictParent });
      continue;
    }

    let requestId: string | undefined;
    try {
      requestId = await createCreditHeader(payload, HEADER_STATUS_SUBMITTED, submittedOn);
      const childRes = await Cat_policyrequestenvironmentsService.create({
        'cat_policyrequestid@odata.bind': `/cat_policyrequests(${requestId})`,
        cat_environmentguid: env.environmentId,
        cat_environmentname: env.displayName,
        cat_credit_childstate: CREDIT_CHILD_STATE_PENDING,
        ...(amount !== undefined ? { cat_creditrequestedamount: amount } : {}),
        ...(tenantDraw ? { cat_credit_requesttenantdraw: true } : {}),
      } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>);

      if (!childRes.success) {
        // The header we just created never got its child — roll it back so it
        // cannot appear as an orphaned request awaiting approval.
        await cleanupOrphanCreditHeader(requestId);
        results.push({ environmentGuid: env.environmentId, status: 'failed', error: childRes.error?.message });
        continue;
      }

      await writeCreditSideRecords(requestId, payload.answers, payload.participants);
      if (payload.supportingDocument) {
        await uploadCreditSupportingDocument(requestId, payload.supportingDocument);
      }
      results.push({ environmentGuid: env.environmentId, status: 'created', requestId });
    } catch (err) {
      // Something failed after (or during) header creation — roll the header and
      // any partial children back so no half-written request lingers.
      if (requestId) await cleanupOrphanCreditHeader(requestId);
      results.push({
        environmentGuid: env.environmentId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to submit credit request for environment.',
      });
    }
  }

  // Remove the draft shell only if at least one environment actually submitted;
  // otherwise the maker keeps their recoverable draft. Its supporting-document
  // annotation is deleted with it so it is not orphaned.
  if (payload.draftRequestId && results.some((r) => r.status === 'created')) {
    await deleteCreditSupportingDocument(payload.draftRequestId);
    await deleteCreditEnvironmentChildren(payload.draftRequestId);
    await deleteCreditAnswerChildren(payload.draftRequestId);
    await deleteCreditParticipantChildren(payload.draftRequestId);
    await Cat_policyrequestsService.delete(payload.draftRequestId);
  }

  return { results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/** Withdraws a credit request. Allowed only while Awaiting approval (Submitted/UnderReview). */
export async function withdrawCreditRequest(requestId: string): Promise<void> {
  const header = await assertCreditHeader(requestId, ['cat_requesttype', 'cat_status']);
  // "Awaiting approval" is header status 2 (Submitted) or 5 (UnderReview) — matches
  // deriveCreditLabel. The server transition command remains the atomic guard
  // against a stale-state race (data-model.md §7a).
  const status = Number(header.cat_status);
  if (status !== 2 && status !== 5) {
    throw new CreditRequestError('This request can only be withdrawn while it is awaiting approval.');
  }
  const result = await Cat_policyrequestsService.update(requestId, { cat_status: HEADER_STATUS_WITHDRAWN });
  ensureOk(result, 'Failed to withdraw credit request.');
}

/**
 * Requests a change post-allocation: a type-aware clone of the maker-owned fields
 * only, stamped Credits, as a fresh Draft with no back-pointer. Rejects a
 * non-Credits source id.
 */
export async function requestCreditChange(
  sourceRequestId: string,
  currentUser: { aadObjectId: string; upn: string },
): Promise<{ requestId: string }> {
  const source = await getCreditRequestDetail(sourceRequestId); // asserts Credits

  // Gate the operation on the authoritative persisted label, not just the UI menu.
  // "Request a change" clones a post-allocation request only; any other state
  // (Draft, Awaiting approval, Declined, partial) is rejected server-read-side.
  if (source.creditLabel !== 'Allocated') {
    throw new CreditRequestError('A change can only be requested for an allocated credit request.');
  }

  const newId = await createCreditHeader(
    {
      createdByAadObjectId: currentUser.aadObjectId,
      createdByUpn: currentUser.upn,
      justification: source.justification,
    },
    HEADER_STATUS_DRAFT,
  );

  try {
    for (const env of source.environments) {
      const res = await Cat_policyrequestenvironmentsService.create({
        'cat_policyrequestid@odata.bind': `/cat_policyrequests(${newId})`,
        cat_environmentguid: env.environmentGuid,
        cat_environmentname: env.environmentName,
      } as Omit<Cat_policyrequestenvironmentsBase, 'cat_policyrequestenvironmentid'>);
      ensureOk(res, 'Failed to clone credit request environment.');
    }
  } catch (err) {
    if (err instanceof CreditRequestError) throw err;
    throw new CreditRequestError(err instanceof Error ? err.message : 'Failed to clone credit request.', newId);
  }

  return { requestId: newId };
}

/**
 * Resumes a credit draft. Rejects a non-Credits id, then reports which of the draft's
 * environments are no longer in the eligible set the caller passes in.
 */
export async function loadCreditDraft(
  requestId: string,
  currentEnvironments: CreditWizardEnvironment[],
): Promise<LoadCreditDraftResult> {
  const detail = await getCreditRequestDetail(requestId); // asserts Credits

  // Only a Draft can be resumed into the editable wizard. A non-draft Credits id
  // (submitted, allocated, withdrawn, …) is treated as a typed not-found so the
  // route shows the not-found panel instead of loading a non-editable request.
  if (detail.status !== 'Draft') {
    throw new CreditRequestError(
      'This request is not available in the Copilot Credits experience.',
      undefined,
      { notFound: true },
    );
  }

  const currentKeys = new Set(currentEnvironments.map((e) => normalizeEnvKey(e.environmentId)));

  const removed: CreditWizardEnvironment[] = detail.environments
    .filter((e) => !currentKeys.has(normalizeEnvKey(e.environmentGuid)))
    .map((e) => ({ environmentId: e.environmentGuid, displayName: e.environmentName }));

  const envDiff: CreditEnvDiff = { removed };
  return { detail, envDiff };
}
