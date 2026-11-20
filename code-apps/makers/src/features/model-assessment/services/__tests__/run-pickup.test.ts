import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveRunForAgent, getFlowsTurnedOff } from '../model-assessment-service';
import { EVALUATION_FLOW_NAME, KIT_FLOW_NAME } from '../../contracts/model-assessment';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));

const EVALUATION_FLOW_ID = 'eb45ddbf-02aa-f111-aaab-7ced8d1882b8';
const KIT_FLOW_ID = 'f0ef9a96-d416-49c6-9060-b85cae19ac11';
const status = '@OData.Community.Display.V1.FormattedValue';
const rows = (value: unknown[]) => ({ success: true, data: { value } });

describe('runs the flow never picked up', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reports the evaluation flow when it is turned off', async () => {
    mocks.list.mockResolvedValue(rows([{ workflowid: EVALUATION_FLOW_ID, statecode: 0 }]));
    expect(await getFlowsTurnedOff(false)).toEqual([EVALUATION_FLOW_NAME]);
    expect(mocks.list.mock.calls[0][7]).toBe(`category eq 5 and (workflowid eq ${EVALUATION_FLOW_ID})`);
  });

  it('also checks the Kit flow for Kit assessments', async () => {
    mocks.list.mockResolvedValue(rows([
      { workflowid: EVALUATION_FLOW_ID, statecode: 1 },
      { workflowid: KIT_FLOW_ID, statecode: 2 },
    ]));
    expect(await getFlowsTurnedOff(true)).toEqual([KIT_FLOW_NAME]);
  });

  it('does not block an assessment when the flows cannot be read', async () => {
    mocks.list.mockResolvedValueOnce(rows([]));
    expect(await getFlowsTurnedOff(true)).toEqual([]);
    mocks.list.mockResolvedValueOnce({ success: false });
    expect(await getFlowsTurnedOff(false)).toEqual([]);
    mocks.list.mockResolvedValueOnce(rows([{ workflowid: EVALUATION_FLOW_ID }]));
    expect(await getFlowsTurnedOff(false)).toEqual([]);
    mocks.list.mockResolvedValueOnce(rows([{ workflowid: EVALUATION_FLOW_ID, statecode: '0' }]));
    expect(await getFlowsTurnedOff(false)).toEqual([EVALUATION_FLOW_NAME]);
  });

  it('joins a run in progress rather than a newer request that was never picked up', async () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    mocks.list.mockResolvedValue(rows([
      { cat_evaluationrunid: 'stuck', cat_requestkey: 'stuck', [`cat_statuscode${status}`]: 'Requested', createdon: minutesAgo(5) },
      {
        cat_evaluationrunid: 'running', cat_requestkey: 'running', [`cat_statuscode${status}`]: 'Detecting',
        createdon: minutesAgo(6), cat_startedon: minutesAgo(6),
      },
    ]));
    expect((await getActiveRunForAgent('00000000-0000-0000-0000-000000000001'))?.requestKey).toBe('running');
  });
});
