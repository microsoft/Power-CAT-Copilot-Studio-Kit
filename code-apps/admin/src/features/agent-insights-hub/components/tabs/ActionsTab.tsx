/**
 * ActionsTab - Action execution metrics with KPIs, charts, and data table.
 *
 * 3 MetricCards: Total Executions, Unique Actions, Avg Elapsed Time.
 * Charts: Execution Trend (area) + Node Kind Distribution (donut) on same row.
 * Table: action metric columns with Badge for Data Source + Node Kind.
 */

import { useMemo } from "react";
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Badge, Tooltip } from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useActionMetrics } from "../../hooks/useActionMetrics";
import { formatNumber, formatResponseTime, safeDiv } from "../../utils/metricCalculations";
import { actionsExportColumns } from "../../utils/exportColumns";
import { CHART_COLORS, CHANNEL_DISPLAY_NAMES } from "../../contracts/types";
import { ACTION_METRICS, ACTION_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import type { GridColumn, ActionMetrics } from "../../contracts/types";
import MetricCard from "../MetricCard";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDonutChart from "../charts/FluentDonutChart";
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

const NODE_KIND_COLORS: Record<string, "informative" | "brand" | "success" | "warning" | "subtle"> = {
  HttpRequestAction: "informative",
  InvokeFlowAction: "brand",
  ConnectorAction: "success",
  SetVariableAction: "warning",
};

function aggregateKpis(data: ActionMetrics[]) {
  let totalExec = 0, totalElapsed = 0;
  const nodeKinds = new Set<string>();
  for (const d of data) {
    totalExec += d.cat_executioncount ?? 0;
    totalElapsed += d.cat_totalelapsedms ?? 0;
    nodeKinds.add(d.cat_nodekind);
  }
  return { totalExec, uniqueNodeKinds: nodeKinds.size, avgElapsedMs: safeDiv(totalElapsed, totalExec) };
}

export default function ActionsTab() {
  const filterCtx = useFilterContext();
  const { data, isLoading } = useActionMetrics(filterCtx);
  const { data: tableHasData } = useTableHasData("actions");
  const styles = useStyles();

  const kpis = useMemo(() => aggregateKpis(data ?? []), [data]);

  // Execution Trend — AreaChart (like Error Trend)
  const executionTrend = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_executioncount ?? 0));
    }
    return [{ legend: "Executions", color: CHART_COLORS.slot1,
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Node Kind Distribution — DonutChart
  const nodeKindDonut = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) map.set(d.cat_nodekind, (map.get(d.cat_nodekind) ?? 0) + (d.cat_executioncount ?? 0));
    return Array.from(map.entries()).map(([legend, val]) => ({ legend, data: val }));
  }, [data]);

  // Table columns
  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_metricdate", label: "Metric Date", width: "100px", sortable: true,
      render: (r) => new Date(String(r.cat_metricdate)).toLocaleDateString() },
    { key: "cat_nodekind", label: "Node Kind", width: "155px", sortable: true,
      render: (r) => {
        const kind = String(r.cat_nodekind ?? "");
        const color = NODE_KIND_COLORS[kind] ?? "subtle";
        return <Badge appearance="tint" color={color}>{kind}</Badge>;
      } },
    { key: "cat_agentname", label: "Agent", width: "120px", sortable: true },
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
    { key: "cat_executioncount", label: "Execution Count", width: "110px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_executioncount ?? 0)) },
    { key: "cat_avgelapsedms", label: "Avg Elapsed (ms)", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_avgelapsedms ?? 0)) },
    { key: "cat_p90elapsedms", label: "P90 Elapsed (ms)", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p90elapsedms ?? 0)) },
    { key: "cat_p95elapsedms", label: "P95 Elapsed (ms)", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p95elapsedms ?? 0)) },
    { key: "cat_p99elapsedms", label: "P99 Elapsed (ms)", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p99elapsedms ?? 0)) },
    { key: "cat_minelapsedms", label: "Min Elapsed (ms)", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_minelapsedms ?? 0)) },
    { key: "cat_maxelapsedms", label: "Max Elapsed (ms)", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_maxelapsedms ?? 0)) },
    { key: "cat_totalelapsedms", label: "Total Elapsed (ms)", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_totalelapsedms ?? 0)) },
    { key: "cat_stddevelapsedms", label: "Std Dev Elapsed (ms)", width: "150px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_stddevelapsedms ?? 0)) },
    { key: "cat_dailyconversationcount", label: "Daily Conversation Count", width: "175px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyconversationcount ?? 0)) },
    { key: "cat_topicid", label: "Topic ID", width: "150px", sortable: true },
  ], []);

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading action metrics..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  return (
    <div className={styles.root}>
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Action Metrics</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.actions} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.metricsRow}>
          <MetricCard label="Total Executions" value={formatNumber(kpis.totalExec)} tooltip={ACTION_METRICS.totalExecutions} />
          <MetricCard label="Unique Actions" value={formatNumber(kpis.uniqueNodeKinds)} tooltip={ACTION_METRICS.uniqueNodeKinds} />
          <MetricCard label="Avg Elapsed Time" value={formatResponseTime(kpis.avgElapsedMs)} tooltip={ACTION_METRICS.avgElapsedTime} />
        </div>
      </Card>

      {/* Execution Trend (area) + Node Kind Distribution (donut) on same row */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Execution Trend" tooltip={ACTION_CHARTS.executionTrend}>
            <FluentAreaChart chartTitle="Execution Trend" series={executionTrend} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Node Kind Distribution" tooltip={ACTION_CHARTS.executionsByNodeKind}>
            <FluentDonutChart chartTitle="Node Kind Distribution" items={nodeKindDonut} />
          </ChartCard>
        </div>
      </div>

      <FluentDataGrid
        title="Action Metrics"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={actionsExportColumns}
        exportFilename="action-metrics"
        searchPlaceholder="Search by action, node kind..."
      />
    </div>
  );
}
