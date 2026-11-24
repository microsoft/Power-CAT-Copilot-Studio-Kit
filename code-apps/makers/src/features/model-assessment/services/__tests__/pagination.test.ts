import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEvaluationResults, getEvaluationRuns, getModelHistory, getTrackedAgents } from '../model-assessment-service';
import { listAgentsInCurrentEnv } from '../agent-discovery-service';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));

beforeEach(() => vi.resetAllMocks());

describe('complete Dataverse reads', () => {
  it.each([
    { name: 'results', read: getEvaluationResults }, { name: 'runs', read: getEvaluationRuns },
    { name: 'history', read: getModelHistory }, { name: 'agents', read: getTrackedAgents },
  ])(
    'follows every page for $name, preserving the query and decoding the token once',
    async ({ read }) => {
      const token = '<cookie page="2" value="a+b%20"/>';
      const next = `https://org.crm.dynamics.com/api/data/v9.2/rows?$skiptoken=${encodeURIComponent(token)}`;
      mocks.list.mockResolvedValueOnce({ success: true, data: { value: [{}], '@odata.nextLink': next } })
        .mockResolvedValueOnce({ success: true, data: { value: [{}] } });
      expect(await read()).toHaveLength(2);
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(mocks.list.mock.calls[1].slice(0, 12)).toEqual(mocks.list.mock.calls[0].slice(0, 12));
      expect(mocks.list.mock.calls[1][12]).toBe(token);
    },
  );

  it('supports connector-wrapped continuation links', async () => {
    const token = 'page 2 + cookie';
    const inner = `rows?$skiptoken=${encodeURIComponent(token)}`;
    mocks.list.mockResolvedValueOnce({
      success: true, data: { value: [], '@odata.nextLink': `https://connector/nextLink?next=${encodeURIComponent(inner)}` },
    }).mockResolvedValueOnce({ success: true, data: { value: [{ cat_evaluationresultid: 'last' }] } });
    expect((await getEvaluationResults()).map(row => row.id)).toEqual(['last']);
    expect(mocks.list.mock.calls[1][12]).toBe(token);
  });

  it('retains the result beyond the 5000-row page boundary', async () => {
    const first = Array.from({ length: 5000 }, (_, index) => ({ cat_evaluationresultid: `result-${index}` }));
    mocks.list.mockResolvedValueOnce({
      success: true, data: { value: first, '@odata.nextLink': 'https://org/rows?$skiptoken=page2' },
    }).mockResolvedValueOnce({
      success: true, data: { value: [{ cat_evaluationresultid: 'last', cat_resultstatuscode: 'Error' }] },
    });
    const results = await getEvaluationResults();
    expect(results).toHaveLength(5001);
    expect(results[5000]).toMatchObject({ id: 'last', status: 'Error' });
  });

  it('rejects a later page failure rather than returning partial results', async () => {
    mocks.list.mockResolvedValueOnce({
      success: true, data: { value: [{}], '@odata.nextLink': 'https://org/rows?$skiptoken=page2' },
    }).mockResolvedValueOnce({ success: false });
    await expect(getEvaluationResults()).rejects.toThrow('Failed to load');
  });

  it.each(['https://org/rows?invalid=2', 42])('rejects an unusable continuation %s', async next => {
    mocks.list.mockResolvedValue({ success: true, data: { value: [], '@odata.nextLink': next } });
    await expect(getEvaluationResults()).rejects.toThrow(/continuation/i);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('rejects repeated tokens instead of looping or duplicating pages', async () => {
    mocks.list.mockResolvedValue({
      success: true, data: { value: [{}], '@odata.nextLink': 'https://org/rows?$skiptoken=same' },
    });
    await expect(getEvaluationResults()).rejects.toThrow(/continuation/i);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, {}, { value: null }, { value: [null] }])('rejects malformed rows: %j', async data => {
    mocks.list.mockResolvedValue({ success: true, data });
    await expect(getEvaluationResults()).rejects.toThrow(/invalid/i);
  });
});

describe('discovery failures', () => {
  it('rejects an unsuccessful connector response instead of an empty agent list', async () => {
    mocks.list.mockResolvedValue({ success: false });
    await expect(listAgentsInCurrentEnv()).rejects.toThrow('Failed to load bots');
  });

  it('retains a genuinely empty successful discovery result', async () => {
    mocks.list.mockResolvedValue({ success: true, data: { value: [] } });
    expect(await listAgentsInCurrentEnv()).toEqual([]);
  });

  it('includes agents regardless of their orchestration mode', async () => {
    mocks.list.mockResolvedValue({
      success: true,
      data: {
        value: [
          { botid: 'classic', name: 'Classic', configuration: '{"settings":{"GenerativeActionsEnabled":false}}' },
          { botid: 'unset', name: 'Unset', configuration: '{}' },
          { botid: 'generative', name: 'Generative', configuration: '{"settings":{"GenerativeActionsEnabled":true}}' },
        ],
      },
    });
    expect((await listAgentsInCurrentEnv()).map((agent) => agent.botId)).toEqual(['classic', 'generative', 'unset']);
  });
});
