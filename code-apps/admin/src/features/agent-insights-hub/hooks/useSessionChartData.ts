/**
 * useSessionChartData - Session duration and error distribution charts.
 *
 * Accepts DailyMetrics[] and ErrorDetails[] and returns:
 * - durationDistribution: short/medium/long conversations (donut)
 * - errorDistribution: errors by code (donut)
 */

import { useMemo } from "react";
import type { DailyMetrics, ErrorDetails } from "../contracts/types";
import { CHART_COLORS_ARRAY } from "../contracts/types";
import { aggregateByKey, topN, toDonutItems } from "../utils/chartHelpers";
import type { DonutDataItem } from "../components/charts/FluentDonutChart";

export interface SessionChartData {
  durationDistribution: DonutDataItem[];
  errorDistribution: DonutDataItem[];
}

/** Compute session duration and error distribution donut chart data. */
export function useSessionChartData(
  dailyMetrics: DailyMetrics[],
  errorDetails: ErrorDetails[]
): SessionChartData {
  return useMemo(() => {
    // Duration Distribution (donut): short/medium/long
    const shortCount = dailyMetrics.reduce(
      (s, d) => s + (d.cat_shortconversations ?? 0), 0
    );
    const mediumCount = dailyMetrics.reduce(
      (s, d) => s + (d.cat_mediumconversations ?? 0), 0
    );
    const longCount = dailyMetrics.reduce(
      (s, d) => s + (d.cat_longconversations ?? 0), 0
    );
    const durationDistribution: DonutDataItem[] = [
      { legend: "Short (< 1 min)", data: shortCount, color: CHART_COLORS_ARRAY[0] },
      { legend: "Medium (1-10 min)", data: mediumCount, color: CHART_COLORS_ARRAY[1] },
      { legend: "Long (> 10 min)", data: longCount, color: CHART_COLORS_ARRAY[2] },
    ];

    // Error Distribution (donut): aggregate errors by code
    const errorMap = aggregateByKey(
      errorDetails,
      (e) => e.cat_errorcode,
      (e) => e.cat_errorcount ?? 0
    );
    const errorDistribution = toDonutItems(topN(errorMap, 10));

    return { durationDistribution, errorDistribution };
  }, [dailyMetrics, errorDetails]);
}
