import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAssessmentAgentUrl } from '../agent-links';

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  buildUrl: vi.fn(),
}));
vi.mock('@microsoft/power-apps/app', () => ({ getContext: mocks.getContext }));
vi.mock('../../../agent-change-tracker/services/agent-links', () => ({
  buildCopilotStudioAgentUrl: mocks.buildUrl,
}));

describe('assessment agent links', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the original bot ID and runtime environment with the existing link builder', async () => {
    mocks.getContext.mockResolvedValue({ app: { environmentId: 'environment-id' } });
    mocks.buildUrl.mockResolvedValue('https://copilotstudio.microsoft.com/agent');
    expect(await getAssessmentAgentUrl('bot-id')).toBe('https://copilotstudio.preview.microsoft.com/agent');
    expect(mocks.buildUrl).toHaveBeenCalledWith({
      agentId: 'bot-id',
      environmentId: 'environment-id',
      environmentUrl: 'current',
    });
  });

  it('drops the overview page from classic agent links', async () => {
    mocks.getContext.mockResolvedValue({ app: { environmentId: 'environment-id' } });
    mocks.buildUrl.mockResolvedValue('https://copilotstudio.microsoft.com/environments/e/bots/b/overview');
    expect(await getAssessmentAgentUrl('b')).toBe('https://copilotstudio.preview.microsoft.com/environments/e/bots/b');
  });

  it('keeps sovereign-cloud hosts instead of switching them to preview', async () => {
    mocks.getContext.mockResolvedValue({ app: { environmentId: 'environment-id' } });
    mocks.buildUrl.mockResolvedValue('https://gcc.powerva.microsoft.us/environments/e/agents/a');
    expect(await getAssessmentAgentUrl('a')).toBe('https://gcc.powerva.microsoft.us/environments/e/agents/a');
  });

  it('reports missing identifiers instead of returning a broken link', async () => {
    mocks.getContext.mockResolvedValue({ app: {} });
    mocks.buildUrl.mockResolvedValue(null);
    await expect(getAssessmentAgentUrl('bot-id')).rejects.toThrow('identifier is unavailable');
  });

  it('propagates context failures to the query error state', async () => {
    mocks.getContext.mockRejectedValue(new Error('Context unavailable'));
    await expect(getAssessmentAgentUrl('bot-id')).rejects.toThrow('Context unavailable');
    expect(mocks.buildUrl).not.toHaveBeenCalled();
  });
});
