import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listRecords } = vi.hoisted(() => ({
  listRecords: vi.fn(),
}));

vi.mock('@microsoft/power-apps/app', () => ({
  getContext: vi.fn().mockResolvedValue({
    app: {
      environmentId: '11111111-1111-1111-1111-111111111111',
      environmentUrl: 'https://host.crm.dynamics.com',
    },
  }),
}));

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    ListRecords: listRecords,
  },
}));

import { resolveAgentEnvironmentId } from '../services/agentEnvironment';

describe('resolveAgentEnvironmentId', () => {
  beforeEach(() => {
    listRecords.mockReset();
    listRecords.mockResolvedValue({ data: { value: [] } });
  });

  it('uses the environment selected before the review without scanning agent details', async () => {
    const selectedEnvironmentId = '00000000-0000-0000-0000-000000000000';

    await expect(
      resolveAgentEnvironmentId(
        'https://contoso.crm.dynamics.com',
        selectedEnvironmentId,
      ),
    ).resolves.toBe(selectedEnvironmentId);
    expect(listRecords).not.toHaveBeenCalled();
  });

  it('limits the legacy fallback lookup to the reviewed agent', async () => {
    const agentId = 'a1aaaaaa-aaaa-4aaa-9aaa-000000000012';
    const selectedEnvironmentId = '00000000-0000-0000-0000-000000000000';
    listRecords.mockImplementation(async (...args: unknown[]) => ({
      data: {
        value: args[5] === `cat_agentid eq '${agentId}'`
          ? [{
              cat_agentid: agentId,
              cat_environmentid: selectedEnvironmentId,
              cat_environmenturl: 'https://contoso.crm.dynamics.com',
            }]
          : [],
      },
    }));

    const resolveWithAgentId = resolveAgentEnvironmentId as (
      reviewedOrgUrl: string | null,
      routeEnvironmentId: string | null,
      reviewedAgentId: string,
    ) => Promise<string | null>;

    await expect(
      resolveWithAgentId(
        'https://contoso.crm.dynamics.com',
        null,
        agentId,
      ),
    ).resolves.toBe(selectedEnvironmentId);
    expect(listRecords).toHaveBeenCalledWith(
      'cat_agentdetailses',
      undefined,
      undefined,
      undefined,
      'cat_agentid,cat_environmentid,cat_environmenturl',
      `cat_agentid eq '${agentId}'`,
      undefined,
      undefined,
      undefined,
      5,
    );
  });
});
