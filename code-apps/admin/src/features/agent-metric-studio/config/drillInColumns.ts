// Hardcoded column configuration per source table for the Drill-In panel.
// Derived from the "Active" views in the Dataverse solution (views_summary.json).
// Each table has a curated set of columns with display labels.

export interface DrillInColumn {
  key: string;
  label: string;
  minWidth: number;
}

export type DrillInColumnsMap = Record<string, DrillInColumn[]>;

/**
 * Column definitions keyed by table logical name.
 * Order matches the "Active" view layout from Power Platform.
 */
export const DRILL_IN_COLUMNS: DrillInColumnsMap = {
  cat_dailymetrics: [
    { key: 'cat_metricdate', label: 'Metric Date', minWidth: 108 },
    { key: 'cat_agentname', label: 'Agent Name', minWidth: 164 },
    { key: 'cat_channelid', label: 'Channel Id', minWidth: 102 },
    { key: 'cat_datasourcecode', label: 'Data Source', minWidth: 109 },
    { key: 'cat_dailyconversationcount', label: 'Daily Conversation Count', minWidth: 140 },
    { key: 'cat_dailyuniqueusers', label: 'Daily Unique Users', minWidth: 130 },
    { key: 'cat_dailyuniquetools', label: 'Daily Unique Tools', minWidth: 130 },
    { key: 'cat_dailyuniquetopics', label: 'Daily Unique Topics', minWidth: 130 },
    { key: 'cat_totalusermessages', label: 'Total User Messages', minWidth: 130 },
    { key: 'cat_totalresponses', label: 'Total Responses', minWidth: 120 },
    { key: 'cat_totalresponsetimems', label: 'Total Response Time (ms)', minWidth: 150 },
    { key: 'cat_p10responsetimems', label: 'P10 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p50responsetimems', label: 'P50 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p90responsetimems', label: 'P90 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p95responsetimems', label: 'P95 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p99responsetimems', label: 'P99 Response Time (ms)', minWidth: 145 },
    { key: 'cat_minresponsetimems', label: 'Min Response Time (ms)', minWidth: 145 },
    { key: 'cat_maxresponsetimems', label: 'Max Response Time (ms)', minWidth: 145 },
    { key: 'cat_stddevresponsetimems', label: 'Std Dev Response Time (ms)', minWidth: 160 },
    { key: 'cat_slowresponses16s', label: 'Slow Responses (>16s)', minWidth: 135 },
    { key: 'cat_totaldurationms', label: 'Total Duration (ms)', minWidth: 130 },
    { key: 'cat_conversationcountforduration', label: 'Conversations (Duration)', minWidth: 155 },
    { key: 'cat_mediandurationms', label: 'Median Duration (ms)', minWidth: 135 },
    { key: 'cat_p95durationms', label: 'P95 Duration (ms)', minWidth: 125 },
    { key: 'cat_singleturnconversations', label: 'Single-Turn Conversations', minWidth: 155 },
    { key: 'cat_multiturnconversations', label: 'Multi-Turn Conversations', minWidth: 150 },
    { key: 'cat_shortconversations', label: 'Short Conversations', minWidth: 130 },
    { key: 'cat_mediumconversations', label: 'Medium Conversations', minWidth: 140 },
    { key: 'cat_longconversations', label: 'Long Conversations', minWidth: 130 },
    { key: 'cat_errorcount', label: 'Error Count', minWidth: 100 },
    { key: 'cat_toolcallcount', label: 'Tool Call Count', minWidth: 115 },
    { key: 'cat_toolsuccesscount', label: 'Tool Success Count', minWidth: 130 },
    { key: 'cat_toolfailurecount', label: 'Tool Failure Count', minWidth: 125 },
    { key: 'cat_totaltoolresponsetimems', label: 'Total Tool Response Time (ms)', minWidth: 170 },
    { key: 'cat_maxtoolresponsetimems', label: 'Max Tool Response Time (ms)', minWidth: 165 },
    { key: 'cat_p50toolresponsetimems', label: 'P50 Tool Response Time (ms)', minWidth: 165 },
    { key: 'cat_p95toolresponsetimems', label: 'P95 Tool Response Time (ms)', minWidth: 165 },
    { key: 'cat_topusersdisplay', label: 'Top Users', minWidth: 130 },
  ],

  cat_copilotkpi: [
    { key: 'cat_conversationid', label: 'Conversation ID', minWidth: 150 },
    { key: 'cat_copilotconfigurationid', label: 'Copilot Configuration', minWidth: 160 },
    { key: 'cat_conversationdate', label: 'Conversation Date', minWidth: 130 },
    { key: 'cat_globaloutcomecode', label: 'Global Outcome', minWidth: 120 },
    { key: 'cat_sessions', label: 'Sessions', minWidth: 90 },
    { key: 'cat_csat', label: 'CSAT', minWidth: 80 },
    { key: 'cat_turns', label: 'Turns', minWidth: 80 },
  ],

  cat_agentdetails: [
    { key: 'cat_name', label: 'Name', minWidth: 180 },
    { key: 'cat_description', label: 'Description', minWidth: 200 },
    { key: 'cat_environmentname', label: 'Environment', minWidth: 140 },
    { key: 'cat_environmenttype', label: 'Environment Type', minWidth: 130 },
    { key: 'cat_orchestrationtype', label: 'Orchestration Type', minWidth: 130 },
    { key: 'cat_usesgenaicode', label: 'Uses Gen AI', minWidth: 100 },
    { key: 'cat_usestoolscode', label: 'Uses Tools', minWidth: 100 },
    { key: 'cat_usespromptscode', label: 'Uses Prompts', minWidth: 100 },
    { key: 'cat_usesknowledgesourcescode', label: 'Uses Knowledge', minWidth: 110 },
  ],

  cat_agentusagehistory: [
    { key: 'cat_agent', label: 'Agent', minWidth: 160 },
    { key: 'cat_agentid', label: 'Agent ID', minWidth: 140 },
    { key: 'cat_environmentid', label: 'Environment ID', minWidth: 140 },
    { key: 'cat_featurename', label: 'Feature', minWidth: 120 },
    { key: 'cat_usagedate', label: 'Usage Date', minWidth: 110 },
    { key: 'cat_billedcopilotcredits', label: 'Billed Credits', minWidth: 110 },
    { key: 'cat_nonbilledcopilotcredits', label: 'Non-Billed Credits', minWidth: 120 },
  ],

  cat_agentvalue: [
    { key: 'cat_name', label: 'Name', minWidth: 200 },
    { key: 'createdon', label: 'Created On', minWidth: 130 },
  ],

  cat_conversationanalyzer: [
    { key: 'cat_name', label: 'Name', minWidth: 160 },
    { key: 'cat_conversationid', label: 'Conversation ID', minWidth: 150 },
    { key: 'cat_agentid', label: 'Agent ID', minWidth: 130 },
    { key: 'cat_messages', label: 'Messages', minWidth: 100 },
    { key: 'cat_conversationdurationseconds', label: 'Duration (s)', minWidth: 100 },
    { key: 'createdon', label: 'Created On', minWidth: 120 },
    { key: 'cat_prompt', label: 'Prompt', minWidth: 150 },
    { key: 'cat_summary', label: 'Summary', minWidth: 200 },
    { key: 'cat_promptresult', label: 'Prompt Result', minWidth: 150 },
  ],

  cat_toolmetrics: [
    { key: 'cat_metricdate', label: 'Metric Date', minWidth: 108 },
    { key: 'cat_toolname', label: 'Tool Name', minWidth: 140 },
    { key: 'cat_tooltype', label: 'Tool Type', minWidth: 100 },
    { key: 'cat_agentname', label: 'Agent Name', minWidth: 140 },
    { key: 'cat_channelid', label: 'Channel Id', minWidth: 100 },
    { key: 'cat_datasourcecode', label: 'Data Source', minWidth: 100 },
    { key: 'cat_callcount', label: 'Call Count', minWidth: 90 },
    { key: 'cat_successcount', label: 'Success Count', minWidth: 105 },
    { key: 'cat_successrate', label: 'Success Rate', minWidth: 100 },
    { key: 'cat_failurecount', label: 'Failure Count', minWidth: 105 },
    { key: 'cat_failurerate', label: 'Failure Rate', minWidth: 100 },
    { key: 'cat_avgresponsetimems', label: 'Avg Response Time (ms)', minWidth: 145 },
    { key: 'cat_minresponsetimems', label: 'Min Response Time (ms)', minWidth: 145 },
    { key: 'cat_maxresponsetimems', label: 'Max Response Time (ms)', minWidth: 145 },
    { key: 'cat_medianresponsetimems', label: 'Median Response Time (ms)', minWidth: 155 },
    { key: 'cat_p90responsetimems', label: 'P90 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p95responsetimems', label: 'P95 Response Time (ms)', minWidth: 145 },
    { key: 'cat_p99responsetimems', label: 'P99 Response Time (ms)', minWidth: 145 },
    { key: 'cat_stddevresponsetimems', label: 'Std Dev (ms)', minWidth: 110 },
    { key: 'cat_uniqueconversations', label: 'Unique Conversations', minWidth: 140 },
    { key: 'cat_firstcall', label: 'First Call', minWidth: 110 },
    { key: 'cat_lastcall', label: 'Last Call', minWidth: 110 },
    { key: 'cat_errorcodes', label: 'Error Codes', minWidth: 120 },
    { key: 'cat_resultcodes', label: 'Result Codes', minWidth: 120 },
  ],

  cat_topicmetrics: [
    { key: 'cat_topicmetricsname', label: 'Name', minWidth: 140 },
    { key: 'cat_metricdate', label: 'Metric Date', minWidth: 108 },
    { key: 'cat_agentname', label: 'Agent Name', minWidth: 140 },
    { key: 'cat_topicname', label: 'Topic Name', minWidth: 140 },
    { key: 'cat_channelid', label: 'Channel Id', minWidth: 100 },
    { key: 'cat_datasourcecode', label: 'Data Source', minWidth: 100 },
    { key: 'cat_triggercount', label: 'Trigger Count', minWidth: 100 },
    { key: 'cat_completioncount', label: 'Completion Count', minWidth: 115 },
    { key: 'cat_completionrate', label: 'Completion Rate', minWidth: 110 },
    { key: 'cat_redirectcount', label: 'Redirect Count', minWidth: 110 },
    { key: 'cat_abandonmentcount', label: 'Abandonment Count', minWidth: 125 },
    { key: 'cat_abandonmentrate', label: 'Abandonment Rate', minWidth: 120 },
    { key: 'cat_errorcount', label: 'Error Count', minWidth: 100 },
    { key: 'cat_errorrate', label: 'Error Rate', minWidth: 90 },
    { key: 'cat_dailyuniqueconversations', label: 'Unique Conversations', minWidth: 140 },
    { key: 'cat_dailyuniqueusers', label: 'Unique Users', minWidth: 105 },
    { key: 'cat_totaldurationms', label: 'Total Duration (ms)', minWidth: 130 },
    { key: 'cat_durationcount', label: 'Duration Count', minWidth: 110 },
    { key: 'cat_mediandurationms', label: 'Median Duration (ms)', minWidth: 135 },
    { key: 'cat_p95durationms', label: 'P95 Duration (ms)', minWidth: 120 },
    { key: 'cat_mindurationms', label: 'Min Duration (ms)', minWidth: 120 },
    { key: 'cat_maxdurationms', label: 'Max Duration (ms)', minWidth: 125 },
    { key: 'cat_messagecount', label: 'Message Count', minWidth: 110 },
    { key: 'cat_messagesin', label: 'Messages In', minWidth: 100 },
    { key: 'cat_messagesout', label: 'Messages Out', minWidth: 100 },
    { key: 'cat_actioncount', label: 'Action Count', minWidth: 100 },
    { key: 'cat_totalactionelapsedms', label: 'Total Action Elapsed (ms)', minWidth: 155 },
    { key: 'cat_maxactionelapsedms', label: 'Max Action Elapsed (ms)', minWidth: 145 },
    { key: 'cat_p90actionelapsedms', label: 'P90 Action Elapsed (ms)', minWidth: 145 },
    { key: 'cat_nodekindsdisplay', label: 'Node Kinds', minWidth: 120 },
  ],

  cat_transcriptmetrics: [
    { key: 'cat_conversationdate', label: 'Conversation Date', minWidth: 130 },
    { key: 'cat_agentid', label: 'Agent ID', minWidth: 130 },
    { key: 'cat_agentname', label: 'Agent Name', minWidth: 140 },
    { key: 'cat_channelid', label: 'Channel Id', minWidth: 100 },
    { key: 'cat_datasourcecode', label: 'Data Source', minWidth: 100 },
    { key: 'cat_totalconversations', label: 'Total Conversations', minWidth: 130 },
    { key: 'cat_sessioncount', label: 'Session Count', minWidth: 105 },
    { key: 'cat_engagedcount', label: 'Engaged Count', minWidth: 105 },
    { key: 'cat_unengagedcount', label: 'Unengaged Count', minWidth: 115 },
    { key: 'cat_resolvedcount', label: 'Resolved Count', minWidth: 110 },
    { key: 'cat_escalatedcount', label: 'Escalated Count', minWidth: 115 },
    { key: 'cat_abandonedcount', label: 'Abandoned Count', minWidth: 115 },
    { key: 'cat_totalturns', label: 'Total Turns', minWidth: 95 },
    { key: 'cat_csatcount', label: 'CSAT Count', minWidth: 90 },
    { key: 'cat_csatscore', label: 'CSAT Score', minWidth: 90 },
    { key: 'cat_feedbacklikecount', label: 'Likes', minWidth: 80 },
    { key: 'cat_feedbackdislikecount', label: 'Dislikes', minWidth: 80 },
  ],

  cat_actionmetrics: [
    { key: 'cat_metricdate', label: 'Metric Date', minWidth: 108 },
    { key: 'cat_nodekind', label: 'Node Kind', minWidth: 102 },
    { key: 'cat_topicid', label: 'Topic ID', minWidth: 100 },
    { key: 'cat_agentname', label: 'Agent Name', minWidth: 112 },
    { key: 'cat_channelid', label: 'Channel Id', minWidth: 102 },
    { key: 'cat_datasourcecode', label: 'Data Source', minWidth: 109 },
    { key: 'cat_executioncount', label: 'Execution Count', minWidth: 115 },
    { key: 'cat_dailyconversationcount', label: 'Daily Conversations', minWidth: 140 },
    { key: 'cat_avgelapsedms', label: 'Avg Elapsed (ms)', minWidth: 120 },
    { key: 'cat_minelapsedms', label: 'Min Elapsed (ms)', minWidth: 115 },
    { key: 'cat_maxelapsedms', label: 'Max Elapsed (ms)', minWidth: 120 },
    { key: 'cat_p10elapsedms', label: 'P10 Elapsed (ms)', minWidth: 115 },
    { key: 'cat_p50elapsedms', label: 'P50 Elapsed (ms)', minWidth: 115 },
    { key: 'cat_p90elapsedms', label: 'P90 Elapsed (ms)', minWidth: 115 },
    { key: 'cat_p95elapsedms', label: 'P95 Elapsed (ms)', minWidth: 115 },
    { key: 'cat_p99elapsedms', label: 'P99 Elapsed (ms)', minWidth: 115 },
    { key: 'cat_stddevelapsedms', label: 'Std Dev Elapsed (ms)', minWidth: 135 },
  ],

  cat_agentcompliance: [
    { key: 'cat_name', label: 'Name', minWidth: 180 },
    { key: 'cat_agentowner', label: 'Agent Owner', minWidth: 140 },
    { key: 'cat_piiseverity', label: 'PII Severity', minWidth: 110 },
    { key: 'cat_piicompliancestatus', label: 'PII Compliance Status', minWidth: 150 },
    { key: 'cat_lastpiifound', label: 'Last PII Found', minWidth: 130 },
    { key: 'cat_perctranscriptsinpiiviolation', label: '% Transcripts in PII Violation', minWidth: 180 },
  ],

  cat_agentreviews: [
    { key: 'cat_name', label: 'Name', minWidth: 200 },
    { key: 'createdon', label: 'Created On', minWidth: 130 },
  ],
};

/**
 * Retrieve columns for a given source table.
 * Returns the hardcoded config if available, otherwise undefined (caller should auto-detect).
 */
export function getColumnsForTable(table: string): DrillInColumn[] | undefined {
  return DRILL_IN_COLUMNS[table];
}
