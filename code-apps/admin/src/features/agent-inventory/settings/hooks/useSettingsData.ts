import { useMutation, useQuery } from '@tanstack/react-query';
import { agentInventoryKeys } from '../../hooks/queryKeys';
import type { EnvironmentGroupInput, SettingsSaveRequest } from '../contracts/types';
import { EnvironmentCatalogService } from '../services/EnvironmentCatalogService';
import { EnvironmentGroupService } from '../services/EnvironmentGroupService';
import { InventoryProcessService } from '../services/InventoryProcessService';
import { InventorySettingsService } from '../services/InventorySettingsService';
import { SettingsSaveService } from '../services/SettingsSaveService';

export function useSettingsData() {
  const settingsQuery = useQuery({
    queryKey: agentInventoryKeys.settings(),
    queryFn: () => InventorySettingsService.get(),
  });
  const groupsQuery = useQuery({
    queryKey: agentInventoryKeys.settingsGroups(),
    queryFn: () => EnvironmentGroupService.list(),
  });
  const environmentsQuery = useQuery({
    queryKey: agentInventoryKeys.settingsEnvironments(),
    queryFn: () => EnvironmentCatalogService.list(),
    staleTime: 10 * 60 * 1000,
  });
  const processesQuery = useQuery({
    queryKey: agentInventoryKeys.settingsProcesses(),
    queryFn: () => InventoryProcessService.list(),
  });
  return { settingsQuery, groupsQuery, environmentsQuery, processesQuery };
}

export function useSaveSettings() {
  return useMutation({
    mutationFn: (request: SettingsSaveRequest) => SettingsSaveService.save(request),
  });
}

export function useEnvironmentGroupMutations() {
  const create = useMutation({ mutationFn: EnvironmentGroupService.create });
  const update = useMutation({ mutationFn: EnvironmentGroupService.update });
  const remove = useMutation({ mutationFn: EnvironmentGroupService.delete });
  return {
    create,
    update,
    remove,
    save(input: EnvironmentGroupInput) {
      return input.id ? update.mutateAsync(input) : create.mutateAsync(input);
    },
  };
}
