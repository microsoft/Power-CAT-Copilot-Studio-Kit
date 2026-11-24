import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addTrackedAgent } from '../agent-discovery-service';
import { parseAgentConfiguration } from '../model-parser';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    ListRecordsWithOrganization: mocks.list,
    CreateRecordWithOrganization: mocks.create,
  },
}));

const agent = { botId: 'bot-id', name: 'Test agent', schema: 'test_agent' };
const harness = (series?: unknown) => JSON.stringify({
  recognizer: { $kind: 'CLICopilotRecognizer' },
  agentSettings: { model: { series } },
});
const rows = (value: unknown[]) => ({ success: true, data: { value } });

describe('model capture for harness agents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({ success: true });
  });

  it('captures the current harness model without querying classic components', async () => {
    mocks.list.mockResolvedValue(rows([{ configuration: harness(' claude-opus-5 ') }]));
    expect(await addTrackedAgent(agent)).toEqual({ success: true, duplicate: false });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][4].cat_currentmodel).toBe('claude-opus-5');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][4].cat_TrackedAgent_ModelHistory).toEqual([{
      cat_name: 'Baseline - claude-opus-5',
      cat_changetypecode: 335350001,
      cat_currentmodel: 'claude-opus-5',
    }]);
  });

  it('retains component-based detection for standard agents', async () => {
    mocks.list.mockResolvedValueOnce(rows([{ configuration: '{"settings":{"GenerativeActionsEnabled":true}}' }]))
      .mockResolvedValueOnce(rows([{ data: 'modelNameHint: GPT5Reasoning' }]));
    await addTrackedAgent(agent);
    expect(mocks.list.mock.calls[1][1]).toBe('botcomponents');
    expect(mocks.create.mock.calls[0][4].cat_currentmodel).toBe('GPT5Reasoning');
    expect(mocks.create.mock.calls[0][4].cat_TrackedAgent_ModelHistory[0].cat_currentmodel).toBe('GPT5Reasoning');
  });

  it('surfaces an atomic registration failure without retrying a separate history write', async () => {
    mocks.list.mockResolvedValue(rows([{ configuration: harness('gpt-6-astra') }]));
    mocks.create.mockResolvedValue({ success: false, error: 'History creation failed' });
    expect(await addTrackedAgent(agent)).toEqual({ success: false, duplicate: false });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('keeps duplicate registration idempotent', async () => {
    mocks.list.mockResolvedValue(rows([{ configuration: harness('gpt-6-astra') }]));
    mocks.create.mockResolvedValue({ success: false, error: 'Duplicate cat_agentkey' });
    expect(await addTrackedAgent(agent)).toEqual({ success: false, duplicate: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to stale classic metadata for a harness without a model', async () => {
    mocks.list.mockResolvedValue(rows([{ configuration: harness() }]));
    expect(await addTrackedAgent(agent)).toEqual({ success: false, duplicate: false, modelUnavailable: true });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('surfaces malformed JSON and rejects non-string model values', () => {
    expect(() => parseAgentConfiguration('{')).toThrow();
    expect(parseAgentConfiguration(harness(42))).toEqual({ isHarness: true, model: undefined });
    expect(parseAgentConfiguration(null)).toEqual({ isHarness: false });
  });
});
