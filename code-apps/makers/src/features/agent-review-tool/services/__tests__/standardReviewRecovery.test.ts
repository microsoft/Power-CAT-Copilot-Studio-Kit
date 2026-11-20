import { describe, expect, it } from 'vitest';
import {
  clearStandardReviewRecovery,
  createStandardReviewRecovery,
  readStandardReviewRecovery,
  writeStandardReviewRecovery,
  type StandardReviewRecoveryStorage,
} from '../standardReviewRecovery';

class MemoryStorage implements StandardReviewRecoveryStorage {
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
  botId: 'standard-bot-1',
  botName: 'Workshop Helper',
  componentIdUnique: 'standard-component-1',
  orgUrl: 'https://contoso.crm.dynamics.com',
  sourceEnvironment: 'https://contoso.crm.dynamics.com',
  agentVersion: '2026-09-12T01:00:00.000Z',
};

describe('Standard review restart recovery', () => {
  it('round-trips the live request and workflow job id', () => {
    const storage = new MemoryStorage();
    const recovery = createStandardReviewRecovery(
      { ...input, existingJobId: 'job-1' },
      'environment-1',
      '/agent-review-tool',
      1_000,
    );

    expect(recovery).not.toBeNull();
    writeStandardReviewRecovery(recovery!, storage);

    expect(readStandardReviewRecovery(storage, 2_000)).toEqual(recovery);
  });

  it('does not claim that an in-memory ZIP review can survive app close', () => {
    const recovery = createStandardReviewRecovery(
      {
        ...input,
        sourceEnvironment: 'zip',
        zipFile: new File([], 'synthetic.zip'),
        zipBotSchemaName: 'workshop_helper',
      },
      null,
      '/agent-review-tool',
      1_000,
    );

    expect(recovery).toBeNull();
  });

  it('removes recovery after the result is saved or the failure is dismissed', () => {
    const storage = new MemoryStorage();
    const recovery = createStandardReviewRecovery(
      input,
      null,
      '/agent-review-tool',
      1_000,
    );
    writeStandardReviewRecovery(recovery!, storage);

    clearStandardReviewRecovery(storage);

    expect(readStandardReviewRecovery(storage, 2_000)).toBeNull();
  });

  it('discards stale and future-dated recovery state', () => {
    const staleStorage = new MemoryStorage();
    const futureStorage = new MemoryStorage();
    const recovery = createStandardReviewRecovery(
      input,
      null,
      '/agent-review-tool',
      1_000,
    );
    writeStandardReviewRecovery(recovery!, staleStorage);
    writeStandardReviewRecovery(recovery!, futureStorage);

    expect(
      readStandardReviewRecovery(staleStorage, 8 * 24 * 60 * 60 * 1000),
    ).toBeNull();
    expect(readStandardReviewRecovery(futureStorage, 500)).toBeNull();
  });
});
