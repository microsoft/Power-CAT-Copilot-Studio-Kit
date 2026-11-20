import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelPublishFailure, useModelUpdating, useUpdateAgentModel } from '../useModelUpdate';
import { AgentModelPublishError, type ModelOption } from '../../services/model-update-service';
import { useKitSettingsSaving, useSaveKitSettings } from '../useKitTests';
import type { KitSettingsVM, TrackedAgentVM } from '../../contracts/model-assessment';

interface MutationOptions {
  mutationKey: readonly string[];
  mutationFn: (option: ModelOption) => Promise<void>;
  onSettled: () => Promise<unknown>;
  gcTime: number;
}

interface KitMutationOptions {
  mutationKey: readonly string[];
  mutationFn: (settings: KitSettingsVM) => Promise<void>;
  onSuccess: (data: void, settings: KitSettingsVM) => Promise<unknown>;
}

type AgentCacheUpdater = (agents: TrackedAgentVM[] | undefined) => TrackedAgentVM[] | undefined;

const mocks = vi.hoisted(() => ({
  mutation: vi.fn<(options: MutationOptions) => void>(),
  kitMutation: vi.fn<(options: KitMutationOptions) => void>(),
  saveKit: vi.fn(),
  cache: vi.fn<(key: readonly string[], updater: AgentCacheUpdater) => void>(),
  update: vi.fn(),
  invalidate: vi.fn(),
  mutating: vi.fn(),
  state: vi.fn(),
}));

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({ MicrosoftDataverseService: {} }));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: MutationOptions | KitMutationOptions) =>
    'onSuccess' in options ? mocks.kitMutation(options) : mocks.mutation(options),
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate, setQueryData: mocks.cache }),
  useIsMutating: mocks.mutating,
  useMutationState: mocks.state,
}));
vi.mock('../../services/model-update-service', async (original) => ({
  ...await original<typeof import('../../services/model-update-service')>(),
  updateAgentModel: mocks.update,
}));
vi.mock('../../services/model-assessment-service', () => ({
  getKitOptions: vi.fn(),
  getKitProgress: vi.fn(),
  saveKitSettings: mocks.saveKit,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.saveKit.mockResolvedValue(undefined);
  mocks.mutating.mockReturnValue(0);
  mocks.state.mockReturnValue([]);
});

describe('model update hooks', () => {
  it.each([true, false])('passes the selected evaluation mode to the model service (Kit: %s)', async (kitMode) => {
    useUpdateAgentModel('bot', false, kitMode);
    const options = mocks.mutation.mock.calls[0][0];
    const model = { code: 'GPT41' };
    await options.mutationFn(model);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('bot', false, model, kitMode);
    expect(options.mutationKey).toEqual(['mat', 'update-model', 'bot']);
    expect(options.gcTime).toBe(Infinity);
    await options.onSettled();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['mat', 'live-models'] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['mat', 'kit-options'] });
  });

  it('keeps the assessment locked for the duration of the model mutation', () => {
    mocks.mutating.mockReturnValue(1);
    expect(useModelUpdating('bot')).toBe(true);
    expect(mocks.mutating).toHaveBeenCalledWith({ mutationKey: ['mat', 'update-model', 'bot'] });
    mocks.mutating.mockReturnValue(0);
    expect(useModelUpdating('bot')).toBe(false);
  });

  it('retains the latest publication failure and its retry model for the selected agent', () => {
    const failure = new AgentModelPublishError({ code: 'GPT41' }, new Error('Publishing failed.'));
    mocks.state.mockReturnValue([null, failure]);
    expect(useModelPublishFailure('bot')).toBe(failure);
    expect(mocks.state).toHaveBeenCalledWith({
      filters: { mutationKey: ['mat', 'update-model', 'bot'] },
      select: expect.any(Function),
    });
  });

  it('clears publication failures after a retry starts or succeeds', () => {
    const failure = new AgentModelPublishError({ code: 'GPT41' }, new Error('Publishing failed.'));
    mocks.state.mockReturnValue([failure, null]);
    expect(useModelPublishFailure('bot')).toBeUndefined();
  });

  it('does not mistake a model save error for a failed publication', () => {
    mocks.state.mockReturnValue([new Error('Saving failed.')]);
    expect(useModelPublishFailure('bot')).toBeUndefined();
  });

  it('tracks evaluation-mode saving until the saved agent settings have been refreshed', async () => {
    useSaveKitSettings('agent');
    const options = mocks.kitMutation.mock.calls[0][0];
    const settings = { enabled: true };
    expect(options.mutationKey).toEqual(['mat', 'kit-settings', 'agent']);
    await options.mutationFn(settings);
    expect(mocks.saveKit).toHaveBeenCalledExactlyOnceWith('agent', settings);
    let finish!: () => void;
    mocks.invalidate.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    let refreshed = false;
    const refresh = options.onSuccess(undefined, settings).then(() => { refreshed = true; });
    await Promise.resolve();
    expect(refreshed).toBe(false);
    expect(mocks.cache).toHaveBeenCalledWith(['mat', 'tracked-agents'], expect.any(Function));
    const agent: TrackedAgentVM = {
      id: 'agent', name: 'Agent', schema: 'agent', sourceStatus: 'Active',
      regression: 'Not Assessed', lastRunStatus: 'None', pass: 0, fail: 0, error: 0, excluded: 0,
      kit: { enabled: false },
    };
    const unchanged = { ...agent, id: 'other' };
    const updated = mocks.cache.mock.calls[0][1]([agent, unchanged]);
    expect(updated?.[0].kit).toEqual(settings);
    expect(updated?.[1]).toBe(unchanged);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['mat', 'tracked-agents'] });
    finish();
    await refresh;
    expect(refreshed).toBe(true);
  });

  it('keeps model changes blocked while evaluation settings are saving', () => {
    mocks.mutating.mockReturnValue(1);
    expect(useKitSettingsSaving('agent')).toBe(true);
    expect(mocks.mutating).toHaveBeenCalledWith({ mutationKey: ['mat', 'kit-settings', 'agent'] });
    mocks.mutating.mockReturnValue(0);
    expect(useKitSettingsSaving('agent')).toBe(false);
  });
});
