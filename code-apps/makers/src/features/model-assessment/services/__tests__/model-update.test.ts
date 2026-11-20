import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentModelPublishError, modelOptionsFor, setModelInGptYaml, updateAgentModel } from '../model-update-service';
import { engineFix, type EligibleAgent } from '../agent-eligibility-service';

const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), publish: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    UpdateRecordWithOrganization: mocks.update,
    PerformBoundActionWithOrganization: mocks.publish,
  },
}));
vi.mock('../../../../shared/services/dataversePaging', () => ({ listDataverseRows: mocks.list }));

const GPT = [
  'kind: GptComponentMetadata',
  'instructions: |-',
  '  Answer politely.',
  '  model: keep this line',
  'aISettings:',
  '  model:',
  '    kind: PreviewModels',
  '    modelNameHint: GPT5Reasoning',
  'gptCapabilities:',
  '  webBrowsing: true',
  '',
].join('\r\n');

const BOT_ID = '11111111-1111-4111-8111-111111111111';
const PUBLISHED_ON = '2026-10-23T12:00:00Z';
const component = { botcomponentid: 'component', schemaname: 'cr_agent.gpt.default', data: GPT };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockImplementation(async (_organization: string, entitySet: string) =>
    entitySet === 'bots' ? [{ publishedon: PUBLISHED_ON }] : [component]);
  mocks.update.mockResolvedValue({ success: true });
  mocks.publish.mockResolvedValue({ success: true, data: {} });
});

afterEach(() => vi.useRealTimers());

describe('updateAgentModel', () => {
  it('saves Copilot Studio evaluation changes without publishing or reading publication state', async () => {
    await updateAgentModel(BOT_ID, false, { code: 'GPT41' });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('current', 'botcomponents', expect.any(Object));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('keeps harness changes save-only', async () => {
    mocks.list.mockResolvedValue([{ configuration: '{"agentSettings":{"model":{"series":"Auto"}}}' }]);
    await updateAgentModel(BOT_ID, true, { code: 'GPT5Chat' });
    expect(mocks.update).toHaveBeenCalledWith(
      'return=minimal', 'application/json', 'current', 'bots', BOT_ID,
      { configuration: '{"agentSettings":{"model":{"$kind":"ModelConfig","series":"GPT5Chat"}}}' },
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('publishes only after a Kit model save and waits for publication to change', async () => {
    vi.useFakeTimers();
    mocks.list
      .mockResolvedValueOnce([{ publishedon: PUBLISHED_ON }])
      .mockResolvedValueOnce([component])
      .mockResolvedValueOnce([{ publishedon: PUBLISHED_ON }])
      .mockResolvedValueOnce([{ publishedon: '2026-10-23T12:01:00Z' }]);
    let finished = false;
    const saving = updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(
      'current', 'bots', 'Microsoft.Dynamics.CRM.PvaPublish', BOT_ID,
    );
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await saving;
    expect(finished).toBe(true);
  });

  it('confirms publication for an agent that has never been published', async () => {
    mocks.list
      .mockResolvedValueOnce([{ publishedon: null }])
      .mockResolvedValueOnce([component])
      .mockResolvedValueOnce([{ publishedon: PUBLISHED_ON }]);
    await updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true);
    expect(mocks.publish).toHaveBeenCalledOnce();
  });

  it('does not publish when saving the model fails', async () => {
    mocks.update.mockResolvedValue({ success: false });
    await expect(updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true)).rejects.toThrow('Could not save');
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([42, 'invalid'])('rejects malformed publication state before changing the model: %s', async (publishedon) => {
    mocks.list.mockResolvedValue([{ publishedon }]);
    await expect(updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true)).rejects.toThrow('invalid agent publication timestamp');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([
    { success: false, error: { message: 'Publish permission denied.' } },
    new Error('Publish permission denied.'),
  ])('preserves the failed model and publishing error for a retry: %s', async (response) => {
    if (response instanceof Error) mocks.publish.mockRejectedValue(response);
    else mocks.publish.mockResolvedValue(response);
    const option = { code: 'GPT41' };
    const saving = updateAgentModel(BOT_ID, false, option, true);
    await expect(saving).rejects.toBeInstanceOf(AgentModelPublishError);
    await expect(saving).rejects.toMatchObject({ option, message: expect.stringContaining('Publish permission denied.') });
  });

  it('fails explicitly if publication cannot be read', async () => {
    mocks.list
      .mockResolvedValueOnce([{ publishedon: PUBLISHED_ON }])
      .mockResolvedValueOnce([component])
      .mockRejectedValueOnce(new Error('Publication status could not be loaded.'));
    await expect(updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true))
      .rejects.toThrow('Publication status could not be loaded.');
  });

  it('does not treat an accepted publish request as success when publication never changes', async () => {
    vi.useFakeTimers();
    const saving = updateAgentModel(BOT_ID, false, { code: 'GPT41' }, true);
    const failure = expect(saving).rejects.toThrow('not confirmed within five minutes');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await failure;
  });

  it('rejects invalid agent IDs and unsupported Kit harness publishing before changing the agent', async () => {
    await expect(updateAgentModel('invalid', false, { code: 'GPT41' }, true)).rejects.toThrow('valid Copilot Studio agent ID');
    await expect(updateAgentModel(BOT_ID, true, { code: 'GPT5Chat' }, true)).rejects.toThrow('do not support Copilot harness');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe('setModelInGptYaml', () => {
  it('replaces only the model block and drops kind for generally available models', () => {
    const next = setModelInGptYaml(GPT, { code: 'GPT41' });
    expect(next).toBe(GPT.replace(/\r\n/g, '\n')
      .replace('  model:\n    kind: PreviewModels\n    modelNameHint: GPT5Reasoning', '  model:\n    modelNameHint: GPT41'));
  });

  it('writes the release channel for preview models', () => {
    expect(setModelInGptYaml(GPT, { code: 'GPT5Auto', kind: 'PreviewModels' }))
      .toContain('aISettings:\n  model:\n    kind: PreviewModels\n    modelNameHint: GPT5Auto\ngptCapabilities:');
  });

  it('adds the model settings when the agent has none', () => {
    expect(setModelInGptYaml('kind: GptComponentMetadata\ninstructions: Hi\n', { code: 'Sonnet46' }))
      .toBe('kind: GptComponentMetadata\ninstructions: Hi\naISettings:\n  model:\n    modelNameHint: Sonnet46\n');
  });

  it('refuses settings it cannot edit safely', () => {
    expect(() => setModelInGptYaml('aISettings: { model: { modelNameHint: GPT41 } }\n', { code: 'Opus47' })).toThrow();
  });
});

describe('modelOptionsFor', () => {
  const codes = (harness: boolean, current?: string) => modelOptionsFor(harness, current).map((o) => o.code);

  it('offers the list for the agent\'s harness', () => {
    expect(codes(true)).toContain('gpt-6-luna');
    expect(codes(true)).not.toContain('GPT41');
    expect(codes(false)).toContain('GPT41');
    expect(codes(false)).not.toContain('gpt-6-luna');
  });

  it('keeps a listed current model in place, whatever its casing', () => {
    expect(codes(false, 'opus48')).toEqual(codes(false));
  });

  it('puts an unlisted current model first so it can be shown as selected', () => {
    expect(codes(true, 'GPT7Preview')).toEqual(['GPT7Preview', ...codes(true)]);
  });

  it('does not offer Fable models, but still shows one an agent already uses', () => {
    expect(codes(true).some((c) => /fable/i.test(c))).toBe(false);
    expect(codes(true, 'Fable5')).toEqual(['Fable5', ...codes(true)]);
  });

  it('leaves out preview and experimental models when the environment turns them off', () => {
    const offered = modelOptionsFor(false, 'Opus48', false);
    expect(offered.every((o) => !o.kind)).toBe(true);
    expect(offered.map((o) => o.code)).toContain('GPT41');
  });

  it('still shows a current preview model as preview when preview models are off', () => {
    const [first, ...rest] = modelOptionsFor(false, 'gpt5reasoning', false);
    expect(first).toEqual({ code: 'GPT5Reasoning', kind: 'PreviewModels' });
    expect(rest.every((o) => !o.kind)).toBe(true);
  });

  it('no longer offers GPT-5.5 Chat, but still shows it for an agent that uses it', () => {
    expect(codes(false)).not.toContain('GPT55Chat');
    expect(codes(true)).not.toContain('GPT55Chat');
    expect(codes(true, 'gpt55chat')).toEqual(['gpt55chat', ...codes(true)]);
  });
});

const eligible = (over: Partial<EligibleAgent> = {}): EligibleAgent => ({
  botId: 'b', name: 'Agent', schema: 'cr_agent', harness: false, copilot: false, kit: false,
  kitConfigurationIds: [], ...over,
});

describe('engineFix', () => {
  it('switches an agent with only Kit tests to Kit and binds its only configuration', () => {
    expect(engineFix(undefined, eligible({ kit: true, kitConfigurationIds: ['c1'] })))
      .toEqual({ enabled: true, configurationId: 'c1' });
  });

  it('switches back to Copilot Studio when the Kit configuration is gone', () => {
    expect(engineFix({ enabled: true, configurationId: 'c1' }, eligible({ copilot: true }))).toEqual({ enabled: false });
  });

  it('keeps the maker\'s choice when the agent has both engines', () => {
    const both = eligible({ copilot: true, kit: true, kitConfigurationIds: ['c1', 'c2'] });
    expect(engineFix({ enabled: false }, both)).toBeUndefined();
    expect(engineFix({ enabled: true, configurationId: 'c2', testSetId: 't' }, both)).toBeUndefined();
  });
});
