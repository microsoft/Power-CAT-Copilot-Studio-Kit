import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOrganizations, getEnvironments } = vi.hoisted(() => ({
  getOrganizations: vi.fn(),
  getEnvironments: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
}));

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    GetOrganizations: getOrganizations,
  },
}));

vi.mock('../../../../generated/services/PowerAppsforMakersService', () => ({
  PowerAppsforMakersService: {
    Get_Environments: getEnvironments,
  },
}));

import { useOrganizations } from '../useOrganizations';

describe('useOrganizations', () => {
  beforeEach(() => {
    getOrganizations.mockReset();
    getEnvironments.mockReset();
  });

  it('adds the Power Platform environment ID to each Dataverse organization option', async () => {
    const organizationUrl = 'https://contoso.crm.dynamics.com';
    const environmentId = '00000000-0000-0000-0000-000000000000';
    getOrganizations.mockResolvedValue({
      data: {
        value: [{
          Url: organizationUrl,
          FriendlyName: 'ZAVA development',
        }],
      },
    });
    getEnvironments.mockResolvedValue({
      data: {
        value: [{
          name: environmentId,
          properties: {
            displayName: 'ZAVA development',
            linkedEnvironmentMetadata: {
              instanceUrl: `${organizationUrl}/`,
            },
          },
        }],
      },
    });

    const query = useOrganizations() as unknown as {
      queryFn: () => Promise<Array<{
        Url?: string;
        FriendlyName?: string;
        EnvironmentId?: string;
      }>>;
    };

    await expect(query.queryFn()).resolves.toEqual([{
      Url: organizationUrl,
      FriendlyName: 'ZAVA development',
      EnvironmentId: environmentId,
    }]);
    expect(getEnvironments).toHaveBeenCalledWith('2022-11-01', 250);
  });
});
