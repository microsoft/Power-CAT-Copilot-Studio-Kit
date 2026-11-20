/**
 * Metric and chart descriptions for tooltip info icons.
 * Centralized here and imported by all tab components.
 *
 * Descriptions are aligned with the actual Kusto queries (Queries.md)
 * and verified against UI code logic in each tab component.
 */

// ---------------------------------------------------------------------------
// Overview Page (HOME)
// ---------------------------------------------------------------------------

export const HOME_METRICS = {
  totalConversations:
    "The total number of conversations with your agent during the selected time period. Based on daily distinct conversation counts.",
  dailyActiveUsers:
    "Average daily unique users who interacted with your agents. Requires user capture to be enabled in agent configuration.",
  activeUsers:
    "Users who interacted with this agent during the selected period. Requires user capture to be enabled in agent configuration.",
  responses:
    "Total bot messages sent including text responses, adaptive cards, and system messages.",
  avgResponse:
    "Average time between a user message and the next bot response. Responses over 120 seconds are excluded as outliers. Lower is better.",
  duration:
    "Average conversation duration from first to last event. Excludes single-event conversations.",
  toolSuccess: "Percentage of successful tool executions. Higher is better.",
  errors:
    "Total errors encountered (OnErrorLog events). Lower is better.",
};

export const HOME_CHARTS = {
  topTopics:
    "Topics ranked by trigger count (TopicStart events). Shows the most frequently activated topics.",
  topicExecutionSlowest:
    "Topics with the longest average execution time. Measured from TopicStart to TopicEnd, capped at 1 hour.",
  conversationsByChannel:
    "Distribution of conversations across different channels (Teams, Web, etc.).",
  singleVsMultiTurn:
    "Single-turn: conversations with exactly 1 user message. Multi-turn: conversations with 2+ user messages.",
  sessionDurationDistribution:
    "Breakdown of conversations by duration: Short (<1 min), Medium (1-10 min), Long (>10 min).",
  errorDistribution:
    "Breakdown of errors by error code. Helps identify the most common failure types.",
  topTools:
    "Top tools by call volume. Shows the most frequently called tools across all agents.",
  toolExecutionSlowest:
    "Tools with the highest average execution time. Consider optimizing these for better performance.",
  responseTime:
    "Daily average and P90 response times. P90 means 90% of responses were faster than this value.",
};

// ---------------------------------------------------------------------------
// Daily Metrics Page
// ---------------------------------------------------------------------------

export const DAILY_METRICS_CHARTS = {
  conversationVolume:
    "Daily distinct conversation count. Shows engagement trends and peak usage periods.",
  dailyActiveUsers:
    "Daily unique users. Requires user capture to be enabled in agent configuration.",
  dailyMessages:
    "User messages (actual text messages only, excluding system events) and bot responses sent per day.",
};

// ---------------------------------------------------------------------------
// Topic Metrics Page
// ---------------------------------------------------------------------------

export const TOPIC_METRICS = {
  totalTriggers:
    "Total number of times topics were triggered (TopicStart events) during conversations.",
  completed:
    "Topics that successfully ran to completion (TopicEnd events).",
  abandoned:
    "Topics where triggers exceeded completions and redirects. Calculated as: triggers - completions - redirects.",
  avgDuration:
    "Average time from TopicStart to TopicEnd. Only includes paired start/end events, capped at 1 hour.",
  errors:
    "Errors attributed to topics based on the most recent active topic at the time of the error.",
  messages:
    "Total user messages (text only, excluding system events) attributed to topics.",
};

export const TOPIC_CHARTS = {
  triggersOverTime:
    "Daily trend of topic triggers showing how often users activate topics.",
  topTopicsByTriggers:
    "Most frequently triggered topics (Top 10). Helps identify popular content.",
  topicsWithMostErrors:
    "Topics with most errors (Top 5). Only shows if errors exist.",
  messagesInVsOut:
    "User messages (text only) vs bot responses, attributed to topics via the most recent TopicStart event.",
};

// ---------------------------------------------------------------------------
// Action Metrics Page
// ---------------------------------------------------------------------------

export const ACTION_METRICS = {
  totalExecutions:
    "Total action node executions across the selected time period.",
  avgElapsedTime:
    "Average elapsed time per action execution. Lower is better.",
  uniqueNodeKinds:
    "Number of distinct action types executed (HTTP, Flow, Connector, etc.).",
};

export const ACTION_CHARTS = {
  executionTrend:
    "Daily count of action executions over time. Shows action usage patterns.",
  executionsByNodeKind:
    "Breakdown of actions by type (HTTP, Flow, etc.). Shows most used types.",
};

// ---------------------------------------------------------------------------
// Tool Metrics Page
// ---------------------------------------------------------------------------

export const TOOL_METRICS = {
  totalCalls:
    "Total external dependency calls (HTTP, Connectors, Flows, GenAI) from the App Insights dependencies table.",
  uniqueTools: "Number of distinct tools that were called by agents.",
  successRate:
    "Percentage of tool calls that completed successfully.",
  totalFailures: "Number of tool calls that failed or returned errors.",
  avgResponseTime:
    "Average tool response time from the App Insights dependencies table. Lower is better.",
  p90ResponseTime:
    "90th percentile response time - 90% of tool calls are faster than this value.",
};

export const TOOL_CHARTS = {
  callsOverTime:
    "Daily trend of tool invocations over the selected time period.",
  toolTypeDistribution:
    "Breakdown of tool calls by type (Action, Connector, Flow, etc.). Shows which tool types are used most.",
  failuresOverTime:
    "Daily trend of tool failures. Spikes may indicate tool reliability issues.",
  successRateByTool:
    "Success rate percentage per tool. Shows which tools have the highest reliability.",
};

// ---------------------------------------------------------------------------
// Error Details Page
// ---------------------------------------------------------------------------

export const ERROR_METRICS = {
  totalErrors:
    "Total count of OnErrorLog events recorded during the selected time period.",
  uniqueErrorCodes:
    "Number of distinct error codes encountered. More codes may indicate diverse issues.",
  affectedConversations:
    "Sum of daily affected conversation counts. May include duplicates across days or error codes.",
  impactedUsers:
    "Sum of daily affected user counts. May include duplicates across days or error codes.",
};

export const ERROR_CHARTS = {
  errorTrend:
    "Daily error counts over time. Spikes may indicate system issues.",
  topErrorCodes:
    "Top 5 most frequently occurring error codes. Focus debugging efforts here.",
  errorsByChannel:
    "Distribution of errors across different communication channels.",
  impactedUsers:
    "Trend of daily affected users impacted by errors.",
};

// ---------------------------------------------------------------------------
// Transcript Metrics Page
// ---------------------------------------------------------------------------

export const TRANSCRIPT_METRICS = {
  sessions:
    "The total number of conversation sessions with your agent during the selected time period.",
  engaged:
    "Sessions where the user sent at least one message after the agent greeting. Rate is calculated as a percentage of total sessions.",
  resolved:
    "Sessions that were marked as resolved. Rate is calculated as a percentage of total sessions.",
  escalated:
    "Sessions escalated to a human agent. Rate is calculated as a percentage of total sessions.",
  abandoned:
    "Sessions where users left without resolution or escalation. Rate is calculated as a percentage of total sessions.",
  totalTurns: "Average number of message exchanges per conversation session.",
  csatScore:
    "Average customer satisfaction rating from post-conversation surveys.",
  feedbackCount:
    "User feedback reactions (thumbs up/down) received during conversations.",
  runs: "Total number of autonomous agent runs triggered during the selected time period.",
  successfulRuns:
    "Percentage of autonomous runs that completed without errors. Higher is better.",
  avgDuration:
    "Weighted average duration of autonomous agent runs. Calculated across all runs in the selected period.",
};

export const TRANSCRIPT_CHARTS = {
  sessionTrend:
    "Resolved, Escalated, and Abandoned counts with rate percentages and period-over-period trends, alongside a stacked area chart showing how these outcomes change over time.",
  engagementBreakdown: "Distribution of engaged vs unengaged sessions.",
  sessionOutcomes:
    "Distribution of how sessions ended — Resolved, Escalated, or Abandoned.",
  satisfactionScore:
    "Average customer satisfaction score (1-5) from post-conversation surveys. Satisfied: 4-5, Neutral: 3, Dissatisfied: 1-2.",
  connectedAgents:
    "Breakdown of connected agents called during conversations — call counts and success rates aggregated across the selected period.",
};

// ---------------------------------------------------------------------------
// Usage History Page
// ---------------------------------------------------------------------------

export const USAGE_METRICS = {
  billedCredits: "Total billed Copilot credits consumed.",
  nonBilledCredits: "Total non-billed Copilot credits consumed.",
};

export const USAGE_CHARTS = {
  creditConsumption: "Billed and non-billed credit usage trend over time.",
  creditsByEnvironment: "Top 5 environments by billed credit consumption.",
  creditsByFeature: "Credit distribution across features.",
};

// ---------------------------------------------------------------------------
// Add Agent Dialog
// ---------------------------------------------------------------------------

export const ADD_AGENT_FIELDS = {
  agent: "Select an agent for which you want to capture insights. Selecting an agent will auto-fill the Name, Agent Id, and Dataverse URL fields.",
  name: "A friendly display name for this configuration. Must be unique across all configurations. It's recommended to use the agent name.",
  agentName: "The name of the Copilot Studio agent as registered in the environment.",
  agentId: "The unique identifier (GUID) of the Copilot Studio agent. Get the Copilot Id from Copilot Studio portal under Settings > Session Info.",
  dataverseUrl: "The base URL of the Dataverse environment where the agent is deployed (e.g., https://org.crm.dynamics.com).",
  appInsightsAppId: "The Application ID from your Azure Application Insights resource. Found in Azure Portal > Application Insights > API Access.",
  appInsightsTenantId: "The Azure AD Tenant ID where the Application Insights resource is registered. Found in Azure Portal > Microsoft Entra ID > Overview.",
  appInsightsClientId: "The Client ID (Application ID) of the Azure AD app registration used to authenticate with Application Insights.",
  secretLocation: "Where the client secret is stored. Use \"Secret Value\" to enter it directly, or \"Environment Variable\" to reference a Power Platform environment variable.",
  secret: "The client secret value for the Azure AD app registration. This is used to authenticate API calls to Application Insights.",
  environmentVariable: "The name of the Power Platform environment variable that stores the client secret.",
  kpiSource: "Select which data sources to use for generating KPI metrics. Multiple sources can be selected.",
  captureUserDetails: "When enabled, user identity information (name) will be captured from App Insights telemetry logs.",
  captureUserFeedback: "When enabled, end-user satisfaction feedback will be collected from conversations.",
};

// ---------------------------------------------------------------------------
// Tab Descriptions — info icon tooltips for each tab's section header
// ---------------------------------------------------------------------------

export const TAB_DESCRIPTIONS = {
  overview:
    "A high-level summary of how your agents are performing across key areas — conversations, users, response quality, and errors.",
  topics:
    "Understand which topics users engage with most, how often they complete or abandon, and where errors occur.",
  actions:
    "Track how action nodes are performing across your agents — execution volume, speed, and the types of actions being used.",
  tools:
    "Monitor the reliability and speed of external dependencies your agents call during conversations.",
  errors:
    "Identify what's going wrong — which errors are most frequent, how many users are impacted, and how errors trend over time.",
  transcripts:
    "Analyze conversation quality — how users engage, whether sessions get resolved or escalated, and overall satisfaction.",
  usageHistory:
    "Track Copilot credit consumption to understand cost and usage patterns across environments and features.",
  syncLogs:
    "View the execution history of data synchronization flows to monitor whether metrics data is being generated successfully.",
  transcriptsStaging:
    "Monitor the ingestion pipeline for transcript data — check processing status and identify any stuck or failed records.",
};

// ---------------------------------------------------------------------------
// Generate Metrics (Sync) Dialog
// ---------------------------------------------------------------------------

export const SYNC_FIELDS = {
  configuration: "Choose which agent configuration to generate metrics for. Select \"All Agents\" to process all configurations in a single run.",
  startDate: "The beginning of the date range for historical data extraction. Cannot be older than 365 days from today.",
  endDate: "The end of the date range for historical data extraction. Cannot be in the future.",
};
