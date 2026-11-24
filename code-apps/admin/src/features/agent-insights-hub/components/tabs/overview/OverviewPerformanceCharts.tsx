/**
 * OverviewPerformanceCharts - Response Time grouped bar chart.
 *
 * Full-width grouped bar showing avg + P90 response time by date.
 */

import React from "react";
import ChartCard from "../../ChartCard";
import { HOME_CHARTS } from "../../../utils/metricDescriptions";
import FluentGroupedBarChart from "../../charts/FluentGroupedBarChart";
import type { GroupedBarDataItem } from "../../charts/FluentGroupedBarChart";

export interface OverviewPerformanceChartsProps {
  responseTimeGrouped: GroupedBarDataItem[];
  responseTimeUnit: string;
}

/** Response Time grouped bar chart (avg + P90). */
const OverviewPerformanceCharts: React.FC<OverviewPerformanceChartsProps> = ({
  responseTimeGrouped,
  responseTimeUnit,
}) => {
  if (responseTimeGrouped.length === 0) return null;

  return (
    <ChartCard
      title={`Response time (${responseTimeUnit})`}
      tooltip={HOME_CHARTS.responseTime}
      minHeight="280px"
    >
      <FluentGroupedBarChart
        chartTitle="Response time"
        items={responseTimeGrouped}
      />
    </ChartCard>
  );
};

export default React.memo(OverviewPerformanceCharts);
