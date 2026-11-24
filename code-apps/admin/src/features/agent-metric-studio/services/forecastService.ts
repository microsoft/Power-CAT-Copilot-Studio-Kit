// Pluggable forecaster. Two client-side models today (Trend+Band, ETS).
// Dispatcher selects based on tenant preference; unsupported prefs fall back to Trend.

import type { ForecastPoint, ForecastResult, ScenarioInputs, TimeSeriesPoint } from '../types';

export interface IForecaster {
  name: string;
  forecast(history: TimeSeriesPoint[], horizon: number, inputs?: ScenarioInputs): ForecastResult;
}

// --- shared math ---

function computeMape(actual: number[], predicted: number[]): number | undefined {
  let sum = 0; let n = 0;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i];
    if (!a) continue;
    sum += Math.abs((a - predicted[i]) / a);
    n++;
  }
  return n ? (sum / n) * 100 : undefined;
}

function applyLift(inputs?: ScenarioInputs): number {
  return 1 +
    ((inputs?.adoptionLiftPct ?? 0) / 100) +
    ((inputs?.containmentLiftPct ?? 0) / 100) +
    ((inputs?.volumeDeltaPct ?? 0) / 100);
}

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, _, i) => a + xs[i] * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

export const trendForecaster: IForecaster = {
  name: 'Trend+Band',
  forecast(history, horizon, inputs) {
    if (!history.length) {
      return { history: [], forecast: [], modelName: this.name, scenarioInputs: toRecord(inputs) };
    }
    const xs = history.map((_, i) => i);
    const ys = history.map(p => p.value);
    const { slope, intercept } = linearRegression(xs, ys);
    const fitted = xs.map(i => slope * i + intercept);
    const residuals = ys.map((y, i) => y - fitted[i]);
    const sigma = Math.max(stddev(residuals), Math.abs(intercept) * 0.05);

    const lift = applyLift(inputs);

    const lastDate = new Date(history[history.length - 1].date);
    const forecast: ForecastPoint[] = [];
    for (let h = 1; h <= horizon; h++) {
      const d = new Date(lastDate);
      d.setDate(lastDate.getDate() + h);
      const mean = (slope * (xs.length + h - 1) + intercept) * lift;
      const growing = 1 + h / (horizon * 2);
      const band = sigma * growing;
      forecast.push({
        date: d.toISOString().slice(0, 10),
        p10: Math.max(0, mean - 1.28 * band),
        p50: Math.max(0, mean),
        p90: Math.max(0, mean + 1.28 * band),
      });
    }
    const mape = computeMape(ys, fitted);
    return { history, forecast, modelName: this.name, mape, scenarioInputs: toRecord(inputs) };
  },
};

/**
 * Exponential smoothing (Holt linear trend). Adapts to shifts more quickly than
 * OLS regression; better suited to metrics with recent regime changes.
 */
export const etsForecaster: IForecaster = {
  name: 'ETS (Holt)',
  forecast(history, horizon, inputs) {
    if (!history.length) {
      return { history: [], forecast: [], modelName: this.name, scenarioInputs: toRecord(inputs) };
    }
    const ys = history.map(p => p.value);
    const alpha = 0.5;   // level smoothing
    const beta = 0.2;    // trend smoothing
    let level = ys[0];
    let trend = ys.length > 1 ? ys[1] - ys[0] : 0;
    const fitted: number[] = [level];
    for (let i = 1; i < ys.length; i++) {
      const prevLevel = level;
      level = alpha * ys[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      fitted.push(level);
    }
    const residuals = ys.map((y, i) => y - fitted[i]);
    const sigma = Math.max(stddev(residuals), Math.abs(level) * 0.05);

    const lift = applyLift(inputs);
    const lastDate = new Date(history[history.length - 1].date);
    const forecast: ForecastPoint[] = [];
    for (let h = 1; h <= horizon; h++) {
      const d = new Date(lastDate);
      d.setDate(lastDate.getDate() + h);
      const mean = (level + trend * h) * lift;
      const growing = 1 + h / (horizon * 2);
      const band = sigma * growing;
      forecast.push({
        date: d.toISOString().slice(0, 10),
        p10: Math.max(0, mean - 1.28 * band),
        p50: Math.max(0, mean),
        p90: Math.max(0, mean + 1.28 * band),
      });
    }
    const mape = computeMape(ys, fitted);
    return { history, forecast, modelName: this.name, mape, scenarioInputs: toRecord(inputs) };
  },
};

function toRecord(i?: ScenarioInputs): Record<string, number> | undefined {
  if (!i) return undefined;
  return { adoptionLiftPct: i.adoptionLiftPct, containmentLiftPct: i.containmentLiftPct, volumeDeltaPct: i.volumeDeltaPct };
}

/** Pick the forecaster. LLM/External fall back to Trend for now. */
export function resolveForecaster(pref?: 'Trend' | 'ETS' | 'LLM' | 'External'): IForecaster {
  switch (pref) {
    case 'ETS': return etsForecaster;
    case 'Trend':
    case undefined:
    case null as unknown as undefined:
      return trendForecaster;
    default:
      // LLM / External aren't wired yet — silently fall back to Trend.
      return trendForecaster;
  }
}

export const forecastService = { ...trendForecaster };
