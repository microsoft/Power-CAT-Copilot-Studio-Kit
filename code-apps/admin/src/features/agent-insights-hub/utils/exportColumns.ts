/**
 * Export Columns - Per-tab column definitions for Excel export.
 *
 * Each array defines the columns that appear in the exported spreadsheet.
 * The key matches the entity interface property name so the export logic
 * can map data fields to columns by key.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export const formatDate = (value: unknown): string => {
  if (!value) return "";
  return new Date(String(value)).toLocaleDateString();
};

const formatMs = (value: unknown): string => {
  if (value == null) return "";
  return Number(value).toLocaleString();
};

const formatPct = (value: unknown): string => {
  if (value == null) return "";
  return `${Number(value).toFixed(1)}%`;
};

export const formatNum = (value: unknown): string => {
  if (value == null) return "";
  return Number(value).toLocaleString();
};

// ---------------------------------------------------------------------------
// Daily Metrics
// ---------------------------------------------------------------------------

export const dailyMetricsExportColumns: ExportColumn[] = [
  { key: "cat_metricdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_agentname", header: "Agent", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_dailyconversationcount", header: "Conversations", width: 14, formatter: formatNum },
  { key: "cat_dailyuniqueusers", header: "Unique Users", width: 14, formatter: formatNum },
  { key: "cat_dailyuniquetools", header: "Unique Tools", width: 14, formatter: formatNum },
  { key: "cat_dailyuniquetopics", header: "Unique Topics", width: 14, formatter: formatNum },
  { key: "cat_totalusermessages", header: "User Messages", width: 14, formatter: formatNum },
  { key: "cat_totalresponses", header: "Responses", width: 12, formatter: formatNum },
  { key: "cat_totalresponsetimems", header: "Total Response Time", width: 18, formatter: formatMs },
  { key: "cat_p10responsetimems", header: "P10 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p50responsetimems", header: "P50 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p90responsetimems", header: "P90 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p95responsetimems", header: "P95 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p99responsetimems", header: "P99 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_minresponsetimems", header: "Min Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_maxresponsetimems", header: "Max Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_stddevresponsetimems", header: "StdDev Response (ms)", width: 18, formatter: formatMs },
  { key: "cat_slowresponses16s", header: "Slow Responses (>16s)", width: 18, formatter: formatNum },
  { key: "cat_totaldurationms", header: "Total Duration (ms)", width: 18, formatter: formatMs },
  { key: "cat_conversationcountforduration", header: "Conversations (Duration)", width: 20, formatter: formatNum },
  { key: "cat_mediandurationms", header: "Median Duration (ms)", width: 18, formatter: formatMs },
  { key: "cat_p95durationms", header: "P95 Duration (ms)", width: 16, formatter: formatMs },
  { key: "cat_singleturnconversations", header: "Single-Turn", width: 12, formatter: formatNum },
  { key: "cat_multiturnconversations", header: "Multi-Turn", width: 12, formatter: formatNum },
  { key: "cat_shortconversations", header: "Short Conversations", width: 18, formatter: formatNum },
  { key: "cat_mediumconversations", header: "Medium Conversations", width: 18, formatter: formatNum },
  { key: "cat_longconversations", header: "Long Conversations", width: 18, formatter: formatNum },
  { key: "cat_errorcount", header: "Errors", width: 10, formatter: formatNum },
  { key: "cat_toolcallcount", header: "Tool Calls", width: 12, formatter: formatNum },
  { key: "cat_toolsuccesscount", header: "Tool Successes", width: 14, formatter: formatNum },
  { key: "cat_toolfailurecount", header: "Tool Failures", width: 14, formatter: formatNum },
  { key: "cat_totaltoolresponsetimems", header: "Total Tool Response (ms)", width: 22, formatter: formatMs },
  { key: "cat_maxtoolresponsetimems", header: "Max Tool Response (ms)", width: 20, formatter: formatMs },
  { key: "cat_p50toolresponsetimems", header: "P50 Tool Response (ms)", width: 20, formatter: formatMs },
  { key: "cat_p95toolresponsetimems", header: "P95 Tool Response (ms)", width: 20, formatter: formatMs },
  { key: "cat_topusersdisplay", header: "Top Users", width: 30 },
];

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export const topicsExportColumns: ExportColumn[] = [
  { key: "cat_metricdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_topicname", header: "Topic", width: 24 },
  { key: "cat_agentname", header: "Agent", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_triggercount", header: "Triggers", width: 12, formatter: formatNum },
  { key: "cat_completioncount", header: "Completions", width: 12, formatter: formatNum },
  { key: "cat_completionrate", header: "Completion Rate", width: 14, formatter: formatPct },
  { key: "cat_abandonmentcount", header: "Abandonments", width: 14, formatter: formatNum },
  { key: "cat_abandonmentrate", header: "Abandonment Rate", width: 14, formatter: formatPct },
  { key: "cat_redirectcount", header: "Redirects", width: 12, formatter: formatNum },
  { key: "cat_errorcount", header: "Errors", width: 10, formatter: formatNum },
  { key: "cat_errorrate", header: "Error Rate", width: 12, formatter: formatPct },
  { key: "cat_dailyuniqueconversations", header: "Conversations", width: 14, formatter: formatNum },
  { key: "cat_dailyuniqueusers", header: "Users", width: 10, formatter: formatNum },
  { key: "cat_totaldurationms", header: "Total Duration (ms)", width: 18, formatter: formatMs },
  { key: "cat_durationcount", header: "Duration Count", width: 14, formatter: formatNum },
  { key: "cat_mediandurationms", header: "Median Duration (ms)", width: 18, formatter: formatMs },
  { key: "cat_mindurationms", header: "Min Duration (ms)", width: 16, formatter: formatMs },
  { key: "cat_maxdurationms", header: "Max Duration (ms)", width: 16, formatter: formatMs },
  { key: "cat_p95durationms", header: "P95 Duration (ms)", width: 16, formatter: formatMs },
  { key: "cat_messagecount", header: "Messages", width: 12, formatter: formatNum },
  { key: "cat_messagesin", header: "Messages In", width: 12, formatter: formatNum },
  { key: "cat_messagesout", header: "Messages Out", width: 12, formatter: formatNum },
  { key: "cat_actioncount", header: "Actions", width: 10, formatter: formatNum },
  { key: "cat_totalactionelapsedms", header: "Total Action Elapsed (ms)", width: 22, formatter: formatMs },
  { key: "cat_maxactionelapsedms", header: "Max Action Elapsed (ms)", width: 20, formatter: formatMs },
  { key: "cat_p90actionelapsedms", header: "P90 Action Elapsed (ms)", width: 20, formatter: formatMs },
  { key: "cat_nodekindsdisplay", header: "Node Kinds", width: 24 },
];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const actionsExportColumns: ExportColumn[] = [
  { key: "cat_metricdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_nodekind", header: "Node Kind", width: 16 },
  { key: "cat_topicid", header: "Topic ID", width: 24 },
  { key: "cat_agentname", header: "Agent", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_executioncount", header: "Executions", width: 12, formatter: formatNum },
  { key: "cat_dailyconversationcount", header: "Conversations", width: 14, formatter: formatNum },
  { key: "cat_totalelapsedms", header: "Total Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_avgelapsedms", header: "Avg Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_minelapsedms", header: "Min Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_maxelapsedms", header: "Max Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_p10elapsedms", header: "P10 Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_p50elapsedms", header: "P50 Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_p90elapsedms", header: "P90 Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_p95elapsedms", header: "P95 Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_p99elapsedms", header: "P99 Elapsed (ms)", width: 16, formatter: formatMs },
  { key: "cat_stddevelapsedms", header: "StdDev Elapsed (ms)", width: 18, formatter: formatMs },
];

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const toolsExportColumns: ExportColumn[] = [
  { key: "cat_metricdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_toolname", header: "Tool Name", width: 24 },
  { key: "cat_tooltype", header: "Tool Type", width: 16 },
  { key: "cat_agentname", header: "Agent", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_callcount", header: "Calls", width: 10, formatter: formatNum },
  { key: "cat_successcount", header: "Successes", width: 12, formatter: formatNum },
  { key: "cat_successrate", header: "Success Rate", width: 12, formatter: formatPct },
  { key: "cat_failurecount", header: "Failures", width: 12, formatter: formatNum },
  { key: "cat_failurerate", header: "Failure Rate", width: 12, formatter: formatPct },
  { key: "cat_avgresponsetimems", header: "Avg Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_minresponsetimems", header: "Min Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_maxresponsetimems", header: "Max Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_medianresponsetimems", header: "Median Response (ms)", width: 18, formatter: formatMs },
  { key: "cat_p90responsetimems", header: "P90 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p95responsetimems", header: "P95 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_p99responsetimems", header: "P99 Response (ms)", width: 16, formatter: formatMs },
  { key: "cat_stddevresponsetimems", header: "StdDev Response (ms)", width: 18, formatter: formatMs },
  { key: "cat_uniqueconversations", header: "Conversations", width: 14, formatter: formatNum },
  { key: "cat_firstcall", header: "First Call", width: 14, formatter: formatDate },
  { key: "cat_lastcall", header: "Last Call", width: 14, formatter: formatDate },
  { key: "cat_errorcodes", header: "Error Codes", width: 20 },
  { key: "cat_resultcodes", header: "Result Codes", width: 20 },
];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const errorsExportColumns: ExportColumn[] = [
  { key: "cat_metricdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_errorcode", header: "Error Code", width: 20 },
  { key: "cat_agentname", header: "Agent", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_errorcount", header: "Error Count", width: 12, formatter: formatNum },
  { key: "cat_dailyaffectedconversations", header: "Affected Conversations", width: 20, formatter: formatNum },
  { key: "cat_dailyaffectedusers", header: "Affected Users", width: 14, formatter: formatNum },
  { key: "cat_totalsessionsforday", header: "Total Sessions", width: 14, formatter: formatNum },
  { key: "cat_affectedtopics", header: "Affected Topics", width: 24 },
  { key: "cat_sampleerrormessages", header: "Sample Error Messages", width: 30 },
  { key: "cat_firstoccurence", header: "First Occurrence", width: 16, formatter: formatDate },
  { key: "cat_lastoccurence", header: "Last Occurrence", width: 16, formatter: formatDate },
  { key: "cat_sessionid", header: "Session ID", width: 20 },
];

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

export const transcriptsExportColumns: ExportColumn[] = [
  { key: "cat_conversationdate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_agentid", header: "Agent ID", width: 24 },
  { key: "cat_agentname", header: "Agent Name", width: 20 },
  { key: "cat_channelid", header: "Channel", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 12 },
  { key: "cat_totalconversations", header: "Conversations", width: 14, formatter: formatNum },
  { key: "cat_sessioncount", header: "Sessions", width: 12, formatter: formatNum },
  { key: "cat_engagedcount", header: "Engaged", width: 12, formatter: formatNum },
  { key: "cat_unengagedcount", header: "Unengaged", width: 12, formatter: formatNum },
  { key: "cat_resolvedcount", header: "Resolved", width: 12, formatter: formatNum },
  { key: "cat_escalatedcount", header: "Escalated", width: 12, formatter: formatNum },
  { key: "cat_abandonedcount", header: "Abandoned", width: 12, formatter: formatNum },
  { key: "cat_totalturns", header: "Total Turns", width: 12, formatter: formatNum },
  { key: "cat_csatcount", header: "CSAT Count", width: 12, formatter: formatNum },
  { key: "cat_csatscore", header: "CSAT Score", width: 12, formatter: formatPct },
  { key: "cat_feedbacklikecount", header: "Likes", width: 10, formatter: formatNum },
  { key: "cat_feedbackdislikecount", header: "Dislikes", width: 10, formatter: formatNum },
];

// ---------------------------------------------------------------------------
// Usage History
// ---------------------------------------------------------------------------

export const usageHistoryExportColumns: ExportColumn[] = [
  { key: "cat_usagedate", header: "Date", width: 14, formatter: formatDate },
  { key: "cat_name", header: "Name", width: 24 },
  { key: "cat_agentid", header: "Agent ID", width: 24 },
  { key: "cat_environmentid", header: "Environment ID", width: 24 },
  { key: "cat_featurename", header: "Feature", width: 20 },
  { key: "cat_billedcopilotcredits", header: "Billed Credits", width: 14, formatter: formatNum },
  { key: "cat_nonbilledcopilotcredits", header: "Non-Billed Credits", width: 16, formatter: formatNum },
];

// ---------------------------------------------------------------------------
// Sync Logs
// ---------------------------------------------------------------------------

export const syncLogsExportColumns: ExportColumn[] = [
  { key: "createdon", header: "Created On", width: 16, formatter: formatDate },
  { key: "cat_name", header: "Name", width: 24 },
  { key: "cat_executionstatuscode", header: "Status", width: 14 },
  { key: "cat_cloudflowname", header: "Cloud Flow", width: 24 },
  { key: "cat_startdate", header: "Start Date", width: 16, formatter: formatDate },
  { key: "cat_enddate", header: "End Date", width: 16, formatter: formatDate },
  { key: "cat_flowduration", header: "Duration", width: 14 },
  { key: "cat_errormessage", header: "Error Message", width: 30 },
  { key: "cat_cloudflowinstanceurl", header: "Flow URL", width: 30 },
];

// ---------------------------------------------------------------------------
// Transcript Staging
// ---------------------------------------------------------------------------

const formatStagingDataSource = (value: unknown): string => {
  const code = Number(value);
  if (code === 1) return "Production";
  if (code === 2) return "Test Data";
  return String(value ?? "");
};

const formatWorkflowStatus = (value: unknown): string => {
  const code = Number(value);
  if (code === 1) return "Pending";
  if (code === 2) return "Completed";
  if (code === 3) return "Failed";
  return String(value ?? "");
};

export const transcriptStagingExportColumns: ExportColumn[] = [
  { key: "cat_name", header: "Name", width: 20 },
  { key: "cat_agentname", header: "Agent Name", width: 20 },
  { key: "cat_conversationdate", header: "Conversation Date", width: 18, formatter: formatDate },
  { key: "cat_conversationid", header: "Conversation ID", width: 20 },
  { key: "cat_channelid", header: "Channel ID", width: 14 },
  { key: "cat_datasourcecode", header: "Data Source", width: 14, formatter: formatStagingDataSource },
  { key: "cat_workflowstatus", header: "Workflow Status", width: 14, formatter: formatWorkflowStatus },
  { key: "cat_transcriptguid", header: "Transcript ID", width: 20 },
  { key: "createdon", header: "Created On", width: 18, formatter: formatDate },
];
