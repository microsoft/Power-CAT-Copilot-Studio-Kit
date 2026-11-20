import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isKitActive,
  type EvaluationRunVM,
  type KitRunVM,
  type KitSettingsVM,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import {
  getKitOptions,
  getKitProgress,
  saveKitSettings,
} from '../services/model-assessment-service';

const PROGRESS_POLL_MS = 15_000;
const kitSettingsKey = (agentId: string) => ['mat', 'kit-settings', agentId] as const;
/** How long after an assessment finishes to keep checking for the Kit flow to start. */
export const KIT_START_WINDOW_MS = 5 * 60_000;

const norm = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Run statuses at which the Kit flow starts (or records a skip). For agents in
 * Kit mode it starts as soon as a model change is confirmed ("Evaluation
 * Running"), so every later status is included too.
 */
const KIT_TRIGGER_STATUSES = new Set([
  'evaluationrunning', 'evaluationcompleted',
  'completed', 'completedwitherrors', 'nochange', 'noevaluationsconfigured',
]);

/** A model change was confirmed recently and the Kit flow has not picked it up yet. */
export function isAwaitingKitStart(
  run: EvaluationRunVM | undefined,
  kitEnabled: boolean,
  now = Date.now(),
): boolean {
  if (!run || run.kit || !kitEnabled || !KIT_TRIGGER_STATUSES.has(norm(run.status))) return false;
  const finished = Date.parse(run.completedOn ?? '');
  return Number.isNaN(finished) || now - finished < KIT_START_WINDOW_MS;
}

export function shouldPollKit(run: EvaluationRunVM | undefined, kitEnabled: boolean): boolean {
  if (!run) return false;
  if (run.kit) return isKitActive(run.kit.status);
  return isAwaitingKitStart(run, kitEnabled);
}

export function useKitOptions(agent: TrackedAgentVM, enabled: boolean) {
  return useQuery({
    queryKey: ['mat', 'kit-options', agent.id, agent.schema, agent.copilotAgentId],
    queryFn: () => getKitOptions(agent),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSaveKitSettings(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: kitSettingsKey(agentId),
    mutationFn: (settings: KitSettingsVM) => saveKitSettings(agentId, settings),
    onSuccess: (_, settings) => {
      queryClient.setQueryData<TrackedAgentVM[]>(['mat', 'tracked-agents'], (agents) =>
        agents?.map((agent) => agent.id === agentId
          ? { ...agent, kit: { ...agent.kit, ...settings } }
          : agent));
      return queryClient.invalidateQueries({ queryKey: ['mat', 'tracked-agents'] });
    },
  });
}

export function useKitSettingsSaving(agentId: string): boolean {
  return useIsMutating({ mutationKey: kitSettingsKey(agentId) }) > 0;
}

/** Live "x of y tests" progress of a running Kit track. */
export function useKitProgress(kit: KitRunVM | undefined) {
  const running = norm(kit?.status) === 'running';
  const query = useQuery({
    queryKey: ['mat', 'kit-progress', kit?.testRunId],
    queryFn: () => getKitProgress(kit!.testRunId!),
    enabled: running && Boolean(kit?.testRunId),
    refetchInterval: running ? PROGRESS_POLL_MS : false,
  });
  return running ? query.data : undefined;
}
