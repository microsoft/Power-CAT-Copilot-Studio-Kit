/**
 * useUsageChartData - Topic usage and slowest topics chart data.
 *
 * Accepts TopicMetrics[] and returns:
 * - topTopics: top 10 topics by trigger count (donut)
 * - slowestTopics: top 5 topics by avg duration (horizontal bar)
 * - slowestTopicsUnit: display unit for the bar chart axis
 */

import { useMemo } from "react";
import type { TopicMetrics } from "../contracts/types";
import { CHART_COLORS_ARRAY } from "../contracts/types";
import { weightedAverage, chooseDurationUnit, convertDuration } from "../utils/metricCalculations";
import { aggregateByKey, topN, toDonutItems } from "../utils/chartHelpers";
import type { DonutDataItem } from "../components/charts/FluentDonutChart";
import type { HorizontalBarDataItem } from "../components/charts/FluentHorizontalBarChart";

export interface UsageChartData {
  topTopics: DonutDataItem[];
  slowestTopics: HorizontalBarDataItem[];
  slowestTopicsUnit: string;
}

/** Compute topic usage donut and slowest-topics bar chart data. */
export function useUsageChartData(topicMetrics: TopicMetrics[]): UsageChartData {
  return useMemo(() => {
    // Top Topics (donut): aggregate triggers by topic name, top 10
    const topicTriggers = aggregateByKey(
      topicMetrics,
      (t) => t.cat_topicname,
      (t) => t.cat_triggercount ?? 0
    );
    const topTopics = toDonutItems(topN(topicTriggers, 10));

    // Slowest Topics (horizontal bar): top 5 by weighted avg duration
    const topicDurAgg = new Map<
      string,
      { totalDur: number; count: number }
    >();
    for (const t of topicMetrics) {
      const name = t.cat_topicname;
      const entry = topicDurAgg.get(name) ?? { totalDur: 0, count: 0 };
      entry.totalDur += t.cat_totaldurationms ?? 0;
      entry.count += t.cat_durationcount ?? 0;
      topicDurAgg.set(name, entry);
    }
    const topicAvgs = [...topicDurAgg.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([label, v]) => ({ label, avgMs: weightedAverage(v.totalDur, v.count) }));
    const topicDu = chooseDurationUnit(Math.max(...topicAvgs.map((t) => t.avgMs), 0));
    const slowestTopics: HorizontalBarDataItem[] = topicAvgs
      .map(({ label, avgMs }, idx) => ({
        label,
        value: convertDuration(avgMs, topicDu),
        color: CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const slowestTopicsUnit = topicDu.unit;

    return { topTopics, slowestTopics, slowestTopicsUnit };
  }, [topicMetrics]);
}
