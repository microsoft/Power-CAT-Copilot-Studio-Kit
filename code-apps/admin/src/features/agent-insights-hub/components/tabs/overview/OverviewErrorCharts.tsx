/**
 * OverviewToolCharts - Top Tools + Slowest Tools row.
 *
 * Two charts side-by-side: Top Tools (donut) and Slowest Tools (horizontal bar).
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

export interface OverviewToolChartsProps {
  topTools: DonutDataItem[];
  toolExecutionSlowest: HorizontalBarDataItem[];
  toolExecutionUnit: string;
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

/** Row with Top Tools donut and Slowest Tools horizontal bar. */
const OverviewToolCharts: React.FC<OverviewToolChartsProps> = ({
  topTools,
  toolExecutionSlowest,
  toolExecutionUnit,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.row}>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Top tools"
          tooltip={HOME_CHARTS.topTools}
        >
          <FluentDonutChart chartTitle="Top tools" items={topTools} />
        </ChartCard>
      </div>
      <div className={styles.chartSlot}>
        <ChartCard
          title={`Slowest tools (${toolExecutionUnit})`}
          tooltip={HOME_CHARTS.toolExecutionSlowest}
        >
          <FluentHorizontalBarChart items={toolExecutionSlowest} />
        </ChartCard>
      </div>
    </div>
  );
};

export default React.memo(OverviewToolCharts);
