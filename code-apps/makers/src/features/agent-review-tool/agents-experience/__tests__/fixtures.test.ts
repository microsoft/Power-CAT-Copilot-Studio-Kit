import { describe, expect, it } from 'vitest';
import { FX } from './fixtures';

describe('fixtures', () => {
  it('exposes all 25 fixtures', () => {
    expect(Object.keys(FX)).toHaveLength(25);
    expect(FX.botConfigurationCopilot).toContain('agentSettings');
  });
});
