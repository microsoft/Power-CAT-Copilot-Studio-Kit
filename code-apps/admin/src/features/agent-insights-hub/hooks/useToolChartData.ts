/**
 * useToolChartData - Tool usage and slowest tool execution charts.
 *
 * Accepts ToolMetrics[] and returns:
 * - topTools: top 10 tools by call count (donut)
 * - toolExecutionSlowest: top 5 tools by avg response time (horizontal bar)
 * - toolExecutionUnit: display unit for the bar chart axis
 */

import { useMemo } from "react";
import type { ToolMetrics } from "../contracts/types";
import { CHART_COLORS_ARRAY } from "../contracts/types";
import { weightedAverage, chooseDurationUnit, convertDuration } from "../utils/metricCalculations";
import { aggregateByKey, topN, toDonutItems } from "../utils/chartHelpers";
import type { DonutDataItem } from "../components/charts/FluentDonutChart";
import type { HorizontalBarDataItem } from "../components/charts/FluentHorizontalBarChart";

export interface ToolChartData {
  topTools: DonutDataItem[];
  toolExecutionSlowest: HorizontalBarDataItem[];
  toolExecutionUnit: string;
}

/** Compute tool usage donut and slowest-execution bar chart data. */
export function useToolChartData(toolMetrics: ToolMetrics[]): ToolChartData {
  return useMemo(() => {
    // Top Tools (donut): aggregate calls by tool name, top 10
    const toolCalls = aggregateByKey(
      toolMetrics,
      (t) => t.cat_toolname,
      (t) => t.cat_callcount ?? 0
    );
    const topTools = toDonutItems(topN(toolCalls, 10));

    // Tool Execution Slowest (horizontal bar): top 5 by weighted avg time
    const toolTimeAgg = new Map<
      string,
      { totalTime: number; count: number }
    >();
    for (const t of toolMetrics) {
      const name = t.cat_toolname;
      const entry = toolTimeAgg.get(name) ?? { totalTime: 0, count: 0 };
      entry.totalTime += (t.cat_avgresponsetimems ?? 0) * (t.cat_callcount ?? 0);
      entry.count += t.cat_callcount ?? 0;
      toolTimeAgg.set(name, entry);
    }
    const toolAvgs = [...toolTimeAgg.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([label, v]) => ({ label, avgMs: weightedAverage(v.totalTime, v.count) }));
    const toolDu = chooseDurationUnit(Math.max(...toolAvgs.map((t) => t.avgMs), 0));
    const toolExecutionSlowest: HorizontalBarDataItem[] = toolAvgs
      .map(({ label, avgMs }, idx) => ({
        label,
        value: convertDuration(avgMs, toolDu),
        color: CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const toolExecutionUnit = toolDu.unit;

    return { topTools, toolExecutionSlowest, toolExecutionUnit };
  }, [toolMetrics]);
}
