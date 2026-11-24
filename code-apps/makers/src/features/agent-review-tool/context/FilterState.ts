/**
 * FilterState TypeScript interface
 *
 * Defines the shared state for Agent Review Tool including
 * search, pagination, and current review tracking.
 */

/** Agent tab discriminator */
export type AgentTab = 'copilot-studio' | 'declarative-agent' | 'skills-automations';

/**
 * Filter state interface
 *
 * Shared state managed by FilterContext across all components.
 */
export interface FilterState {
  /** Active agent type tab — default 'copilot-studio' (preserves existing entry behaviour) */
  activeAgentType: AgentTab;

  /** Search query for filtering bots by name */
  searchQuery: string;

  /** Current page number (0-indexed) */
  currentPage: number;

  /** Number of items per page */
  pageSize: number;

  /** Currently selected/reviewing bot ID (for tracking which bot is being reviewed) */
  currentReviewBotId: string | null;

  /** Whether the review dialog is open */
  isReviewDialogOpen: boolean;

  /** Bot ID for the review dialog (when viewing existing review) */
  reviewDialogBotId: string | null;

  /** Whether welcome tour is active */
  isTourActive: boolean;

  /** Current tour step (1, 2, or 3) */
  tourStep: number;

  /** Selected environment org URL (null = current environment) */
  selectedOrgUrl: string | null;

  /** Display label for the selected environment (e.g. FriendlyName) */
  selectedOrgLabel: string;

  /** Power Platform environment ID of the selected environment (null = unknown) */
  selectedEnvironmentId: string | null;
}

/**
 * Filter actions interface
 *
 * Actions for updating filter state.
 */
export interface FilterActions {
  /** Set active agent type tab */
  setActiveAgentType: (tab: AgentTab) => void;

  /** Set search query */
  setSearchQuery: (query: string) => void;

  /** Set current page */
  setCurrentPage: (page: number) => void;

  /** Set page size */
  setPageSize: (size: number) => void;

  /** Set currently reviewing bot ID */
  setCurrentReviewBotId: (botId: string | null) => void;

  /** Open the Standard result page for a bot, optionally by exact review ID. */
  openReviewDialog: (
    botId: string,
    reviewId?: string,
    sourceEnvironment?: string,
  ) => void;

  /** Close review dialog */
  closeReviewDialog: () => void;

  /** Start welcome tour */
  startTour: () => void;

  /** Go to next tour step */
  nextTourStep: () => void;

  /** Go to previous tour step */
  previousTourStep: () => void;

  /** Skip/finish tour */
  finishTour: () => void;

  /** Reset all filters to defaults */
  resetFilters: () => void;

  /** Set the selected environment org URL, display label, and its Power Platform environment ID */
  setSelectedOrgUrl: (url: string | null, environmentId?: string | null, label?: string) => void;
}

/**
 * Combined filter state and actions
 *
 * This is what components receive from useFilterContext() hook.
 */
export interface FilterContextValue extends FilterState, FilterActions {}

/**
 * Default filter state values
 */
export const DEFAULT_FILTER_STATE: FilterState = {
  activeAgentType: 'copilot-studio',
  searchQuery: '',
  currentPage: 0,
  pageSize: 5,
  currentReviewBotId: null,
  isReviewDialogOpen: false,
  reviewDialogBotId: null,
  isTourActive: false,
  tourStep: 1,
  selectedOrgUrl: null,
  selectedOrgLabel: '',
  selectedEnvironmentId: null,
};
