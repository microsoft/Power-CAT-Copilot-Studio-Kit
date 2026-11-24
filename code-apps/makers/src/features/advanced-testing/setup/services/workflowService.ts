/**
 * Workflow service for Advanced Testing setup, Phase 3.
 *
 * Owns discovery, bucketing, and orchestrated activation of the Test
 * Automation processes (Cloud Flows + Custom Actions) per plan §2.6 rows
 * A1-A13. PATCH/error-remap pattern ported from
 * `CopilotStudioKitAdmin/src/features/power-shield/features/admin/services/
 * workflowService.ts`; bucketing logic is bespoke to Advanced Testing.
 *
 * Source-of-truth for the activation order is the typed name set constants
 * below. They came from the user's screenshots of the deployed Copilot Studio
 * Kit solution and must not be re-derived from `name` heuristics.
 */

import { MicrosoftDataverseService } from "../../../../generated/services/MicrosoftDataverseService";
import type {
  ActivationProgress,
  ActivationRowOutcome,
  ActivationRunResult,
  BucketActivationPolicy,
  BucketActivationResult,
  BucketId,
  DuplicateActionGroup,
  ProcessInventory,
  ProcessKind,
  WorkflowRow,
} from "../contracts/types";

const LOG_PREFIX = "[AdvancedTesting:Setup:Workflow]";

// ─── Authoritative name sets (plan §2.6 inventory) ──────────────────────────

/** Bucket 1: Dataverse Custom Actions (`category=3`, no name prefix). */
export const BUCKET_1_ACTIONS = [
  "Run Agent Tests",
  "Run Dataverse Conversation Transcripts Enrichment",
  "Run Azure Application Insights Enrichment",
  "Run AI Builder Analysis",
  "Run Rollup Columns Updates",
] as const;

/** Bucket 2: Child Cloud Flows. */
export const BUCKET_2_CHILD_FLOWS = [
  "Test Automation | Update Agent Test Run Rollup Columns",
  "Test Automation | AI Builder Credit Consumption",
  "Test Automation | Rubrics AI Grading Flow",
  "Test Automation | Rubrics Refinement",
  "Test Automation | Multi Topic Transcripts Enrichment (Child)",
  "Test Automation | Validate Agent Plans (Child)",
  "Test Automation | Run Multiturn Tests (Child)",
  "Test Automation | Run Multiturn Tests Automated (GrandChild)",
] as const;

/** Bucket 3: Parent feature Cloud Flows. */
export const BUCKET_3_PARENT_FLOWS = [
  "Test Automation | Analyze Generated Answers with AI Builder",
  "Test Automation | Enrich with Dataverse Conversation Transcripts",
  "Test Automation | Enrich with Azure Application Insights",
] as const;

/** Bucket 4: Orchestrator + child called by the top-level Automated flow. */
export const BUCKET_4_ORCHESTRATOR = [
  "Test Automation | Run Agent Tests",
  "Test Automation | Run Agent Tests Automated (Child)",
] as const;

/**
 * Bucket 5: Top-level `Run Agent Tests Automated` flow (formerly the "Caller").
 * Activated last because it depends on the (Child) flow in bucket 4.
 */
export const BUCKET_5_CALLERS = [
  "Test Automation | Run Agent Tests Automated",
] as const;

/** Independent group: optional flows, excluded from orchestrator (A4). */
export const INDEPENDENT_FLOWS = [
  "Test Automation | Assign Copilot Studio Kit Tester Role to Team",
  "Pipeline | Validate Agent Using Test Cases",
] as const;

/**
 * Per-bucket activation policy (A5). Bucket 1 (Custom Actions) polls briefly to
 * absorb read-after-write lag but skips dependency-error retry because Actions
 * have no async propagation. Cloud Flow buckets keep the RD-3 + RD-4 policy.
 * Bucket 5 mirrors bucket 4 since the top-level flow depends on the child chain.
 */
export const BUCKET_POLICIES: Record<BucketId, BucketActivationPolicy> = {
  "bucket-1": { pollAttempts: 2, pollIntervalMs: 1000, retryDependencyErrors: false },
  "bucket-2": { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: true },
  "bucket-3": { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: true },
  "bucket-4": { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: true },
  "bucket-5": { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: true },
  independent: { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: true },
  unexpected: { pollAttempts: 3, pollIntervalMs: 2000, retryDependencyErrors: false },
};

/** Order the orchestrator walks (A3). Independent is excluded. */
export const ORCHESTRATOR_BUCKET_ORDER: readonly BucketId[] = [
  "bucket-1",
  "bucket-2",
  "bucket-3",
  "bucket-4",
  "bucket-5",
] as const;

// ─── Query shape ─────────────────────────────────────────────────────────────

const SELECT_COLUMNS = [
  "workflowid",
  "name",
  "uniquename",
  "category",
  "statecode",
  "statuscode",
  "ismanaged",
  "solutionid",
  "componentstate",
].join(",");

/**
 * Broadened filter (A1). Pulls both `category=5` Cloud Flows prefixed
 * `'Test Automation |'` or `'Pipeline |'`, AND the typed allow-list of
 * Custom Actions (`category=3`, no prefix).
 */
function buildDiscoveryFilter(): string {
  const flowClause =
    "(category eq 5 and (startswith(name,'Test Automation |') or startswith(name,'Pipeline |')))";
  const actionNamesOr = BUCKET_1_ACTIONS.map(
    (n) => `name eq '${n.replace(/'/g, "''")}'`,
  ).join(" or ");
  const actionClause = `(category eq 3 and (${actionNamesOr}))`;
  return `type eq 1 and (${flowClause} or ${actionClause})`;
}

// ─── Error helper (parallel to PS shape) ─────────────────────────────────────

function extractError(
  context: string,
  result: { success: boolean; error?: unknown; data?: unknown },
): string {
  const errorObj = result.error ?? result.data;
  console.error(`${LOG_PREFIX} ${context}, full error:`, JSON.stringify(errorObj, null, 2));

  if (typeof errorObj === "object" && errorObj !== null) {
    const err = errorObj as Record<string, unknown>;
    if (typeof err.error === "object" && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (inner.message) return `${context}: ${inner.message as string}`;
    }
    if (err.message) return `${context}: ${err.message as string}`;
    if (typeof err.body === "object" && err.body !== null) {
      const body = err.body as Record<string, unknown>;
      if (typeof body.error === "object" && body.error !== null) {
        const bodyErr = body.error as Record<string, unknown>;
        if (bodyErr.message) return `${context}: ${bodyErr.message as string}`;
      }
    }
  }
  return `${context}: ${JSON.stringify(errorObj) ?? "Unknown error"}`;
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

interface WorkflowRowRaw {
  workflowid: string;
  name?: string;
  uniquename?: string | null;
  category?: number;
  statecode?: number;
  statuscode?: number;
  ismanaged?: boolean;
  solutionid?: string | null;
  componentstate?: number;
}

function toWorkflowRow(r: WorkflowRowRaw): WorkflowRow {
  const category = r.category ?? 0;
  const kind: ProcessKind = category === 3 ? "custom-action" : "cloud-flow";
  const statecode = r.statecode ?? 0;
  return {
    id: r.workflowid,
    name: r.name ?? "",
    uniqueName: r.uniquename ?? null,
    category,
    kind,
    statecode,
    statuscode: r.statuscode ?? 1,
    isActive: statecode === 1,
    isManaged: Boolean(r.ismanaged),
    solutionId: r.solutionid ?? null,
    componentState: r.componentstate ?? 0,
  };
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * One-shot discovery of every row matching the broadened filter (A1).
 * Caller passes the result to `bucketProcesses()` for classification.
 */
export async function getTestAutomationProcesses(): Promise<WorkflowRow[]> {
  const filter = buildDiscoveryFilter();
  console.log(`${LOG_PREFIX} getTestAutomationProcesses, filter: ${filter}`);

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "workflows",
    undefined,
    undefined,
    undefined,
    undefined,
    SELECT_COLUMNS,
    filter,
    "name asc",
    undefined,
    undefined,
    200,
  );

  if (!result.success) {
    throw new Error(extractError("Failed to query test automation processes", result));
  }

  const raw = (result.data as unknown as { value?: WorkflowRowRaw[] })?.value ?? [];
  const rows = raw.map(toWorkflowRow);
  console.log(`${LOG_PREFIX} discovery returned ${rows.length} rows`);
  if (rows.length > 0) {
    console.log(
      `${LOG_PREFIX} rows:`,
      rows
        .map(
          (r) =>
            `${r.kind === "custom-action" ? "[CA]" : "[CF]"} ${r.name} state=${r.statecode} cs=${r.componentState}${r.isManaged ? " mgd" : ""}`,
        )
        .join(" | "),
    );
  } else {
    console.warn(`${LOG_PREFIX} discovery returned 0 rows. Broaden the filter to debug.`);
  }
  return rows;
}

/** Read a single row by id. Returns null when the row is gone or the read fails. */
export async function fetchSingleProcess(workflowId: string): Promise<WorkflowRow | null> {
  const filter = `workflowid eq ${workflowId}`;
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "workflows",
    undefined,
    undefined,
    undefined,
    undefined,
    SELECT_COLUMNS,
    filter,
    undefined,
    undefined,
    undefined,
    1,
  );
  if (!result.success) {
    console.warn(
      `${LOG_PREFIX} fetchSingleProcess id=${workflowId} failed:`,
      extractError("fetchSingleProcess", result),
    );
    return null;
  }
  const raw = (result.data as unknown as { value?: WorkflowRowRaw[] })?.value ?? [];
  return raw.length > 0 ? toWorkflowRow(raw[0]) : null;
}

// ─── Bucketing + diagnostics ─────────────────────────────────────────────────

const BUCKET_LOOKUP: Map<string, BucketId> = (() => {
  const m = new Map<string, BucketId>();
  for (const n of BUCKET_1_ACTIONS) m.set(n, "bucket-1");
  for (const n of BUCKET_2_CHILD_FLOWS) m.set(n, "bucket-2");
  for (const n of BUCKET_3_PARENT_FLOWS) m.set(n, "bucket-3");
  for (const n of BUCKET_4_ORCHESTRATOR) m.set(n, "bucket-4");
  for (const n of BUCKET_5_CALLERS) m.set(n, "bucket-5");
  for (const n of INDEPENDENT_FLOWS) m.set(n, "independent");
  return m;
})();

/** Returns the bucket a process name belongs to, or `'unexpected'` if unknown. */
export function classifyByName(name: string): BucketId {
  return BUCKET_LOOKUP.get(name) ?? "unexpected";
}

function sortByOrder<T extends WorkflowRow>(rows: T[], order: readonly string[]): T[] {
  const indexOfName = (n: string) => {
    const i = order.indexOf(n);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...rows].sort((a, b) => indexOfName(a.name) - indexOfName(b.name));
}

/**
 * Classifies discovery rows into buckets, computes missing-name diagnostics
 * (A12), and detects duplicate Custom Actions (A8). Deleted rows
 * (`componentstate === 2`) are excluded from buckets and duplicate groups.
 */
export function bucketProcesses(rows: WorkflowRow[]): ProcessInventory {
  const live = rows.filter((r) => r.componentState !== 2);

  const inv: ProcessInventory = {
    rows,
    bucket1: [],
    bucket2: [],
    bucket3: [],
    bucket4: [],
    bucket5: [],
    independent: [],
    unexpected: [],
    duplicates: [],
    missing: [],
  };

  for (const row of live) {
    switch (classifyByName(row.name)) {
      case "bucket-1":
        inv.bucket1.push(row);
        break;
      case "bucket-2":
        inv.bucket2.push(row);
        break;
      case "bucket-3":
        inv.bucket3.push(row);
        break;
      case "bucket-4":
        inv.bucket4.push(row);
        break;
      case "bucket-5":
        inv.bucket5.push(row);
        break;
      case "independent":
        inv.independent.push(row);
        break;
      default:
        // unexpected: only Cloud Flows are surfaced as unexpected; stray Custom
        // Actions can't reach here because the filter only pulls allow-listed ones.
        inv.unexpected.push(row);
        break;
    }
  }

  inv.bucket1 = sortByOrder(inv.bucket1, BUCKET_1_ACTIONS);
  inv.bucket2 = sortByOrder(inv.bucket2, BUCKET_2_CHILD_FLOWS);
  inv.bucket3 = sortByOrder(inv.bucket3, BUCKET_3_PARENT_FLOWS);
  inv.bucket4 = sortByOrder(inv.bucket4, BUCKET_4_ORCHESTRATOR);
  inv.bucket5 = sortByOrder(inv.bucket5, BUCKET_5_CALLERS);
  inv.independent = sortByOrder(inv.independent, INDEPENDENT_FLOWS);

  // A8: duplicate Custom Actions among live rows.
  const actionGroups = new Map<string, WorkflowRow[]>();
  for (const row of live) {
    if (row.kind !== "custom-action") continue;
    if (!BUCKET_LOOKUP.has(row.name)) continue;
    const list = actionGroups.get(row.name) ?? [];
    list.push(row);
    actionGroups.set(row.name, list);
  }
  for (const [name, group] of actionGroups) {
    if (group.length > 1) {
      inv.duplicates.push({ name, rows: group });
    }
  }

  // A12: missing names per bucket.
  const presentNames = new Set(live.map((r) => r.name));
  const expected: { bucket: BucketId; names: readonly string[] }[] = [
    { bucket: "bucket-1", names: BUCKET_1_ACTIONS },
    { bucket: "bucket-2", names: BUCKET_2_CHILD_FLOWS },
    { bucket: "bucket-3", names: BUCKET_3_PARENT_FLOWS },
    { bucket: "bucket-4", names: BUCKET_4_ORCHESTRATOR },
    { bucket: "bucket-5", names: BUCKET_5_CALLERS },
    { bucket: "independent", names: INDEPENDENT_FLOWS },
  ];
  for (const { bucket, names } of expected) {
    const missing = names.filter((n) => !presentNames.has(n));
    if (missing.length > 0) {
      inv.missing.push({ bucket, names: [...missing] });
    }
  }

  console.log(
    `${LOG_PREFIX} bucketed: b1=${inv.bucket1.length} b2=${inv.bucket2.length} b3=${inv.bucket3.length} b4=${inv.bucket4.length} b5=${inv.bucket5.length} indep=${inv.independent.length} unexpected=${inv.unexpected.length} duplicates=${inv.duplicates.length} missingGroups=${inv.missing.length}`,
  );

  return inv;
}

/**
 * Returns the rows for a given bucket id from a {@link ProcessInventory}.
 * Single source of truth used by the orchestrator walk, the Flows tab
 * flatten/count helpers, and the Setup-status badge derivation. Adding a
 * new bucket only requires extending this function (plus the corresponding
 * `ProcessInventory` field and `BucketId` literal).
 */
export function getBucketRows(inv: ProcessInventory, bucketId: BucketId): WorkflowRow[] {
  switch (bucketId) {
    case "bucket-1":
      return inv.bucket1;
    case "bucket-2":
      return inv.bucket2;
    case "bucket-3":
      return inv.bucket3;
    case "bucket-4":
      return inv.bucket4;
    case "bucket-5":
      return inv.bucket5;
    case "independent":
      return inv.independent;
    default:
      return [];
  }
}

/** True when a row belongs to a duplicate group and per-row Activate should be disabled (A8). */
export function isDuplicate(row: WorkflowRow, duplicates: DuplicateActionGroup[]): boolean {
  return duplicates.some((g) => g.rows.some((r) => r.id === row.id));
}

// ─── Activation primitives ───────────────────────────────────────────────────

function isDependencyError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("child") || m.includes("referenced") || m.includes("not found");
}

/** Category-aware error remap (A7 + RD-9). */
function remapActivationError(row: WorkflowRow, raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("privilege") || lower.includes("permission")) {
    if (row.kind === "custom-action") {
      return "Activating this process requires the Activate Real-time Processes privilege and write permission on the process.";
    }
    return "Unable to activate flow. You may need owner or co-owner rights on this flow. Check your permissions in Power Automate.";
  }
  if (lower.includes("managed")) {
    return "Unable to activate this managed process. Contact the solution owner or activate it directly in Power Automate.";
  }
  return raw;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function patchActivate(row: WorkflowRow): Promise<void> {
  console.log(`${LOG_PREFIX} PATCH activate id=${row.id} name="${row.name}" kind=${row.kind}`);
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    "return=minimal",
    "application/json",
    "current",
    "workflows",
    row.id,
    { statecode: 1, statuscode: 2 },
  );
  if (!result.success) {
    const raw = extractError("Failed to activate process", result);
    throw new Error(remapActivationError(row, raw));
  }
}

async function pollUntilActive(
  row: WorkflowRow,
  policy: BucketActivationPolicy,
  onProgress?: (phase: "polling") => void,
): Promise<boolean> {
  for (let attempt = 1; attempt <= policy.pollAttempts; attempt++) {
    await sleep(policy.pollIntervalMs);
    onProgress?.("polling");
    const fresh = await fetchSingleProcess(row.id);
    console.log(
      `${LOG_PREFIX} poll ${attempt}/${policy.pollAttempts} id=${row.id} statecode=${fresh?.statecode}`,
    );
    if (fresh?.isActive) return true;
  }
  return false;
}

/**
 * Per-row activation. Reads the live row first (A10 idempotency), skips when
 * already active, otherwise PATCHes + polls + optionally retries on
 * dependency-error. Returns a typed outcome.
 */
export async function activateProcess(
  row: WorkflowRow,
  policy: BucketActivationPolicy,
  onPhase?: (phase: "patching" | "polling" | "retrying") => void,
): Promise<
  | { kind: "activated"; row: WorkflowRow }
  | { kind: "already-active"; row: WorkflowRow }
  | { kind: "failed"; row: WorkflowRow; error: string }
> {
  const fresh = await fetchSingleProcess(row.id);
  if (fresh?.isActive) {
    console.log(`${LOG_PREFIX} ${row.name} already active, skipping PATCH`);
    return { kind: "already-active", row: fresh };
  }
  const live = fresh ?? row;

  onPhase?.("patching");
  try {
    await patchActivate(live);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (policy.retryDependencyErrors && isDependencyError(msg)) {
      console.warn(`${LOG_PREFIX} dependency error for ${live.name}, retrying once: ${msg}`);
      onPhase?.("retrying");
      await sleep(policy.pollIntervalMs);
      try {
        await patchActivate(live);
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        return { kind: "failed", row: live, error: msg2 };
      }
    } else {
      return { kind: "failed", row: live, error: msg };
    }
  }

  const confirmed = await pollUntilActive(live, policy, () => onPhase?.("polling"));
  if (!confirmed) {
    return {
      kind: "failed",
      row: live,
      error:
        "Activation request accepted but the process did not report active within the polling window. Try Refresh in a few seconds.",
    };
  }
  return {
    kind: "activated",
    row: { ...live, statecode: 1, statuscode: 2, isActive: true },
  };
}

// ─── Orchestrator (A3 + A10 + Q16d) ──────────────────────────────────────────

/**
 * Sequential walk of buckets 1 -> 5. Within each bucket: sequential rows,
 * per-bucket policy, idempotent skip for already-active rows. On any failure
 * inside a bucket, marks remaining buckets as skipped and halts the walk
 * (stop-before-next-bucket, Q16d). Re-runs are safe per A10.
 */
export async function activateAllInOrder(
  inventory: ProcessInventory,
  onProgress: (progress: ActivationProgress) => void,
): Promise<ActivationRunResult> {
  if (inventory.duplicates.length > 0) {
    throw new Error(
      `Cannot activate while ${inventory.duplicates.length} duplicate Custom Action name(s) exist. Resolve duplicates first.`,
    );
  }

  const buckets: BucketActivationResult[] = [];
  const totals = { activated: 0, alreadyActive: 0, failed: 0, skipped: 0 };
  let stoppedBeforeBucket: BucketId | null = null;
  let halted = false;

  for (let bi = 0; bi < ORCHESTRATOR_BUCKET_ORDER.length; bi++) {
    const bid = ORCHESTRATOR_BUCKET_ORDER[bi];
    const rows = getBucketRows(inventory, bid);
    const policy = BUCKET_POLICIES[bid];
    const outcomes: ActivationRowOutcome[] = [];

    if (halted) {
      for (const row of rows) {
        outcomes.push({ kind: "skipped", row, reason: "bucket-stopped" });
        totals.skipped++;
      }
      buckets.push({ bucketId: bid, outcomes });
      continue;
    }

    let bucketFailed = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const meta = { bucketId: bid, row, index: i + 1, total: rows.length };
      onProgress({ ...meta, phase: "patching" });

      const res = await activateProcess(row, policy, (phase) =>
        onProgress({ ...meta, phase }),
      );

      if (res.kind === "activated") {
        totals.activated++;
        outcomes.push({ kind: "activated", row: res.row });
        onProgress({ ...meta, phase: "done" });
      } else if (res.kind === "already-active") {
        totals.alreadyActive++;
        outcomes.push({ kind: "already-active", row: res.row });
        onProgress({ ...meta, phase: "done" });
      } else {
        totals.failed++;
        outcomes.push({ kind: "failed", row: res.row, error: res.error });
        onProgress({ ...meta, phase: "failed" });
        bucketFailed = true;
      }
    }

    buckets.push({ bucketId: bid, outcomes });

    if (bucketFailed) {
      halted = true;
      stoppedBeforeBucket =
        bi + 1 < ORCHESTRATOR_BUCKET_ORDER.length ? ORCHESTRATOR_BUCKET_ORDER[bi + 1] : null;
    }
  }

  console.log(`${LOG_PREFIX} activateAllInOrder complete:`, totals, { stoppedBeforeBucket });
  return { buckets, totals, stoppedBeforeBucket };
}
