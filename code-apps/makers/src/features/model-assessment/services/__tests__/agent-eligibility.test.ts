import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), agents: vi.fn() }));
vi.mock('../../../../shared/services/dataversePaging', () => ({ listDataverseRows: mocks.list }));
vi.mock('../agent-discovery-service', () => ({
  listAgentsInCurrentEnv: mocks.agents,
  addTrackedAgent: vi.fn(),
}));
vi.mock('../model-assessment-service', () => ({ saveKitSettings: vi.fn() }));

import { listEligibleAgents } from '../agent-eligibility-service';
import { ENTITY_SET } from '../../contracts/model-assessment';

describe('listEligibleAgents', () => {
  beforeEach(() => vi.resetAllMocks());

  it('queries active evaluation test sets by name only while retaining pipeline-enabled Kit eligibility', async () => {
    const evaluationAgent = { botId: 'evaluation-agent', name: 'Evaluation agent', schema: 'evaluation' };
    const kitAgent = { botId: 'kit-agent', name: 'Kit agent', schema: 'kit' };
    mocks.agents.mockResolvedValue([
      evaluationAgent,
      kitAgent,
      { botId: 'unmarked-agent', name: 'Unmarked agent', schema: 'unmarked' },
    ]);
    mocks.list.mockImplementation(async (_org: string, entitySet: string) =>
      entitySet === 'botcomponents'
        ? [{ _parentbotid_value: evaluationAgent.botId }]
        : [{ cat_copilotconfigurationid: 'configuration', cat_agentidentifier: kitAgent.schema }]);

    expect(await listEligibleAgents()).toEqual([
      { ...evaluationAgent, harness: false, copilot: true, kit: false, kitConfigurationIds: [] },
      { ...kitAgent, harness: false, copilot: false, kit: true, kitConfigurationIds: ['configuration'] },
    ]);
    expect(mocks.list).toHaveBeenCalledWith('current', 'botcomponents', {
      select: '_parentbotid_value',
      filter: "componenttype eq 19 and statecode eq 0 and _parentbotcomponentid_value eq null"
        + " and contains(name,'MODELCHECK')",
    });
    expect(mocks.list).toHaveBeenCalledWith('current', ENTITY_SET.kitConfiguration, {
      select: 'cat_copilotconfigurationid,cat_agentidentifier',
      filter: 'cat_ispipelineenabled eq true and statecode eq 0',
      orderby: 'createdon desc',
    });
  });
});
