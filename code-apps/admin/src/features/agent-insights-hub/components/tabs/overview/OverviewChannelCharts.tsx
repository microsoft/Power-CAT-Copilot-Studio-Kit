/**
 * OverviewChannelCharts - Channel Distribution + Single vs Multi-turn row.
 *
 * Two donut charts side-by-side wrapped in ChartCard containers.
 */

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import ChartCard from "../../ChartCard";
import { HOME_CHARTS } from "../../../utils/metricDescriptions";
import FluentDonutChart from "../../charts/FluentDonutChart";
import type { DonutDataItem } from "../../charts/FluentDonutChart";

export interface OverviewChannelChartsProps {
  channelDistribution: DonutDataItem[];
  sessionTurnDistribution: DonutDataItem[];
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

/** Row with Channel Distribution and Single vs Multi-turn session donuts. */
const OverviewChannelCharts: React.FC<OverviewChannelChartsProps> = ({
  channelDistribution,
  sessionTurnDistribution,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.row}>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Conversations by channel"
          tooltip={HOME_CHARTS.conversationsByChannel}
        >
          <FluentDonutChart
            chartTitle="Conversations by channel"
            items={channelDistribution}
          />
        </ChartCard>
      </div>
      <div className={styles.chartSlot}>
        <ChartCard
          title="Single vs Multi-turn sessions"
          tooltip={HOME_CHARTS.singleVsMultiTurn}
        >
          <FluentDonutChart
            chartTitle="Single vs Multi-turn sessions"
            items={sessionTurnDistribution}
          />
        </ChartCard>
      </div>
    </div>
  );
};

export default React.memo(OverviewChannelCharts);
