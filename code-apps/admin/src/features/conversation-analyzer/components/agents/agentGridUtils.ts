import type { SortDirection } from '@fluentui/react-components';
import type { AgentTableRow } from '../../hooks/useAgentsTable';
import { HEALTH_PRIORITY } from '../../contracts/constants';
import type { HealthStatus, PiiExposure, SentimentLabel } from '../../contracts/types';

export type AgentColumnId =
  | 'agent' | 'coverage' | 'conversations' | 'sentiment' | 'pii' | 'lastAnalyzed' | 'status' | 'actions';

export type SortableAgentColumnId = Exclude<AgentColumnId, 'actions'>;

export interface AgentSortState {
  sortColumn: SortableAgentColumnId;
  sortDirection: SortDirection;
}

export type AgentStatusFilterValue = 'all' | HealthStatus;

export const DEFAULT_AGENT_SORT: AgentSortState = { sortColumn: 'lastAnalyzed', sortDirection: 'descending' };

/** Display order for the segmented status filter. */
export const STATUS_FILTER_ORDER: readonly HealthStatus[] = ['critical', 'attention', 'healthy', 'unknown'];

const SENTIMENT_ORDER: Record<SentimentLabel, number> = { negative: 0, mixed: 1, neutral: 2, positive: 3, unknown: 4 };
const PII_ORDER: Record<PiiExposure, number> = { high: 0, medium: 1, low: 2, none: 3, unknown: 4 };

const byName = (a: AgentTableRow, b: AgentTableRow) => a.name.localeCompare(b.name);
const withName = (diff: number, a: AgentTableRow, b: AgentTableRow) => diff || byName(a, b);

/** Column comparators; name is always the tie-breaker. */
export const AGENT_COMPARE: Record<SortableAgentColumnId, (a: AgentTableRow, b: AgentTableRow) => number> = {
  agent: byName,
  coverage: (a, b) => withName(a.coverageRatio - b.coverageRatio, a, b),
  conversations: (a, b) => withName(a.conversations - b.conversations, a, b),
  sentiment: (a, b) => withName(SENTIMENT_ORDER[a.sentiment] - SENTIMENT_ORDER[b.sentiment], a, b),
  pii: (a, b) => withName(PII_ORDER[a.pii] - PII_ORDER[b.pii], a, b),
  lastAnalyzed: (a, b) => withName((a.lastAnalyzedAt ?? '').localeCompare(b.lastAnalyzedAt ?? ''), a, b),
  status: (a, b) => withName(HEALTH_PRIORITY[a.status] - HEALTH_PRIORITY[b.status], a, b),
};

/** Sorts agent rows client-side. */
export function sortAgentRows(rows: AgentTableRow[], sort: AgentSortState): AgentTableRow[] {
  const compare = AGENT_COMPARE[sort.sortColumn];
  const dir = sort.sortDirection === 'descending' ? -1 : 1;
  return [...rows].sort((a, b) => dir * compare(a, b));
}

/** Maps `?status=` values (incl. legacy aliases) to a filter value. */
export function parseStatusParam(value: string | null): AgentStatusFilterValue {
  switch ((value ?? '').toLowerCase()) {
    case 'healthy': return 'healthy';
    case 'attention': case 'needs-attention': return 'attention';
    case 'critical': return 'critical';
    case 'unknown': case 'not-analyzed': case 'notanalyzed': return 'unknown';
    default: return 'all';
  }
}

/** Relative "x days ago" text for an ISO date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diffMs = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
