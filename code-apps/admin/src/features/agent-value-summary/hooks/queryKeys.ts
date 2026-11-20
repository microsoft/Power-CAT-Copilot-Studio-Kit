/**
 * React Query key factory for Agent Value Summary.
 *
 * Hierarchical keys ensure proper cache invalidation and deduplication.
 */

export const agentValueQueryKeys = {
  all: ['agent-value-summary'] as const,
  agentValues: () => [...agentValueQueryKeys.all, 'values'] as const,
  agentDetails: () => [...agentValueQueryKeys.all, 'agent-details'] as const,
  syncStatus: () => [...agentValueQueryKeys.all, 'sync-status'] as const,
};
