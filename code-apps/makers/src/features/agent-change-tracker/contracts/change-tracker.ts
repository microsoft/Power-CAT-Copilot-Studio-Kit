/**
 * Type contracts for the Agent Change Tracker feature.
 *
 * The backing Dataverse tables live in the environment the app is deployed to,
 * addressed through the connector's `current` organization sentinel (see
 * services/tracking-org.ts), so the feature is portable across environments.
 * They are read/written via MicrosoftDataverseService *WithOrganization ops.
 *
 * The current backend is the pre/post-image architecture: the plug-in writes a
 * source outbox, the processor appends central history, and current state is
 * maintained separately. UI component categories remain intentionally
 * independent from the source Dataverse componenttype values.
 */

/**
 * Dataverse entity set (plural) names for the pre/post-image architecture.
 */
export const ENTITY_SET = {
  config: 'cat_agenttrackingconfigurations',
  changeLog: 'cat_agentchangehistoryelastics',
  state: 'cat_agenttrackedstates',
  outbox: 'cat_agentchangeoutboxes',
} as const;

/** Primary key column of each tracking table. */
export const PRIMARY_KEY = {
  config: 'cat_agenttrackingconfigurationid',
  changeLog: 'cat_agentchangehistoryelasticid',
  state: 'cat_agenttrackedstateid',
  outbox: 'cat_agentchangeoutboxid',
} as const;

/**
 * The change-history table has no agent id of its own — every row is tied to
 * its agent through an N:1 lookup to the tracking configuration row. The same
 * lookup is written by the four "Agent Change Tracker | Capture *" cloud flows,
 * so the app and the flows share one linkage.
 *
 * Reads filter on the `_..._value` form; writes bind the navigation property,
 * whose casing must match the entity's $metadata exactly.
 */
export const CONFIG_LINK = {
  /** State and source outbox use a local Dataverse lookup. */
  lookupFilterField: '_cat_trackingconfigurationid_value',
  bindKey: 'cat_TrackingConfigurationId@odata.bind',
} as const;

/**
 * Elastic-table storage policy for cat_agentchangehistoryelastic, shared with the
 * four "Agent Change Tracker | Capture *" cloud flows so both writers behave
 * identically.
 *
 * `partitionid` is the tracking configuration id, which co-locates every change
 * row of one agent in a single logical partition. Every read of this table
 * filters on that configuration (see {@link CONFIG_LOOKUP}), so the partition key
 * matches the dominant query exactly.
 *
 * `ttlinseconds` expires a row 60 days after it is written. History is derived
 * data — the authoritative state lives in Copilot Studio and in the config row's
 * baseline — so it should not accumulate indefinitely.
 */
export const HISTORY_STORAGE = {
  /** Elastic logical partition key column. */
  partitionField: 'partitionid',
  /** Time-to-live column; Dataverse deletes the row once it elapses. */
  ttlField: 'ttlinseconds',
  /** Retention window applied to every new change row: 60 days. */
  ttlSeconds: 60 * 24 * 60 * 60,
  /**
   * Whether reads are scoped to a single partition. Enabled once the legacy,
   * unpartitioned history was purged (July 2026) — every row now carries a
   * partition id, so a partition-scoped query is both correct and cheaper. Set
   * back to `false` only if unpartitioned rows are reintroduced.
   */
  partitionScopedReads: true,
} as const;

export const TrackingStatus = {
  Initializing: 335350000,
  Active: 335350001,
  Removed: 335350003,
} as const;
export type TrackingStatus = (typeof TrackingStatus)[keyof typeof TrackingStatus];

export const OperationCode = {
  Baseline: 335350000,
  Create: 335350001,
  Update: 335350002,
  Delete: 335350003,
} as const;
export type OperationCode = (typeof OperationCode)[keyof typeof OperationCode];

export const SourceTable = {
  Agent: 335350000,
  Component: 335350001,
} as const;
export type SourceTable = (typeof SourceTable)[keyof typeof SourceTable];

/** Source of a change-history row (cat_sourcecode option set). */
export const ChangeSource = {
  Flow: 1,
  Baseline: 2,
} as const;
export type ChangeSource = (typeof ChangeSource)[keyof typeof ChangeSource];

/**
 * Component type of a tracked change (cat_componenttypecode option set).
 *
 * These values MUST match the option set defined on cat_agentchangehistoryelastic
 * exactly, because they cross three boundaries: the app writes them to
 * `cat_componenttypecode` and to the `componentType` field of each
 * `cat_baselinepayload` leaf, and the "Capture Botcomponent Delete" flow copies
 * that value straight back
 * into `cat_componenttypecode`. Diverging here silently mislabels rows for every
 * other reader of the table (Dataverse views, Advanced Find, Power BI) without
 * raising a validation error, since a wrong-but-valid option still saves.
 */
export const ComponentType = {
  Agent: 1,
  Settings: 2,
  Description: 3,
  Instructions: 4,
  Knowledge: 5,
  Topic: 6,
  Connector: 7,
  Tool: 8,
  Trigger: 9,
  ChildAgent: 10,
  Skill: 11,
  Evaluation: 12,
  Other: 13,
  MCP: 14,
} as const;
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType];

/**
 * Whether a change row carries a single agent-level scalar value rather than a
 * YAML-authored component body — the shape that renders as one before → after
 * pair with no "View YAML".
 *
 * Three labels ("Agent name", "Published on", "Agent icon") describe the agent
 * itself rather than its configuration, so they are stored as
 * {@link ComponentType.Agent}; every other tracked scalar stays
 * {@link ComponentType.Settings}. Both read identically, so every gate that used
 * to test for Settings alone must use this predicate instead.
 *
 * Accepting BOTH values is deliberate and permanent, not a migration shim: the
 * change table is append-only, so rows written before the Agent-category split
 * remain Settings until their TTL expires, and the app and the capture flows
 * deploy independently. Reading permissively means neither side has to ship
 * first and no backfill is required.
 *
 * NOTE: this is NOT a test for "is an agent-level row". The Capture Agent Delete
 * flow also writes {@link ComponentType.Agent}, for the deletion of the agent
 * itself. Those rows carry the agent source record id and changeType `Deleted`, so
 * callers that must exclude them (see the settings reconciliation in
 * change-tracker-service) additionally require an absent component id.
 */
export function isScalarComponentType(type: ComponentType | undefined): boolean {
  return type === ComponentType.Settings || type === ComponentType.Agent;
}

export const COMPONENT_TYPE_LABEL: Record<ComponentType, string> = {
  [ComponentType.Agent]: 'Agent',
  [ComponentType.Settings]: 'Settings',
  [ComponentType.Description]: 'Description',
  [ComponentType.Instructions]: 'Instructions',
  [ComponentType.Knowledge]: 'Knowledge source',
  [ComponentType.Topic]: 'Topic',
  [ComponentType.Connector]: 'Connector',
  [ComponentType.Tool]: 'Tool',
  [ComponentType.Trigger]: 'Trigger',
  [ComponentType.ChildAgent]: 'Child Agent',
  [ComponentType.Other]: 'Other',
  [ComponentType.Evaluation]: 'Evaluation',
  [ComponentType.Skill]: 'Skill',
  [ComponentType.MCP]: 'MCP',
};

/** Top-level YAML `kind` values that authoritatively map to a component type. */
const YAML_KIND_TO_TYPE: Record<string, ComponentType> = {
  // Agent instructions and model settings are stored together as
  // `GptComponentMetadata`. Instruction text can legitimately reference an
  // InvokeConnectedAgentTaskAction, so recognize the top-level kind before the
  // nested connected-agent fallback below.
  gptcomponentmetadata: ComponentType.Instructions,
  knowledgesourceconfiguration: ComponentType.Knowledge,
  nofeedbackcollection: ComponentType.Settings,
  defaultfeedbackcollection: ComponentType.Settings,
  generalqualitygrader: ComponentType.Evaluation,
  evaluationset: ComponentType.Evaluation,
  evaluationdata: ComponentType.Evaluation,
  // New-designer evaluation questions are authored as `kind: MultiTurnEvaluationCase`
  // (or SingleTurnEvaluationCase) and typed by Dataverse with an opaque `mspva_<guid>`
  // schema, so classifyComponent / the capture flow fall back to "Other". The
  // authored `kind` is authoritative and relabels them to Evaluation.
  multiturnevaluationcase: ComponentType.Evaluation,
  singleturnevaluationcase: ComponentType.Evaluation,
  // New-designer Skills (Skills panel) are botcomponents typed by Dataverse as
  // componenttype 9 (same as Tools), so they'd otherwise fall back to "Other".
  // The authored `kind: InlineAgentSkill` is authoritative and also relabels
  // rows captured before Skill classification existed.
  inlineagentskill: ComponentType.Skill,
  // Connected agents (new-designer "Agents" panel) are authored as
  // `kind: ConnectedAgentTool` but Dataverse types them with a `.tool.` schema
  // segment, so classifyComponent / the capture flow classify them as "Tool".
  // The authored `kind` is authoritative and relabels them to a Child Agent.
  connectedagenttool: ComponentType.ChildAgent,
  // Modern MCP components are authored directly as `kind: McpTool`.
  mcptool: ComponentType.MCP,
};

/** Extract the first top-level `kind:` token from a component's YAML body. */
export function firstYamlKind(yaml: string | undefined): string {
  if (!yaml) return '';
  const m = yaml.match(/(?:^|\n)\s*kind:\s*([A-Za-z0-9_]+)/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Refine a component type using its authored YAML body. Dataverse sometimes
 * types knowledge sources as topics; the YAML `kind` is the authoritative
 * signal, so it overrides the stored/derived type when recognised.
 */
export function refineComponentType(type: ComponentType, yaml: string | undefined): ComponentType {
  const kind = firstYamlKind(yaml);
  const mapped = YAML_KIND_TO_TYPE[kind];
  if (mapped) return mapped;
  // Classic-designer connected agents are authored as `kind: TaskDialog` whose
  // nested `action.kind` is `InvokeConnectedAgentTaskAction`. The top-level kind
  // is unmapped and the schema name carries no `.childagent.`/`.agent.` segment,
  // so the change rows land on the capture flow's fallback type (Other) and
  // surface as "Other" without this override. The nested action kind is the
  // authoritative signal that this is a connected (child) agent.
  if ((yaml ?? '').toLowerCase().includes('invokeconnectedagenttaskaction')) {
    return ComponentType.ChildAgent;
  }
  // Classic-designer MCP components use a TaskDialog wrapper and identify the
  // protocol through nested operation metadata rather than the top-level kind.
  if ((yaml ?? '').toLowerCase().includes('modelcontextprotocolmetadata')) {
    return ComponentType.MCP;
  }
  // Trigger components (e.g. `kind: WorkflowExternalTrigger` for a flow-based
  // trigger such as "When a new email arrives") are typed by Dataverse without
  // a `.trigger.` schema segment, so classifyComponent falls back to "Other".
  // The authored `kind` is the authoritative signal: any *Trigger kind is a Trigger.
  if (kind.endsWith('trigger')) return ComponentType.Trigger;
  return type;
}

/** Nature of the change (cat_changetypecode option set). */
export const ChangeType = {
  Created: 1,
  Updated: 2,
  Deleted: 3,
} as const;
export type ChangeType = (typeof ChangeType)[keyof typeof ChangeType];

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  [ChangeType.Created]: 'Added',
  [ChangeType.Updated]: 'Updated',
  [ChangeType.Deleted]: 'Removed',
};

/** Baseline snapshot status for a configured agent (cat_baselinestatuscode option set). */
export const BaselineStatus = {
  Pending: 1,
  Captured: 2,
  Failed: 3,
} as const;
export type BaselineStatus = (typeof BaselineStatus)[keyof typeof BaselineStatus];

/** A row in cat_agenttrackingconfiguration — one per opted-in agent. */
export interface TrackingConfig {
  id: string;
  agentId: string;
  agentName: string;
  environmentId?: string;
  environmentUrl?: string;
  status?: TrackingStatus;
  baselineCapturedOn?: string;
  baselineStatus?: BaselineStatus;
  configuredByName?: string;
  configuredOn?: string;
}

/** Input to opt an agent into tracking. */
export interface AddTrackingConfigInput {
  agentId: string;
  agentName: string;
  environmentId?: string;
  environmentUrl?: string;
  configuredByName?: string;
}

/** A single per-field/per-path change row in cat_agentchangehistoryelastic. */
export interface ChangeLogEntry {
  id: string;
  agentId: string;
  /** Id of the tracking configuration row this change belongs to. */
  configId?: string;
  componentType?: ComponentType;
  componentId?: string;
  componentName?: string;
  changeType?: ChangeType;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  /** Current authored YAML used only when scalar history values cannot identify the component kind. */
  classificationBody?: string;
  /** Component description stored outside the authored YAML, used for creation-card display. */
  componentDescription?: string;
  changedByName?: string;
  changedOn?: string;
  saveTransactionId?: string;
  eventId?: string;
  sourceVersion?: string;
  sourceTable?: SourceTable;
  sourceComponentType?: number;
  componentSchemaName?: string;
  changedColumns?: string[];
}

/**
 * Change rows grouped by a single Save transaction
 * (cat_savetransactionid) — the unit shown in the timeline.
 */
export interface SaveGroup {
  saveTransactionId: string;
  changedOn?: string;
  changedByName?: string;
  entries: ChangeLogEntry[];
}

/** An agent available to be configured for tracking. */
export interface AvailableAgent {
  id: string;
  name: string;
  agentId?: string;
  environmentId?: string;
  environmentUrl?: string;
  environmentName?: string;
  environmentType?: string;
  /** Agent owner display name from the central cat_agentdetails catalog. */
  ownerName?: string;
  /** Display name of the user who last published the agent. */
  publishedByName?: string;
  /** When the agent was last published (cat_publisheddate), if ever. */
  publishedOn?: string;
}

/** A distinct environment surfaced for the environment-first selection flow. */
export interface AvailableEnvironment {
  /** Environment id (cat_environmentid); falls back to the url when absent. */
  id: string;
  /** Friendly display name (cat_environmentname) or the host when absent. */
  name: string;
  /** Org url used for cross-environment Dataverse reads. */
  url: string;
  type?: string;
}

/**
 * A single tracked unit of an agent's current state — either a Copilot Studio
 * `botcomponent` (tool, topic, knowledge, trigger…) or one flattened agent
 * setting (e.g. Code Interpreter). The diff engine compares these against the
 * stored snapshot to derive create/update/delete change events.
 */
export interface ComponentState {
  /** Stable identity within the agent (botcomponentid, or `settings::<path>`). */
  key: string;
  componentId?: string;
  componentType: ComponentType;
  componentName: string;
  /** The diff body (component YAML, or the setting value). */
  body: string;
  /** The component's plain-text description (botcomponent `description` column). */
  description?: string;
  /** FNV-1a hash of {@link body}; cheap change detection. */
  hash: string;
  /** When the underlying botcomponent was created (ISO); undefined for settings. */
  createdOn?: string;
  modifiedOn?: string;
  modifiedByName?: string;
  modifiedById?: string;
}

/** One tracked unit of an agent's prior baseline state, parsed for diffing.
 *  Persisted (with others) in the config row's cat_baselinepayload JSON blob. */
export interface SnapshotComponent {
  key: string;
  componentType: ComponentType;
  componentName: string;
  body: string;
  /** The component's plain-text description at baseline time, if captured. */
  description?: string;
  hash: string;
  /** When the underlying botcomponent was created (ISO), if captured. */
  createdOn?: string;
}

/** Outcome summary of a capture run. */
export interface CaptureResult {
  isBaseline: boolean;
  created: number;
  updated: number;
  deleted: number;
  total: number;
}

/** Who a change is attributed to when no component-level author is available. */
export interface Attribution {
  name?: string;
}

/** The agent's own last-modified metadata (used to attribute deletes). */
export interface AgentModifier {
  modifiedByName?: string;
  modifiedById?: string;
  modifiedOn?: string;
  createdByName?: string;
  createdById?: string;
  createdOn?: string;
  ownerName?: string;
  ownerId?: string;
}

/** Who created and owns an agent — surfaced so users know who owns the bot. */
export interface AgentOwnership {
  createdByName?: string;
  createdById?: string;
  createdOn?: string;
  ownerName?: string;
  ownerId?: string;
  publishedOn?: string;
  /** The agent's icon as a raw base64 image (bots.iconbase64), when set. */
  iconBase64?: string;
}

/** Full live read of an agent: its components/settings plus agent-level meta. */
export interface LiveState {
  states: ComponentState[];
  agent: AgentModifier;
}
