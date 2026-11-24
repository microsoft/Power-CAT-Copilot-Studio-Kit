/**
 * React Query key factory for the Conversation Analyzer feature.
 *
 * Hierarchical keys with primitive params ensure correct cache invalidation
 * and deduplication. Period is encoded as a stable string (the resolved ISO
 * `from`/`to` pair) so changing the active time period busts the cache while
 * tab switches reuse it.
 */

export const queryKeys = {
  all: ['conversation-analyzer'] as const,

  // Dashboard tab
  summary: (period: string) =>
    [...queryKeys.all, 'summary', period] as const,
  coverage: (period: string) =>
    [...queryKeys.all, 'coverage', period] as const,
  activityTrends: (period: string) =>
    [...queryKeys.all, 'activity-trends', period] as const,
  aiConsumption: (period: string) =>
    [...queryKeys.all, 'ai-consumption', period] as const,

  // Agents tab
  agentsKpis: (period: string) =>
    [...queryKeys.all, 'agents-kpis', period] as const,
  agentsTable: (
    period: string,
    search: string,
    status: string,
    sort: string,
    page?: number,
    pageSize?: number,
  ) =>
    [...queryKeys.all, 'agents-table', period, search, status, sort, ...(page != null ? [page, pageSize] : [])] as const,
  agentHealth: (period: string) =>
    [...queryKeys.all, 'agent-health', period] as const,

  // Custom Analysis Insights tab
  promptsKpis: (period: string) =>
    [...queryKeys.all, 'prompts-kpis', period] as const,
  promptsTable: (
    period: string,
    search: string,
    status: string,
    sort: string,
    page: number,
    pageSize: number,
  ) =>
    [...queryKeys.all, 'prompts-table', period, search, status, sort, page, pageSize] as const,
  featuredPrompts: (period: string) =>
    [...queryKeys.all, 'featured-prompts', period] as const,

  // Dashboard previews
  agentSummaryPreview: (period: string) =>
    [...queryKeys.all, 'agent-summary-preview', period] as const,

  // Conversations tab
  conversationAnalysisRun: () =>
    [...queryKeys.all, 'conversation-batch-analysis'] as const,
  conversationEnvironments: () =>
    [...queryKeys.all, 'conversation-browser', 'environments'] as const,
  conversationAgents: (environmentUrl: string) =>
    [...queryKeys.all, 'conversation-browser', 'agents', environmentUrl] as const,
  conversationTranscripts: (
    environmentUrl: string,
    agentId: string,
    search: string,
    searchAgentIds: readonly string[],
    sortColumn: string,
    sortDirection: string,
  ) =>
    [
      ...queryKeys.all,
      'conversation-browser',
      'transcripts',
      environmentUrl,
      agentId,
      search,
      searchAgentIds,
      sortColumn,
      sortDirection,
    ] as const,
  conversationTranscriptCount: (
    environmentUrl: string,
    agentId: string,
    search: string,
    searchAgentIds: readonly string[],
  ) =>
    [
      ...queryKeys.all,
      'conversation-browser',
      'transcript-count',
      environmentUrl,
      agentId,
      search,
      searchAgentIds,
    ] as const,
  conversationTranscriptContent: (environmentUrl: string, transcriptId: string) =>
    [...queryKeys.all, 'conversation-browser', 'transcript-content', environmentUrl, transcriptId] as const,

  // Sub-screens (Phase 4)
  agentMeta: (agentId: string, environmentUrl: string) =>
    [...queryKeys.all, 'agent-meta', agentId, environmentUrl] as const,
  transcripts: (agentId: string, search: string) =>
    [...queryKeys.all, 'transcripts', agentId, search] as const,
  analysisResults: (agentId: string, environmentUrl: string) =>
    [...queryKeys.all, 'analysis-results', agentId, environmentUrl] as const,
  analysisResultDetail: (conversationAnalyzerId: string) =>
    [...queryKeys.all, 'analysis-result-detail', conversationAnalyzerId] as const,
  conversationTranscript: (conversationTranscriptId: string) =>
    [...queryKeys.all, 'conversation-transcript', conversationTranscriptId] as const,
  promptsAll: (search: string, page: number, pageSize: number) =>
    [...queryKeys.all, 'prompts-all', search, page, pageSize] as const,
  systemPromptText: (modelName: string) =>
    [...queryKeys.all, 'system-prompt-text', modelName] as const,
} as const;
