import { describe, expect, it } from 'vitest';
import {
  parseFinalizationSnapshot,
  type FinalizationSnapshot,
} from '../index.js';

describe('parseFinalizationSnapshot', () => {
  it('accepts a JSON-round-tripped schema v1 snapshot', () => {
    const snapshot = {
      version: 1,
      coreVersion: '0.1.0-modern-review.0',
      sourceRevision: '4fd618cd',
      startedAt: '2026-08-23T00:00:00.000Z',
      identity: {},
      model: {},
      deterministic: {},
      bundles: [],
    };

    expect(parseFinalizationSnapshot(JSON.parse(JSON.stringify(snapshot))))
      .toEqual(snapshot);
  });

  it('rejects a snapshot from an unsupported schema version', () => {
    expect(() => parseFinalizationSnapshot({
      version: 2,
    } as unknown as FinalizationSnapshot)).toThrow('version');
  });
});
