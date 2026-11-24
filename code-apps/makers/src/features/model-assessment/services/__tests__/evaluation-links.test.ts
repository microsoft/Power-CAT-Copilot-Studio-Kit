import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAssessmentEvaluationLinks } from '../evaluation-links';

const mocks = vi.hoisted(() => ({ list: vi.fn(), bot: vi.fn(), context: vi.fn(), baseUrl: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));
vi.mock('@microsoft/power-apps/app', () => ({ getContext: mocks.context }));
vi.mock('../../../../shared/services/copilotStudioUrl', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../shared/services/copilotStudioUrl')>(),
  getConfiguredCopilotStudioBaseUrl: mocks.baseUrl,
}));

const botId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherBot = '00000000-0000-0000-0000-000000000001';
const evaluationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const environmentId = '00000000-0000-0000-0000-000000000000';
const component = (overrides: Record<string, unknown> = {}) => ({
  botcomponentid: evaluationId, name: 'MODELCHECK Cx Case Agent',
  _parentbotid_value: botId, componenttype: 19,
  data: 'kind: EvaluationSet\nname: Evaluation',
  ...overrides,
});
const respond = (value: unknown[]) => mocks.list.mockImplementation((_org: string, entity: string) =>
  entity === 'bots' ? mocks.bot() : Promise.resolve({ success: true, data: { value } }),
);

describe('assessment evaluation links', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ app: { environmentId } });
    mocks.baseUrl.mockResolvedValue('https://copilotstudio.microsoft.com');
    mocks.bot.mockResolvedValue({ success: true, data: { value: [{ configuration: '{}' }] } });
    respond([component()]);
  });

  it('resolves the configuration component ID under its parent bot, not an execution ID', async () => {
    const links = await getAssessmentEvaluationLinks(botId);
    const url = `https://copilotstudio.microsoft.com/environments/${environmentId}/bots/${botId}/evaluation/configsDetails/${evaluationId}`;
    expect(links).toEqual({ [evaluationId]: url, 'modelcheck cx case agent': url });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[0][0]).toBe('current');
    expect(mocks.list.mock.calls[1][1]).toBe('botcomponents');
    expect(mocks.list.mock.calls[1][7]).toBe(`_parentbotid_value eq ${botId} and componenttype eq 19`);
  });

  it('hides GitHub harness evaluation links without requesting configurations or URL context', async () => {
    mocks.bot.mockResolvedValue({
      success: true,
      data: { value: [{ configuration: '{"recognizer":{"$kind":"CLICopilotRecognizer"}}' }] },
    });
    const links = await getAssessmentEvaluationLinks(botId);
    expect(links).toEqual({});
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list.mock.calls[0][1]).toBe('bots');
    expect(mocks.list.mock.calls[0][7]).toBe(`botid eq ${botId}`);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.baseUrl).not.toHaveBeenCalled();
  });

  it('does not guess the bots route when agent type lookup fails or the agent is missing', async () => {
    mocks.bot.mockResolvedValue({ success: false });
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('Failed to load the agent type');
    mocks.bot.mockResolvedValue({ success: true, data: { value: [] } });
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('agent configuration is unavailable');
    mocks.bot.mockResolvedValue({ success: true, data: { value: [{ configuration: '{bad' }] } });
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow();
  });

  it('normalizes names and honors the configured sovereign cloud host', async () => {
    mocks.baseUrl.mockResolvedValue('https://high.powerva.microsoft.us/');
    respond([component({ name: '  MODELCHECK Cx Case Agent  ', _parentbotid_value: botId.toUpperCase() })]);
    const links = await getAssessmentEvaluationLinks(botId);
    expect(links['modelcheck cx case agent']).toBe(
      `https://high.powerva.microsoft.us/environments/${environmentId}/bots/${botId}/evaluation/configsDetails/${evaluationId}`,
    );
  });

  it('ignores evaluation data, legacy cases, other agents and unnamed non-set payloads', async () => {
    respond([
      component({ data: 'kind: EvaluationData' }),
      component({ componenttype: 18 }),
      component({ _parentbotid_value: otherBot }),
      component({ data: null }),
      component({ data: 'kind: TestCaseDefinition', name: null }),
    ]);
    expect(await getAssessmentEvaluationLinks(botId)).toEqual({});
  });

  it('links sets that share a name by set id only, and keeps uniquely named sets', async () => {
    respond([
      component(),
      component({ name: ' MODELCHECK cx case agent ', botcomponentid: otherBot }),
      component({ name: 'Unique evaluation', botcomponentid: '00000000-0000-0000-0000-000000000002' }),
    ]);
    const links = await getAssessmentEvaluationLinks(botId);
    expect(Object.hasOwn(links, 'modelcheck cx case agent')).toBe(false);
    expect(Object.keys(links).sort()).toEqual([evaluationId, otherBot, '00000000-0000-0000-0000-000000000002', 'unique evaluation'].sort());
  });

  it('does not mistake repeated copies of the same component for multiple configurations', async () => {
    respond([component(), component({ botcomponentid: evaluationId.toUpperCase() })]);
    expect(Object.keys(await getAssessmentEvaluationLinks(botId))).toEqual([evaluationId, 'modelcheck cx case agent']);
  });

  it('supports names that are also object prototype keys without creating phantom links', async () => {
    respond([component({ name: '__proto__' })]);
    const links = await getAssessmentEvaluationLinks(botId);
    expect(Object.hasOwn(links, '__proto__')).toBe(true);
    expect(Object.hasOwn(links, 'constructor')).toBe(false);
  });

  it('rejects invalid bot IDs before making requests', async () => {
    await expect(getAssessmentEvaluationLinks("x' or true")).rejects.toThrow('valid Copilot Studio agent ID');
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('surfaces connector and context failures', async () => {
    mocks.list.mockImplementation((_org: string, entity: string) =>
      entity === 'bots' ? mocks.bot() : Promise.resolve({ success: false }),
    );
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('Failed to load evaluation configurations');
    respond([]);
    mocks.context.mockResolvedValue({ app: {} });
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('environment ID is unavailable');
    mocks.context.mockRejectedValue(new Error('Context failed'));
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('Context failed');
  });

  it('rejects malformed or incomplete result pages rather than guessing uniqueness', async () => {
    mocks.list.mockImplementation((_org: string, entity: string) =>
      entity === 'bots' ? mocks.bot() : Promise.resolve({ success: true, data: {} }),
    );
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('invalid evaluation configuration list');
    mocks.list.mockImplementation((_org: string, entity: string) => entity === 'bots' ? mocks.bot() : Promise.resolve({
      success: true, data: { value: [component()], '@odata.nextLink': 'next-page' },
    }));
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('list is incomplete');
  });

  it('reports malformed configuration metadata and invalid set identifiers', async () => {
    respond([component({ data: 'kind: [broken' })]);
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('Unable to read evaluation metadata');
    respond([component({ botcomponentid: 'missing-id' })]);
    await expect(getAssessmentEvaluationLinks(botId)).rejects.toThrow('missing a valid ID or name');
  });
});
