/**
 * localStorage-backed fallback store for the Agent Change Tracker.
 *
 * Used only when {@link shouldUseLocalStore} reports that no live Power Apps
 * data connection is available (plain `vite` dev). It lets the full flow work
 * offline: pick an agent, opt it into tracking, and review its captured
 * baseline. Configured agents persist across reloads; the change history is a
 * fictitious sample in the shape of the agent's components in Dataverse.
 *
 * None of this data is written to Dataverse — it lives entirely in the browser.
 */

import {
  BaselineStatus,
  ChangeType,
  ComponentType,
  type AddTrackingConfigInput,
  type AgentOwnership,
  type AvailableAgent,
  type CaptureResult,
  type ChangeLogEntry,
  type TrackingConfig,
} from '../contracts/change-tracker';

const CONFIGS_KEY = 'csk.agentChangeTracker.configs.v1';
const ENV_URL = 'https://contoso.crm.dynamics.com';
const ENV_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Catalog of agents offered in the Configure dialog when offline.
 *
 * This is fictitious sample data in the shape of `cat_agentdetails` rows whose
 * environment is the tracking org — i.e. the same shape that the live connected
 * app returns from `getTrackableAgents`. When the app runs
 * with a live Power Apps connection these values are fetched from Dataverse
 * instead of this list.
 */
const SEED_AGENTS: AvailableAgent[] = [
  { id: '00000000-0000-0000-0000-000000000101', name: 'Adaptive Card Gallery', agentId: '00000000-0000-0000-0000-000000000201', environmentId: ENV_ID, environmentUrl: ENV_URL },
  { id: '00000000-0000-0000-0000-000000000102', name: 'Request Tracker cat_', agentId: '00000000-0000-0000-0000-000000000202', environmentId: ENV_ID, environmentUrl: ENV_URL },
  { id: '00000000-0000-0000-0000-000000000103', name: 'Know My Customer', agentId: '00000000-0000-0000-0000-000000000203', environmentId: ENV_ID, environmentUrl: ENV_URL },
  { id: '00000000-0000-0000-0000-000000000104', name: 'Adaptive Card Gallery (cat_)', agentId: '00000000-0000-0000-0000-000000000204', environmentId: ENV_ID, environmentUrl: ENV_URL },
  { id: '00000000-0000-0000-0000-000000000105', name: 'Agent pipeline', agentId: '00000000-0000-0000-0000-000000000205', environmentId: ENV_ID, environmentUrl: ENV_URL },
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function readConfigs(): TrackingConfig[] {
  try {
    const raw = localStorage.getItem(CONFIGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackingConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeConfigs(configs: TrackingConfig[]): void {
  try {
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  } catch {
    /* storage unavailable — best effort only */
  }
}

/** Catalog agents available to opt into tracking (offline). */
export function localGetTrackableAgents(): AvailableAgent[] {
  return SEED_AGENTS;
}

/** Agents currently opted into tracking (offline). */
export function localListConfigs(): TrackingConfig[] {
  return [...readConfigs()].sort((a, b) =>
    (b.configuredOn ?? '').localeCompare(a.configuredOn ?? ''),
  );
}

/** Opt an agent into tracking, persisting to localStorage (offline). */
export function localAddConfig(input: AddTrackingConfigInput): boolean {
  const configs = readConfigs();
  if (configs.some((c) => c.agentId === input.agentId)) return true;

  configs.push({
    id: newId(),
    agentId: input.agentId,
    agentName: input.agentName,
    environmentId: input.environmentId,
    environmentUrl: input.environmentUrl ?? ENV_URL,
    baselineStatus: BaselineStatus.Captured,
    baselineCapturedOn: new Date().toISOString(),
    configuredByName: input.configuredByName ?? 'Local preview',
    configuredOn: new Date().toISOString(),
  });
  writeConfigs(configs);
  return true;
}

const PIPELINE_ID = '00000000-0000-0000-0000-000000000205';

interface SnapshotChange {
  type: ComponentType;
  name: string;
  changeType: ChangeType;
  changedOn: string;
  author: string;
  tx: string;
  before?: string;
  after?: string;
  fieldName?: string;
}

/**
 * Fictitious sample component history for the "Agent pipeline" bot — used
 * only for the offline dev preview. Shows the full
 * range of tracked operations (settings toggles, tool/topic create-update-delete,
 * and the initial baseline) so the UI can be validated without a live host.
 */
const PIPELINE_CHANGES: ReadonlyArray<SnapshotChange> = [
  // Most recent save — a mix of operations on 2026-06-24.
  {
    type: ComponentType.Settings,
    name: 'File uploads',
    fieldName: 'File uploads',
    changeType: ChangeType.Updated,
    before: 'false',
    after: 'true',
    changedOn: '2026-06-24T09:16:00.000Z',
    author: 'Alex Wilber',
    tx: 'save-2026-06-24',
  },
  {
    type: ComponentType.Settings,
    name: 'Generative orchestration (Reasoning)',
    fieldName: 'Generative orchestration (Reasoning)',
    changeType: ChangeType.Updated,
    before: 'false',
    after: 'true',
    changedOn: '2026-06-24T09:16:00.000Z',
    author: 'Alex Wilber',
    tx: 'save-2026-06-24',
  },
  {
    type: ComponentType.Tool,
    name: 'Office 365 Outlook — Send a Draft message',
    changeType: ChangeType.Created,
    after: 'contoso_Agentpipeline.action.Office365Outlook-SendaDraftmessage',
    changedOn: '2026-06-24T09:16:00.000Z',
    author: 'Alex Wilber',
    tx: 'save-2026-06-24',
  },
  {
    type: ComponentType.Topic,
    name: 'Escalate',
    changeType: ChangeType.Deleted,
    before: 'contoso_Agentpipeline.topic.Escalate',
    changedOn: '2026-06-24T09:16:00.000Z',
    author: 'Alex Wilber',
    tx: 'save-2026-06-24',
  },
  {
    type: ComponentType.Topic,
    name: 'Greeting',
    changeType: ChangeType.Updated,
    before: 'message: Hello! How can I help?',
    after: 'message: Hi there 👋 — how can I help you today?',
    changedOn: '2026-06-24T09:16:00.000Z',
    author: 'Alex Wilber',
    tx: 'save-2026-06-24',
  },
  // Baseline — the full inventory recorded on 2026-06-04.
  {
    type: ComponentType.Settings,
    name: 'Generative orchestration (Reasoning)',
    changeType: ChangeType.Created,
    after: 'false',
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Settings,
    name: 'File uploads',
    changeType: ChangeType.Created,
    after: 'false',
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Settings,
    name: 'Semantic search',
    changeType: ChangeType.Created,
    after: 'true',
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Settings,
    name: 'General knowledge (model)',
    changeType: ChangeType.Created,
    after: 'true',
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Instructions,
    name: 'Agent instructions',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Tool,
    name: 'Office 365 Outlook — Send an email (V2)',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Topic,
    name: 'Greeting',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Topic,
    name: 'Escalate',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Topic,
    name: 'Conversation Start',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
  {
    type: ComponentType.Topic,
    name: 'Fallback',
    changeType: ChangeType.Created,
    changedOn: '2026-06-04T09:48:00.000Z',
    author: 'Megan Bowen',
    tx: 'baseline-2026-06-04',
  },
];

const APPENDED_KEY = 'csk.agentChangeTracker.captures.v1';

function readAppended(agentId: string): SnapshotChange[] {
  try {
    const raw = localStorage.getItem(`${APPENDED_KEY}.${agentId}`);
    return raw ? (JSON.parse(raw) as SnapshotChange[]) : [];
  } catch {
    return [];
  }
}

function writeAppended(agentId: string, changes: SnapshotChange[]): void {
  try {
    localStorage.setItem(`${APPENDED_KEY}.${agentId}`, JSON.stringify(changes));
  } catch {
    /* best effort */
  }
}

function toEntry(agentId: string, change: SnapshotChange, index: number): ChangeLogEntry {
  return {
    id: `change-${agentId}-${change.tx}-${index}`,
    agentId,
    changedOn: change.changedOn,
    changedByName: change.author,
    saveTransactionId: change.tx,
    componentType: change.type,
    componentName: change.name,
    changeType: change.changeType,
    fieldName: change.fieldName,
    oldValue: change.before,
    newValue: change.after,
  };
}

/** Newest seed save, expressed as an age so the preview never goes stale. */
const SEED_NEWEST_AGE_MS = 2 * 86_400_000;

/**
 * Re-anchors the fixed seed timestamps to the current date, preserving the
 * spacing between saves.
 *
 * The seed uses fixed dates in 2026-06. Audit history is only
 * retained for 30 days, and the date filter is clamped to that window, so
 * absolute timestamps fall out of range as time passes and the offline preview
 * opens with nothing to show.
 */
function anchorSeedToNow(seed: ReadonlyArray<SnapshotChange>): SnapshotChange[] {
  if (seed.length === 0) return [];
  const times = seed.map((change) => Date.parse(change.changedOn));
  const newest = Math.max(...times);
  if (!Number.isFinite(newest)) return [...seed];

  const shift = Date.now() - SEED_NEWEST_AGE_MS - newest;
  return seed.map((change, index) => ({
    ...change,
    changedOn: new Date(times[index] + shift).toISOString(),
  }));
}

/** Captured change history for an agent (offline): appended captures + seed. */
export function localListChangeLog(agentId: string): ChangeLogEntry[] {
  const seed = agentId === PIPELINE_ID ? anchorSeedToNow(PIPELINE_CHANGES) : [];
  const all = [...readAppended(agentId), ...seed];
  return all.map((change, index) => toEntry(agentId, change, index));
}

/** Simulate a capture run offline by appending a small, realistic change set. */
export function localCapture(config: TrackingConfig): CaptureResult {
  const now = new Date();
  const tx = `capture-${now.getTime()}`;
  const author = config.configuredByName ?? 'Local preview';
  const sample: SnapshotChange[] = [
    {
      type: ComponentType.Knowledge,
      name: 'Product FAQ (SharePoint)',
      changeType: ChangeType.Created,
      after: 'contoso_Agentpipeline.knowledge.ProductFAQ',
      changedOn: now.toISOString(),
      author,
      tx,
    },
    {
      type: ComponentType.Settings,
      name: 'Semantic search',
      fieldName: 'Semantic search',
      changeType: ChangeType.Updated,
      before: 'true',
      after: 'false',
      changedOn: now.toISOString(),
      author,
      tx,
    },
  ];
  const existing = readAppended(config.agentId);
  writeAppended(config.agentId, [...sample, ...existing]);
  return { isBaseline: false, created: 1, updated: 1, deleted: 0, total: 2 };
}

/** Reset an agent's captured history offline (clears appended captures). */
export function localReset(config: TrackingConfig): CaptureResult {
  writeAppended(config.agentId, []);
  const seed = config.agentId === PIPELINE_ID ? PIPELINE_CHANGES : [];
  const created = seed.filter((c) => c.changeType === ChangeType.Created).length;
  return { isBaseline: true, created, updated: 0, deleted: 0, total: seed.length };
}

/** Remove a configured agent and clear its captured history (offline). */
export function localRemoveConfig(configId: string): boolean {
  const configs = readConfigs();
  const target = configs.find((c) => c.id === configId);
  writeConfigs(configs.filter((c) => c.id !== configId));
  if (target) {
    try {
      localStorage.removeItem(`${APPENDED_KEY}.${target.agentId}`);
    } catch {
      /* best effort */
    }
  }
  return true;
}

/** Placeholder agent ownership for offline preview mode. */
export function localGetAgentOwnership(): AgentOwnership {
  return {
    createdByName: 'Local preview owner',
    ownerName: 'Local preview owner',
  };
}
