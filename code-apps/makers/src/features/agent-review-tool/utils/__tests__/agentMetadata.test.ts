import { describe, expect, it } from 'vitest';
import { parseAgentSettings } from '../agentMetadata';

describe('parseAgentSettings authentication mode labels', () => {
  it.each([
    [0, 'Unspecified'],
    [1, 'No Authentication'],
    [2, 'Microsoft Entra ID'],
    [3, 'Microsoft Entra ID (Custom)'],
    [4, 'Generic OAuth2'],
    [9, 'Unknown'],
  ] as const)('labels the mode %i as %s', (mode, label) => {
    expect(parseAgentSettings(undefined, mode).authenticationMode).toBe(label);
  });

  it('leaves the label out when the mode is not captured', () => {
    expect(parseAgentSettings(undefined, undefined).authenticationMode).toBeUndefined();
  });
});
