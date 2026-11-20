/**
 * OverviewSessionCharts - Duration Distribution + Error Distribution row.
 *
 * Two donut charts side-by-side wrapped in ChartCard containers.
 */

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import ChartCard from "../../ChartCard";
import { HOME_CHARTS } from "../../../utils/metricDescriptions";
import FluentDonutChart from "../../charts/FluentDonutChart";
import type { DonutDataItem } from "../../charts/FluentDonutChart";

export interface OverviewSessionChartsProps {
  durationDistribution: DonutDataItem[];
  errorDistribution: DonutDataItem[];
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

/** Row with Session Duration Distribution and Error Distribution donuts. */
const OverviewSessionCharts: React.FC<OverviewSessionChartsProps> = ({
  durationDistribution,
  errorDistribution,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.row}>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Session duration distribution"
          tooltip={HOME_CHARTS.sessionDurationDistribution}
        >
          <FluentDonutChart
            chartTitle="Session duration distribution"
            items={durationDistribution}
          />
        </ChartCard>
      </div>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Error distribution by type"
          tooltip={HOME_CHARTS.errorDistribution}
        >
          <FluentDonutChart
            chartTitle="Error distribution by type"
            items={errorDistribution}
          />
        </ChartCard>
      </div>
    </div>
  );
};

export default React.memo(OverviewSessionCharts);
