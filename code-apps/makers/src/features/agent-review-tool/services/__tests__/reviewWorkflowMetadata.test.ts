import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getContext, getEnvironments, listRecords } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getEnvironments: vi.fn(),
  listRecords: vi.fn(),
}));
vi.mock('@microsoft/power-apps/app', () => ({ getContext }));
vi.mock('../../../../generated/services/PowerAppsforMakersService', () => ({
  PowerAppsforMakersService: { Get_Environments: getEnvironments },
}));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: listRecords },
}));

import {
  getReviewServiceOrganizationUrl,
  readReviewMetadataRows,
} from '../reviewWorkflowMetadata';

const environmentId = '00000000-0000-0000-0000-000000000000';
const organizationUrl = 'https://review-service.crm.dynamics.com';

beforeEach(() => {
  vi.resetAllMocks();
  getContext.mockResolvedValue({
    app: {
      environmentId,
      queryParams: { mda_org_url: 'https://selected-source.crm.dynamics.com' },
    },
  });
  getEnvironments.mockResolvedValue({
    success: true,
    data: {
      value: [
        {
          name: 'some-other-environment',
          properties: {
            linkedEnvironmentMetadata: { instanceUrl: 'https://selected-source.crm.dynamics.com' },
          },
        },
        {
          name: environmentId,
          properties: { linkedEnvironmentMetadata: { instanceUrl: `${organizationUrl}/` } },
        },
      ],
    },
  });
  listRecords.mockResolvedValue({ success: true, data: { value: [] } });
});

describe('review-service organization resolution', () => {
  it('uses the host environment ID, not an MDA parameter or selected source', async () => {
    expect(await getReviewServiceOrganizationUrl()).toBe(organizationUrl);
  });

  it('does not use the first available environment when the host ID is missing', async () => {
    getContext.mockResolvedValue({ app: {} });
    await expect(getReviewServiceOrganizationUrl()).rejects.toThrow('app environment');
    expect(getEnvironments).not.toHaveBeenCalled();
  });

  it('rejects an environment that is not returned for the user', async () => {
    getContext.mockResolvedValue({ app: { environmentId: 'unavailable-environment' } });
    await expect(getReviewServiceOrganizationUrl()).rejects.toThrow('could not be resolved');
  });

  it.each([
    { success: false, error: { message: '403: environment access denied' } },
    { success: 'false', data: { value: [] } },
    { success: 'true', data: { value: [] } },
    { success: true },
    { success: true, data: { value: null } },
    { success: true, data: { value: [null] } },
  ])('rejects failed or malformed environment responses', async (response) => {
    getEnvironments.mockResolvedValue(response);
    await expect(getReviewServiceOrganizationUrl()).rejects.toThrow();
  });

  it.each([
    'http://review-service.crm.dynamics.com',
    'https://user:password@review-service.crm.dynamics.com',
    'https://review-service.crm.dynamics.com/api/data/v9.2',
    'https://review-service.crm.dynamics.com?source=other',
  ])('rejects an invalid organization URL %s', async (instanceUrl) => {
    getEnvironments.mockResolvedValue({
      success: true,
      data: {
        value: [{
          name: environmentId,
          properties: { linkedEnvironmentMetadata: { instanceUrl } },
        }],
      },
    });
    await expect(getReviewServiceOrganizationUrl()).rejects.toThrow('invalid Dataverse URL');
  });
});

describe('metadata reads', () => {
  it('uses an explicit organization URL and a bounded query', async () => {
    await expect(readReviewMetadataRows(
      organizationUrl, 'solutions', 'uniquename', "uniquename eq 'AgentReviewWorkflow'",
    )).resolves.toEqual([]);
    expect(listRecords).toHaveBeenCalledWith(
      organizationUrl, 'solutions',
      undefined, undefined, undefined, undefined,
      'uniquename', "uniquename eq 'AgentReviewWorkflow'",
      undefined, undefined, undefined, 2,
    );
  });

  it.each([
    { success: false, error: { message: '403: missing privilege' } },
    { success: 'false', data: { value: [] } },
    { success: 'true', data: { value: [] } },
    { success: true },
    { success: true, data: {} },
    { success: true, data: { value: 'not a row list' } },
    { success: true, data: { value: [null] } },
  ])('does not convert a failed or malformed read into absence', async (response) => {
    listRecords.mockResolvedValue(response);
    await expect(readReviewMetadataRows(
      organizationUrl, 'solutions', 'uniquename', "uniquename eq 'AgentReviewWorkflow'",
    )).rejects.toThrow('Read solutions');
  });
});
