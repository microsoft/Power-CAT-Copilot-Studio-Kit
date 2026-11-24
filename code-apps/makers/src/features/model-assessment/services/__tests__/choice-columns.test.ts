import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEvaluationRun,
  getEvaluationResults,
  getEvaluationRuns,
  getModelHistory,
  getRunByRequestKey,
  getTrackedAgents,
} from '../model-assessment-service';
import { addTrackedAgent } from '../agent-discovery-service';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    ListRecordsWithOrganization: mocks.list,
    CreateRecordWithOrganization: mocks.create,
  },
}));

const formatted = '@OData.Community.Display.V1.FormattedValue';
const oldColumn = /\bcat_(?:status|analysisstatus|regressionstatus|errorcategory|resultstatus|changetype|sourcestatus)\b/;

describe('code-suffixed Choice column contracts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({ success: true });
  });

  it('reads all seven formatted choices from the replacement columns', async () => {
    const row = {
      cat_trackedagentid: 'agent', cat_evaluationrunid: 'run',
      cat_evaluationresultid: 'result', cat_modelhistoryid: 'history',
      [`cat_sourcestatuscode${formatted}`]: 'Active',
      [`cat_changetypecode${formatted}`]: 'Model Changed',
      [`cat_statuscode${formatted}`]: 'Completed',
      [`cat_analysisstatuscode${formatted}`]: 'Completed',
      [`cat_regressionstatuscode${formatted}`]: 'Critical',
      [`cat_errorcategorycode${formatted}`]: 'External Error',
      [`cat_resultstatuscode${formatted}`]: 'Fail',
    };
    mocks.list.mockResolvedValue({ success: true, data: { value: [row] } });
    expect((await getTrackedAgents())[0].sourceStatus).toBe('Active');
    expect((await getModelHistory())[0].changeType).toBe('Model Changed');
    expect((await getEvaluationRuns())[0]).toMatchObject({
      status: 'Completed', analysisStatus: 'Completed',
      regression: 'Critical', errorCategory: 'External Error',
    });
    expect((await getEvaluationResults())[0].status).toBe('Fail');
    expect(await getRunByRequestKey('request')).toMatchObject({ status: 'Completed' });
    for (const call of mocks.list.mock.calls) {
      expect(call[6]).not.toMatch(oldColumn);
    }
    expect(mocks.list.mock.calls[4][7]).toBe("cat_requestkey eq 'request'");
  });

  it('creates requested runs with unchanged option numbers on new columns', async () => {
    mocks.list.mockResolvedValue({ success: true, data: { value: [{
      cat_trackedagentid: 'agent', cat_name: 'Test agent',
    }] } });
    const [agent] = await getTrackedAgents();
    await createEvaluationRun(agent);
    const body = mocks.create.mock.calls[0][4];
    expect(body).toMatchObject({
      cat_statuscode: 335350001,
      cat_analysisstatuscode: 335350002,
      cat_regressionstatuscode: 335350001,
      'cat_TrackedAgentId@odata.bind': 'cat_trackedagents(agent)',
    });
    expect(JSON.stringify(body)).not.toMatch(oldColumn);
  });

  it('creates tracked agents using the new source-status column', async () => {
    mocks.list.mockResolvedValue({ success: true, data: { value: [{
      configuration: JSON.stringify({
        recognizer: { $kind: 'CLICopilotRecognizer' },
        agentSettings: { model: { series: 'gpt-6-astra' } },
      }),
    }] } });
    await addTrackedAgent({ botId: 'bot', name: 'Test agent', schema: 'test_agent' });
    const body = mocks.create.mock.calls[0][4];
    expect(body.cat_sourcestatuscode).toBe(335350001);
    expect(JSON.stringify(body)).not.toMatch(oldColumn);
  });
});
