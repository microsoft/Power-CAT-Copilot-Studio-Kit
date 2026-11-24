/**
 * Filter State - Factory functions and utilities for FilterState management.
 *
 * Uses a factory function (not module-level constant) so default dates
 * are computed fresh on each call, preventing stale values after idle.
 */

import type { FilterState, DateFilter } from "../contracts/types";
import { DATE_RANGE_OPTIONS } from "../contracts/types";

/**
 * Creates a fresh default FilterState. Called each time the context initializes
 * so date calculations are never stale.
 */
export function getDefaultFilters(): FilterState {
  return {
    selectedConfigId: "all",
    dateRange: "last90days",
    customStartDate: "",
    customEndDate: "",
    selectedChannel: "all",
    dataMode: "production",
  };
}

/**
 * Computes concrete start/end Date objects from the current filter state.
 * For preset ranges, calculates relative to "now". For custom ranges,
 * parses the user-supplied date strings.
 */
export function getDateFilter(state: FilterState): DateFilter {
  const now = new Date();
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  if (state.dateRange === "custom") {
    const start = state.customStartDate
      ? new Date(state.customStartDate)
      : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const end = state.customEndDate ? new Date(state.customEndDate) : endDate;
    return { startDate: start, endDate: end };
  }

  const option = DATE_RANGE_OPTIONS.find((o) => o.value === state.dateRange);
  const daysBack = option?.daysBack ?? 90;
  // Subtract (daysBack - 1) so "Last 7 days" = today + 6 prior days = 7 days total
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (daysBack - 1)
  );

  return { startDate, endDate };
}