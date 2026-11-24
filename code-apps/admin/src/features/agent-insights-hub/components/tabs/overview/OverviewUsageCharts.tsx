/**
 * OverviewUsageCharts - Top Topics + Slowest Topics row.
 *
 * Two charts side-by-side: Top Topics (donut) and Slowest Topics (horizontal bar).
 * Each wrapped in ChartCard with flex: 1 1 0 sizing.
 */

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import ChartCard from "../../ChartCard";
import { HOME_CHARTS } from "../../../utils/metricDescriptions";
import FluentDonutChart from "../../charts/FluentDonutChart";
import FluentHorizontalBarChart from "../../charts/FluentHorizontalBarChart";
import type { DonutDataItem } from "../../charts/FluentDonutChart";
import type { HorizontalBarDataItem } from "../../charts/FluentHorizontalBarChart";

export interface OverviewUsageChartsProps {
  topTopics: DonutDataItem[];
  slowestTopics: HorizontalBarDataItem[];
  slowestTopicsUnit: string;
}

const useStyles = makeStyles({
  row: {
    display: "flex",
    gap: tokens.spacingHorizontalL,
    alignItems: "stretch",
  },
  chartSlot: {
    flex: "1 1 0",
    minWidth: "0",
  },
});

/** Row with Top Topics donut and Slowest Topics horizontal bar. */
const OverviewUsageCharts: React.FC<OverviewUsageChartsProps> = ({
  topTopics,
  slowestTopics,
  slowestTopicsUnit,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.row}>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Top topics"
          tooltip={HOME_CHARTS.topTopics}
        >
          <FluentDonutChart chartTitle="Top topics" items={topTopics} />
        </ChartCard>
      </div>
      <div className={styles.chartSlot}>
        <ChartCard
          title={`Slowest topics (${slowestTopicsUnit})`}
          tooltip={HOME_CHARTS.topicExecutionSlowest}
        >
          <FluentHorizontalBarChart items={slowestTopics} />
        </ChartCard>
      </div>
    </div>
  );
};

export default React.memo(OverviewUsageCharts);
