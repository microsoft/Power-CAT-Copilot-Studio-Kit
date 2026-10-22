import type { ReviewViewModel } from './components/viewTypes.js';
import type { AgentMapSelection } from '../../widgets/agent-map/AgentMapInspector.js';
import type { AgentMapNodeCategory, AgentMapProvenance } from '../../agent-map/types.js';

export type ReviewTabId = 'map' | 'findings';

export function normalizeReviewTab(value: unknown): ReviewTabId {
  return value === 'findings' || value === 'skills' || value === 'coverage' || value === 'checks'
    ? 'findings'
    : 'map';
}

export interface ReviewNodeFilter {
  reviewId: string;
  nodeId: string;
}

export interface ReviewMapNavigation {
  view: 'map' | 'list';
  selection: AgentMapSelection;
  filters: {
    query: string;
    categories: AgentMapNodeCategory[];
    provenances: AgentMapProvenance[];
    includeUnresolved: boolean;
    /**
     * 2 when the filters were saved after evaluation sets and test cases became
     * hidden by default. Older saved filters do not have it.
     */
    defaultsVersion?: typeof REVIEW_MAP_FILTER_DEFAULTS_VERSION;
  };
  movedPositions: Array<[string, { x: number; y: number }]>;
}

export const REVIEW_MAP_FILTER_DEFAULTS_VERSION = 2;

export interface CopilotReviewResultsProps {
  model: Pick<ReviewViewModel, 'summary'> &
    Partial<Omit<ReviewViewModel, 'summary'>>;
  activeTab: ReviewTabId;
  showSummary?: boolean;
  onTabChange(tab: ReviewTabId): void;
  onOpenFinding?(findingId: string): void;
  reviewId?: string;
  mapNavigation?: ReviewMapNavigation;
  onMapNavigationChange?(navigation: ReviewMapNavigation): void;
  nodeFilter?: ReviewNodeFilter | null;
  onNodeFilterChange?(filter: ReviewNodeFilter | null): void;
  /** A node with linked findings, or the root agent, was activated. Other nodes are only selected. */
  onActivateNode?(filter: ReviewNodeFilter, navigation: ReviewMapNavigation): void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?(): void;
  /** Inline only: false when the host does not offer fullscreen or refused it. */
  fullscreenAvailable?: boolean;
  /** Inline only: show the findings in fullscreen, for one node or for all nodes. */
  onViewAllFindings?(filter: ReviewNodeFilter | null): void;
  /** Inline only: show the current result in fullscreen. */
  onOpenFullscreen?(): void;
}

export interface WorkflowProgressActions {
  canCancelExecution: boolean;
  onCancelExecution?: () => void;
  onContinueInBackground(): void;
}

export interface ProgressStage {
  stageName: string;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'error';
  detail?: string;
  attribution?: 'workflow-agent';
}
