import { describe, expect, it } from 'vitest';
import {
  clearCopilotReviewRecovery,
  createCopilotReviewRecovery,
  readCopilotReviewRecovery,
  writeCopilotReviewRecovery,
  type CopilotReviewRecoveryStorage,
} from '../services/jobs/copilotReviewRecovery';

class MemoryStorage implements CopilotReviewRecoveryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const input = {
  botId: 'bot-1',
  botName: 'Contoso Helper',
  componentIdUnique: 'component-1',
  orgUrl: 'https://contoso.crm.dynamics.com',
  sourceEnvironment: 'https://contoso.crm.dynamics.com',
  agentVersion: '2026-03-01T10:00:00.000Z',
};

describe('Copilot review restart recovery', () => {
  it('round-trips the active request and workflow job id', () => {
    const storage = new MemoryStorage();
    const recovery = createCopilotReviewRecovery(
      { ...input, existingJobId: 'job-1' },
      'environment-1',
      '/agent-review-tool',
      1_000,
    );

    expect(recovery).not.toBeNull();
    writeCopilotReviewRecovery(recovery!, storage);

    expect(readCopilotReviewRecovery(storage, 2_000)).toEqual(recovery);
  });

  it('does not claim that an in-memory ZIP review can survive app close', () => {
    const recovery = createCopilotReviewRecovery(
      {
        ...input,
        zipData: {
          configuration: 'configuration',
          components: [],
          resources: [],
        },
      },
      null,
      '/agent-review-tool',
      1_000,
    );

    expect(recovery).toBeNull();
  });

  it('removes recovery state after the result is saved or dismissed', () => {
    const storage = new MemoryStorage();
    const recovery = createCopilotReviewRecovery(
      input,
      null,
      '/agent-review-tool',
      1_000,
    );
    writeCopilotReviewRecovery(recovery!, storage);

    clearCopilotReviewRecovery(storage);

    expect(readCopilotReviewRecovery(storage, 2_000)).toBeNull();
  });

  it('discards stale recovery state', () => {
    const storage = new MemoryStorage();
    const recovery = createCopilotReviewRecovery(
      input,
      null,
      '/agent-review-tool',
      1_000,
    );
    writeCopilotReviewRecovery(recovery!, storage);

    expect(
      readCopilotReviewRecovery(storage, 8 * 24 * 60 * 60 * 1000),
    ).toBeNull();
  });
});
