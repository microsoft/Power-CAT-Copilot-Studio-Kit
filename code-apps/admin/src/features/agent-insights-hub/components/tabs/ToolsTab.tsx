/**
 * ToolsTab - Tool performance metrics with KPIs, charts, and data table.
 *
 * 6 MetricCards: Total Calls, Unique Tools, Success Rate %, Total Failures,
 * Avg Response Time, P90 Response Time.
 * Charts: Tool Calls Over Time (area), Tool Type Distribution (donut),
 * Tool Failures Over Time (area), Slowest Tools (horizontal bar).
 * Table: all ExistingSrcCode columns with Badge for Data Source + Tool Type.
 */

import { useMemo } from "react";
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Badge, Tooltip } from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useToolMetrics } from "../../hooks/useToolMetrics";
import { formatNumber, formatPercentage, formatResponseTime, safeDiv, weightedAverage } from "../../utils/metricCalculations";
import { toolsExportColumns } from "../../utils/exportColumns";
import { CHART_COLORS, CHANNEL_DISPLAY_NAMES } from "../../contracts/types";
import { TOOL_METRICS, TOOL_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import type { GridColumn, ToolMetrics } from "../../contracts/types";
import MetricCard from "../MetricCard";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDonutChart from "../charts/FluentDonutChart";
import FluentHorizontalBarChart from "../charts/FluentHorizontalBarChart";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  metricsRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap", alignItems: "stretch" },
  chartRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap", alignItems: "stretch" },
  chartHalf: { flex: "1 1 45%", minWidth: "300px", display: "flex" },
});

function aggregateKpis(data: ToolMetrics[]) {
  let totalCalls = 0, successCount = 0, failureCount = 0;
  let totalAvgWeighted = 0, totalP90Weighted = 0, totalWeight = 0;
  const toolNames = new Set<string>();
  for (const d of data) {
    const calls = d.cat_callcount ?? 0;
    totalCalls += calls;
    successCount += d.cat_successcount ?? 0;
    failureCount += d.cat_failurecount ?? 0;
    totalAvgWeighted += (d.cat_avgresponsetimems ?? 0) * calls;
    totalP90Weighted += (d.cat_p90responsetimems ?? 0) * calls;
    totalWeight += calls;
    toolNames.add(d.cat_toolname);
  }
  return {
    totalCalls,
    uniqueTools: toolNames.size,
    successRate: safeDiv(successCount * 100, totalCalls),
    totalFailures: failureCount,
    avgResponseMs: weightedAverage(totalAvgWeighted, totalWeight),
    p90ResponseMs: weightedAverage(totalP90Weighted, totalWeight),
  };
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function ToolsTab() {
  const filterCtx = useFilterContext();
  const { data, isLoading } = useToolMetrics(filterCtx);
  const { data: tableHasData } = useTableHasData("tools");
  const styles = useStyles();

  const kpis = useMemo(() => aggregateKpis(data ?? []), [data]);

  // Tool Calls Over Time — AreaChart (like Error Trend)
  const callsOverTime = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_callcount ?? 0));
    }
    return [{ legend: "Tool Calls", color: CHART_COLORS.slot1,
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Tool Type Distribution — DonutChart (unchanged)
  const toolTypeDonut = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) map.set(d.cat_tooltype, (map.get(d.cat_tooltype) ?? 0) + (d.cat_callcount ?? 0));
    return Array.from(map.entries()).map(([legend, val]) => ({ legend, data: val }));
  }, [data]);

  // Tool Failures Over Time — AreaChart (replaces Success Rate by Tool)
  const failuresOverTime = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_failurecount ?? 0));
    }
    return [{ legend: "Failures", color: "#E74856",
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Tool Success Rate — HorizontalBarChart showing success % per tool
  const toolSuccessRate = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, { success: number; total: number }>();
    for (const d of data) {
      const existing = map.get(d.cat_toolname) ?? { success: 0, total: 0 };
      existing.success += d.cat_successcount ?? 0;
      existing.total += d.cat_callcount ?? 0;
      map.set(d.cat_toolname, existing);
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.total > 0)
      .map(([label, v]) => ({ label, value: Math.round((v.success / v.total) * 100) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [data]);

  // Table columns — all 23 ExistingSrcCode columns in same sequence
  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_toolname", label: "Tool Name", width: "170px", sortable: true },
    { key: "cat_metricdate", label: "Date", width: "100px", sortable: true,
      render: (r) => new Date(String(r.cat_metricdate)).toLocaleDateString() },
    { key: "cat_agentname", label: "Agent", width: "130px", sortable: true },
    { key: "cat_tooltype", label: "Tool Type", width: "110px", sortable: true,
      render: (r) => <Badge appearance="tint" color="brand" size="small">{String(r.cat_tooltype ?? "")}</Badge> },
    { key: "cat_channelid", label: "Channel", width: "100px", sortable: true,
      render: (r) => CHANNEL_DISPLAY_NAMES[String(r.cat_channelid ?? "")] ?? String(r.cat_channelid ?? "") },
    { key: "cat_datasourcecode", label: "Data Source", width: "110px", sortable: true,
      render: (r) => (
        <Badge appearance="tint" color={Number(r.cat_datasourcecode) === 1 ? "success" : "warning"} size="small">
          {Number(r.cat_datasourcecode) === 1 ? "Production" : "Test Data"}
        </Badge>
      ),
      searchValue: (r) => Number(r.cat_datasourcecode) === 1 ? "Production" : "Test Data",
    },
    { key: "cat_callcount", label: "Call Count", width: "90px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_callcount ?? 0)) },
    { key: "cat_successcount", label: "Success Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_successcount ?? 0)) },
    { key: "cat_failurecount", label: "Failure Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_failurecount ?? 0)) },
    { key: "cat_successrate", label: "Success Rate", width: "100px", sortable: true, alignment: "end",
      render: (r) => {
        const rate = Number(r.cat_successrate ?? 0);
        const color = rate >= 95 ? "success" as const : rate >= 80 ? "warning" as const : "danger" as const;
        return <Badge appearance="tint" color={color} size="small">{formatPercentage(rate)}</Badge>;
      } },
    { key: "cat_failurerate", label: "Failure Rate", width: "105px", sortable: true, alignment: "end",
      render: (r) => formatPercentage(Number(r.cat_failurerate ?? 0)) },
    { key: "cat_uniqueconversations", label: "Unique Conversations", width: "155px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_uniqueconversations ?? 0)) },
    { key: "cat_avgresponsetimems", label: "Avg Response Time (ms)", width: "160px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_avgresponsetimems ?? 0)) },
    { key: "cat_medianresponsetimems", label: "Median Response Time (ms)", width: "180px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_medianresponsetimems ?? 0)) },
    { key: "cat_p90responsetimems", label: "P90 Response Time (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p90responsetimems ?? 0)) },
    { key: "cat_p95responsetimems", label: "P95 Response Time (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p95responsetimems ?? 0)) },
    { key: "cat_p99responsetimems", label: "P99 Response Time (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p99responsetimems ?? 0)) },
    { key: "cat_minresponsetimems", label: "Min Response Time (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_minresponsetimems ?? 0)) },
    { key: "cat_maxresponsetimems", label: "Max Response Time (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_maxresponsetimems ?? 0)) },
    { key: "cat_errorcodes", label: "Error Codes", width: "150px", sortable: true },
    { key: "cat_resultcodes", label: "Result Codes", width: "150px", sortable: true },
    { key: "cat_firstcall", label: "First Call", width: "150px", sortable: true,
      render: (r) => formatDateTime(String(r.cat_firstcall ?? "")) },
    { key: "cat_lastcall", label: "Last Call", width: "150px", sortable: true,
      render: (r) => formatDateTime(String(r.cat_lastcall ?? "")) },
  ], []);

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading tool metrics..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  return (
    <div className={styles.root}>
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Tool Metrics</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.tools} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.metricsRow}>
          <MetricCard label="Total Calls" value={formatNumber(kpis.totalCalls)} tooltip={TOOL_METRICS.totalCalls} />
          <MetricCard label="Unique Tools" value={formatNumber(kpis.uniqueTools)} tooltip={TOOL_METRICS.uniqueTools} />
          <MetricCard label="Success Rate" value={formatPercentage(kpis.successRate)} tooltip={TOOL_METRICS.successRate} />
          <MetricCard label="Total Failures" value={formatNumber(kpis.totalFailures)} tooltip={TOOL_METRICS.totalFailures} />
          <MetricCard label="Avg Response Time" value={formatResponseTime(kpis.avgResponseMs)} tooltip={TOOL_METRICS.avgResponseTime} />
          <MetricCard label="P90 Response Time" value={formatResponseTime(kpis.p90ResponseMs)} tooltip={TOOL_METRICS.p90ResponseTime} />
        </div>
      </Card>

      {/* Row 1: Tool Calls Over Time (area) + Tool Type Distribution (donut) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Tool Calls Over Time" tooltip={TOOL_CHARTS.callsOverTime}>
            <FluentAreaChart chartTitle="Tool Calls Over Time" series={callsOverTime} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Tool Type Distribution" tooltip={TOOL_CHARTS.toolTypeDistribution}>
            <FluentDonutChart chartTitle="Tool Type Distribution" items={toolTypeDonut} />
          </ChartCard>
        </div>
      </div>

      {/* Row 2: Tool Failures Over Time (area) + Slowest Tools (horizontal bar) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Tool Failures Over Time" tooltip={TOOL_CHARTS.failuresOverTime}>
            <FluentAreaChart chartTitle="Tool Failures Over Time" series={failuresOverTime} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Tool success rate (%)" tooltip={TOOL_CHARTS.successRateByTool}>
            <FluentHorizontalBarChart items={toolSuccessRate} />
          </ChartCard>
        </div>
      </div>

      <FluentDataGrid
        title="Tool Metrics"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={toolsExportColumns}
        exportFilename="tool-metrics"
        searchPlaceholder="Search tools..."
      />
    </div>
  );
}
