/**
 * TopicsTab - Topic performance metrics with KPIs, charts, and data table.
 *
 * 6 MetricCards: Total Triggers, Completed, Abandoned, Avg Duration, Errors, Messages.
 * Charts: Triggers Over Time (area, same as Error Trend) + Topics with Most Errors (horizontal bar, top 5) on same row.
 * Then: Top Topics (donut) + Messages In vs Out (donut).
 * Table: all 26 ExistingSrcCode columns with Badge for Data Source + Completion Rate.
 */

import { useMemo } from "react";
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Badge, Tooltip } from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useTopicMetrics } from "../../hooks/useTopicMetrics";
import { formatNumber, formatDuration, safeDiv } from "../../utils/metricCalculations";
import { topicsExportColumns } from "../../utils/exportColumns";
import { CHART_COLORS, CHANNEL_DISPLAY_NAMES } from "../../contracts/types";
import { TOPIC_METRICS, TOPIC_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import type { GridColumn, TopicMetrics } from "../../contracts/types";
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

function aggregateKpis(data: TopicMetrics[]) {
  let triggers = 0, completed = 0, abandoned = 0, errors = 0, messages = 0;
  let totalDuration = 0, durationCount = 0;
  for (const d of data) {
    triggers += d.cat_triggercount ?? 0;
    completed += d.cat_completioncount ?? 0;
    abandoned += d.cat_abandonmentcount ?? 0;
    errors += d.cat_errorcount ?? 0;
    messages += d.cat_messagecount ?? 0;
    totalDuration += d.cat_totaldurationms ?? 0;
    durationCount += d.cat_durationcount ?? 0;
  }
  const avgDurationMs = safeDiv(totalDuration, durationCount);
  return { triggers, completed, abandoned, errors, messages, avgDurationMs };
}

export default function TopicsTab() {
  const filterCtx = useFilterContext();
  const { data, isLoading } = useTopicMetrics(filterCtx);
  const { data: tableHasData } = useTableHasData("topics");
  const styles = useStyles();

  const kpis = useMemo(() => aggregateKpis(data ?? []), [data]);

  // Topic Triggers Over Time — LineChart (per ui-spec-topics.json: variant "line")
  const triggersOverTime = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_triggercount ?? 0));
    }
    return [{ legend: "Triggers", color: CHART_COLORS.slot1,
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Topics with Most Errors — HorizontalBarChart top 5
  const errorTopicsBar = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const ec = d.cat_errorcount ?? 0;
      if (ec > 0) map.set(d.cat_topicname, (map.get(d.cat_topicname) ?? 0) + ec);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([label, value]) => ({ label, value, color: "#E74856" }));
  }, [data]);

  // Top Topics by Triggers — DonutChart
  const topTopicsDonut = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) map.set(d.cat_topicname, (map.get(d.cat_topicname) ?? 0) + (d.cat_triggercount ?? 0));
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([legend, val]) => ({ legend, data: val }));
  }, [data]);

  // Messages In vs Out — DonutChart
  const messagesDonut = useMemo(() => {
    if (!data?.length) return [];
    let msgIn = 0, msgOut = 0;
    for (const d of data) { msgIn += d.cat_messagesin ?? 0; msgOut += d.cat_messagesout ?? 0; }
    return [
      { legend: "Messages In", data: msgIn, color: CHART_COLORS.slot1 },
      { legend: "Messages Out", data: msgOut, color: CHART_COLORS.slot3 },
    ];
  }, [data]);

  // Table columns — all 26 ExistingSrcCode columns in same sequence
  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_topicname", label: "Topic", width: "170px", sortable: true },
    { key: "cat_metricdate", label: "Date", width: "100px", sortable: true,
      render: (r) => new Date(String(r.cat_metricdate)).toLocaleDateString() },
    { key: "cat_agentname", label: "Agent", width: "140px", sortable: true },
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
    { key: "cat_triggercount", label: "Trigger Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_triggercount ?? 0)) },
    { key: "cat_completioncount", label: "Completion Count", width: "110px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_completioncount ?? 0)) },
    { key: "cat_completionrate", label: "Completion Rate", width: "110px", sortable: true, alignment: "end",
      render: (r) => {
        const rate = Number(r.cat_completionrate ?? 0);
        const color = rate >= 80 ? "success" as const : rate >= 50 ? "warning" as const : "danger" as const;
        return <Badge appearance="tint" color={color} size="small">{`${rate.toFixed(1)}%`}</Badge>;
      } },
    { key: "cat_redirectcount", label: "Redirect Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_redirectcount ?? 0)) },
    { key: "cat_abandonmentcount", label: "Abandonment Count", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_abandonmentcount ?? 0)) },
    { key: "cat_abandonmentrate", label: "Abandonment Rate", width: "140px", sortable: true, alignment: "end",
      render: (r) => `${Number(r.cat_abandonmentrate ?? 0).toFixed(1)}%` },
    { key: "cat_errorcount", label: "Error Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_errorcount ?? 0)) },
    { key: "cat_errorrate", label: "Error Rate", width: "100px", sortable: true, alignment: "end",
      render: (r) => `${Number(r.cat_errorrate ?? 0).toFixed(1)}%` },
    { key: "cat_dailyuniqueconversations", label: "Daily Unique Conversations", width: "175px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyuniqueconversations ?? 0)) },
    { key: "cat_dailyuniqueusers", label: "Daily Unique Users", width: "135px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyuniqueusers ?? 0)) },
    { key: "cat_mediandurationms", label: "Median Duration (ms)", width: "145px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_mediandurationms ?? 0)) },
    { key: "cat_p95durationms", label: "P95 Duration (ms)", width: "135px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p95durationms ?? 0)) },
    { key: "cat_mindurationms", label: "Min Duration (ms)", width: "135px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_mindurationms ?? 0)) },
    { key: "cat_maxdurationms", label: "Max Duration (ms)", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_maxdurationms ?? 0)) },
    { key: "cat_messagecount", label: "Message Count", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_messagecount ?? 0)) },
    { key: "cat_messagesin", label: "Messages In", width: "110px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_messagesin ?? 0)) },
    { key: "cat_messagesout", label: "Messages Out", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_messagesout ?? 0)) },
    { key: "cat_actioncount", label: "Action Count", width: "110px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_actioncount ?? 0)) },
    { key: "cat_maxactionelapsedms", label: "Max Action Elapsed (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_maxactionelapsedms ?? 0)) },
    { key: "cat_p90actionelapsedms", label: "P90 Action Elapsed (ms)", width: "165px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p90actionelapsedms ?? 0)) },
    { key: "cat_nodekindsdisplay", label: "Node Kinds Display", width: "200px", sortable: true },
  ], []);

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading topic metrics..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  return (
    <div className={styles.root}>
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Topic Metrics</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.topics} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.metricsRow}>
          <MetricCard label="Total Triggers" value={formatNumber(kpis.triggers)} tooltip={TOPIC_METRICS.totalTriggers} />
          <MetricCard label="Completed" value={formatNumber(kpis.completed)} tooltip={TOPIC_METRICS.completed} />
          <MetricCard label="Abandoned" value={formatNumber(kpis.abandoned)} tooltip={TOPIC_METRICS.abandoned} />
          <MetricCard label="Avg Duration" value={formatDuration(kpis.avgDurationMs)} tooltip={TOPIC_METRICS.avgDuration} />
          <MetricCard label="Errors" value={formatNumber(kpis.errors)} tooltip={TOPIC_METRICS.errors} />
          <MetricCard label="Messages" value={formatNumber(kpis.messages)} tooltip={TOPIC_METRICS.messages} />
        </div>
      </Card>

      {/* Row 1: Topic Triggers Over Time (line per ui-spec) + Topics with Most Errors (bar, top 5) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Topic Triggers Over Time" tooltip={TOPIC_CHARTS.triggersOverTime}>
            <FluentAreaChart chartTitle="Topic Triggers Over Time" series={triggersOverTime} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          {errorTopicsBar.length > 0 ? (
            <ChartCard title="Topics with Most Errors" tooltip={TOPIC_CHARTS.topicsWithMostErrors}>
              <FluentHorizontalBarChart items={errorTopicsBar} />
            </ChartCard>
          ) : (
            <ChartCard title="Topics with Most Errors" tooltip={TOPIC_CHARTS.topicsWithMostErrors}>
              <FluentHorizontalBarChart items={[]} />
            </ChartCard>
          )}
        </div>
      </div>

      {/* Row 2: Top Topics (donut) + Messages In vs Out (donut) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Top Topics by Triggers" tooltip={TOPIC_CHARTS.topTopicsByTriggers}>
            <FluentDonutChart chartTitle="Top Topics by Triggers" items={topTopicsDonut} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Messages In vs Out" tooltip={TOPIC_CHARTS.messagesInVsOut}>
            <FluentDonutChart chartTitle="Messages In vs Out" items={messagesDonut} />
          </ChartCard>
        </div>
      </div>

      <FluentDataGrid
        title="Topic Metrics"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={topicsExportColumns}
        exportFilename="topic-metrics"
        searchPlaceholder="Search topics..."
      />
    </div>
  );
}
