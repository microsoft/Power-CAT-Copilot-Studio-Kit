/**
 * ErrorsTab - Error analysis with KPIs, charts, and data table.
 *
 * 4 MetricCards: Total Errors, Unique Error Codes, Affected Conversations, Impacted Users.
 * Charts: Error Trend (area), Top Error Codes (horizontal bar, top 5),
 * Errors by Channel (donut), Impacted Users trend (area).
 * Table: Source column with Badge, Error Code with colored Badge.
 */

import { useMemo } from "react";
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Badge, Tooltip } from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useErrorDetails } from "../../hooks/useErrorDetails";
import { formatNumber } from "../../utils/metricCalculations";
import { errorsExportColumns } from "../../utils/exportColumns";
import { CHART_COLORS, CHANNEL_DISPLAY_NAMES } from "../../contracts/types";
import { ERROR_METRICS, ERROR_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import type { GridColumn, ErrorDetails } from "../../contracts/types";
import MetricCard from "../MetricCard";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDonutChart from "../charts/FluentDonutChart";
import FluentHorizontalBarChart from "../charts/FluentHorizontalBarChart";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";

// Distinct light badge colors for error codes
const ERROR_CODE_COLORS: Array<"danger" | "severe" | "warning" | "informative" | "important"> = [
  "danger", "severe", "warning", "important", "informative",
];

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  metricsRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap", alignItems: "stretch" },
  chartRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap", alignItems: "stretch" },
  chartHalf: { flex: "1 1 45%", minWidth: "300px", display: "flex" },
});

function aggregateKpis(data: ErrorDetails[]) {
  let totalErrors = 0, affectedConv = 0, impactedUsers = 0;
  const errorCodes = new Set<string>();
  for (const d of data) {
    totalErrors += d.cat_errorcount ?? 0;
    affectedConv += d.cat_dailyaffectedconversations ?? 0;
    impactedUsers += d.cat_dailyaffectedusers ?? 0;
    errorCodes.add(d.cat_errorcode);
  }
  return { totalErrors, uniqueErrorCodes: errorCodes.size, affectedConv, impactedUsers };
}

export default function ErrorsTab() {
  const filterCtx = useFilterContext();
  const { data, isLoading } = useErrorDetails(filterCtx);
  const { data: tableHasData } = useTableHasData("errors");
  const styles = useStyles();

  const kpis = useMemo(() => aggregateKpis(data ?? []), [data]);

  // Error Trend — AreaChart (like Credit consumption over time)
  const errorTrend = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_errorcount ?? 0));
    }
    return [{ legend: "Errors", color: "#E74856",
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Top Error Codes — HorizontalBarChart top 5 (like Slowest Topics)
  const topErrorCodes = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) map.set(d.cat_errorcode, (map.get(d.cat_errorcode) ?? 0) + (d.cat_errorcount ?? 0));
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [data]);

  // Errors by Channel — DonutChart (unchanged)
  const errorsByChannel = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const ch = d.cat_channelid ?? "unknown";
      map.set(ch, (map.get(ch) ?? 0) + (d.cat_errorcount ?? 0));
    }
    return Array.from(map.entries()).map(([ch, val]) => ({
      legend: CHANNEL_DISPLAY_NAMES[ch] ?? ch, data: val,
    }));
  }, [data]);

  // Impacted Users Trend — AreaChart (single series area)
  const impactedUsersTrend = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, number>();
    for (const d of data) {
      const key = d.cat_metricdate.substring(0, 10);
      map.set(key, (map.get(key) ?? 0) + (d.cat_dailyaffectedusers ?? 0));
    }
    return [{ legend: "Impacted Users", color: CHART_COLORS.slot4,
      data: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, y]) => ({ x: new Date(date), y })) }];
  }, [data]);

  // Error code → badge color map for consistent coloring in table
  const errorCodeColorMap = useMemo(() => {
    if (!data?.length) return new Map<string, typeof ERROR_CODE_COLORS[number]>();
    const codes = new Set<string>();
    for (const d of data) codes.add(d.cat_errorcode);
    const map = new Map<string, typeof ERROR_CODE_COLORS[number]>();
    let i = 0;
    for (const code of codes) {
      map.set(code, ERROR_CODE_COLORS[i % ERROR_CODE_COLORS.length]);
      i++;
    }
    return map;
  }, [data]);

  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_metricdate", label: "Date", width: "100px", sortable: true,
      render: (r) => new Date(String(r.cat_metricdate)).toLocaleDateString() },
    { key: "cat_agentname", label: "Agent", width: "140px", sortable: true },
    { key: "cat_errorcode", label: "Error Code", width: "155px", sortable: true,
      render: (r) => {
        const code = String(r.cat_errorcode ?? "");
        const color = errorCodeColorMap.get(code) ?? "informative";
        return <Badge appearance="tint" color={color} size="small">{code}</Badge>;
      } },
    { key: "cat_errorcount", label: "Count", width: "80px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_errorcount ?? 0)) },
    { key: "cat_dailyaffectedconversations", label: "Affected Conversations", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyaffectedconversations ?? 0)) },
    { key: "cat_dailyaffectedusers", label: "Impacted Users", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyaffectedusers ?? 0)) },
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
    { key: "cat_sampleerrormessages", label: "Sample Error Message", width: "260px", sortable: false },
  ], [errorCodeColorMap]);

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading error details..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  return (
    <div className={styles.root}>
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Error Metrics</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.errors} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.metricsRow}>
          <MetricCard label="Total Errors" value={formatNumber(kpis.totalErrors)} invertTrend tooltip={ERROR_METRICS.totalErrors} />
          <MetricCard label="Unique Error Codes" value={formatNumber(kpis.uniqueErrorCodes)} tooltip={ERROR_METRICS.uniqueErrorCodes} />
          <MetricCard label="Affected Conversations" value={formatNumber(kpis.affectedConv)} tooltip={ERROR_METRICS.affectedConversations} />
          <MetricCard label="Impacted Users" value={formatNumber(kpis.impactedUsers)} tooltip={ERROR_METRICS.impactedUsers} />
        </div>
      </Card>

      {/* Row 1: Error Trend (area) + Top Error Codes (horizontal bar, top 5) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Error Trend" tooltip={ERROR_CHARTS.errorTrend}>
            <FluentAreaChart chartTitle="Error Trend" series={errorTrend} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Top Error Codes" tooltip={ERROR_CHARTS.topErrorCodes}>
            <FluentHorizontalBarChart items={topErrorCodes} />
          </ChartCard>
        </div>
      </div>

      {/* Row 2: Errors by Channel (donut) + Impacted Users Trend (area) */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Errors by Channel" tooltip={ERROR_CHARTS.errorsByChannel}>
            <FluentDonutChart chartTitle="Errors by Channel" items={errorsByChannel} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Impacted Users Trend" tooltip={ERROR_CHARTS.impactedUsers}>
            <FluentAreaChart chartTitle="Impacted Users Trend" series={impactedUsersTrend} />
          </ChartCard>
        </div>
      </div>

      <FluentDataGrid
        title="Error Details"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={errorsExportColumns}
        exportFilename="error-details"
        searchPlaceholder="Search errors..."
      />
    </div>
  );
}
