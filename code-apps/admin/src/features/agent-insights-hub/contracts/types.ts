/**
 * Agent Insights Hub - TypeScript Interfaces
 *
 * Feature-specific types wrapping Dataverse entity shapes.
 * Generated services return raw objects; these interfaces provide type safety.
 */

// ---------------------------------------------------------------------------
// Filter State
// ---------------------------------------------------------------------------

export interface FilterState {
  selectedConfigId: string;
  dateRange: string;
  customStartDate: string;
  customEndDate: string;
  selectedChannel: string;
  dataMode: "production" | "test" | "both";
}

export interface DateFilter {
  startDate: Date;
  endDate: Date;
}

export interface FilterContextType extends FilterState {
  setSelectedConfigId: (id: string) => void;
  setDateRange: (range: string) => void;
  setCustomStartDate: (date: string) => void;
  setCustomEndDate: (date: string) => void;
  setSelectedChannel: (channel: string) => void;
  setDataMode: (mode: "production" | "test" | "both") => void;
  configurations: AgentConfiguration[];
  loadingConfigurations: boolean;
  configurationsError: boolean;
  refreshConfigurations: () => Promise<void>;
  availableChannels: string[];
  getDateFilter: () => DateFilter;
}

// ---------------------------------------------------------------------------
// Entity Interfaces
// ---------------------------------------------------------------------------

export interface AgentConfiguration {
  cat_copilotconfigurationid: string;
  cat_name: string;
  cat_agentname?: string;
  cat_copilotid: string;
  cat_dataverseurl: string;
  cat_configurationtypescodes?: string;
  cat_azureappinsightsapplicationid?: string;
  cat_azureappinsightstenantid?: string;
  cat_azureappinsightsclientid?: string;
  cat_azureappinsightssecretlocationcode?: number;
  cat_azureappinsightssecret?: string;
  cat_azureappinsightsenvironmentvariable?: string;
  cat_actionparameters?: string;
  statecode?: number;
  _cat_agents_value?: string;
  cat_kpisourcecodes?: string;
  cat_iscaptureuserdetailsenabled?: boolean;
  cat_iscaptureuserfeedbackenabled?: boolean;
  createdon?: string;
}

export interface DailyMetrics {
  cat_dailymetricsid: string;
  cat_dailymetricsname?: string;
  cat_agentname: string;
  cat_metricdate: string;
  cat_channelid: string;
  cat_datasourcecode: number;
  cat_dailyconversationcount?: number;
  cat_dailyuniqueusers?: number;
  cat_dailyuniquetools?: number;
  cat_dailyuniquetopics?: number;
  cat_totalusermessages?: number;
  cat_totalresponses?: number;
  cat_totalresponsetimems?: number;
  cat_minresponsetimems?: number;
  cat_maxresponsetimems?: number;
  cat_p10responsetimems?: number;
  cat_p50responsetimems?: number;
  cat_p90responsetimems?: number;
  cat_p95responsetimems?: number;
  cat_p99responsetimems?: number;
  cat_stddevresponsetimems?: number;
  cat_slowresponses16s?: number;
  cat_totaldurationms?: number;
  cat_conversationcountforduration?: number;
  cat_mediandurationms?: number;
  cat_p95durationms?: number;
  cat_singleturnconversations?: number;
  cat_multiturnconversations?: number;
  cat_shortconversations?: number;
  cat_mediumconversations?: number;
  cat_longconversations?: number;
  cat_errorcount?: number;
  cat_toolcallcount?: number;
  cat_toolsuccesscount?: number;
  cat_toolfailurecount?: number;
  cat_totaltoolresponsetimems?: number;
  cat_maxtoolresponsetimems?: number;
  cat_p50toolresponsetimems?: number;
  cat_p95toolresponsetimems?: number;
  cat_topusersdisplay?: string;
  _cat_agentconfiguration_value?: string;
}

export interface TopicMetrics {
  cat_topicmetricsid: string;
  cat_topicmetricsname?: string;
  cat_topicname: string;
  cat_metricdate: string;
  cat_agentname: string;
  cat_channelid: string;
  cat_datasourcecode: number;
  cat_triggercount?: number;
  cat_completioncount?: number;
  cat_completionrate?: number;
  cat_abandonmentcount?: number;
  cat_abandonmentrate?: number;
  cat_redirectcount?: number;
  cat_errorcount?: number;
  cat_errorrate?: number;
  cat_dailyuniqueconversations?: number;
  cat_dailyuniqueusers?: number;
  cat_totaldurationms?: number;
  cat_durationcount?: number;
  cat_mediandurationms?: number;
  cat_mindurationms?: number;
  cat_maxdurationms?: number;
  cat_p95durationms?: number;
  cat_messagecount?: number;
  cat_messagesin?: number;
  cat_messagesout?: number;
  cat_actioncount?: number;
  cat_totalactionelapsedms?: number;
  cat_maxactionelapsedms?: number;
  cat_p90actionelapsedms?: number;
  cat_nodekindsdisplay?: string;
  _cat_agentconfiguration_value?: string;
}

export interface ActionMetrics {
  cat_actionmetricsid: string;
  cat_actionmetricsname?: string;
  cat_nodekind: string;
  cat_actionid?: string;
  cat_topicid?: string;
  cat_metricdate: string;
  cat_agentname: string;
  cat_channelid: string;
  cat_datasourcecode: number;
  cat_executioncount?: number;
  cat_dailyconversationcount?: number;
  cat_totalelapsedms?: number;
  cat_avgelapsedms?: number;
  cat_minelapsedms?: number;
  cat_maxelapsedms?: number;
  cat_p10elapsedms?: number;
  cat_p50elapsedms?: number;
  cat_p90elapsedms?: number;
  cat_p95elapsedms?: number;
  cat_p99elapsedms?: number;
  cat_stddevelapsedms?: number;
  _cat_agentconfiguration_value?: string;
}

export interface ToolMetrics {
  cat_toolmetricsid: string;
  cat_toolmetricsname?: string;
  cat_toolname: string;
  cat_tooltype: string;
  cat_metricdate: string;
  cat_agentname: string;
  cat_channelid?: string;
  cat_datasourcecode: number;
  cat_callcount?: number;
  cat_successcount?: number;
  cat_successrate?: number;
  cat_failurecount?: number;
  cat_failurerate?: number;
  cat_avgresponsetimems?: number;
  cat_minresponsetimems?: number;
  cat_maxresponsetimems?: number;
  cat_medianresponsetimems?: number;
  cat_p90responsetimems?: number;
  cat_p95responsetimems?: number;
  cat_p99responsetimems?: number;
  cat_stddevresponsetimems?: number;
  cat_uniqueconversations?: number;
  cat_firstcall?: string;
  cat_lastcall?: string;
  cat_errorcodes?: string;
  cat_resultcodes?: string;
  _cat_agentconfiguration_value?: string;
}

export interface ErrorDetails {
  cat_errordetailsid: string;
  cat_errordetailsname?: string;
  cat_errorcode: string;
  cat_metricdate: string;
  cat_agentname: string;
  cat_channelid?: string;
  cat_datasourcecode: number;
  cat_errorcount?: number;
  cat_dailyaffectedconversations?: number;
  cat_dailyaffectedusers?: number;
  cat_totalsessionsforday?: number;
  cat_affectedtopics?: string;
  cat_sampleerrormessages?: string;
  cat_firstoccurence?: string;
  cat_lastoccurence?: string;
  cat_sessionid?: string;
  _cat_agentconfiguration_value?: string;
}

export interface TranscriptMetrics {
  cat_transcriptmetricsid: string;
  cat_transcriptmetricname?: string;
  cat_agentid: string;
  cat_agentname?: string;
  cat_conversationdate: string;
  cat_channelid: string;
  cat_datasourcecode?: number;
  cat_totalconversations?: number;
  cat_sessioncount?: number;
  cat_engagedcount?: number;
  cat_unengagedcount?: number;
  cat_resolvedcount?: number;
  cat_escalatedcount?: number;
  cat_abandonedcount?: number;
  cat_totalturns?: number;
  cat_csatcount?: number;
  cat_csatscore?: number;
  cat_feedbacklikecount?: number;
  cat_feedbackdislikecount?: number;
  cat_runs?: number;
  cat_successfulruns?: number;
  cat_averagedurationseconds?: number;
  cat_connectedagentdetails?: string;
  _cat_agentconfiguration_value?: string;
}

/** Single entry in the cat_connectedagentdetails JSON array. */
export interface ConnectedAgentDetail {
  Agent: string;
  Type: string;
  Count: number;
  Success: number;
}

export interface AgentUsageHistory {
  cat_agentusagehistoryid: string;
  cat_name: string;
  cat_agentid?: string;
  cat_environmentid?: string;
  cat_featurename?: string;
  cat_usagedate?: string;
  cat_billedcopilotcredits?: number;
  cat_nonbilledcopilotcredits?: number;
  _cat_agent_value?: string;
}

export interface TranscriptStaging {
  cat_agentinsightstranscriptstagingid: string;
  cat_name: string;
  cat_agentname?: string;
  cat_conversationdate?: string;
  cat_conversationid?: string;
  cat_channelid?: string;
  cat_datasourcecode?: number;
  cat_workflowstatus?: number;
  cat_transcriptguid?: string;
  createdon?: string;
  cat_datasourcecodename?: string;
  cat_workflowstatusname?: string;
  _cat_agentconfiguration_value?: string;
}

export const WORKFLOW_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Completed",
  3: "Failed",
};

export const STAGING_DATA_SOURCE_LABELS: Record<number, string> = {
  1: "Production",
  2: "Test Data",
};

export interface SyncLog {
  cat_copilotstudiokitlogsid: string;
  cat_name?: string;
  createdon?: string;
  cat_executionstatuscode?: number;
  cat_cloudflowname?: string;
  cat_cloudflowinstanceurl?: string;
  cat_startdate?: string;
  cat_enddate?: string;
  cat_flowduration?: string;
  cat_errormessage?: string;
  _cat_copilotconfigurationid_value?: string;
}

export interface AgentDetails {
  cat_agentdetailsid: string;
  cat_name: string;
  cat_environmentname?: string;
  cat_environmentid?: string;
  cat_agentid?: string;
  cat_environmenturl?: string;
}

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: number;
  isNewMetric?: boolean;
  invertTrend?: boolean;
  loading?: boolean;
  tooltip?: string;
  icon?: React.ReactElement;
}

export interface GridColumn<T> {
  key: string;
  label: string;
  width: string;
  sortable?: boolean;
  alignment?: "start" | "end";
  render?: (item: T) => React.ReactNode;
  searchValue?: (item: T) => string;
}

export interface ChartCardProps {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
  minHeight?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DATE_RANGE_OPTIONS = [
  { value: "last7days", label: "Last 7 days", daysBack: 7 },
  { value: "last30days", label: "Last 30 days", daysBack: 30 },
  { value: "last90days", label: "Last 90 days", daysBack: 90 },
  { value: "last180days", label: "Last 180 days", daysBack: 180 },
  { value: "last365days", label: "Last 365 days", daysBack: 365 },
  { value: "custom", label: "Custom range", daysBack: null },
] as const;

// Channel constants are defined in the shared single source of truth so Agent
// Insights Hub and Agent Debugger reuse identical values and never drift.
export {
  CHANNEL_OPTIONS,
  CHANNEL_DISPLAY_NAMES,
} from "../../../shared/constants/channels";

export const DATA_MODE_OPTIONS = [
  { value: "production", label: "Production" },
  { value: "test", label: "Test data" },
  { value: "both", label: "All data" },
] as const;

export const EXECUTION_STATUS_LABELS: Record<number, string> = {
  1: "Not Started",
  2: "Running",
  3: "Complete",
  4: "Error",
  5: "Cancelled",
};

export const CHART_COLORS = {
  slot1: "#637CEF",
  slot2: "#E3008C",
  slot3: "#2AA0A4",
  slot4: "#9373C0",
  slot5: "#13A10E",
  slot6: "#3A96DD",
  slot7: "#CA5010",
  slot8: "#57811B",
  slot9: "#B146C2",
  slot10: "#AE8C00",
} as const;

export const CHART_COLORS_ARRAY = [
  "#637CEF", "#E3008C", "#2AA0A4", "#9373C0", "#13A10E",
  "#3A96DD", "#CA5010", "#57811B", "#B146C2", "#AE8C00",
] as const;

export const SESSION_OUTCOME_COLORS = {
  resolved: "#0078d4",
  escalated: "#e3008c",
  abandoned: "#00b7c3",
  unengaged: "#8a8886",
} as const;

export const CSAT_COLORS = {
  dissatisfied: "#d13438",
  neutral: "#8a8886",
  satisfied: "#107c10",
} as const;

export const DEFAULT_PAGE_SIZE = 25;
export const REACT_QUERY_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const KPI_SOURCE_OPTIONS = [
  { value: "1", label: "Application Insights" },
  { value: "2", label: "Conversation Transcripts" },
  { value: "3", label: "Usage History" },
] as const;

export const SECRET_LOCATION_OPTIONS = [
  { value: "1", label: "Dataverse" },
  { value: "2", label: "KeyVault" },
] as const;

export const SECRET_LOCATION_DISPLAY: Record<number, string> = {
  1: "Dataverse",
  2: "KeyVault",
};

export const KPI_SOURCE_DISPLAY: Record<string, string> = {
  "1": "Application Insights",
  "2": "Conversation Transcripts",
  "3": "Usage History",
};
