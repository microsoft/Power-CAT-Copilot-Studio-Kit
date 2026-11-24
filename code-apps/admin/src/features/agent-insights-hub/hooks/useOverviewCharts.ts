/**
 * useOverviewCharts - Thin orchestrator that delegates to focused chart hooks.
 *
 * Preserves the original OverviewChartData interface and export signature
 * so consumers (OverviewTab.tsx) require no changes.
 */

import type {
  DailyMetrics,
  TopicMetrics,
  ToolMetrics,
  ErrorDetails,
} from "../contracts/types";
import type { DonutDataItem } from "../components/charts/FluentDonutChart";
import type { HorizontalBarDataItem } from "../components/charts/FluentHorizontalBarChart";
import type { GroupedBarDataItem } from "../components/charts/FluentGroupedBarChart";
import { useUsageChartData } from "./useUsageChartData";
import { useChannelChartData } from "./useChannelChartData";
import { useSessionChartData } from "./useSessionChartData";
import { useToolChartData } from "./useToolChartData";
import { usePerformanceChartData } from "./usePerformanceChartData";

// ---------------------------------------------------------------------------
// Return type (unchanged — backward compatible)
// ---------------------------------------------------------------------------

export interface OverviewChartData {
  topTopics: DonutDataItem[];
  channelDistribution: DonutDataItem[];
  sessionTurnDistribution: DonutDataItem[];
  durationDistribution: DonutDataItem[];
  errorDistribution: DonutDataItem[];
  topTools: DonutDataItem[];
  toolExecutionSlowest: HorizontalBarDataItem[];
  toolExecutionUnit: string;
  slowestTopics: HorizontalBarDataItem[];
  slowestTopicsUnit: string;
  responseTimeGrouped: GroupedBarDataItem[];
  responseTimeUnit: string;
  activeUsers: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Transforms raw entity arrays into chart-ready data for the Overview tab. */
export function useOverviewCharts(
  dailyMetrics: DailyMetrics[],
  topicMetrics: TopicMetrics[],
  toolMetrics: ToolMetrics[],
  errorDetails: ErrorDetails[]
): OverviewChartData {
  const { topTopics, slowestTopics, slowestTopicsUnit } =
    useUsageChartData(topicMetrics);

  const { channelDistribution, sessionTurnDistribution } =
    useChannelChartData(dailyMetrics);

  const { durationDistribution, errorDistribution } =
    useSessionChartData(dailyMetrics, errorDetails);

  const { topTools, toolExecutionSlowest, toolExecutionUnit } =
    useToolChartData(toolMetrics);

  const { responseTimeGrouped, responseTimeUnit, activeUsers } =
    usePerformanceChartData(dailyMetrics);

  return {
    topTopics,
    channelDistribution,
    sessionTurnDistribution,
    durationDistribution,
    errorDistribution,
    topTools,
    toolExecutionSlowest,
    toolExecutionUnit,
    slowestTopics,
    slowestTopicsUnit,
    responseTimeGrouped,
    responseTimeUnit,
    activeUsers,
  };
}
