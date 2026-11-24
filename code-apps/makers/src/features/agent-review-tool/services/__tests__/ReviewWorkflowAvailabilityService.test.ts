import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../reviewWorkflowMetadata', () => ({
  getReviewServiceOrganizationUrl: vi.fn(),
  readReviewMetadataRows: vi.fn(),
}));

import {
  assertReviewWorkflowAvailable,
  getReviewWorkflowAvailability,
} from '../ReviewWorkflowAvailabilityService';
import {
  getReviewServiceOrganizationUrl,
  readReviewMetadataRows,
} from '../reviewWorkflowMetadata';

const organizationUrl = 'https://review-service.crm.dynamics.com';
const workflowId = '71b31233-076b-facf-68e6-6a8b67a7d075';
let installed = true;
let workflows: Record<string, unknown>[];
let components: Record<string, unknown>[];

beforeEach(() => {
  vi.resetAllMocks();
  installed = true;
  workflows = [{ workflowid: workflowId, statecode: 1 }];
  components = [];
  vi.mocked(getReviewServiceOrganizationUrl).mockResolvedValue(organizationUrl);
  vi.mocked(readReviewMetadataRows).mockImplementation(async (_orgUrl, table) => {
    switch (table) {
      case 'environmentvariabledefinitions':
      case 'environmentvariablevalues':
        return [];
      case 'solutions':
        return installed
          ? [{ solutionid: 'addon', uniquename: 'AgentReviewWorkflow', version: '1.0.0.0' }]
          : [];
      case 'workflows':
        return workflows;
      case 'solutioncomponents':
        return components;
      default:
        throw new Error(`Unexpected table: ${table}`);
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getReviewWorkflowAvailability', () => {
  it('keeps installation separate from workflow and connection readiness', async () => {
    const result = await getReviewWorkflowAvailability();
    expect(result).toMatchObject({
      status: 'available',
      installation: 'installed',
      connectionReadiness: 'not-verified',
      addonVersion: '1.0.0.0',
    });
  });

  it('preserves the active workflow from a core-only legacy installation', async () => {
    installed = false;
    const result = await getReviewWorkflowAvailability();
    expect(result).toMatchObject({
      status: 'available',
      installation: 'legacy',
      connectionReadiness: 'not-verified',
    });
    await expect(assertReviewWorkflowAvailable()).resolves.toBeUndefined();
  });

  it('reports a missing add-on only after successful absence checks', async () => {
    installed = false;
    workflows = [];
    const result = await getReviewWorkflowAvailability();
    expect(result.status).toBe('missing-addon');
    await expect(assertReviewWorkflowAvailable()).rejects.toMatchObject({
      code: 'workflow-unavailable',
      message: expect.stringContaining('Agent Review Workflow add-on'),
    });
  });

  it('does not call an unreadable legacy workflow missing', async () => {
    installed = false;
    workflows = [];
    components = [{ objectid: workflowId }];
    const result = await getReviewWorkflowAvailability();
    expect(result.status).toBe('unverifiable');
    expect(result.installation).toBe('legacy');
  });

  it('reports an installed add-on with no readable workflow separately', async () => {
    workflows = [];
    const result = await getReviewWorkflowAvailability();
    expect(result.status).toBe('workflow-not-found');
    expect(result.installation).toBe('installed');
  });

  it.each([0, 2, '0', '2'])('blocks a disabled workflow with state %s', async (statecode) => {
    workflows[0].statecode = statecode;
    expect((await getReviewWorkflowAvailability()).status).toBe('workflow-disabled');
    await expect(assertReviewWorkflowAvailable()).rejects.toMatchObject({
      code: 'workflow-unavailable',
    });
  });

  it('accepts the numeric-string state returned by some SDK versions', async () => {
    workflows[0].statecode = '1';
    expect((await getReviewWorkflowAvailability()).status).toBe('available');
  });

  it('blocks multiple review workers instead of choosing one', async () => {
    workflows.push({
      workflowid: '7b38b4f3-b7ea-4ad3-a21f-829661540937',
      statecode: 1,
    });
    expect((await getReviewWorkflowAvailability()).status).toBe('workflow-conflict');
  });

  it.each([
    { message: '403: missing Read Solution privilege' },
    { message: 'Network request failed' },
    { message: "Resource not found for the segment 'workflows'" },
  ])('keeps lookup failure unverifiable: $message', async (error) => {
    vi.mocked(readReviewMetadataRows).mockRejectedValue(new Error(error.message));
    const result = await getReviewWorkflowAvailability();
    expect(result.status).toBe('unverifiable');
    expect(result.message).not.toMatch(/not installed/i);
    expect(result.detail).toContain(error.message);
  });

  it.each([undefined, null, 'Activated', 99])('rejects invalid workflow state %s', async (statecode) => {
    workflows[0].statecode = statecode;
    expect((await getReviewWorkflowAvailability()).status).toBe('unverifiable');
  });

  it('rechecks the worker on every submission instead of retaining Ready', async () => {
    await assertReviewWorkflowAvailable();
    workflows[0].statecode = 0;
    await expect(assertReviewWorkflowAvailable()).rejects.toMatchObject({
      code: 'workflow-unavailable',
    });
  });

  it.each([
    'https://review-service.crm9.dynamics.com',
    'https://review-service.crm.microsoftdynamics.us',
    'https://review-service.crm.appsplatform.us',
  ])('does not offer add-on installation in government cloud %s', async (url) => {
    vi.mocked(getReviewServiceOrganizationUrl).mockResolvedValue(url);
    expect((await getReviewWorkflowAvailability()).status).toBe('unsupported-cloud');
    expect(readReviewMetadataRows).not.toHaveBeenCalled();
  });

  it('honors the configured GCC endpoint in the review-service environment', async () => {
    vi.mocked(readReviewMetadataRows).mockImplementation(async (_url, table) => {
      if (table === 'environmentvariabledefinitions') {
        return [{ environmentvariabledefinitionid: workflowId, defaultvalue: 'GCC' }];
      }
      if (table === 'environmentvariablevalues') return [];
      throw new Error('A government review must not query a worker');
    });
    expect((await getReviewWorkflowAvailability()).status).toBe('unsupported-cloud');
  });

  it('bounds the check and permits a fresh retry after a timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(getReviewServiceOrganizationUrl).mockImplementationOnce(
      () => new Promise<string>(() => undefined),
    );
    const pending = getReviewWorkflowAvailability();
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).status).toBe('unverifiable');
    expect((await getReviewWorkflowAvailability()).status).toBe('available');
  });

  it('uses only the review-service organization for every metadata lookup', async () => {
    await getReviewWorkflowAvailability();
    for (const [url] of vi.mocked(readReviewMetadataRows).mock.calls) {
      expect(url).toBe(organizationUrl);
    }
    const solutionCall = vi.mocked(readReviewMetadataRows).mock.calls.find(
      ([, table]) => table === 'solutions',
    );
    expect(solutionCall?.[3]).toBe("uniquename eq 'AgentReviewWorkflow'");
  });
});
