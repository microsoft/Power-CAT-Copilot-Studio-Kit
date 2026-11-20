/* eslint-disable react-refresh/only-export-components */
/**
 * FilterContext - Global filter state for the Conversation Analyzer feature.
 *
 * Provides the active tab + time-period selection shared across the
 * dashboard tabs and all nested sub-screens (New Analysis, Analysis Results,
 * Analysis Result Details, Manage Prompts). Uses useReducer so state
 * transitions stay predictable when adding actions later.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type {
  ActiveTab,
  DateFilter,
  FilterContextType,
  FilterState,
  TimePeriod,
} from '../contracts/types';
import { getDateFilter, getDefaultFilters, persistTimeFilter } from './FilterState';

type FilterAction =
  | { type: 'SET_TAB'; payload: ActiveTab }
  | { type: 'SET_TIME_PERIOD'; payload: TimePeriod }
  | { type: 'SET_CUSTOM_DATES'; payload: { start?: string; end?: string } }
  | { type: 'RESET' };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_TIME_PERIOD':
      return { ...state, timePeriod: action.payload };
    case 'SET_CUSTOM_DATES':
      return {
        ...state,
        customStartDate: action.payload.start ?? state.customStartDate,
        customEndDate: action.payload.end ?? state.customEndDate,
      };
    case 'RESET':
      return getDefaultFilters();
    default:
      return state;
  }
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

interface FilterProviderProps {
  children: React.ReactNode;
}

/** Provides global filter state to the Conversation Analyzer feature. */
export function FilterProvider({ children }: FilterProviderProps) {
  const [state, dispatch] = useReducer(filterReducer, undefined, getDefaultFilters);

  const { timePeriod, customStartDate, customEndDate } = state;
  useEffect(() => {
    persistTimeFilter({ timePeriod, customStartDate, customEndDate });
  }, [timePeriod, customStartDate, customEndDate]);

  const setActiveTab = useCallback(
    (tab: ActiveTab) => dispatch({ type: 'SET_TAB', payload: tab }),
    [],
  );
  const setTimePeriod = useCallback(
    (period: TimePeriod) => dispatch({ type: 'SET_TIME_PERIOD', payload: period }),
    [],
  );
  const setCustomStartDate = useCallback(
    (date: string) => dispatch({ type: 'SET_CUSTOM_DATES', payload: { start: date } }),
    [],
  );
  const setCustomEndDate = useCallback(
    (date: string) => dispatch({ type: 'SET_CUSTOM_DATES', payload: { end: date } }),
    [],
  );

  const computeDateFilter = useCallback((): DateFilter => getDateFilter(state), [state]);

  const value = useMemo<FilterContextType>(
    () => ({
      ...state,
      setActiveTab,
      setTimePeriod,
      setCustomStartDate,
      setCustomEndDate,
      getDateFilter: computeDateFilter,
    }),
    [state, setActiveTab, setTimePeriod, setCustomStartDate, setCustomEndDate, computeDateFilter],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

/** Hook to consume the Conversation Analyzer filter context. Throws if used outside provider. */
export function useFilterContext(): FilterContextType {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }
  return ctx;
}
