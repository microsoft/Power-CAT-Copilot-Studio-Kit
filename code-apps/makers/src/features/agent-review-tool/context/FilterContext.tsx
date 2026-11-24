/**
 * FilterContext for Agent Review Tool
 *
 * Provides shared state management for search, pagination, and dialog state
 * across all components in the Agent Review Tool feature.
 */

/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContext } from '@microsoft/power-apps/app';
import {
  type FilterContextValue,
  type FilterState,
  type AgentTab,
  DEFAULT_FILTER_STATE,
} from './FilterState';

const AGENT_TABS: readonly AgentTab[] = ['copilot-studio', 'declarative-agent', 'skills-automations'];
const FILTER_STORAGE_KEY = 'agent-review-tool.filter-state.v1';

type PersistedFilterState = Pick<
  FilterState,
  'searchQuery' | 'selectedOrgUrl' | 'selectedOrgLabel' | 'selectedEnvironmentId'
>;

function nullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function loadPersistedFilterState(): PersistedFilterState | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.searchQuery !== 'string'
      || !nullableString(candidate.selectedOrgUrl)
      || typeof candidate.selectedOrgLabel !== 'string'
      || !nullableString(candidate.selectedEnvironmentId)
    ) {
      return null;
    }

    return {
      searchQuery: candidate.searchQuery,
      selectedOrgUrl: candidate.selectedOrgUrl,
      selectedOrgLabel: candidate.selectedOrgLabel,
      selectedEnvironmentId: candidate.selectedEnvironmentId,
    };
  } catch (error) {
    console.warn('Could not restore Agent Review Tool filters.', error);
    return null;
  }
}

function savePersistedFilterState(state: FilterState): void {
  if (typeof sessionStorage === 'undefined') return;

  const persisted: PersistedFilterState = {
    searchQuery: state.searchQuery,
    selectedOrgUrl: state.selectedOrgUrl,
    selectedOrgLabel: state.selectedOrgLabel,
    selectedEnvironmentId: state.selectedEnvironmentId,
  };

  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(persisted));
  } catch (error) {
    console.warn('Could not save Agent Review Tool filters.', error);
  }
}

/**
 * The tab a review page should return the reader to.
 *
 * The active tab is React state, so it resets whenever this provider remounts —
 * which is exactly what happens on the way back from a review route. Without
 * this, a breadcrumb out of a Skills and Automations review would land on
 * Copilot Studio Agents, and the reader would have to find their place again.
 *
 * Unknown or absent values fall through to the default, so existing links and
 * the plain `/agent-review-tool` entry point are unaffected.
 */
function tabFromSearch(value: string | null): AgentTab | null {
  return AGENT_TABS.includes(value as AgentTab) ? (value as AgentTab) : null;
}

/**
 * Filter context
 *
 * Holds the current filter state and actions for updating it.
 */
const FilterContext = createContext<FilterContextValue | undefined>(undefined);

/**
 * FilterProvider props
 */
interface FilterProviderProps {
  children: ReactNode;
}

/**
 * FilterProvider component
 *
 * Wraps the Agent Review Tool feature and provides filter context to all child components.
 *
 * @example
 * ```tsx
 * <FilterProvider>
 *   <Dashboard />
 * </FilterProvider>
 * ```
 */
export function FilterProvider({ children }: FilterProviderProps) {
  const [searchParams] = useSearchParams();
  // Read once, at mount. Later edits to the query string must not yank the tab
  // out from under someone who has since clicked a different one.
  const [state, setState] = useState<FilterState>(() => {
    const requested = tabFromSearch(searchParams.get('tab'));
    const persisted = loadPersistedFilterState();
    return {
      ...DEFAULT_FILTER_STATE,
      ...persisted,
      activeAgentType: requested ?? DEFAULT_FILTER_STATE.activeAgentType,
    };
  });
  const navigate = useNavigate();

  useEffect(() => {
    savePersistedFilterState(state);
  }, [state]);

  // Seed the current environment ID from the Power Apps SDK on mount
  useEffect(() => {
    getContext()
      .then(ctx => {
        const envId = ctx.app.environmentId;
        if (envId) {
          setState(prev =>
            prev.selectedOrgUrl === null && prev.selectedEnvironmentId === null
              ? { ...prev, selectedEnvironmentId: envId }
              : prev
          );
        }
      })
      .catch(() => {/* best-effort — not critical */});
  }, []);

  // Actions
  const setActiveAgentType = (tab: AgentTab) => {
    setState((prev) => ({
      ...prev,
      activeAgentType: tab,
      searchQuery: '', // Clear search on tab switch
      currentPage: 0, // Reset pagination on tab switch
    }));
  };

  const setSearchQuery = (query: string) => {
    setState((prev) => ({
      ...prev,
      searchQuery: query,
      currentPage: 0, // Reset to first page when search changes
    }));
  };

  const setCurrentPage = (page: number) => {
    setState((prev) => ({ ...prev, currentPage: page }));
  };

  const setPageSize = (size: number) => {
    setState((prev) => ({
      ...prev,
      pageSize: size,
      currentPage: 0, // Reset to first page when page size changes
    }));
  };

  const setCurrentReviewBotId = (botId: string | null) => {
    setState((prev) => ({ ...prev, currentReviewBotId: botId }));
  };

  /**
   * Opens a Standard review.
   *
   * The seam for spec 017: this now **navigates to the review page** instead of
   * opening `ReviewDialogV2`. All three `Dashboard` call sites are unchanged —
   * only this body moved.
   *
   * `ReviewDialogV2` is still mounted in `Dashboard` but can no longer open,
   * because `isReviewDialogOpen` never becomes true. Reverting is this function
   * body alone; deleting the dialog is a separate change.
   */
  const openReviewDialog = (
    botId: string,
    reviewId?: string,
    sourceEnvironment?: string,
  ) => {
    const query = new URLSearchParams();
    if (state.selectedOrgUrl) query.set('orgUrl', state.selectedOrgUrl);
    if (reviewId) query.set('reviewId', reviewId);
    if (sourceEnvironment === 'zip') query.set('sourceEnvironment', 'zip');
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    navigate(`/agent-review-tool/standard/${encodeURIComponent(botId)}${suffix}`);
  };

  const closeReviewDialog = () => {
    setState((prev) => ({
      ...prev,
      isReviewDialogOpen: false,
      reviewDialogBotId: null,
    }));
  };

  const startTour = () => {
    setState((prev) => ({
      ...prev,
      isTourActive: true,
      tourStep: 1,
    }));
  };

  const nextTourStep = () => {
    setState((prev) => ({
      ...prev,
      tourStep: Math.min(prev.tourStep + 1, 3), // Max 3 steps
    }));
  };

  const previousTourStep = () => {
    setState((prev) => ({
      ...prev,
      tourStep: Math.max(prev.tourStep - 1, 1), // Min 1 step
    }));
  };

  const finishTour = () => {
    setState((prev) => ({
      ...prev,
      isTourActive: false,
      tourStep: 1,
    }));
  };

  const resetFilters = () => {
    setState(DEFAULT_FILTER_STATE);
  };

  const setSelectedOrgUrl = (url: string | null, environmentId?: string | null, label?: string) => {
    setState((prev) => ({
      ...prev,
      selectedOrgUrl: url,
      selectedOrgLabel: label ?? '',
      selectedEnvironmentId:
        environmentId !== undefined
          ? environmentId
          : url
            ? null
            : prev.selectedEnvironmentId,
      currentPage: 0, // Reset pagination when environment changes
    }));
  };

  // Context value
  const contextValue: FilterContextValue = {
    // State
    ...state,

    // Actions
    setActiveAgentType,
    setSearchQuery,
    setCurrentPage,
    setPageSize,
    setCurrentReviewBotId,
    openReviewDialog,
    closeReviewDialog,
    startTour,
    nextTourStep,
    previousTourStep,
    finishTour,
    resetFilters,
    setSelectedOrgUrl,
  };

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

/**
 * useFilterContext hook
 *
 * Provides access to filter state and actions from any component
 * within the FilterProvider tree.
 *
 * @throws {Error} If used outside FilterProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { searchQuery, setSearchQuery } = useFilterContext();
 *   return <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />;
 * }
 * ```
 */
export function useFilterContext(): FilterContextValue {
  const context = useContext(FilterContext);

  if (context === undefined) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }

  return context;
}
