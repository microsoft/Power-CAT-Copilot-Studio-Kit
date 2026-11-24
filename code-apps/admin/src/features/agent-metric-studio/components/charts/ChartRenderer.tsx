import { KpiChart } from './KpiChart';
import { TableGridView } from './TableGridView';
import { FluentDonutChart } from './fluent/FluentDonutChart';
import { FluentVerticalBarChart } from './fluent/FluentVerticalBarChart';
import { FluentHorizontalBarChart } from './fluent/FluentHorizontalBarChart';
import { FluentGroupedBarChart } from './fluent/FluentGroupedBarChart';
import { FluentLineChart } from './fluent/FluentLineChart';
import { FluentAreaChart } from './fluent/FluentAreaChart';
import { FluentTopicsList } from './fluent/FluentTopicsList';
import type { FilterState, MetricDataset, MetricDefinition, VisualizationType } from '../../types';
import { useAppStore } from '../../store/appStore';

export function ChartRenderer({
  metric, data, overrideViz, filters,
}: { metric: MetricDefinition; data: MetricDataset; overrideViz?: VisualizationType; filters?: FilterState }) {
  const viz = overrideViz ?? metric.visualizationType;
  const openDrillIn = useAppStore(st => st.openDrillIn);
  const tenantPrimary = undefined;

  // Debug tracing — enable via: window.__AMS_DEBUG = true
  if ((window as unknown as Record<string, unknown>).__AMS_DEBUG) {
    console.group(`[AMS ChartRenderer] ${metric.name} (${viz})`);
    console.log('points:', data.points.length, data.points.length > 0 ? `first=${JSON.stringify(data.points[0])}, last=${JSON.stringify(data.points.at(-1))}` : '(none)');
    console.log('categorical:', data.categorical?.length ?? 0, data.categorical?.slice(0, 3));
    console.groupEnd();
  }

  const cats = data.categorical ?? data.points.slice(-10).map(p => ({ label: p.date.slice(5), value: p.value }));

  const lineSeries = [{
    legend: metric.name,
    data: data.points.map(p => ({ x: new Date(p.date), y: p.value })),
  }];

  const handleChartClick = () => {
    openDrillIn({ metricId: metric.id });
  };

  let chart: React.ReactNode;

  switch (viz) {
    case 'KPI':
      return <KpiChart metric={metric} data={data} />;
    case 'Line':
      chart = <FluentLineChart series={lineSeries} chartTitle={metric.name} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} line chart`} />;
      break;
    case 'Bar':
      chart = <FluentVerticalBarChart data={cats} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} bar chart`} />;
      break;
    case 'Donut':
      chart = <FluentDonutChart data={cats} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} donut chart`} />;
      break;
    case 'HorizontalBar':
      chart = <FluentHorizontalBarChart data={cats.slice(0, 5)} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} horizontal bar chart`} />;
      break;
    case 'GroupedBar':
      chart = <FluentGroupedBarChart data={[]} series={[]} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} grouped bar chart`} />;
      break;
    case 'Area':
      chart = <FluentAreaChart series={lineSeries.map(s => ({ ...s, color: '#637CEF' }))} chartTitle={metric.name} ariaLabel={`${metric.name} area chart`} />;
      break;
    case 'TopicsList':
      chart = <FluentTopicsList data={cats} tenantPrimary={tenantPrimary} ariaLabel={`${metric.name} topics list`} />;
      break;
    case 'Table':
      return filters ? <TableGridView metric={metric} filters={filters} /> : <TableGridView metric={metric} filters={{ agentIds: [], timeRange: { preset: '7d' } }} />;
    default:
      return <KpiChart metric={metric} data={data} />;
  }

  return (
    <div
      onClick={handleChartClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleChartClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${metric.name}`}
      style={{ cursor: 'pointer', width: '100%', height: '100%' }}
      className="ams-card-no-drag"
    >
      {chart}
    </div>
  );
}
