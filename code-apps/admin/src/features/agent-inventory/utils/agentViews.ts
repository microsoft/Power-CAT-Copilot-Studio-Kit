import type {
  AgentInventoryRecord,
  AgentInventoryView,
  InventoryChoice,
} from '../contracts/types';

const DORMANT_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

export function isYesChoice(value: InventoryChoice): boolean {
  return value === 'yes';
}

export type AuthenticationCategory = 'none' | 'microsoft' | 'manual' | 'unknown';

/**
 * Classifies an agent's end-user authentication mode into one of four buckets:
 * "None" -> `none`, "Integrated" -> `microsoft`, any other configured value
 * (e.g. Generic OAuth 2.0, Custom Entra ID) -> `manual`, and a blank/unset
 * value -> `unknown` (missing data is never assumed to be no-authentication).
 */
export function classifyAuthentication(value?: string): AuthenticationCategory {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized === 'none' || normalized.includes('no authentication')) return 'none';
  if (normalized === 'integrated') return 'microsoft';
  return 'manual';
}

/** Display labels for each authentication category, shared by the dashboard donut and derived metrics. */
export const AUTHENTICATION_CATEGORY_LABELS: Record<AuthenticationCategory, string> = {
  microsoft: 'Microsoft authenticated',
  manual: 'Manual authentication',
  none: 'No authentication',
  unknown: 'Unknown',
};

export function isCustomAgent(record: AgentInventoryRecord): boolean {
  return record.type.toLowerCase() === 'custom';
}

/** Dormant = no recorded usage in the last 90 days (or no usage date at all). */
export function isDormantRecord(record: AgentInventoryRecord): boolean {
  const last = record.lastUsageDate ? new Date(record.lastUsageDate) : null;
  const valid = last && !Number.isNaN(last.getTime()) ? last : null;
  return !valid || Date.now() - valid.getTime() > DORMANT_THRESHOLD_MS;
}

export function isMissingOwner(record: AgentInventoryRecord): boolean {
  return !record.owner?.trim();
}

export function isUnmanaged(record: AgentInventoryRecord): boolean {
  return record.managedState?.toLowerCase() === 'unmanaged';
}

interface AgentViewDefinition {
  /** Human-readable label shown in the All agents filter banner. */
  label: string;
  predicate: (record: AgentInventoryRecord) => boolean;
}

/**
 * Single source of truth shared by the dashboard tile counts (aggregations.ts)
 * and the All agents deep-link filters so the two never diverge.
 */
export const AGENT_INVENTORY_VIEWS: Record<AgentInventoryView, AgentViewDefinition> = {
  'no-authentication': {
    label: 'Agents without end-user authentication',
    predicate: (record) => classifyAuthentication(record.authenticationType) === 'none',
  },
  draft: {
    label: 'Draft agents (not published)',
    predicate: (record) => record.published === 'no',
  },
  autonomous: {
    label: 'Autonomous agents',
    predicate: (record) => isYesChoice(record.autonomousAgent),
  },
  'connector-maker-auth': {
    label: 'Agents using connector maker authentication context',
    predicate: (record) => isYesChoice(record.capabilities.usesConnectorMakerAuthContext),
  },
  dormant: {
    label: 'Agents dormant for 90+ days',
    predicate: (record) => isDormantRecord(record),
  },
  'test-not-configured': {
    label: 'Agents without test automation configured',
    predicate: (record) => record.capabilities.usesEvaluations === 'no',
  },
  unmanaged: {
    label: 'Unmanaged agents (outside managed solutions)',
    predicate: (record) => isUnmanaged(record),
  },
  'missing-owner': {
    label: 'Agents without an assigned owner',
    predicate: (record) => record.hasSystemAdminAccess === 'yes' && isMissingOwner(record),
  },
  'web-search-enabled': {
    label: 'Agents with web search enabled',
    predicate: (record) => isYesChoice(record.capabilities.webSearchEnabled),
  },
  'capability-generative-ai': {
    label: 'Agents using generative AI',
    predicate: (record) => isYesChoice(record.capabilities.usesGenAI),
  },
  'capability-knowledge-sources': {
    label: 'Agents using knowledge sources',
    predicate: (record) => isYesChoice(record.capabilities.usesKnowledgeSources),
  },
  'capability-tools-actions': {
    label: 'Agents using tools',
    predicate: (record) => isYesChoice(record.capabilities.usesTools),
  },
  'capability-skills': {
    label: 'Agents using skills',
    predicate: (record) => isYesChoice(record.capabilities.usesSkills),
  },
  'capability-evaluations': {
    label: 'Agents using evaluations',
    predicate: (record) => isYesChoice(record.capabilities.usesEvaluations),
  },
  'capability-ai-builder-prompts': {
    label: 'Agents using AI Builder prompts',
    predicate: (record) => isYesChoice(record.capabilities.usesPrompts),
  },
  'capability-mcp': {
    label: 'Agents using MCP',
    predicate: (record) => isYesChoice(record.capabilities.usesMCP),
  },
};

export function isAgentInventoryView(value: string | null): value is AgentInventoryView {
  return value !== null && Object.prototype.hasOwnProperty.call(AGENT_INVENTORY_VIEWS, value);
}
