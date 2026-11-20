/**
 * useOverviewMetrics - Aggregates 7 KPIs from DailyMetrics data.
 *
 * Compares current period against the previous period of equal length
 * (fetched separately) for trend calculation.
 */

import { useMemo } from "react";
import type { DailyMetrics } from "../contracts/types";
import {
  calculateTrend,
  weightedAverage,
  safeDiv,
  formatNumber,
  formatResponseTime,
} from "../utils/metricCalculations";
import { HOME_METRICS } from "../utils/metricDescriptions";

export interface OverviewMetric {
  label: string;
  value: string;
  trend: number;
  isNewMetric?: boolean;
  unit?: string;
  invertTrend?: boolean;
  tooltip?: string;
}

export interface OverviewMetricsResult {
  metrics: OverviewMetric[];
  isLoading: boolean;
}

/** Sum a numeric field across DailyMetrics rows, treating nullish as 0. */
function sumField(rows: DailyMetrics[], key: keyof DailyMetrics): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

/** Count unique metric dates in the dataset. */
function uniqueDayCount(rows: DailyMetrics[]): number {
  const dates = new Set(
    rows.map((r) => r.cat_metricdate?.substring(0, 10)).filter((d): d is string => d != null)
  );
  return Math.max(dates.size, 1);
}

/** Compute KPI values from a period slice. */
function computeKpis(rows: DailyMetrics[]) {
  const totalConversations = sumField(rows, "cat_dailyconversationcount");
  const totalUniqueUsers = sumField(rows, "cat_dailyuniqueusers");
  const days = uniqueDayCount(rows);
  const avgDAU = safeDiv(totalUniqueUsers, days);

  const totalResponses = sumField(rows, "cat_totalresponses");
  const totalResponseTimeMs = sumField(rows, "cat_totalresponsetimems");
  const avgResponseTimeMs = weightedAverage(totalResponseTimeMs, totalResponses);

  const totalDurationMs = sumField(rows, "cat_totaldurationms");
  const durationCount = sumField(rows, "cat_conversationcountforduration");
  const avgDurationMin = weightedAverage(totalDurationMs, durationCount) / 60000;

  const toolSuccessCount = sumField(rows, "cat_toolsuccesscount");
  const toolCallCount = sumField(rows, "cat_toolcallcount");
  const toolSuccessRate = safeDiv(toolSuccessCount, toolCallCount) * 100;

  const totalErrors = sumField(rows, "cat_errorcount");

  return {
    totalConversations,
    avgDAU,
    totalResponses,
    avgResponseTimeMs,
    avgDurationMin,
    toolSuccessRate,
    totalErrors,
  };
}

/**
 * Aggregates 7 KPIs with trend indicators.
 * Trends compare current period vs previous period of equal length.
 */
export function useOverviewMetrics(
  dailyMetrics: DailyMetrics[],
  previousDailyMetrics: DailyMetrics[],
  isLoading: boolean
): OverviewMetricsResult {
  const metrics = useMemo<OverviewMetric[]>(() => {
    if (!dailyMetrics || dailyMetrics.length === 0) return [];

    const allKpis = computeKpis(dailyMetrics);
    const hasPreviousData = previousDailyMetrics.length > 0;
    const prev = hasPreviousData ? computeKpis(previousDailyMetrics) : null;

    const noTrend = { percentageChange: 0, direction: "neutral" as const, isSignificant: false, isNewMetric: false };

    const convTrend = prev ? calculateTrend(allKpis.totalConversations, prev.totalConversations) : noTrend;
    const dauTrend = prev ? calculateTrend(allKpis.avgDAU, prev.avgDAU) : noTrend;
    const respTrend = prev ? calculateTrend(allKpis.totalResponses, prev.totalResponses) : noTrend;
    const avgRespTimeTrend = prev ? calculateTrend(allKpis.avgResponseTimeMs, prev.avgResponseTimeMs) : noTrend;
    const durationTrend = prev ? calculateTrend(allKpis.avgDurationMin, prev.avgDurationMin) : noTrend;
    const toolSuccessTrend = prev ? calculateTrend(allKpis.toolSuccessRate, prev.toolSuccessRate) : noTrend;
    const errorTrend = prev ? calculateTrend(allKpis.totalErrors, prev.totalErrors) : noTrend;

    return [
      {
        label: "Conversations",
        value: formatNumber(allKpis.totalConversations),
        trend: convTrend.percentageChange,
        isNewMetric: convTrend.isNewMetric,
        tooltip: HOME_METRICS.totalConversations,
      },
      {
        label: "Average DAU",
        value: formatNumber(Math.round(allKpis.avgDAU)),
        trend: dauTrend.percentageChange,
        isNewMetric: dauTrend.isNewMetric,
        tooltip: HOME_METRICS.dailyActiveUsers,
      },
      {
        label: "Responses",
        value: formatNumber(allKpis.totalResponses),
        trend: respTrend.percentageChange,
        isNewMetric: respTrend.isNewMetric,
        tooltip: HOME_METRICS.responses,
      },
      {
        label: "Average response",
        value: formatResponseTime(allKpis.avgResponseTimeMs),
        trend: avgRespTimeTrend.percentageChange,
        isNewMetric: avgRespTimeTrend.isNewMetric,
        invertTrend: true,
        tooltip: HOME_METRICS.avgResponse,
      },
      {
        label: "Duration",
        value: allKpis.avgDurationMin.toFixed(1),
        trend: durationTrend.percentageChange,
        isNewMetric: durationTrend.isNewMetric,
        unit: "min",
        invertTrend: true,
        tooltip: HOME_METRICS.duration,
      },
      {
        label: "Tool success",
        value: allKpis.toolSuccessRate.toFixed(1),
        trend: toolSuccessTrend.percentageChange,
        isNewMetric: toolSuccessTrend.isNewMetric,
        unit: "%",
        tooltip: HOME_METRICS.toolSuccess,
      },
      {
        label: "Errors",
        value: formatNumber(allKpis.totalErrors),
        trend: errorTrend.percentageChange,
        isNewMetric: errorTrend.isNewMetric,
        invertTrend: true,
        tooltip: HOME_METRICS.errors,
      },
    ];
  }, [dailyMetrics, previousDailyMetrics]);

  return { metrics, isLoading };
}
