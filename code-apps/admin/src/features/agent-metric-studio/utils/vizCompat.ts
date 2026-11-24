import type { VisualizationType, MetricDataset } from '../types';

/**
 * Defines which visualization types are compatible with each data shape.
 * Time-series data (points with date/value) supports line-style charts.
 * Categorical data (label/value pairs) supports distribution charts.
 */

const TIME_SERIES_TYPES: VisualizationType[] = ['KPI', 'Line', 'Bar', 'Area'];
const CATEGORICAL_TYPES: VisualizationType[] = ['Donut', 'Bar', 'HorizontalBar', 'TopicsList'];

// Types that cannot be switched to (require special data shapes or separate fetches)
const EXCLUDED_TARGETS: Set<VisualizationType> = new Set(['Table', 'GroupedBar']);

export interface VizOption {
  type: VisualizationType;
  label: string;
  icon: string; // Fluent icon name hint (for display)
}

const VIZ_LABELS: Record<VisualizationType, string> = {
  KPI: 'KPI Card',
  Line: 'Line',
  Bar: 'Vertical Bar',
  Donut: 'Donut',
  HorizontalBar: 'Horizontal Bar',
  GroupedBar: 'Grouped Bar',
  Area: 'Area',
  TopicsList: 'Ranked List',
  Table: 'Data Table',
};

/**
 * Returns the list of visualization types a card can switch to,
 * given its current type and available data.
 */
export function getCompatibleVizTypes(
  currentViz: VisualizationType,
  data?: MetricDataset
): VisualizationType[] {
  if (EXCLUDED_TARGETS.has(currentViz)) return [];

  const hasTimeSeries = !!data && data.points.length > 0;
  const hasCategorical = !!data && (!!data.categorical || data.points.length > 0);

  const compatible = new Set<VisualizationType>();

  if (hasTimeSeries) {
    TIME_SERIES_TYPES.forEach(t => compatible.add(t));
  }

  if (hasCategorical) {
    CATEGORICAL_TYPES.forEach(t => compatible.add(t));
  }

  // Remove excluded types and the current type
  compatible.delete(currentViz);
  EXCLUDED_TARGETS.forEach(t => compatible.delete(t));

  return Array.from(compatible);
}

/**
 * Get display label for a visualization type.
 */
export function getVizLabel(viz: VisualizationType): string {
  return VIZ_LABELS[viz] ?? viz;
}
