/**
 * Advanced Testing — Setup feature contracts.
 *
 * Shared types across the Setup sub-feature. Phase 2 added Connection
 * Reference types; Phase 3 adds Test Automation process types
 * (Cloud Flows + Custom Actions). Environment Variable types arrive in
 * Phase 5.
 */

// ─── Connection References (Phase 2) ────────────────────────────────────────

/**
 * Represents a Connection Reference record from the Dataverse `connectionreferences`
 * table. Mirrors the Power Shield model so the Power Shield service port works
 * unchanged.
 */
export interface ConnectionReference {
  /** connectionreferenceid (PK) */
  id: string;
  /** connectionreferencedisplayname */
  displayName: string;
  /** connectionreferencelogicalname */
  logicalName: string;
  /** connectorid, short connector API name (e.g. `shared_commondataserviceforapps`) */
  connectorId: string;
  /** connectionid, Dataverse-persisted compact 32-char hex. `null` when unmapped. */
  connectionId: string | null;
  /** statecode === 0 means active */
  isActive: boolean;
}

/**
 * Static, code-side definition of a Connection Reference that the Advanced
 * Testing feature requires. Held in a typed registry (`REQUIRED_CRS`) so the
 * Setup UI can render a row per definition even when the Dataverse record is
 * missing (uninstalled solution layer, deleted CR, renamed).
 */
export interface RequiredCrDefinition {
  /** `connectionreferencelogicalname`, stable identity across renames. */
  logicalName: string;
  /** User-facing fallback label when the Dataverse record is absent. */
  displayName: string;
  /**
   * Connector identifier used to build the "+ Create New Connection" deep link
   * when the Dataverse record is absent. Accepts either a full ARM path
   * (e.g. `/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio`)
   * or the short api name (`shared_microsoftcopilotstudio`); both are
   * normalized at the call site.
   */
  connectorId: string;
}

/**
 * One row in the Connections tab. Pairs a static {@link RequiredCrDefinition}
 * with the live Dataverse `ConnectionReference` record (when present). The
 * `record === null` case represents "definition exists in code but the CR row
 * is missing from this environment" — the UI renders Not Installed only, with
 * no Dropdown, no mapping mutation, and no available-connections fetch.
 */
export interface ConnectionReferenceSlot {
  definition: RequiredCrDefinition;
  record: ConnectionReference | null;
}

/**
 * An available connection from the Power Platform API Hub, fetched via
 * `PowerAppsforMakersService.Get_Connections`.
 */
export interface AvailableConnection {
  /** value[].name, raw API Hub identifier. Used as the Fluent `<Option>` value. */
  name: string;
  /**
   * The connection's underlying GUID normalized to the same 32-char compact hex
   * form Dataverse persists in `connectionreferences.connectionid`. `null` when
   * `name` doesn't contain a parseable GUID.
   */
  normalizedId: string | null;
  /** value[].properties.displayName */
  displayName: string;
  /** value[].properties.statuses[0].status (e.g. "Connected", "Error") */
  status: string;
  /** value[].properties.createdBy.displayName */
  createdBy: string;
  /** value[].properties.apiId, full provider path, used for matching */
  apiId: string;
  /** value[].properties.createdTime, ISO date string */
  createdTime: string;
}

// ─── Test Automation Processes (Phase 3) ────────────────────────────────────

/**
 * `category` on the Dataverse `workflows` table distinguishes process kinds.
 *  - 3 = Custom Action (real-time process)
 *  - 5 = Modern Flow (Cloud Flow)
 */
export type ProcessKind = "cloud-flow" | "custom-action";

/**
 * Bucket identifier driving activation ordering and group rendering (plan §2.6).
 *  - `bucket-1` Custom Actions (Step 1)
 *  - `bucket-2` Child Cloud Flows (Step 2)
 *  - `bucket-3` Parent feature Cloud Flows (Step 3)
 *  - `bucket-4` Orchestrator + `(Child)` flow called by the top-level (Step 4)
 *  - `bucket-5` Top-level `Run Agent Tests Automated` flow, activated last (Step 5)
 *  - `independent` Optional flows, excluded from orchestrator, per-row only
 *  - `unexpected` `Test Automation |` flow not in any allow-list (A12)
 */
export type BucketId =
  | "bucket-1"
  | "bucket-2"
  | "bucket-3"
  | "bucket-4"
  | "bucket-5"
  | "independent"
  | "unexpected";

/**
 * A row from the Dataverse `workflows` table, expanded with the columns the
 * duplicate-detection (A8) and bucketing logic need.
 */
export interface WorkflowRow {
  /** workflowid (PK) */
  id: string;
  /** name, used for bucket lookup and display */
  name: string;
  /** uniquename, stable schema name across solutions; null when unset */
  uniqueName: string | null;
  /** 3 = Custom Action, 5 = Cloud Flow */
  category: number;
  /** Derived from category */
  kind: ProcessKind;
  /** 0 = Draft, 1 = Activated */
  statecode: number;
  /** 1 = Draft, 2 = Activated (mirrors statecode for workflows) */
  statuscode: number;
  /** `statecode === 1` */
  isActive: boolean;
  /** True for managed-solution rows; affects activation error remap */
  isManaged: boolean;
  /** solutionid, used for A8 duplicate disambiguation. Simple Edm.Guid column on the workflow entity (not a lookup). */
  solutionId: string | null;
  /**
   * componentstate: 0 = Published, 1 = Unpublished, 2 = Deleted, 3 = Deleted Unpublished.
   * Rows with `componentstate === 2` are excluded from buckets and duplicate sets.
   */
  componentState: number;
}

/**
 * Per-bucket activation tuning (plan §2.6 A5).
 *  - `pollAttempts`/`pollIntervalMs`: re-read frequency after PATCH until row reports active.
 *  - `retryDependencyErrors`: re-PATCH once on "child"/"referenced"/"not found" errors (RD-4).
 */
export interface BucketActivationPolicy {
  pollAttempts: number;
  pollIntervalMs: number;
  retryDependencyErrors: boolean;
}

/**
 * One expected Custom Action name returning more than one published live row.
 * A8 BLOCKER: presence of any group with `rows.length > 1` disables the
 * orchestrator and the affected rows' per-row Activate.
 */
export interface DuplicateActionGroup {
  /** The Custom Action `name` that appears in >1 live row */
  name: string;
  /** The duplicate rows (each row's `solutionId` / `isManaged` disambiguates) */
  rows: WorkflowRow[];
}

/**
 * Discovery + classification snapshot (`getProcessInventory`).
 * Counts are derived from these arrays; never persisted separately (A12).
 */
export interface ProcessInventory {
  /** Raw discovery result, includes `componentstate === 2` rows */
  rows: WorkflowRow[];
  bucket1: WorkflowRow[];
  bucket2: WorkflowRow[];
  bucket3: WorkflowRow[];
  bucket4: WorkflowRow[];
  bucket5: WorkflowRow[];
  independent: WorkflowRow[];
  /** `Test Automation |` Cloud Flows not in any allow-list (A12 warning source) */
  unexpected: WorkflowRow[];
  /** A8 duplicate Custom Action groups */
  duplicates: DuplicateActionGroup[];
  /** Names expected per bucket but missing from discovery (A12 warning source) */
  missing: { bucket: BucketId; names: string[] }[];
}

/** Per-row activation outcome inside `ActivationRunResult`. */
export type ActivationRowOutcome =
  | { kind: "activated"; row: WorkflowRow }
  | { kind: "already-active"; row: WorkflowRow }
  | { kind: "failed"; row: WorkflowRow; error: string }
  | {
      kind: "skipped";
      row: WorkflowRow;
      reason: "bucket-stopped" | "duplicate-blocked";
    };

/** Per-bucket activation result returned by `activateAllInOrder`. */
export interface BucketActivationResult {
  bucketId: BucketId;
  outcomes: ActivationRowOutcome[];
}

/** Final result of a full `activateAllInOrder` walk. */
export interface ActivationRunResult {
  buckets: BucketActivationResult[];
  totals: {
    activated: number;
    alreadyActive: number;
    failed: number;
    skipped: number;
  };
  /** Set to the next bucket id when the walk halted early; null on full success. */
  stoppedBeforeBucket: BucketId | null;
}

/** Phase reported to `onProgress` during an activation walk. */
export type ActivationPhase = "patching" | "polling" | "retrying" | "done" | "failed" | "skipped";

/** Streaming progress callback payload for `activateAllInOrder`. */
export interface ActivationProgress {
  bucketId: BucketId;
  row: WorkflowRow;
  /** 1-based index within the current bucket */
  index: number;
  total: number;
  phase: ActivationPhase;
}

// ─── Environment Variables (Phase 5) ────────────────────────────────────────

/**
 * Subset of Dataverse `environmentvariabledefinition.type` option set values we
 * support in the Setup screen. The option set codes are documented at
 * https://learn.microsoft.com/en-us/power-platform/alm/environmentvariables.
 *  - 100000000 = String  → `text`
 *  - 100000001 = Number (Decimal) → `decimal`
 *  - 100000002 = Boolean → `boolean`
 *  - 100000003 = JSON    → `json`
 *
 * Phase 5 only renders `text` and `decimal` rows; other kinds are returned for
 * completeness so the UI can render them read-only or skip them with a notice.
 */
export type EnvVarKind = "decimal" | "text" | "boolean" | "json";

/**
 * Definition row from `environmentvariabledefinitions`. Stable across
 * environments; one per schema name.
 */
export interface EnvironmentVariableDefinition {
  /** environmentvariabledefinitionid (PK) */
  id: string;
  /** schemaname (e.g. `cat_PowerAutomateEndpoint`) */
  schemaName: string;
  /** displayname, human-readable label */
  displayName: string;
  /**
   * description column. Trimmed at the service layer; empty strings are
   * normalized to `null`. UI may truncate for layout.
   */
  description: string | null;
  /** Mapped from the integer option set value on the `type` column */
  kind: EnvVarKind;
  /**
   * Definition-level default value. Dataverse stores it as a string regardless
   * of `kind`. `null` when no default is configured.
   */
  defaultValue: string | null;
}

/**
 * Per-environment override row from `environmentvariablevalues`. At most one
 * per definition is expected; RD-6 dedupes deterministically when more than
 * one exists.
 */
export interface EnvironmentVariableValue {
  /** environmentvariablevalueid (PK) */
  id: string;
  /** Raw `value` string as Dataverse stores it; never coerced. */
  value: string;
}

/**
 * One row rendered by the Environment Variables tab. `currentValue === null`
 * means no value row exists yet; the UI shows `defaultValue` and POSTs a new
 * value row on save (RD-7 guards against concurrent creation).
 */
export interface EnvironmentVariable {
  definition: EnvironmentVariableDefinition;
  currentValue: EnvironmentVariableValue | null;
}
