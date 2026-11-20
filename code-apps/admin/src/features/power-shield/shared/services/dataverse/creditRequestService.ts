import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_policyrequestparticipantsService } from '../../../../../generated/services/Cat_policyrequestparticipantsService';
import { Cat_servicetreesService } from '../../../../../generated/services/Cat_servicetreesService';
import { Cat_powershieldenvironmentgroupsService } from '../../../../../generated/services/Cat_powershieldenvironmentgroupsService';
import { Cat_powershieldpolicyrequestlogsService } from '../../../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import type { Cat_powershieldpolicyrequestlogsBase } from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';
import { SystemusersService } from '../../../../../generated/services/SystemusersService';
import type { Cat_policyrequests } from '../../../../../generated/models/Cat_policyrequestsModel';
import type { Cat_policyrequestenvironments } from '../../../../../generated/models/Cat_policyrequestenvironmentsModel';
import type { Cat_policyrequestparticipants } from '../../../../../generated/models/Cat_policyrequestparticipantsModel';
import type { RequestStatus, CreditChildState, CreditRequestLabel } from '../../../models/status';
import { isAwaitingDecisionStatus } from '../../../models/status';
import type { RequestParticipant } from '../../../models/requestParticipant';
import type {
  CreditRequestSummary,
  CreditRequestDetail,
  CreditEnvironmentView,
  CreditAuditEvent,
} from '../../../models/creditRequest';
import type { CreditEnforcementSnapshot } from '../../../models/requestEnvironment';
import { andRequestType, classifyRequestTypeStrict } from './requestType';
import { LOG_LEVEL } from './requestLogService';

// ─────────────────────────────────────────────────────────────────────────────
// Typed credit repository (Admin slice) — the credit-side isolation seam.
//
// Contract: contracts/creditRequests-admin-repository.md. This module is the ONLY
// admin credit reader/writer. It injects strict `cat_requesttype = Credits` on
// every list read (via andRequestType), and every ID-taking op reads the
// discriminator and rejects a non-Credits row (assertCreditHeader) BEFORE any
// child read or mutation. It MUST NOT import requestService.ts — importing it
// would risk inheriting the Connector predicate and breaking isolation (SC-002).
//
// Unlike the maker slice this repository is TENANT-WIDE (no row-level ownership
// filter). In this MVP the `cat_credit_allocatedtotal` amount is NOT field
// secured; access is app-enforced (only the approve/correct path writes it). The
// amount is surfaced in getCreditRequestDetail only, never in the list, so a
// missing amount can never be miscounted as a real 0 in a stat card (design
// decision: amounts detail-only). A field-security profile returns with the
// Phase-2 child `cat_credit_*` columns.
//
// Concurrency: the generated generic update() carries no If-Match, so every write
// here is last-write-wins by design (the Code App data source cannot send a
// conditional update). Guards are app-enforced pre-write checks (strict Credits
// type, awaiting-decision status, assignee gate); there is no MVP server plug-in
// or FLS boundary behind them. rowVersion is carried only for a future Phase-2
// server-side atomic action and is not a compare-and-set today.
// ─────────────────────────────────────────────────────────────────────────────

// Header cat_status option-set integers (shared option set; see requestService.ts).
const STATUS_DRAFT = 1;
const STATUS_SUBMITTED = 2;
const STATUS_UNDER_REVIEW = 5;
const STATUS_REJECTED = 7;

const STATUS_NUM_TO_DOMAIN: Record<number, RequestStatus> = {
  1: 'Draft', 2: 'Submitted', 3: 'Withdrawn', 4: 'AutoRejected',
  5: 'UnderReview', 6: 'Approved', 7: 'Rejected', 8: 'Implementing',
  9: 'Implemented', 10: 'ImplementedWithErrors',
};

// cat_credit_childstate option-set integers (data-model.md §8).
export const CREDIT_CHILD_STATE_NUM_TO_DOMAIN: Record<number, CreditChildState> = {
  335350010: 'Pending', 335350011: 'Processing', 335350012: 'Succeeded',
  335350013: 'FailedRetryable', 335350014: 'FailedPermanent',
  335350015: 'UnknownOutcome', 335350016: 'Skipped', 335350017: 'Superseded',
};

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
  '_cat_assignedadministrator_value',
  'cat_credit_allocatedtotal',
  'cat_credit_allocationowner', 'cat_credit_reviewbydate', 'cat_credit_intendedduration',
];

// Privileged, field-secured amount columns — admin only (Copilot Credits Admin FLS).
const CREDIT_ENV_SELECT = [
  'cat_policyrequestenvironmentid', '_cat_policyrequestid_value',
  'cat_environmentguid', 'cat_environmentname', 'cat_credit_childstate', 'cat_credit_activeenvkey',
  'cat_credit_approvedamount', 'cat_credit_absolutetarget', 'cat_credit_observedallocation',
  'cat_credit_lastverifiedallocation', 'cat_credit_operationid', 'cat_credit_attemptid',
  'cat_credit_correlationid', 'cat_fulfillmenterror', 'cat_creditrequestedamount',
  'cat_credit_enf_alert', 'cat_credit_enf_tenantpool', 'cat_credit_enf_paygo', 'cat_credit_enf_deny',
  'cat_credit_requesttenantdraw', 'cat_credit_tenantdrawapproved',
];

// Env child columns the list needs: state for the label, confirmed amounts for "credits added".
const CREDIT_ENV_STATE_SELECT = [
  '_cat_policyrequestid_value', 'cat_credit_childstate',
  'cat_credit_observedallocation', 'cat_credit_lastverifiedallocation', 'cat_creditrequestedamount',
  'cat_environmentname',
];

// Friendly labels for the log's cat_eventtype option set (fulfillment rows).
// Mirrors the connector ActivityTab.eventTypeLabel; credit-decision rows are not
// in this option set and carry their label in cat_name, so an unmapped value
// (null/0/unknown) falls back to cat_name in getCreditRequestAudit.
const LOG_EVENT_TYPE_LABELS: Record<number, string> = {
  1: 'Started',
  2: 'Policy Modified',
  3: 'Policy Created',
  4: 'Completed',
  5: 'Failed',
  6: 'Policy Deleted',
};

/** Thrown when a credit read/write fails; `notFound` marks a wrong-type rejection. */
export class CreditRequestError extends Error {
  notFound?: boolean;
  constructor(message: string, opts?: { notFound?: boolean }) {
    super(message);
    this.name = 'CreditRequestError';
    this.notFound = opts?.notFound;
  }
}

/** Escapes a value for safe interpolation inside a single-quoted OData string literal. */
export function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Parses a field-secured `cat_credit_*` amount. Missing, null, empty, or
 * non-numeric values return `undefined` — NEVER 0 — so an unreadable amount
 * (e.g. blocked by FLS) is never confused with a genuine zero allocation.
 */
export function parseAmount(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parses an enforcement flag (whole number 1, or legacy text '1'/'enabled'); anything else is false. */
function parseFlag(raw: string | number | null | undefined): boolean {
  return raw === '1' || raw === 'enabled' || Number(raw) === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label derivation (admin vocabulary)
//
// Derived client-side (child-state primary) from the header status plus child
// CreditChildState values — schema §8 provisioned NO server rollup label column.
// Fails CLOSED: an unknown/mixed/incomplete state never reads as the optimistic
// 'Allocated'. Single-environment grain: one env child per request, so there is
// no partial-allocation label. The admin close-out label 'Canceled' is
// intentionally NOT derived here — it has no source column yet and is set by the
// Phase 6 close-out disposition path (T031). (data-model.md §4/§5)
// ─────────────────────────────────────────────────────────────────────────────

/** Derives the admin-visible credit label from header status + child credit states. */
export function deriveCreditLabel(
  statusRaw: number | string | null | undefined,
  childStates: CreditChildState[],
): CreditRequestLabel {
  const status = Number(statusRaw);
  if (status === STATUS_SUBMITTED || status === STATUS_UNDER_REVIEW) return 'Awaiting decision';
  // Withdrawn (3), AutoRejected (4) and Rejected (7) roll up to the closed bucket.
  if (status === 3 || status === 4 || status === STATUS_REJECTED) return 'Declined';

  const isAllocationPhase = status === 6 || status === 8 || status === 9 || status === 10;
  if (!isAllocationPhase) return 'Needs admin attention';

  // Approved but no children stamped yet — awaiting the allocation worker.
  if (childStates.length === 0) return 'Approved and awaiting allocation';

  const anyProcessing = childStates.some((s) => s === 'Processing');
  // UnknownOutcome (incl. any value normalized to it) counts as attention — fail closed.
  const anyAttention = childStates.some(
    (s) => s === 'FailedRetryable' || s === 'FailedPermanent' || s === 'UnknownOutcome',
  );
  // Skipped (PAYG approve-without-allocating) records the unchanged total, so it counts as done.
  const allSucceeded = childStates.every((s) => s === 'Succeeded' || s === 'Skipped');

  if (anyAttention) return 'Needs admin attention';
  if (allSucceeded) return 'Allocated';
  if (anyProcessing) return 'Allocating';
  if (childStates.every((s) => s === 'Pending')) return 'Approved and awaiting allocation';
  return 'Allocating';
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeChildState(raw: unknown): CreditChildState | undefined {
  // A null child state means "not yet stamped"; an unrecognized non-null value
  // fails closed to UnknownOutcome so bad data never reads as optimistic.
  if (raw == null) return undefined;
  return CREDIT_CHILD_STATE_NUM_TO_DOMAIN[Number(raw)] ?? 'UnknownOutcome';
}

function toEnforcementSnapshot(r: Cat_policyrequestenvironments): CreditEnforcementSnapshot | undefined {
  const hasAny =
    r.cat_credit_enf_alert != null || r.cat_credit_enf_tenantpool != null ||
    r.cat_credit_enf_paygo != null || r.cat_credit_enf_deny != null;
  if (!hasAny) return undefined;
  return {
    alert: parseFlag(r.cat_credit_enf_alert),
    tenantPool: parseFlag(r.cat_credit_enf_tenantpool),
    payGo: parseFlag(r.cat_credit_enf_paygo),
    deny: parseFlag(r.cat_credit_enf_deny),
  };
}

function toCreditEnvironmentView(r: Cat_policyrequestenvironments): CreditEnvironmentView {
  return {
    id: r.cat_policyrequestenvironmentid,
    environmentGuid: r.cat_environmentguid ?? '',
    environmentName: r.cat_environmentname ?? '',
    creditChildState: normalizeChildState(r.cat_credit_childstate),
    activeEnvKey: r.cat_credit_activeenvkey ?? undefined,
    approvedAmount: parseAmount(r.cat_credit_approvedamount),
    requestedAmount: parseAmount(r.cat_creditrequestedamount),
    requestTenantDraw: r.cat_credit_requesttenantdraw === true,
    tenantDrawApproved: r.cat_credit_tenantdrawapproved === true,
    absoluteTarget: parseAmount(r.cat_credit_absolutetarget),
    observedAllocation: parseAmount(r.cat_credit_observedallocation),
    lastVerifiedAllocation: parseAmount(r.cat_credit_lastverifiedallocation),
    enforcement: toEnforcementSnapshot(r),
    operationId: r.cat_credit_operationid ?? undefined,
    attemptId: r.cat_credit_attemptid ?? undefined,
    correlationId: r.cat_credit_correlationid ?? undefined,
    fulfillmentError: r.cat_fulfillmenterror ?? undefined,
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

// ─────────────────────────────────────────────────────────────────────────────
// Name-resolution helpers (best-effort enrichment — a lookup failure returns an
// empty map and NEVER fails the underlying credit read).
// ─────────────────────────────────────────────────────────────────────────────

async function safeMap<T>(fn: () => Promise<Map<string, T>>): Promise<Map<string, T>> {
  try {
    return await fn();
  } catch {
    return new Map<string, T>();
  }
}

function fetchServiceTreeNames(ids: string[]): Promise<Map<string, string>> {
  return safeMap(async () => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();
    const filter = uniqueIds.map((id) => `cat_servicetreeid eq ${id}`).join(' or ');
    const result = await Cat_servicetreesService.getAll({
      filter, select: ['cat_servicetreeid', 'cat_servicetreename'],
    });
    const map = new Map<string, string>();
    for (const st of result.data ?? []) map.set(st.cat_servicetreeid, st.cat_servicetreename ?? '');
    return map;
  });
}

function fetchEnvironmentGroupNames(ids: string[]): Promise<Map<string, string>> {
  return safeMap(async () => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();
    const filter = uniqueIds.map((id) => `cat_powershieldenvironmentgroupid eq ${id}`).join(' or ');
    const result = await Cat_powershieldenvironmentgroupsService.getAll({
      filter, select: ['cat_powershieldenvironmentgroupid', 'cat_name'],
    });
    const map = new Map<string, string>();
    for (const g of result.data ?? []) map.set(g.cat_powershieldenvironmentgroupid, g.cat_name ?? '');
    return map;
  });
}

function fetchCreatorNames(aadObjectIds: string[]): Promise<Map<string, string>> {
  return safeMap(async () => {
    const uniqueIds = [...new Set(aadObjectIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();
    const filter = uniqueIds.map((id) => `azureactivedirectoryobjectid eq '${escapeODataLiteral(id)}'`).join(' or ');
    const result = await SystemusersService.getAll({
      filter, select: ['azureactivedirectoryobjectid', 'fullname'],
    });
    const map = new Map<string, string>();
    for (const u of result.data ?? []) {
      if (u.azureactivedirectoryobjectid) map.set(u.azureactivedirectoryobjectid, u.fullname ?? '');
    }
    return map;
  });
}

/** Resolves assigned-admin display names from systemusers via the lookup GUID.
 *  Mirrors requestService.fetchAssignedAdminNames — the lookup name column is
 *  not $select-able on cat_policyrequest, so the name is resolved separately. */
function fetchAssignedAdminNames(ids: string[]): Promise<Map<string, string>> {
  return safeMap(async () => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();
    const filter = uniqueIds.map((id) => `systemuserid eq ${id}`).join(' or ');
    const result = await SystemusersService.getAll({
      filter, select: ['systemuserid', 'fullname'],
    });
    const map = new Map<string, string>();
    for (const u of result.data ?? []) map.set(u.systemuserid, u.fullname ?? '');
    return map;
  });
}

/** The slice of an env child the list needs: its state and confirmed amounts. */
export type CreditChildProgress = Pick<
  CreditEnvironmentView,
  'creditChildState' | 'observedAllocation' | 'lastVerifiedAllocation' | 'requestedAmount'
> & Partial<Pick<CreditEnvironmentView, 'environmentName'>>;

/**
 * Credits the maker asked for across a request's environments. Sums the amounts
 * that exist, since a draw-only environment has no amount (spec 032 R9).
 * Undefined when no environment has an amount.
 */
export function creditsRequestedFor(children: Pick<CreditChildProgress, 'requestedAmount'>[]): number | undefined {
  const amounts = children.map((c) => c.requestedAmount).filter((a): a is number => a !== undefined);
  return amounts.length === 0 ? undefined : amounts.reduce((sum, a) => sum + a, 0);
}

/**
 * Credits actually added across a request's environments, using the same rule as
 * the detail grid: Succeeded adds verified − observed, Skipped adds 0. Returns
 * undefined (shown as a dash) when there are no environments, any environment is
 * unfinished, or an amount is unreadable — never a planned or guessed figure.
 */
export function creditsAddedFor(children: CreditChildProgress[]): number | undefined {
  if (children.length === 0) return undefined;
  let total = 0;
  for (const c of children) {
    if (c.creditChildState === 'Skipped') continue;
    if (c.creditChildState !== 'Succeeded') return undefined;
    if (c.lastVerifiedAllocation === undefined || c.observedAllocation === undefined) return undefined;
    total += c.lastVerifiedAllocation - c.observedAllocation;
  }
  return total;
}

/** Loads child credit progress for a set of request ids, grouped by parent id.
 *  This read is authoritative for the label, so a failure DOES throw. */
async function fetchChildProgressByRequest(requestIds: string[]): Promise<Map<string, CreditChildProgress[]>> {
  const map = new Map<string, CreditChildProgress[]>();
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const filter = ids.map((id) => `_cat_policyrequestid_value eq ${id}`).join(' or ');
  const result = await Cat_policyrequestenvironmentsService.getAll({ filter, select: CREDIT_ENV_STATE_SELECT });
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to load credit child states.');
  }
  for (const row of result.data ?? []) {
    const parent = row._cat_policyrequestid_value;
    if (!parent) continue;
    const list = map.get(parent) ?? [];
    list.push({
      creditChildState: normalizeChildState(row.cat_credit_childstate),
      observedAllocation: parseAmount(row.cat_credit_observedallocation),
      lastVerifiedAllocation: parseAmount(row.cat_credit_lastverifiedallocation),
      requestedAmount: parseAmount(row.cat_creditrequestedamount),
      environmentName: row.cat_environmentname ?? undefined,
    });
    map.set(parent, list);
  }
  return map;
}

/** Reads a header and strict-asserts it is a Credits row before any child access. */
export async function assertCreditHeader(requestId: string, select: string[]): Promise<Cat_policyrequests> {
  const headerResult = await Cat_policyrequestsService.get(requestId, { select });
  if (!headerResult.success || !headerResult.data) {
    throw new CreditRequestError(headerResult.error?.message ?? 'Failed to load credit request.');
  }
  if (classifyRequestTypeStrict(headerResult.data.cat_requesttype) !== 'Credits') {
    throw new CreditRequestError(
      'This request is not available in the Copilot Credits experience.',
      { notFound: true },
    );
  }
  return headerResult.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists credit requests tenant-wide (admin sees all Credits rows). Strict
 * Credits isolation is applied ONCE, after every other clause, via
 * andRequestType. Amounts are intentionally excluded here (detail-only); the
 * summary carries the derived label and identity fields only.
 *
 * Note: results are capped (top 200). Stat-card counts derived from this list
 * therefore reflect the returned page, not an unbounded tenant total.
 */
export async function getCreditRequestList(options: {
  statusFilter?: number[];
  search?: string;
} = {}): Promise<CreditRequestSummary[]> {
  const clauses: string[] = [];
  if (options.statusFilter && options.statusFilter.length > 0) {
    clauses.push(`(${options.statusFilter.map((s) => `cat_status eq ${s}`).join(' or ')})`);
  } else {
    // Admins triage submitted requests; a maker's in-progress draft has no admin
    // action or label, so drafts are excluded from the default tenant-wide list.
    clauses.push(`cat_status ne ${STATUS_DRAFT}`);
  }
  if (options.search && options.search.trim()) {
    const term = escapeODataLiteral(options.search.trim());
    clauses.push(`(contains(cat_policyrequestname,'${term}') or contains(cat_createdbyupn,'${term}'))`);
  }

  const filter = andRequestType(clauses.join(' and ') || undefined, 'Credits');

  const result = await Cat_policyrequestsService.getAll({
    filter, select: CREDIT_LIST_SELECT, orderBy: ['createdon desc'], top: 200,
  });
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to load credit requests.');
  }

  const rows = result.data ?? [];
  const [stNameMap, egNameMap, creatorNameMap, adminNameMap, childProgressMap] = await Promise.all([
    fetchServiceTreeNames(rows.map((r) => r._cat_servicetreeid_value ?? '')),
    fetchEnvironmentGroupNames(rows.map((r) => r._cat_environmentgroup_value ?? '')),
    fetchCreatorNames(rows.map((r) => r.cat_createdbyaadobjectid ?? '')),
    fetchAssignedAdminNames(rows.map((r) => r._cat_assignedadministrator_value ?? '')),
    fetchChildProgressByRequest(rows.map((r) => r.cat_policyrequestid)),
  ]);

  return rows.map((r) => {
    const serviceTreeId = r._cat_servicetreeid_value ?? '';
    const environmentGroupId = r._cat_environmentgroup_value ?? undefined;
    const children = childProgressMap.get(r.cat_policyrequestid) ?? [];
    const childStates = children.flatMap((c) => (c.creditChildState ? [c.creditChildState] : []));
    return {
      id: r.cat_policyrequestid,
      requestNumber: r.cat_policyrequestname ?? '',
      serviceTreeId,
      serviceTreeName: stNameMap.get(serviceTreeId),
      environmentGroupId,
      environmentGroupName: environmentGroupId ? egNameMap.get(environmentGroupId) : undefined,
      environmentCount: r.cat_requestenvironmentcount ? parseInt(r.cat_requestenvironmentcount, 10) : undefined,
      // Unknown/NaN header status fails closed to a non-actionable state ('Submitted').
      status: STATUS_NUM_TO_DOMAIN[Number(r.cat_status)] ?? 'Submitted',
      creditLabel: deriveCreditLabel(r.cat_status, childStates),
      assignedAdminName: r._cat_assignedadministrator_value
        ? adminNameMap.get(r._cat_assignedadministrator_value)
        : undefined,
      assignedAdminDvUserId: r._cat_assignedadministrator_value ?? undefined,
      submittedOn: r.cat_submittedon,
      decidedOn: r.cat_decidedon ?? undefined,
      createdByUpn: r.cat_createdbyupn ?? '',
      createdByAadObjectId: r.cat_createdbyaadobjectid ?? undefined,
      createdByName: r.cat_createdbyaadobjectid ? creatorNameMap.get(r.cat_createdbyaadobjectid) : undefined,
      creditsRequested: creditsRequestedFor(children),
      creditsAdded: creditsAddedFor(children),
      environmentNames: children.flatMap((c) => (c.environmentName ? [c.environmentName] : [])),
    };
  });
}

/**
 * Loads a single credit request header + privileged children. Rejects a
 * non-Credits id (typed not-found) BEFORE reading any children.
 */
export async function getCreditRequestDetail(requestId: string): Promise<CreditRequestDetail> {
  const header = await assertCreditHeader(requestId, CREDIT_DETAIL_SELECT);

  // Optimistic-concurrency token for the server compare-and-set commands
  // (reject/approve/close-out). Dataverse returns it as `@odata.etag`; it is not
  // on the generated model type, so read it defensively and leave it undefined
  // when the runtime does not surface it (data-model.md §9.0).
  const rawEtag = (header as unknown as Record<string, unknown>)['@odata.etag'];
  const rowVersion = typeof rawEtag === 'string' ? rawEtag : undefined;

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
  // Fail the read rather than returning a partial request that could mislabel.
  if (!envResult.success) {
    throw new CreditRequestError(envResult.error?.message ?? 'Failed to load credit request environments.');
  }
  if (!parResult.success) {
    throw new CreditRequestError(parResult.error?.message ?? 'Failed to load credit request participants.');
  }

  const environments = (envResult.data ?? []).map(toCreditEnvironmentView);
  const serviceTreeId = header._cat_servicetreeid_value ?? '';
  const environmentGroupId = header._cat_environmentgroup_value ?? undefined;

  const [stNameMap, egNameMap, creatorNameMap, adminNameMap] = await Promise.all([
    fetchServiceTreeNames([serviceTreeId]),
    fetchEnvironmentGroupNames(environmentGroupId ? [environmentGroupId] : []),
    fetchCreatorNames([header.cat_createdbyaadobjectid ?? '']),
    fetchAssignedAdminNames(header._cat_assignedadministrator_value ? [header._cat_assignedadministrator_value] : []),
  ]);

  return {
    id: header.cat_policyrequestid,
    requestNumber: header.cat_policyrequestname ?? '',
    serviceTreeId,
    serviceTreeName: stNameMap.get(serviceTreeId),
    environmentGroupId,
    environmentGroupName: environmentGroupId ? egNameMap.get(environmentGroupId) : undefined,
    status: STATUS_NUM_TO_DOMAIN[Number(header.cat_status)] ?? 'Submitted',
    rowVersion,
    creditLabel: deriveCreditLabel(
      header.cat_status,
      environments.map((e) => e.creditChildState).filter((s): s is CreditChildState => Boolean(s)),
    ),
    allocatedTotal: parseAmount(header.cat_credit_allocatedtotal),
    justification: header.cat_justification ?? '',
    submittedOn: header.cat_submittedon,
    decidedOn: header.cat_decidedon,
    lastErrorSummary: header.cat_lasterrorsummary,
    assignedAdminName: header._cat_assignedadministrator_value
      ? adminNameMap.get(header._cat_assignedadministrator_value)
      : undefined,
    assignedAdminDvUserId: header._cat_assignedadministrator_value ?? undefined,
    allocationOwner: header.cat_credit_allocationowner ?? undefined,
    reviewByDate: header.cat_credit_reviewbydate ?? undefined,
    intendedDuration: parseAmount(header.cat_credit_intendedduration),
    createdByAadObjectId: header.cat_createdbyaadobjectid ?? '',
    createdByUpn: header.cat_createdbyupn ?? '',
    createdByName: header.cat_createdbyaadobjectid
      ? creatorNameMap.get(header.cat_createdbyaadobjectid)
      : undefined,
    environments,
    participants: (parResult.data ?? []).map(toCreditParticipant),
  };
}

/**
 * Reads the append-only request log for a credit request (Activity/audit tab).
 * Rejects a non-Credits id before reading any log rows.
 */
export async function getCreditRequestAudit(requestId: string): Promise<CreditAuditEvent[]> {
  await assertCreditHeader(requestId, ['cat_requesttype']);

  const result = await Cat_powershieldpolicyrequestlogsService.getAll({
    filter: `_cat_policyrequest_value eq ${requestId}`,
    select: [
      'cat_powershieldpolicyrequestlogid', 'cat_name', 'cat_message',
      'cat_eventtype', 'createdon', '_createdby_value',
    ],
    orderBy: ['createdon desc'],
  });
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to load credit request activity.');
  }

  const rows = result.data ?? [];
  // createdby is a systemuser lookup — the flattened name column is not
  // $select-able, so resolve the actor display name via the systemusers map.
  const actorMap = await fetchAssignedAdminNames(rows.map((r) => r._createdby_value ?? ''));

  return rows.map((row) => ({
    id: row.cat_powershieldpolicyrequestlogid,
    timestamp: row.createdon ?? '',
    actor: row._createdby_value ? actorMap.get(row._createdby_value) : undefined,
    action: LOG_EVENT_TYPE_LABELS[Number(row.cat_eventtype)] ?? row.cat_name ?? 'Event',
    detail: row.cat_message ?? undefined,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign / triage (admin-initiated)
//
// rowVersion is reserved for a future server-side atomic action. The generic
// connector update() sends no If-Match, so these do a fresh-read state pre-check
// then a plain update — best-effort, not an atomic compare-and-set.
// ─────────────────────────────────────────────────────────────────────────────

/** Assigns/reassigns the reviewing admin and moves the request to Under review. */
export async function assignCreditRequest(
  requestId: string,
  assigneeDvUserId: string,
  rowVersion: string,
): Promise<void> {
  void rowVersion; // reserved for the future atomic server action
  const header = await assertCreditHeader(requestId, ['cat_requesttype', 'cat_status', '_cat_assignedadministrator_value']);
  const status = Number(header.cat_status);
  if (status !== STATUS_SUBMITTED && status !== STATUS_UNDER_REVIEW) {
    throw new CreditRequestError('This request can only be assigned while it is awaiting a decision.');
  }
  const result = await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_UNDER_REVIEW as Cat_policyrequests['cat_status'],
    'cat_AssignedAdministrator@odata.bind': `/systemusers(${assigneeDvUserId})`,
  } as Parameters<typeof Cat_policyrequestsService.update>[1]);
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to assign credit request.');
  }
  const toId = assigneeDvUserId.toLowerCase();
  const fromId = header._cat_assignedadministrator_value?.toLowerCase();
  if (fromId === toId) return;
  // Names are saved with the row so the log still reads correctly if someone is renamed later.
  const names = await fetchAssignedAdminNames(fromId ? [toId, fromId] : [toId]);
  await appendActivity(requestId, 'CreditAssigned', {
    assignedTo: names.get(toId) || 'an admin',
    ...(fromId ? { assignedFrom: names.get(fromId) || 'another admin' } : {}),
  });
}

/**
 * Rejects a credit request with a mandatory reviewer comment (FR-027).
 *
 * Reject is a simple header decision write through the Code App data source,
 * exactly like the connector reject path: it requires a comment, asserts the row
 * is strictly Credits (a Connector id is rejected), checks the request is still
 * awaiting a decision, enforces the assignee gate (SC-M2 — only the assigned
 * admin may decide), then plain-updates cat_status/cat_admincomment/cat_decidedon.
 * No field-secured column is touched. A best-effort activity row is appended
 * (SC-M6); its failure never surfaces because the decision has already committed.
 */
export async function rejectCreditRequest(
  requestId: string,
  comment: string,
  currentUserDvId: string,
): Promise<void> {
  if (!comment || !comment.trim()) {
    throw new CreditRequestError('A comment is required to reject a credit request.');
  }
  const header = await assertCreditHeader(requestId, [
    'cat_requesttype', 'cat_status', '_cat_assignedadministrator_value',
  ]);
  const status = STATUS_NUM_TO_DOMAIN[Number(header.cat_status)];
  if (!status || !isAwaitingDecisionStatus(status)) {
    throw new CreditRequestError('This request can only be rejected while it is awaiting a decision.');
  }
  assertAssignee(header, currentUserDvId, 'reject this request');
  const children = (await fetchChildProgressByRequest([requestId])).get(requestId) ?? [];
  if (children.some((c) => c.creditChildState === 'Processing' || c.creditChildState === 'UnknownOutcome')) {
    throw new CreditRequestError(
      "An allocation attempt for this request hasn't finished. Resolve it before rejecting.",
    );
  }
  const result = await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_REJECTED as Cat_policyrequests['cat_status'],
    cat_admincomment: comment,
    cat_decidedon: new Date().toISOString(),
  } as Parameters<typeof Cat_policyrequestsService.update>[1]);
  if (!result.success) {
    throw new CreditRequestError(result.error?.message ?? 'Failed to reject credit request.');
  }
  await appendActivity(requestId, 'CreditRejected', { comment });
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision guards
//
// Approval runs through CR/services/creditApprovalCommand (spec 024). Reject
// stays here. Every decision reads the discriminator (strict Credits) and the
// assignee before it writes.
// ─────────────────────────────────────────────────────────────────────────────

/** Case-insensitive assignee gate (SC-M2): only the assigned admin may decide. */
export function assertAssignee(header: Cat_policyrequests, currentUserDvId: string, action: string): void {
  const assignee = (header._cat_assignedadministrator_value ?? '').toLowerCase();
  if (!assignee || assignee !== currentUserDvId.toLowerCase()) {
    throw new CreditRequestError(`Only the assigned admin can ${action}.`);
  }
}

export type CreditActivityAction =
  | 'CreditAssigned'
  | 'CreditRejected'
  | 'CreditAllocationAttempted'
  | 'CreditApprovedWithoutAllocation';

const CREDIT_ACTIVITY_NAMES: Record<CreditActivityAction, string> = {
  CreditAssigned: 'Request assigned',
  CreditRejected: 'Credit request rejected',
  CreditAllocationAttempted: 'Credit allocation attempted',
  CreditApprovedWithoutAllocation: 'Credit request approved without allocating',
};

/**
 * Appends a best-effort activity row to cat_powershieldpolicyrequestlog for a
 * credit decision (SC-M6). Never throws: the decision write has already
 * committed, so a failed audit row must not surface to the admin. The caller has
 * already strict-asserted the parent is a Credits row. The credit event names are
 * not in the log's cat_eventtype option set, so the action is carried in cat_name
 * and the before/after/reason detail as JSON in cat_message.
 */
export async function appendActivity(
  requestId: string,
  action: CreditActivityAction,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await Cat_powershieldpolicyrequestlogsService.create({
      cat_name: CREDIT_ACTIVITY_NAMES[action],
      'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_loglevel: LOG_LEVEL.Info,
      cat_message: JSON.stringify(detail),
    } as Omit<Cat_powershieldpolicyrequestlogsBase, 'cat_powershieldpolicyrequestlogid'>);
  } catch {
    // Best-effort — audit-row failure must never abort or surface on the decision.
  }
}
