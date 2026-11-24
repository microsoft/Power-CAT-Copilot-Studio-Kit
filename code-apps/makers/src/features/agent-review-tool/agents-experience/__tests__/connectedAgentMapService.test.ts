import { describe, expect, it, vi } from 'vitest';
import type { BotComponent, IBotService } from '../../contracts/ServiceContracts';
import { loadConnectedAgentMapSnapshot } from '../services/agent-map/connectedAgentMapService';

vi.mock('../../services/BotService', () => ({ botService: {} }));

const connectedSkill: BotComponent = {
  botcomponentid: 'skill-id',
  botid: 'd3aaaaaa-aaaa-4aaa-aaaa-000000000015',
  componenttype: '9',
  content: '',
  data: [
    'kind: InlineAgentSkill',
    'content: |-',
    '  ---',
    '  name: store-price',
    '  description: Looks up a store price.',
    '  ---',
    '  # Store price',
  ].join('\n'),
  name: 'store-price',
  componentidunique: 'skill-unique',
  schemaname: 'cr306_zavastoreopsassistant_lmpyHR.skill.store-price',
};

describe('connected agent map service', () => {
  it('resolves by schema and parses the target botcomponents', async () => {
    const service: Pick<IBotService, 'getBotBySchemaName' | 'getBotComponents'> = {
      getBotBySchemaName: vi.fn().mockResolvedValue({
        botId: 'd3aaaaaa-aaaa-4aaa-aaaa-000000000015',
        name: 'ZAVA Store Ops Assistant',
        schemaName: 'cr306_zavastoreopsassistant_lmpyHR',
        configuration: JSON.stringify({ agentSettings: { enableMemory: true } }),
      }),
      getBotComponents: vi.fn().mockResolvedValue([connectedSkill]),
    };

    const snapshot = await loadConnectedAgentMapSnapshot(
      'cr306_zavastoreopsassistant_lmpyHR',
      'https://contoso.crm.dynamics.com',
      service,
    );

    expect(snapshot.agentId).toBe('d3aaaaaa-aaaa-4aaa-aaaa-000000000015');
    expect(snapshot.model.skills).toHaveLength(1);
    expect(service.getBotComponents).toHaveBeenCalledWith(
      'd3aaaaaa-aaaa-4aaa-aaaa-000000000015',
      'https://contoso.crm.dynamics.com',
      { throwOnError: true },
    );
  });

  it('surfaces a missing target instead of returning an empty success snapshot', async () => {
    const service: Pick<IBotService, 'getBotBySchemaName' | 'getBotComponents'> = {
      getBotBySchemaName: vi.fn().mockResolvedValue(null),
      getBotComponents: vi.fn(),
    };

    await expect(loadConnectedAgentMapSnapshot('missing.agent', null, service)).rejects.toThrow(
      'No active published agent matched schema "missing.agent".',
    );
    expect(service.getBotComponents).not.toHaveBeenCalled();
  });
});
