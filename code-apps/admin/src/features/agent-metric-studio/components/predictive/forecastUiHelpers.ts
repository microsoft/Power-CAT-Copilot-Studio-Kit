// Shared forecast UI constants and helpers used by both ForecastWorkspace and PredictivePanel.

export const LEVER_TOOLTIPS = {
  adoption: 'Simulates how user adoption changes affect this metric. Positive values model growth in active users; negative values model decline.',
  containment: 'Models the effect of changing how many conversations are resolved without human handoff. Higher containment typically reduces escalation volume.',
  volume: 'Simulates overall traffic volume changes — seasonal spikes, marketing campaigns, or organic growth/decline.',
};

export const FORECAST_SERIES_TOOLTIP = 'History: Actual recorded values from telemetry. ' +
  'Forecast (P50): Median projected value — the most likely outcome. ' +
  'P90/P10: Upper and lower bounds of an 80% confidence interval.';

export const DISCLAIMER_TEXT = 'Forecasts are statistical projections from historical telemetry. ' +
  'They are not commitments and should not be used as the sole input for capacity, staffing, or financial decisions. ' +
  'Confidence intervals assume the recent past is representative of the near future — material changes to product, ' +
  'traffic sources, or user base can invalidate any forecast.';

export const STAT_TOOLTIPS = {
  projected: 'The model\'s median forecast at the end of the configured horizon period.',
  range: 'The forecast band at end of horizon. If model assumptions hold, the actual value is expected to fall within this range about 80% of the time.',
};

export const MAPE_TOOLTIP = 'MAPE (Mean Absolute Percentage Error) measures forecast accuracy as a percentage of actual values. ' +
  'Under 10% = highly accurate, 10–20% = good, 20–50% = reasonable, over 50% = low confidence. ' +
  'High MAPE may indicate the metric is too volatile or has insufficient history for reliable projection.';

export function getMapeConfidence(mape: number | undefined): { label: string; color: 'success' | 'warning' | 'danger' | 'important' } {
  if (mape == null || !Number.isFinite(mape)) return { label: 'Unknown', color: 'important' };
  if (mape < 20) return { label: 'Good fit', color: 'success' };
  if (mape < 50) return { label: 'Fair fit', color: 'warning' };
  return { label: 'Low confidence', color: 'danger' };
}
