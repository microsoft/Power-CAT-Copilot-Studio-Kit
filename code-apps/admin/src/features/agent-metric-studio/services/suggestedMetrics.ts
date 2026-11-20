// Pre-curated metric definitions organized by domain.
// These are displayed in the Domain Cards / Metric Picker Drawer as suggestions
// for one-click onboarding. All data is static — no API calls needed.

import type { AggregationType, MetricCategory, VisualizationType } from '../types';

export interface SuggestedMetric {
  /** Unique key within the catalog (table.field.agg) */
  key: string;
  name: string;
  description: string;
  sourceTable: string;
  sourceField: string;
  aggregation: AggregationType;
  visualizationType: VisualizationType;
  category: MetricCategory;
  /** Whether to seed as Published (true) or Draft (false) */
  publishedByDefault: boolean;
}

export interface MetricDomain {
  id: string;
  label: string;
  description: string;
  icon: string; // Fluent UI icon name
  category: MetricCategory;
  metrics: SuggestedMetric[];
}

export const metricDomains: MetricDomain[] = [
  {
    id: 'adoption',
    label: 'Adoption & Usage',
    description: 'Track how many users and conversations your agents handle daily.',
    icon: 'PeopleTeam',
    category: 'Adoption',
    metrics: [
      { key: 'dailymetrics.dailyconversationcount.sum', name: 'Daily conversations', description: 'Total conversations initiated each day.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_dailyconversationcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'dailymetrics.dailyuniqueusers.sum', name: 'Daily unique users', description: 'Distinct users interacting with agents daily.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_dailyuniqueusers', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'dailymetrics.dailyuniquetopics.sum', name: 'Daily unique topics', description: 'Number of distinct topics triggered per day.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_dailyuniquetopics', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'dailymetrics.dailyuniquetools.sum', name: 'Daily unique tools', description: 'Distinct tools invoked per day.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_dailyuniquetools', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'transcriptmetrics.totalconversations.sum', name: 'Total conversations', description: 'Cumulative conversation count.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_totalconversations', aggregation: 'Sum', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: true },
      { key: 'transcriptmetrics.sessioncount.sum', name: 'Session count', description: 'Total sessions across all agents.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_sessioncount', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'agentusagehistory.users.sum', name: 'Users per agent', description: 'Distinct users per agent over period.', sourceTable: 'cat_agentusagehistory', sourceField: 'cat_users', aggregation: 'Sum', visualizationType: 'Bar', category: 'Adoption', publishedByDefault: true },
      { key: 'agentusagehistory.billedcredits.sum', name: 'Billed credits', description: 'Total billed Copilot credits consumed.', sourceTable: 'cat_agentusagehistory', sourceField: 'cat_billedcopilotcredits', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'agentusagehistory.nonbilledcredits.sum', name: 'Non-billed credits', description: 'Credits consumed outside billing scope.', sourceTable: 'cat_agentusagehistory', sourceField: 'cat_nonbilledcopilotcredits', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: false },
      { key: 'copilotkpi.sessions.sum', name: 'Sessions per conversation', description: 'Sessions aggregated from KPI rows.', sourceTable: 'cat_copilotkpi', sourceField: 'cat_sessions', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: true },
      { key: 'transcriptmetrics.engagedcount.sum', name: 'Engaged conversations', description: 'Conversations where users actively engaged.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_engagedcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Adoption', publishedByDefault: false },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement & Depth',
    description: 'Understand how deeply users interact with your agents.',
    icon: 'ChatMultiple',
    category: 'Conversations',
    metrics: [
      { key: 'copilotkpi.turns.avg', name: 'Turns per conversation', description: 'Average back-and-forth exchanges per conversation.', sourceTable: 'cat_copilotkpi', sourceField: 'cat_turns', aggregation: 'Average', visualizationType: 'KPI', category: 'Conversations', publishedByDefault: true },
      { key: 'copilotkpi.conversationduration.avg', name: 'Conversation duration (sec)', description: 'Average length of conversations.', sourceTable: 'cat_copilotkpi', sourceField: 'cat_conversationduration', aggregation: 'Average', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'conversationanalyzer.messages.avg', name: 'Messages per conversation', description: 'Average messages exchanged per conversation.', sourceTable: 'cat_conversationanalyzer', sourceField: 'cat_messages', aggregation: 'Average', visualizationType: 'KPI', category: 'Conversations', publishedByDefault: true },
      { key: 'conversationanalyzer.durationseconds.avg', name: 'Conversation duration (analyzer)', description: 'Duration measured by conversation analyzer.', sourceTable: 'cat_conversationanalyzer', sourceField: 'cat_conversationdurationseconds', aggregation: 'Average', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'dailymetrics.multiturn.sum', name: 'Multi-turn conversations', description: 'Conversations with more than one turn.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_multiturnconversations', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'dailymetrics.singleturn.sum', name: 'Single-turn conversations', description: 'Conversations completed in a single exchange.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_singleturnconversations', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'dailymetrics.longconversations.sum', name: 'Long conversations', description: 'Conversations exceeding the long threshold.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_longconversations', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: false },
      { key: 'dailymetrics.mediumconversations.sum', name: 'Medium conversations', description: 'Conversations of medium length.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_mediumconversations', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: false },
      { key: 'dailymetrics.shortconversations.sum', name: 'Short conversations', description: 'Brief single-exchange conversations.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_shortconversations', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: false },
      { key: 'dailymetrics.totalusermessages.sum', name: 'Total user messages', description: 'All messages sent by users.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_totalusermessages', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'transcriptmetrics.totalturns.sum', name: 'Total turns', description: 'Aggregate turns across all conversations.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_totalturns', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: false },
      { key: 'topicmetrics.triggercount.sum', name: 'Topic trigger count', description: 'How often each topic is triggered.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_triggercount', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: true },
    ],
  },
  {
    id: 'quality',
    label: 'Quality & Outcomes',
    description: 'Monitor resolution rates, CSAT, and conversation outcomes.',
    icon: 'ShieldCheckmark',
    category: 'Quality',
    metrics: [
      { key: 'copilotkpi.csat.avg', name: 'CSAT score', description: 'Average customer satisfaction score.', sourceTable: 'cat_copilotkpi', sourceField: 'cat_csat', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'copilotkpi.outcome.count', name: 'Conversation outcome', description: 'Breakdown of conversation outcomes (resolved, escalated, abandoned).', sourceTable: 'cat_copilotkpi', sourceField: 'cat_globaloutcomecode', aggregation: 'Count', visualizationType: 'Donut', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.resolvedcount.sum', name: 'Resolved conversations', description: 'Conversations successfully resolved by the agent.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_resolvedcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.escalatedcount.sum', name: 'Escalated conversations', description: 'Conversations escalated to a human agent.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_escalatedcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.abandonedcount.sum', name: 'Abandoned conversations', description: 'Conversations where the user left without resolution.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_abandonedcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.unengagedcount.sum', name: 'Unengaged conversations', description: 'Conversations with minimal user engagement.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_unengagedcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
      { key: 'transcriptmetrics.csatcount.sum', name: 'CSAT response count', description: 'Number of users who provided CSAT feedback.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_csatcount', aggregation: 'Sum', visualizationType: 'KPI', category: 'Quality', publishedByDefault: false },
      { key: 'transcriptmetrics.csatscore.avg', name: 'CSAT score (aggregated)', description: 'Aggregated CSAT across transcript batches.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_csatscore', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.feedbacklikecount.sum', name: 'Feedback likes', description: 'Positive feedback (thumbs up) count.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_feedbacklikecount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'transcriptmetrics.feedbackdislikecount.sum', name: 'Feedback dislikes', description: 'Negative feedback (thumbs down) count.', sourceTable: 'cat_transcriptmetrics', sourceField: 'cat_feedbackdislikecount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'topicmetrics.completionrate.avg', name: 'Topic completion rate', description: 'Percentage of topic flows completed successfully.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_completionrate', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'topicmetrics.completioncount.sum', name: 'Topic completion count', description: 'Number of successfully completed topic flows.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_completioncount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
      { key: 'topicmetrics.abandonmentrate.avg', name: 'Topic abandonment rate', description: 'Percentage of topic flows abandoned by users.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_abandonmentrate', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'topicmetrics.abandonmentcount.sum', name: 'Topic abandonment count', description: 'Number of topic flows abandoned.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_abandonmentcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
    ],
  },
  {
    id: 'performance',
    label: 'Performance & Latency',
    description: 'Monitor response times, percentiles, and errors for SLA tracking.',
    icon: 'Gauge',
    category: 'Performance',
    metrics: [
      { key: 'dailymetrics.mediandurationms.avg', name: 'Median conversation duration (ms)', description: 'Median duration of all conversations.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_mediandurationms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.p95durationms.avg', name: 'P95 conversation duration (ms)', description: '95th percentile conversation duration.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_p95durationms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.totalresponses.sum', name: 'Total responses', description: 'Total agent responses generated.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_totalresponses', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.p50responsetimems.avg', name: 'P50 response time (ms)', description: 'Median response time — typical user experience.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_p50responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.p90responsetimems.avg', name: 'P90 response time (ms)', description: '90th percentile response latency.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_p90responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.p95responsetimems.avg', name: 'P95 response time (ms)', description: '95th percentile response latency.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_p95responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'dailymetrics.p99responsetimems.avg', name: 'P99 response time (ms)', description: '99th percentile — worst-case latency.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_p99responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'dailymetrics.maxresponsetimems.max', name: 'Max response time (ms)', description: 'Maximum single response time observed.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_maxresponsetimems', aggregation: 'Max', visualizationType: 'KPI', category: 'Performance', publishedByDefault: false },
      { key: 'dailymetrics.slowresponses16s.sum', name: 'Slow responses (>16s)', description: 'Responses exceeding the 16-second threshold.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_slowresponses16s', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'dailymetrics.errorcount.sum', name: 'Error count', description: 'Total errors encountered during conversations.', sourceTable: 'cat_dailymetrics', sourceField: 'cat_errorcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'actionmetrics.avgelapsedms.avg', name: 'Action avg elapsed (ms)', description: 'Average time for action node execution.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_avgelapsedms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'actionmetrics.p50elapsedms.avg', name: 'Action P50 elapsed (ms)', description: 'Median action node execution time.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_p50elapsedms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'actionmetrics.p90elapsedms.avg', name: 'Action P90 elapsed (ms)', description: '90th percentile action node latency.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_p90elapsedms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'actionmetrics.p95elapsedms.avg', name: 'Action P95 elapsed (ms)', description: '95th percentile action node latency.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_p95elapsedms', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'actionmetrics.executioncount.sum', name: 'Action execution count', description: 'Total action node executions.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_executioncount', aggregation: 'Sum', visualizationType: 'Bar', category: 'Performance', publishedByDefault: true },
      { key: 'actionmetrics.totalelapsedms.sum', name: 'Action total elapsed (ms)', description: 'Sum of all action execution times.', sourceTable: 'cat_actionmetrics', sourceField: 'cat_totalelapsedms', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
    ],
  },
  {
    id: 'tool-reliability',
    label: 'Tool Reliability',
    description: 'Track tool call success rates, failures, and response times.',
    icon: 'Wrench',
    category: 'Performance',
    metrics: [
      { key: 'toolmetrics.callcount.sum', name: 'Tool call count', description: 'Total tool invocations.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_callcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.successcount.sum', name: 'Tool success count', description: 'Successful tool invocations.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_successcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.failurecount.sum', name: 'Tool failure count', description: 'Failed tool invocations.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_failurecount', aggregation: 'Sum', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.successrate.avg', name: 'Tool success rate', description: 'Percentage of tool calls succeeding.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_successrate', aggregation: 'Average', visualizationType: 'KPI', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.failurerate.avg', name: 'Tool failure rate', description: 'Percentage of tool calls failing.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_failurerate', aggregation: 'Average', visualizationType: 'KPI', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.avgresponsetimems.avg', name: 'Tool avg response time (ms)', description: 'Average tool response latency.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_avgresponsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: true },
      { key: 'toolmetrics.p90responsetimems.avg', name: 'Tool P90 response time (ms)', description: '90th percentile tool latency.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_p90responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'toolmetrics.p95responsetimems.avg', name: 'Tool P95 response time (ms)', description: '95th percentile tool latency.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_p95responsetimems', aggregation: 'Average', visualizationType: 'Line', category: 'Performance', publishedByDefault: false },
      { key: 'toolmetrics.maxresponsetimems.max', name: 'Tool max response time (ms)', description: 'Worst-case tool response time.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_maxresponsetimems', aggregation: 'Max', visualizationType: 'KPI', category: 'Performance', publishedByDefault: false },
      { key: 'toolmetrics.uniqueconversations.sum', name: 'Tool unique conversations', description: 'Distinct conversations using this tool.', sourceTable: 'cat_toolmetrics', sourceField: 'cat_uniqueconversations', aggregation: 'Sum', visualizationType: 'Bar', category: 'Performance', publishedByDefault: false },
    ],
  },
  {
    id: 'topic-analytics',
    label: 'Topic Analytics',
    description: 'Analyze topic-level engagement, errors, and durations.',
    icon: 'BookOpen',
    category: 'Conversations',
    metrics: [
      { key: 'topicmetrics.dailyuniqueconversations.sum', name: 'Topic daily conversations', description: 'Daily unique conversations per topic.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_dailyuniqueconversations', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'topicmetrics.dailyuniqueusers.sum', name: 'Topic daily users', description: 'Daily unique users per topic.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_dailyuniqueusers', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: false },
      { key: 'topicmetrics.errorcount.sum', name: 'Topic error count', description: 'Errors encountered in topic flows.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_errorcount', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: true },
      { key: 'topicmetrics.errorrate.avg', name: 'Topic error rate', description: 'Percentage of topic sessions with errors.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_errorrate', aggregation: 'Average', visualizationType: 'KPI', category: 'Conversations', publishedByDefault: true },
      { key: 'topicmetrics.messagecount.sum', name: 'Topic message count', description: 'Total messages within topic flows.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_messagecount', aggregation: 'Sum', visualizationType: 'Line', category: 'Conversations', publishedByDefault: false },
      { key: 'topicmetrics.mediandurationms.avg', name: 'Topic median duration (ms)', description: 'Median time spent in topic flows.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_mediandurationms', aggregation: 'Average', visualizationType: 'Line', category: 'Conversations', publishedByDefault: false },
      { key: 'topicmetrics.redirectcount.sum', name: 'Topic redirect count', description: 'Times users were redirected from this topic.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_redirectcount', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: false },
      { key: 'topicmetrics.actioncount.sum', name: 'Topic action count', description: 'Action nodes executed within topic flows.', sourceTable: 'cat_topicmetrics', sourceField: 'cat_actioncount', aggregation: 'Sum', visualizationType: 'Bar', category: 'Conversations', publishedByDefault: false },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance & Governance',
    description: 'Monitor PII exposure, sentiment, and compliance status.',
    icon: 'LockClosed',
    category: 'Quality',
    metrics: [
      { key: 'agentcompliance.piiviolationrate.avg', name: 'PII violation rate', description: 'Percentage of transcripts with PII violations.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_perctranscriptsinpiiviolation', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'agentcompliance.lowsentimentrate.avg', name: 'Low sentiment rate', description: 'Percentage of transcripts with negative sentiment.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_perctranscriptswithlowsentiment', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'agentcompliance.sentimentscore.avg', name: 'Sentiment score (monthly avg)', description: 'Monthly average sentiment score across conversations.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_sentimentscoremonthlyaverage', aggregation: 'Average', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'agentcompliance.piiviolationcount.sum', name: 'PII violation count', description: 'Total transcripts with PII violations.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_transcriptspiivioloations', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'agentcompliance.lowsentimentcount.sum', name: 'Low sentiment count', description: 'Total transcripts with low sentiment.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_transcriptswithlowsentiment', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
      { key: 'agentcompliance.sentimenttotaltranscripts.sum', name: 'Sentiment total transcripts', description: 'Total transcripts analyzed for sentiment.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_sentimenttotaltranscripts', aggregation: 'Sum', visualizationType: 'KPI', category: 'Quality', publishedByDefault: false },
      { key: 'agentcompliance.piitotaltranscripts.sum', name: 'PII total transcripts', description: 'Total transcripts analyzed for PII.', sourceTable: 'cat_agentcompliance', sourceField: 'cat_totaltranscripts', aggregation: 'Sum', visualizationType: 'KPI', category: 'Quality', publishedByDefault: false },
    ],
  },
  {
    id: 'agent-quality',
    label: 'Agent Quality',
    description: 'Track agent review scores, patterns, and issues.',
    icon: 'Star',
    category: 'Quality',
    metrics: [
      { key: 'agentreviews.overallscore.avg', name: 'Agent overall score', description: 'Average overall review score for agents.', sourceTable: 'cat_agentreviews', sourceField: 'cat_overallscore', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'agentreviews.patternscore.avg', name: 'Agent pattern score', description: 'Average score for pattern adherence.', sourceTable: 'cat_agentreviews', sourceField: 'cat_patternscore', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'agentreviews.instructionscore.avg', name: 'Agent instruction score', description: 'Average score for instruction following.', sourceTable: 'cat_agentreviews', sourceField: 'cat_instructionscore', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'agentreviews.totalissues.sum', name: 'Total review issues', description: 'Total issues found across agent reviews.', sourceTable: 'cat_agentreviews', sourceField: 'cat_totalissues', aggregation: 'Sum', visualizationType: 'Bar', category: 'Quality', publishedByDefault: true },
      { key: 'agentreviews.highseverityissues.sum', name: 'High severity issues', description: 'Critical issues found in agent reviews.', sourceTable: 'cat_agentreviews', sourceField: 'cat_highseverityissues', aggregation: 'Sum', visualizationType: 'Bar', category: 'Quality', publishedByDefault: true },
      { key: 'agentreviews.failedpatterns.sum', name: 'Failed patterns', description: 'Number of review patterns that failed.', sourceTable: 'cat_agentreviews', sourceField: 'cat_failedpatterns', aggregation: 'Sum', visualizationType: 'Bar', category: 'Quality', publishedByDefault: false },
    ],
  },
  {
    id: 'cost-value',
    label: 'Cost & Value',
    description: 'Understand the business value and classification of agents.',
    icon: 'Money',
    category: 'Cost',
    metrics: [
      { key: 'agentvalue.benefit.count', name: 'Agent value benefit', description: 'Distribution of agents by value/benefit category.', sourceTable: 'cat_agentvalue', sourceField: 'cat_agentvaluebenefit', aggregation: 'Count', visualizationType: 'Donut', category: 'Cost', publishedByDefault: true },
      { key: 'agentvalue.behaviors.count', name: 'Agents by behavior', description: 'Distribution of agents by behavior classification.', sourceTable: 'cat_agentvalue', sourceField: 'cat_agentbehaviors', aggregation: 'Count', visualizationType: 'Donut', category: 'Cost', publishedByDefault: false },
      { key: 'agentvalue.types.count', name: 'Agents by type', description: 'Distribution of agents by type classification.', sourceTable: 'cat_agentvalue', sourceField: 'cat_agenttypes', aggregation: 'Count', visualizationType: 'Donut', category: 'Cost', publishedByDefault: false },
    ],
  },
  {
    id: 'agent-inventory',
    label: 'Agent Inventory',
    description: 'Track your fleet of agents and their feature adoption.',
    icon: 'Bot',
    category: 'Adoption',
    metrics: [
      { key: 'agentdetails.agentid.count', name: 'Total agents', description: 'Total number of registered agents.', sourceTable: 'cat_agentdetails', sourceField: 'cat_agentid', aggregation: 'Count', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: true },
      { key: 'agentdetails.usesgenai.count', name: 'Agents using GenAI', description: 'Agents with generative AI enabled.', sourceTable: 'cat_agentdetails', sourceField: 'cat_usesgenaicode', aggregation: 'Count', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: true },
      { key: 'agentdetails.autonomous.count', name: 'Autonomous agents', description: 'Agents configured for autonomous operation.', sourceTable: 'cat_agentdetails', sourceField: 'cat_autonomousagentcode', aggregation: 'Count', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: true },
      { key: 'agentdetails.usesknowledge.count', name: 'Agents using knowledge sources', description: 'Agents with knowledge base integration.', sourceTable: 'cat_agentdetails', sourceField: 'cat_usesknowledgesourcescode', aggregation: 'Count', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: false },
      { key: 'agentdetails.usestools.count', name: 'Agents using tools', description: 'Agents with tool/plugin integrations.', sourceTable: 'cat_agentdetails', sourceField: 'cat_usestoolscode', aggregation: 'Count', visualizationType: 'KPI', category: 'Adoption', publishedByDefault: false },
    ],
  },
  {
    id: 'agent-testing',
    label: 'Agent Testing',
    description: 'Monitor automated agent test execution, pass rates, and quality scores.',
    icon: 'Beaker',
    category: 'Quality',
    metrics: [
      { key: 'copilottestrun.successrate.avg', name: 'Test run success rate', description: 'Average success rate across test runs.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_successrate', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.id.count', name: 'Total test runs', description: 'Total number of test runs executed.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_copilottestrunid', aggregation: 'Count', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.tests.avg', name: 'Tests per run', description: 'Average number of tests in each run.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_tests', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.success.sum', name: 'Total tests passed', description: 'Sum of successful test results across all runs.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_success', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.failed.sum', name: 'Total tests failed', description: 'Sum of failed test results across all runs.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_failed', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.error.sum', name: 'Total test errors', description: 'Sum of errored test results across all runs.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_error', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestresult.latencyms.avg', name: 'Test result latency (ms)', description: 'Average latency of individual test executions.', sourceTable: 'cat_copilottestresult', sourceField: 'cat_latencyms', aggregation: 'Average', visualizationType: 'Line', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestresult.alignmentpercentage.avg', name: 'Test alignment %', description: 'Average alignment percentage of test results.', sourceTable: 'cat_copilottestresult', sourceField: 'cat_alignmentpercentage', aggregation: 'Average', visualizationType: 'KPI', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestrun.totalcredit.sum', name: 'AI Builder credit per run', description: 'Total AI Builder credits consumed across runs.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_totalaibuildercreditconsumed', aggregation: 'Sum', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
      { key: 'copilottestrun.avglatencyms.avg', name: 'Average run latency (ms)', description: 'Average latency aggregated per test run.', sourceTable: 'cat_copilottestrun', sourceField: 'cat_averagelatencyms', aggregation: 'Average', visualizationType: 'Line', category: 'Quality', publishedByDefault: false },
      { key: 'copilottestresult.resultcode.count', name: 'Test result distribution', description: 'Distribution of test results (pass, fail, error).', sourceTable: 'cat_copilottestresult', sourceField: 'cat_resultcode', aggregation: 'Count', visualizationType: 'Donut', category: 'Quality', publishedByDefault: true },
      { key: 'copilottestresult.aigrade.count', name: 'AI grade distribution', description: 'Distribution of AI grading outcomes.', sourceTable: 'cat_copilottestresult', sourceField: 'cat_aigradecode', aggregation: 'Count', visualizationType: 'Donut', category: 'Quality', publishedByDefault: false },
    ],
  },
];

/** Flat list of all suggested metrics across all domains */
export const allSuggestedMetrics: SuggestedMetric[] = metricDomains.flatMap(d => d.metrics);