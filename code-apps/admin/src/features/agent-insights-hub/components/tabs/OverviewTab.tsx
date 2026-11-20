/**
 * OverviewTab - Layout shell for the Overview landing page.
 *
 * Thin orchestrator that wires useOverviewData, useOverviewMetrics,
 * and useOverviewCharts to 7 sub-section components. All complex
 * logic lives in hooks and sub-components.
 */

import React, { useMemo } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useOverviewData } from "../../hooks/useOverviewData";
import { useOverviewMetrics } from "../../hooks/useOverviewMetrics";
import { useOverviewCharts } from "../../hooks/useOverviewCharts";
import { useSyncLogs } from "../../hooks/useSyncLogs";
import { formatDateForDisplay } from "../../utils/dateFormatting";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";
import OverviewMetrics from "./overview/OverviewMetrics";
import OverviewActiveUsers from "./overview/OverviewActiveUsers";
import OverviewUsageCharts from "./overview/OverviewUsageCharts";
import OverviewSessionCharts from "./overview/OverviewSessionCharts";
import OverviewToolCharts from "./overview/OverviewErrorCharts";
import OverviewChannelCharts from "./overview/OverviewChannelCharts";
import OverviewPerformanceCharts from "./overview/OverviewPerformanceCharts";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
});

/** Overview tab layout shell. Renders KPI cards, charts, and active users. */
const OverviewTab: React.FC = () => {
  const styles = useStyles();
  const filterContext = useFilterContext();
  const { configurations } = filterContext;

  const { data: tableHasData } = useTableHasData("daily");
  const overviewData = useOverviewData(filterContext);
  const dailyMetrics = overviewData.dailyMetrics.data ?? [];
  const previousDailyMetrics = overviewData.previousDailyMetrics.data ?? [];
  const topicMetrics = overviewData.topicMetrics.data ?? [];
  const toolMetrics = overviewData.toolMetrics.data ?? [];
  const errorDetails = overviewData.errorDetails.data ?? [];

  const { metrics } = useOverviewMetrics(dailyMetrics, previousDailyMetrics, overviewData.isLoading);
  const chartData = useOverviewCharts(dailyMetrics, topicMetrics, toolMetrics, errorDetails);

  // Derive last successful sync date from Copilot Agent Kit Logs table
  const { data: syncLogs = [] } = useSyncLogs();
  const lastMetricDate = useMemo(() => {
    const lastSuccess = syncLogs
      .filter((log) => log.cat_executionstatuscode === 3 && log.createdon)
      .sort((a, b) => (b.createdon ?? "").localeCompare(a.createdon ?? ""))[0];
    return lastSuccess?.createdon
      ? formatDateForDisplay(new Date(lastSuccess.createdon))
      : undefined;
  }, [syncLogs]);

  // No configurations exist (only when query succeeded, not when it errored)
  if (configurations.length === 0 && !filterContext.loadingConfigurations) {
    return <EmptyStates variant={filterContext.configurationsError ? "no-data" : "no-configs"} />;
  }

  // Loading state
  if (overviewData.isLoading) {
    return <LoadingSpinner label="Loading overview data..." />;
  }

  // Configs exist but no data
  if (dailyMetrics.length === 0) {
    return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;
  }

  return (
    <div className={styles.container}>
      <OverviewMetrics metrics={metrics} lastMetricDate={lastMetricDate} />

      <OverviewUsageCharts
        topTopics={chartData.topTopics}
        slowestTopics={chartData.slowestTopics}
        slowestTopicsUnit={chartData.slowestTopicsUnit}
      />

      <OverviewChannelCharts
        channelDistribution={chartData.channelDistribution}
        sessionTurnDistribution={chartData.sessionTurnDistribution}
      />

      <OverviewSessionCharts
        durationDistribution={chartData.durationDistribution}
        errorDistribution={chartData.errorDistribution}
      />

      <OverviewToolCharts
        topTools={chartData.topTools}
        toolExecutionSlowest={chartData.toolExecutionSlowest}
        toolExecutionUnit={chartData.toolExecutionUnit}
      />

      <OverviewPerformanceCharts
        responseTimeGrouped={chartData.responseTimeGrouped}
        responseTimeUnit={chartData.responseTimeUnit}
      />

      <OverviewActiveUsers users={chartData.activeUsers} />
    </div>
  );
};

export default React.memo(OverviewTab);
