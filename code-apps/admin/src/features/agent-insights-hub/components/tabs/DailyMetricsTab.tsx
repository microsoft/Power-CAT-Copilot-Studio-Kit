/**
 * DailyMetricsTab - Daily conversation metrics with line charts and data table.
 *
 * Charts per ui-spec-daily-metrics.json: all LineChart variant.
 * Conversation Volume (full width), Active Users + Daily Messages (side-by-side).
 * Fills missing days with zeros. Table: all 24 ExistingSrcCode columns with Badge for Data Source.
 */

import { useMemo } from "react";
import { makeStyles, tokens, Badge } from "@fluentui/react-components";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useDailyMetrics } from "../../hooks/useDailyMetrics";
import { fillMissingDays } from "../../utils/dateFormatting";
import { getDateFilter } from "../../context/FilterState";
import { formatNumber } from "../../utils/metricCalculations";
import { dailyMetricsExportColumns } from "../../utils/exportColumns";
import { CHART_COLORS, CHANNEL_DISPLAY_NAMES } from "../../contracts/types";
import { DAILY_METRICS_CHARTS } from "../../utils/metricDescriptions";
import type { GridColumn } from "../../contracts/types";
import type { DailyMetrics } from "../../contracts/types";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  chartRow: {
    display: "flex",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  chartHalf: {
    flex: "1 1 45%",
    minWidth: "300px",
    display: "flex",
  },
});

/** Aggregates daily metrics by date, summing values per day. */
function aggregateByDate(data: DailyMetrics[]) {
  const map = new Map<string, { conversations: number; users: number; messages: number; responses: number }>();
  for (const d of data) {
    const dateKey = d.cat_metricdate.substring(0, 10);
    const existing = map.get(dateKey) ?? { conversations: 0, users: 0, messages: 0, responses: 0 };
    existing.conversations += d.cat_dailyconversationcount ?? 0;
    existing.users += d.cat_dailyuniqueusers ?? 0;
    existing.messages += d.cat_totalusermessages ?? 0;
    existing.responses += d.cat_totalresponses ?? 0;
    map.set(dateKey, existing);
  }
  return map;
}

export default function DailyMetricsTab() {
  const filterCtx = useFilterContext();
  const { data, isLoading } = useDailyMetrics(filterCtx);
  const { data: tableHasData } = useTableHasData("daily");

  const { startDate, endDate } = useMemo(() => getDateFilter(filterCtx), [filterCtx]);

  const filledData = useMemo(() => {
    if (!data?.length) return [];
    return fillMissingDays(
      data,
      startDate,
      endDate,
      "cat_metricdate",
      (date) => ({
        cat_dailymetricsid: `zero-${date}`,
        cat_agentname: "",
        cat_metricdate: date,
        cat_channelid: "",
        cat_datasourcecode: 1,
      })
    );
  }, [data, startDate, endDate]);

  const aggregated = useMemo(() => aggregateByDate(filledData), [filledData]);

  // Daily Conversation Volume — LineChart (per ui-spec: variant "line")
  const conversationVolumeSeries = useMemo(
    () => [
      {
        legend: "Conversations",
        color: CHART_COLORS.slot1,
        data: Array.from(aggregated.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ x: new Date(date), y: v.conversations })),
      },
    ],
    [aggregated]
  );

  // Daily Active Users — LineChart (per ui-spec: variant "line")
  const activeUsersSeries = useMemo(
    () => [
      {
        legend: "Active Users",
        color: CHART_COLORS.slot2,
        data: Array.from(aggregated.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ x: new Date(date), y: v.users })),
      },
    ],
    [aggregated]
  );

  // Daily Messages — LineChart (per ui-spec: variant "line")
  const messagesSeries = useMemo(
    () => [
      {
        legend: "User Messages",
        color: CHART_COLORS.slot3,
        data: Array.from(aggregated.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ x: new Date(date), y: v.messages })),
      },
      {
        legend: "Responses",
        color: CHART_COLORS.slot4,
        data: Array.from(aggregated.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ x: new Date(date), y: v.responses })),
      },
    ],
    [aggregated]
  );

  // Table columns — all 24 ExistingSrcCode columns in same sequence
  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_metricdate", label: "Date", width: "100px", sortable: true,
      render: (r) => new Date(String(r.cat_metricdate)).toLocaleDateString() },
    { key: "cat_agentname", label: "Agent", width: "160px", sortable: true },
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
    { key: "cat_dailyconversationcount", label: "Daily Conversation Count", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyconversationcount ?? 0)) },
    { key: "cat_dailyuniqueusers", label: "Daily Unique Users", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyuniqueusers ?? 0)) },
    { key: "cat_totalusermessages", label: "Total User Messages", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_totalusermessages ?? 0)) },
    { key: "cat_dailyuniquetopics", label: "Daily Unique Topics", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyuniquetopics ?? 0)) },
    { key: "cat_dailyuniquetools", label: "Daily Unique Tools", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_dailyuniquetools ?? 0)) },
    { key: "cat_errorcount", label: "Error Count", width: "100px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_errorcount ?? 0)) },
    { key: "cat_multiturnconversations", label: "Multi Turn Conversations", width: "160px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_multiturnconversations ?? 0)) },
    { key: "cat_shortconversations", label: "Short Conversations", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_shortconversations ?? 0)) },
    { key: "cat_mediumconversations", label: "Medium Conversations", width: "150px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_mediumconversations ?? 0)) },
    { key: "cat_longconversations", label: "Long Conversations", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_longconversations ?? 0)) },
    { key: "cat_mediandurationms", label: "Median Duration (ms)", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_mediandurationms ?? 0)) },
    { key: "cat_p95durationms", label: "P95 Duration (ms)", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p95durationms ?? 0)) },
    { key: "cat_p50responsetimems", label: "P50 Response Time (ms)", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p50responsetimems ?? 0)) },
    { key: "cat_p95responsetimems", label: "P95 Response Time (ms)", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p95responsetimems ?? 0)) },
    { key: "cat_p99responsetimems", label: "P99 Response Time (ms)", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_p99responsetimems ?? 0)) },
    { key: "cat_slowresponses16s", label: "Slow Responses (16s)", width: "130px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_slowresponses16s ?? 0)) },
    { key: "cat_toolcallcount", label: "Tool Call Count", width: "120px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_toolcallcount ?? 0)) },
    { key: "cat_toolsuccesscount", label: "Tool Success Count", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_toolsuccesscount ?? 0)) },
    { key: "cat_toolfailurecount", label: "Tool Failure Count", width: "140px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_toolfailurecount ?? 0)) },
  ], []);

  const styles = useStyles();

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading daily metrics..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  return (
    <div className={styles.root}>
      {/* Daily Conversation Volume — full width LineChart per ui-spec */}
      <ChartCard title="Daily Conversation Volume" tooltip={DAILY_METRICS_CHARTS.conversationVolume}>
        <FluentAreaChart chartTitle="Daily Conversation Volume" series={conversationVolumeSeries} />
      </ChartCard>

      {/* Daily Active Users + Daily Messages — side-by-side LineCharts per ui-spec */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Daily Active Users" tooltip={DAILY_METRICS_CHARTS.dailyActiveUsers}>
            <FluentAreaChart chartTitle="Daily Active Users" series={activeUsersSeries} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Daily Messages" tooltip={DAILY_METRICS_CHARTS.dailyMessages}>
            <FluentAreaChart chartTitle="Daily Messages" series={messagesSeries} mode="tozeroy" />
          </ChartCard>
        </div>
      </div>

      <FluentDataGrid
        title="Daily Metrics"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={dailyMetricsExportColumns}
        exportFilename="daily-metrics"
        searchPlaceholder="Search by date, agent..."
      />
    </div>
  );
}
