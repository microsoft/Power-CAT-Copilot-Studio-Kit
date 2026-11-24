// Central type definitions for Agent Metric Studio.

/** Current user context from Power Apps runtime. */
export interface UserInfo {
  /** Dataverse systemuserid (resolved from AAD objectId). */
  systemUserId: string;
  /** Azure AD object ID from getContext(). */
  objectId: string;
  fullName: string;
  userPrincipalName: string;
  tenantId: string;
}

export type MetricCategory =
  | 'Conversations' | 'Quality' | 'Adoption' | 'Performance' | 'Cost' | 'Errors';

export type AggregationType =
  | 'Sum' | 'Average' | 'Count' | 'Min' | 'Max' | 'Latest';

export type VisualizationType =
  | 'KPI' | 'Line' | 'Bar' | 'Donut' | 'Table'
  | 'HorizontalBar' | 'GroupedBar' | 'Area' | 'TopicsList';

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  category: MetricCategory;
  sourceTable: string;
  sourceField: string;
  aggregation: AggregationType;
  visualizationType: VisualizationType;
  unit?: string;
  isActive: boolean;
  isRecommendedMetric?: boolean;
  createdOn?: string;
  createdBy?: string;
}

export interface CardInstance {
  instanceId: string;       // local id on the canvas
  metricId: string;         // points to MetricDefinition.id
  x: number;
  y: number;
  w: number;
  h: number;
  overrideViz?: VisualizationType;
}

export interface DashboardLayout {
  id?: string;
  name: string;
  description?: string;
  cards: CardInstance[];
  filters?: FilterState;
  isDefault?: boolean;
  isShared?: boolean;
  scope: 'Personal' | 'Team' | 'Tenant';
}

export interface AgentOption {
  id: string;   // cat_copilotconfigurationid
  name: string; // display name (cat_agentname ?? cat_name)
}

export type DataMode = 'production' | 'test' | 'both';

export interface FilterState {
  agentIds: string[];         // cat_copilotconfigurationid values (single-select: max length 1)
  timeRange: TimeRange;
  channels?: string[];
  locales?: string[];
  dataMode?: DataMode;
}

export type TimeRangePreset = '7d' | '30d' | '90d' | 'ytd' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  from?: string;  // ISO date
  to?: string;    // ISO date
}

export type AppView = 'dashboard' | 'forecast' | 'metric-registry';

export interface DrillInRequest {
  metricId: string;
  bucket?: string;    // e.g. '2026-04-22' for day-level drill
  label?: string;     // human label ('Apr 22')
}

export interface TimeSeriesPoint {
  date: string;          // ISO
  value: number;
  label?: string;
}

export interface CategoricalPoint {
  label: string;
  value: number;
}

export interface MetricDataset {
  metricId: string;
  points: TimeSeriesPoint[];
  categorical?: CategoricalPoint[];
  total?: number;
  delta?: number;        // vs prior period
  unit?: string;
  lastUpdated: string;
}

export interface ForecastPoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface ForecastResult {
  history: TimeSeriesPoint[];
  forecast: ForecastPoint[];
  modelName: string;
  mape?: number;
  scenarioInputs?: Record<string, number>;
}

export interface ScenarioInputs {
  adoptionLiftPct: number;
  containmentLiftPct: number;
  volumeDeltaPct: number;
}

export type ExportFormat = 'PDF' | 'PPTX' | 'Excel';
export type ExportScope = 'Card' | 'Dashboard' | 'Forecast';
