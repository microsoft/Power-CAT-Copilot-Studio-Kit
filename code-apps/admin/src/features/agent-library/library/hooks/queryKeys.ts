/**
 * React Query key factory for Component Library feature.
 *
 * Hierarchical keys with scalar primitives ensure proper cache invalidation
 * and deduplication across queries.
 */

export const queryKeys = {
  all: ['component-library'] as const,

  installedSolutions: () => [...queryKeys.all, 'installed-solutions'] as const,

  componentCatalog: () => [...queryKeys.all, 'component-catalog'] as const,

  userPrivilege: () => [...queryKeys.all, 'user-privilege'] as const,

  agentList: () => [...queryKeys.all, 'agent-list'] as const,

  organizations: () => [...queryKeys.all, 'organizations'] as const,
} as const;
