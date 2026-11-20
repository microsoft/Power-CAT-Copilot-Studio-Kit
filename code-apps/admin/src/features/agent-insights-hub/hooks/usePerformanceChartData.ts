/**
 * usePerformanceChartData - Response time series and active users.
 *
 * Accepts DailyMetrics[] and returns:
 * - responseTimeGrouped: avg + P90 response time by date (grouped bar)
 * - responseTimeUnit: display unit for the bar chart axis
 * - activeUsers: sorted unique user names
 */

import { useMemo } from "react";
import type { DailyMetrics } from "../contracts/types";
import { CHART_COLORS_ARRAY } from "../contracts/types";
import { weightedAverage, chooseDurationUnit, convertDuration } from "../utils/metricCalculations";
import type { GroupedBarDataItem } from "../components/charts/FluentGroupedBarChart";

export interface PerformanceChartData {
  responseTimeGrouped: GroupedBarDataItem[];
  responseTimeUnit: string;
  activeUsers: string[];
}

/** Compute response time grouped bar and active users list. */
export function usePerformanceChartData(dailyMetrics: DailyMetrics[]): PerformanceChartData {
  return useMemo(() => {
    // Aggregate daily metrics by date
    const dailyByDate = new Map<
      string,
      { totalRespTime: number; totalResp: number; p90Sum: number; p90Count: number }
    >();
    for (const d of dailyMetrics) {
      const dateKey = d.cat_metricdate?.substring(0, 10);
      if (!dateKey) continue;
      const entry = dailyByDate.get(dateKey) ?? {
        totalRespTime: 0,
        totalResp: 0,
        p90Sum: 0,
        p90Count: 0,
      };
      entry.totalRespTime += d.cat_totalresponsetimems ?? 0;
      entry.totalResp += d.cat_totalresponses ?? 0;
      if (d.cat_p90responsetimems != null) {
        entry.p90Sum += d.cat_p90responsetimems;
        entry.p90Count += 1;
      }
      dailyByDate.set(dateKey, entry);
    }

    const sortedDates = [...dailyByDate.keys()].sort();

    // Determine unit from the max response time across all dates
    let maxRespMs = 0;
    for (const v of dailyByDate.values()) {
      const avg = v.totalResp > 0 ? v.totalRespTime / v.totalResp : 0;
      const p90 = v.p90Count > 0 ? v.p90Sum / v.p90Count : 0;
      maxRespMs = Math.max(maxRespMs, avg, p90);
    }
    const respDu = chooseDurationUnit(maxRespMs);
    const responseTimeUnit = respDu.unit;

    const responseTimeGrouped: GroupedBarDataItem[] = sortedDates.map((dateStr) => {
      const v = dailyByDate.get(dateStr)!;
      const avgVal = convertDuration(weightedAverage(v.totalRespTime, v.totalResp), respDu);
      const p90Val = v.p90Count > 0
        ? convertDuration(v.p90Sum / v.p90Count, respDu)
        : 0;
      return {
        name: dateStr,
        series: [
          {
            key: "avg",
            data: avgVal,
            legend: `Average response time (${responseTimeUnit})`,
            color: CHART_COLORS_ARRAY[2],
          },
          {
            key: "p90",
            data: p90Val,
            legend: `P90 response time (${responseTimeUnit})`,
            color: CHART_COLORS_ARRAY[3],
          },
        ],
      };
    });

    // Active Users: parse from cat_topusersdisplay (comma-separated names)
    const usersSet = new Set<string>();
    for (const d of dailyMetrics) {
      const usersStr = d.cat_topusersdisplay;
      if (!usersStr || typeof usersStr !== "string") continue;
      usersStr.split(",").forEach((name) => {
        const trimmed = name.trim();
        if (trimmed && trimmed.toLowerCase() !== "anonymous") {
          usersSet.add(trimmed);
        }
      });
    }
    const activeUsers = [...usersSet].sort();

    return { responseTimeGrouped, responseTimeUnit, activeUsers };
  }, [dailyMetrics]);
}
