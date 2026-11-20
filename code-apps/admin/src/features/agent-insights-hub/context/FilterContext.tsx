/* eslint-disable react-refresh/only-export-components */
/**
 * FilterContext - Global filter state provider for Agent Insights Hub.
 *
 * Uses useReducer for predictable state transitions. All tab components
 * consume this context to share filter state. Does NOT include isAdmin
 * (per M-8 — that belongs in a separate concern).
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  FilterState,
  FilterContextType,
  DateFilter,
} from "../contracts/types";
import { CHANNEL_OPTIONS } from "../contracts/types";
import { getDefaultFilters, getDateFilter } from "./FilterState";
import { useConfigurations } from "../hooks/useConfigurations";
import { queryKeys } from "../hooks/queryKeys";

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type FilterAction =
  | { type: "SET_CONFIG"; payload: string }
  | { type: "SET_DATE_RANGE"; payload: string }
  | { type: "SET_CUSTOM_DATES"; payload: { start?: string; end?: string } }
  | { type: "SET_CHANNEL"; payload: string }
  | { type: "SET_DATA_MODE"; payload: "production" | "test" | "both" }
  | { type: "RESET" };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, selectedConfigId: action.payload };
    case "SET_DATE_RANGE":
      return { ...state, dateRange: action.payload };
    case "SET_CUSTOM_DATES":
      return {
        ...state,
        customStartDate: action.payload.start ?? state.customStartDate,
        customEndDate: action.payload.end ?? state.customEndDate,
      };
    case "SET_CHANNEL":
      return { ...state, selectedChannel: action.payload };
    case "SET_DATA_MODE":
      return { ...state, dataMode: action.payload };
    case "RESET":
      return getDefaultFilters();
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FilterContext = createContext<FilterContextType | undefined>(undefined);

interface FilterProviderProps {
  children: React.ReactNode;
}

/** Provides global filter state to all Agent Insights Hub tabs. */
export function FilterProvider({ children }: FilterProviderProps) {
  const [state, dispatch] = useReducer(filterReducer, undefined, getDefaultFilters);

  const setSelectedConfigId = useCallback(
    (id: string) => dispatch({ type: "SET_CONFIG", payload: id }),
    []
  );
  const setDateRange = useCallback(
    (range: string) => dispatch({ type: "SET_DATE_RANGE", payload: range }),
    []
  );
  const setCustomStartDate = useCallback(
    (date: string) =>
      dispatch({ type: "SET_CUSTOM_DATES", payload: { start: date } }),
    []
  );
  const setCustomEndDate = useCallback(
    (date: string) =>
      dispatch({ type: "SET_CUSTOM_DATES", payload: { end: date } }),
    []
  );
  const setSelectedChannel = useCallback(
    (channel: string) => dispatch({ type: "SET_CHANNEL", payload: channel }),
    []
  );
  const setDataMode = useCallback(
    (mode: "production" | "test" | "both") =>
      dispatch({ type: "SET_DATA_MODE", payload: mode }),
    []
  );

  const computeDateFilter = useCallback(
    (): DateFilter => getDateFilter(state),
    [state]
  );

  const queryClient = useQueryClient();
  const configQuery = useConfigurations();
  const configurations = useMemo(
    () => configQuery.data ?? [],
    [configQuery.data]
  );
  const loadingConfigurations = configQuery.isLoading;
  const configurationsError = configQuery.isError;
  const refreshConfigurations = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.agentConfigurations() });
  }, [queryClient]);

  const availableChannels = useMemo(
    () => CHANNEL_OPTIONS.map((c) => c.value),
    []
  );

  const value = useMemo<FilterContextType>(
    () => ({
      ...state,
      setSelectedConfigId,
      setDateRange,
      setCustomStartDate,
      setCustomEndDate,
      setSelectedChannel,
      setDataMode,
      configurations,
      loadingConfigurations,
      configurationsError,
      refreshConfigurations,
      availableChannels,
      getDateFilter: computeDateFilter,
    }),
    [
      state,
      setSelectedConfigId,
      setDateRange,
      setCustomStartDate,
      setCustomEndDate,
      setSelectedChannel,
      setDataMode,
      configurations,
      loadingConfigurations,
      configurationsError,
      refreshConfigurations,
      availableChannels,
      computeDateFilter,
    ]
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

/** Hook to consume the global filter context. Throws if used outside provider. */
export function useFilterContext(): FilterContextType {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilterContext must be used within a FilterProvider");
  }
  return ctx;
}
