/**
 * OData Filter Builder - Composes $filter strings using Dataverse column names.
 *
 * CRITICAL: All column references use actual Dataverse names (cat_metricdate,
 * _cat_agentconfiguration_value, etc.), NOT domain model property names.
 * Lookup fields use the _fieldname_value format with unquoted GUIDs.
 */

import { CHANNEL_OPTIONS, type FilterState } from "../contracts/types";
import { getDateFilter } from "../context/FilterState";
import { formatDateForOData } from "./dateFormatting";

// Column Name Maps — shared shape for standard metric tables
interface MetricColumns { id: string; date: string; agentName: string; channel: string; dataSource: string; config: string; }
const stdCols = (id: string, date = "cat_metricdate"): MetricColumns => ({
  id, date, agentName: "cat_agentname", channel: "cat_channelid",
  dataSource: "cat_datasourcecode", config: "_cat_agentconfiguration_value",
});

export const DAILY_METRICS_COLUMNS = stdCols("cat_dailymetricsid");
export const TOPIC_METRICS_COLUMNS = stdCols("cat_topicmetricsid");
export const ACTION_METRICS_COLUMNS = stdCols("cat_actionmetricsid");
export const TOOL_METRICS_COLUMNS = stdCols("cat_toolmetricsid");
export const ERROR_DETAILS_COLUMNS = stdCols("cat_errordetailsid");

export const TRANSCRIPT_METRICS_COLUMNS = {
  id: "cat_transcriptmetricsid", date: "cat_conversationdate",
  agentId: "cat_agentid", channel: "cat_channelid",
  dataSource: "cat_datasourcecode", config: "_cat_agentconfiguration_value",
} as const;

export const USAGE_HISTORY_COLUMNS = {
  id: "cat_agentusagehistoryid", date: "cat_usagedate",
  agentId: "cat_agentid", environmentId: "cat_environmentid",
  featureName: "cat_featurename", config: "_cat_agent_value",
} as const;

export const SYNC_LOGS_COLUMNS = {
  id: "cat_copilotstudiokitlogsid", createdOn: "createdon",
  status: "cat_executionstatuscode", config: "_cat_copilotconfigurationid_value",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape single quotes in OData string values by doubling them. */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const UNKNOWN_CHANNEL_VALUE = "unknown";
const KNOWN_CHANNEL_VALUES = CHANNEL_OPTIONS
  .map((option) => option.value)
  .filter((value) => value !== "all" && value !== UNKNOWN_CHANNEL_VALUE);

/** Map data mode to Dataverse cat_datasourcecode option-set value. */
function getDataSourceFilter(
  dataMode: "production" | "test" | "both",
  columnName: string
): string | null {
  switch (dataMode) {
    case "production":
      return `${columnName} eq 1`;
    case "test":
      return `${columnName} eq 2`;
    case "both":
      return null;
  }
}

/**
 * Build a date range filter clause. Uses ge/le for inclusive range.
 * OData dates are formatted as YYYY-MM-DD (no time component needed
 * for Dataverse date-only fields).
 */
function buildDateClause(
  columnName: string,
  startDate: Date,
  endDate: Date
): string {
  const start = formatDateForOData(startDate);
  const end = formatDateForOData(endDate);
  return `${columnName} ge ${start} and ${columnName} le ${end}`;
}

/**
 * Build config lookup filter. Lookup fields use _fieldname_value with
 * unquoted GUID for eq comparison.
 */
function buildConfigFilter(
  configId: string,
  configColumn: string
): string | null {
  if (!configId || configId === "all") return null;
  return `${configColumn} eq ${configId}`;
}

/** Build channel filter clause. */
export function buildChannelFilter(
  channel: string,
  channelColumn: string
): string | null {
  if (!channel || channel === "all") return null;
  if (channel === UNKNOWN_CHANNEL_VALUE) {
    const knownChannelExclusions = KNOWN_CHANNEL_VALUES
      .map((value) => `${channelColumn} ne '${escapeODataString(value)}'`)
      .join(" and ");

    return `(${channelColumn} eq null or ${channelColumn} eq '' or (${knownChannelExclusions}))`;
  }

  return `${channelColumn} eq '${escapeODataString(channel)}'`;
}

/** Join non-null filter parts with ' and '. */
function joinFilters(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" and ");
}

// ---------------------------------------------------------------------------
// Per-Table Builder Functions
// ---------------------------------------------------------------------------

/** Build standard metric filter (config + date + channel + dataSource). */
function buildStandardFilter(state: FilterState, cols: MetricColumns): string {
  const { startDate, endDate } = getDateFilter(state);
  return joinFilters([
    buildConfigFilter(state.selectedConfigId, cols.config),
    buildDateClause(cols.date, startDate, endDate),
    buildChannelFilter(state.selectedChannel, cols.channel),
    getDataSourceFilter(state.dataMode, cols.dataSource),
  ]);
}

/** Build OData $filter for cat_dailymetrics table. */
export function buildDailyMetricsFilter(state: FilterState): string {
  return buildStandardFilter(state, DAILY_METRICS_COLUMNS);
}

/** Build OData $filter for cat_dailymetrics with explicit date range overrides. */
export function buildDailyMetricsFilterWithDates(state: FilterState, startDate: Date, endDate: Date): string {
  return joinFilters([
    buildConfigFilter(state.selectedConfigId, DAILY_METRICS_COLUMNS.config),
    buildDateClause(DAILY_METRICS_COLUMNS.date, startDate, endDate),
    buildChannelFilter(state.selectedChannel, DAILY_METRICS_COLUMNS.channel),
    getDataSourceFilter(state.dataMode, DAILY_METRICS_COLUMNS.dataSource),
  ]);
}

/** Build OData $filter for cat_topicmetrics table. */
export function buildTopicMetricsFilter(state: FilterState): string {
  return buildStandardFilter(state, TOPIC_METRICS_COLUMNS);
}

/** Build OData $filter for cat_actionmetrics table. */
export function buildActionMetricsFilter(state: FilterState): string {
  return buildStandardFilter(state, ACTION_METRICS_COLUMNS);
}

/** Build OData $filter for cat_toolmetrics table. */
export function buildToolMetricsFilter(state: FilterState): string {
  return buildStandardFilter(state, TOOL_METRICS_COLUMNS);
}

/** Build OData $filter for cat_errordetails table. */
export function buildErrorDetailsFilter(state: FilterState): string {
  return buildStandardFilter(state, ERROR_DETAILS_COLUMNS);
}

/**
 * Build OData $filter for cat_transcriptmetrics table.
 * Uses cat_conversationdate (NOT cat_metricdate) and cat_agentid (NOT cat_agentname).
 */
export function buildTranscriptMetricsFilter(state: FilterState): string {
  const cols = TRANSCRIPT_METRICS_COLUMNS;
  const { startDate, endDate } = getDateFilter(state);
  return joinFilters([
    buildConfigFilter(state.selectedConfigId, cols.config),
    buildDateClause(cols.date, startDate, endDate),
    buildChannelFilter(state.selectedChannel, cols.channel),
    state.dataMode !== "both"
      ? getDataSourceFilter(state.dataMode, cols.dataSource)
      : null,
  ]);
}

/**
 * Build OData $filter for cat_agentusagehistory table.
 * Uses cat_usagedate and cat_agentid. No channel or dataSource filters.
 */
export function buildUsageHistoryFilter(
  state: FilterState,
  overrides?: {
    environmentId?: string;
    agentId?: string;
    featureName?: string;
  }
): string {
  const cols = USAGE_HISTORY_COLUMNS;
  const { startDate, endDate } = getDateFilter(state);
  return joinFilters([
    buildConfigFilter(state.selectedConfigId, cols.config),
    buildDateClause(cols.date, startDate, endDate),
    overrides?.environmentId
      ? `${cols.environmentId} eq '${escapeODataString(overrides.environmentId)}'`
      : null,
    overrides?.agentId
      ? `${cols.agentId} eq '${escapeODataString(overrides.agentId)}'`
      : null,
    overrides?.featureName
      ? `${cols.featureName} eq '${escapeODataString(overrides.featureName)}'`
      : null,
  ]);
}

/** Build OData $filter for cat_copilotstudiokitlogs table (Sync Logs). */
export function buildSyncLogsFilter(configId?: string): string {
  const cols = SYNC_LOGS_COLUMNS;
  return joinFilters([
    buildConfigFilter(configId ?? "", cols.config),
  ]);
}
