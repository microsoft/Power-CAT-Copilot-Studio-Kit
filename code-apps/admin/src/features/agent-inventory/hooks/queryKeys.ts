export const agentInventoryKeys = {
  all: ['agent-inventory'] as const,
  agents: () => [...agentInventoryKeys.all, 'agents'] as const,
  usage: (startIso: string) => [...agentInventoryKeys.all, 'usage', startIso] as const,
  detail: (id: string) => [...agentInventoryKeys.all, 'detail', id] as const,
  userSearch: (term: string) => [...agentInventoryKeys.all, 'user-search', term] as const,
  syncStatus: () => [...agentInventoryKeys.all, 'sync-status'] as const,
  lastSync: () => [...agentInventoryKeys.all, 'last-sync'] as const,
  syncProgress: () => [...agentInventoryKeys.all, 'sync-progress'] as const,
  complianceProgress: () => [...agentInventoryKeys.all, 'compliance-progress'] as const,
  actionCompletion: (scope: string) => [...agentInventoryKeys.all, 'action-completion', scope] as const,
  resumeTracking: () => [...agentInventoryKeys.all, 'resume-tracking'] as const,
  detailUsage: (id: string) =>
    [...agentInventoryKeys.all, 'detail', id, 'usage'] as const,
  generatedDescription: (id: string) =>
    [...agentInventoryKeys.all, 'detail', id, 'generated-description'] as const,
  settingsRoot: () => [...agentInventoryKeys.all, 'settings'] as const,
  settings: () => [...agentInventoryKeys.settingsRoot(), 'record'] as const,
  settingsGroups: () => [...agentInventoryKeys.settingsRoot(), 'groups'] as const,
  settingsEnvironments: () => [...agentInventoryKeys.settingsRoot(), 'environments'] as const,
  settingsProcesses: () => [...agentInventoryKeys.settingsRoot(), 'processes'] as const,
};
