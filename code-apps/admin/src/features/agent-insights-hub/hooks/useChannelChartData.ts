/**
 * useChannelChartData - Channel distribution and session turn charts.
 *
 * Accepts DailyMetrics[] and returns:
 * - channelDistribution: conversations by channel (donut)
 * - sessionTurnDistribution: single-turn vs multi-turn (donut)
 */

import { useMemo } from "react";
import type { DailyMetrics } from "../contracts/types";
import { CHANNEL_DISPLAY_NAMES, CHART_COLORS_ARRAY } from "../contracts/types";
import { aggregateByKey, topN, toDonutItems } from "../utils/chartHelpers";
import type { DonutDataItem } from "../components/charts/FluentDonutChart";

export interface ChannelChartData {
  channelDistribution: DonutDataItem[];
  sessionTurnDistribution: DonutDataItem[];
}

/** Compute channel distribution and session turn donut chart data. */
export function useChannelChartData(dailyMetrics: DailyMetrics[]): ChannelChartData {
  return useMemo(() => {
    // Channel Distribution (donut): aggregate conversations by channel
    const channelMap = aggregateByKey(
      dailyMetrics,
      (d) => CHANNEL_DISPLAY_NAMES[d.cat_channelid] ?? d.cat_channelid ?? "Unknown",
      (d) => d.cat_dailyconversationcount ?? 0
    );
    const channelDistribution = toDonutItems(topN(channelMap, 10));

    // Single vs Multi-turn (donut): aggregate turn counts
    const singleTurn = dailyMetrics.reduce(
      (s, d) => s + (d.cat_singleturnconversations ?? 0), 0
    );
    const multiTurn = dailyMetrics.reduce(
      (s, d) => s + (d.cat_multiturnconversations ?? 0), 0
    );
    const sessionTurnDistribution: DonutDataItem[] = [
      { legend: "Single-turn", data: singleTurn, color: CHART_COLORS_ARRAY[0] },
      { legend: "Multi-turn", data: multiTurn, color: CHART_COLORS_ARRAY[1] },
    ];

    return { channelDistribution, sessionTurnDistribution };
  }, [dailyMetrics]);
}
