/**
 * React Query key factory for Agent Insights Hub.
 *
 * Hierarchical keys with scalar primitives ensure proper cache invalidation
 * and deduplication. ConfigId is a GUID (not agentName) per B-1.
 */

export const queryKeys = {
  all: ['agent-insights-hub'] as const,

  agentConfigurations: () =>
    [...queryKeys.all, 'configurations'] as const,

  agentDetails: () =>
    [...queryKeys.all, 'agent-details'] as const,

  dailyMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'daily-metrics', configId, startDate, endDate, channel, dataMode] as const,

  topicMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'topics', configId, startDate, endDate, channel, dataMode] as const,

  actionMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'actions', configId, startDate, endDate, channel, dataMode] as const,

  toolMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'tools', configId, startDate, endDate, channel, dataMode] as const,

  errorDetails: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'errors', configId, startDate, endDate, channel, dataMode] as const,

  transcriptMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'transcripts', configId, startDate, endDate, channel, dataMode] as const,

  usageHistory: (
    env: string,
    agent: string,
    startDate: string,
    endDate: string,
    feature: string,
  ) =>
    [...queryKeys.all, 'usage-history', env, agent, startDate, endDate, feature] as const,

  previousDailyMetrics: (
    configId: string,
    startDate: string,
    endDate: string,
    channel: string,
    dataMode: string,
  ) =>
    [...queryKeys.all, 'previous-daily-metrics', configId, startDate, endDate, channel, dataMode] as const,

  syncLogs: () =>
    [...queryKeys.all, 'sync-logs'] as const,

  transcriptStaging: (workflowStatus: string) =>
    [...queryKeys.all, 'transcript-staging', workflowStatus] as const,
} as const;
