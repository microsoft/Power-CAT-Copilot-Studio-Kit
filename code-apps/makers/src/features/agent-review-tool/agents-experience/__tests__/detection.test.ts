import { describe, expect, it } from 'vitest';
import {
  detectAgentHarness,
  isReviewableAgentConfiguration,
  UNSUPPORTED_HARNESS_MESSAGE,
  UnsupportedHarnessError,
  usesCopilotHarness,
} from '../services/detection';
import { FX } from './fixtures';

const copilotConfiguration = JSON.stringify({
  agentSettings: { $kind: 'AgentSettings' },
  recognizer: { $kind: 'CLICopilotRecognizer' },
});
const futureSettingsConfiguration = JSON.stringify({ agentSettings: { $kind: 'FutureAgentSettings' } });
const futureRecognizerConfiguration = JSON.stringify({
  agentSettings: { $kind: 'AgentSettings' },
  recognizer: { $kind: 'FutureRecognizer' },
});
const standardConfiguration = JSON.stringify({
  settings: { GenerativeActionsEnabled: true },
  recognizer: { $kind: 'GenerativeAIRecognizer' },
});
const classicConfiguration = JSON.stringify({ settings: { GenerativeActionsEnabled: false } });

describe('usesCopilotHarness', () => {
  it('true when configuration contains agentSettings', () =>
    expect(usesCopilotHarness(FX.botConfigurationCopilot)).toBe(true));
  it('false for standard configuration', () =>
    expect(usesCopilotHarness(FX.botConfigurationStandard)).toBe(false));
  it('false for null/undefined/malformed JSON (fail-open to standard)', () => {
    expect(usesCopilotHarness(null)).toBe(false);
    expect(usesCopilotHarness(undefined)).toBe(false);
    expect(usesCopilotHarness('{not json')).toBe(false);
  });
  it('false for an unsupported harness configuration', () => {
    expect(usesCopilotHarness(futureSettingsConfiguration)).toBe(false);
    expect(usesCopilotHarness(futureRecognizerConfiguration)).toBe(false);
  });
});

describe('detectAgentHarness', () => {
  it('returns standard for a null, empty, or bad configuration without a Copilot template', () => {
    for (const value of [null, undefined, '', '{not json', 'null', '[]', '"text"']) {
      expect(detectAgentHarness(value)).toEqual({ kind: 'standard' });
    }
  });

  it('returns standard for standard agents', () => {
    expect(detectAgentHarness(FX.botConfigurationStandard)).toEqual({ kind: 'standard' });
    expect(detectAgentHarness(standardConfiguration, 'default-2.1.0')).toEqual({ kind: 'standard' });
    expect(detectAgentHarness(null, 'default-2.1.0')).toEqual({ kind: 'standard' });
    expect(detectAgentHarness(standardConfiguration, '   ')).toEqual({ kind: 'standard' });
    expect(detectAgentHarness(JSON.stringify({ recognizer: { $kind: 'FutureRecognizer' } }))).toEqual({ kind: 'standard' });
  });

  it('returns copilot for the known Microsoft Copilot signature', () => {
    expect(detectAgentHarness(FX.botConfigurationCopilot)).toEqual({ kind: 'copilot' });
    expect(detectAgentHarness(copilotConfiguration, 'cliagent-1.0.0')).toEqual({ kind: 'copilot' });
    expect(detectAgentHarness(copilotConfiguration, 'default-2.1.0')).toEqual({ kind: 'copilot' });
  });

  it('returns copilot when agentSettings exists but gives no kind', () => {
    for (const agentSettings of [{}, null, [], { $kind: '  ' }, { $kind: 7 }]) {
      expect(detectAgentHarness(JSON.stringify({ agentSettings }))).toEqual({ kind: 'copilot' });
    }
    expect(detectAgentHarness(JSON.stringify({ agentSettings: {}, recognizer: {} }))).toEqual({ kind: 'copilot' });
  });

  it('returns unsupported for an unknown agent settings kind (case-sensitive)', () => {
    expect(detectAgentHarness(futureSettingsConfiguration)).toEqual({
      kind: 'unsupported',
      reason: 'The agent settings have an unknown kind: FutureAgentSettings.',
    });
    expect(detectAgentHarness(JSON.stringify({ agentSettings: { $kind: 'agentsettings' } })).kind).toBe('unsupported');
  });

  it('returns unsupported for Microsoft Copilot settings with an unknown recognizer', () => {
    expect(detectAgentHarness(futureRecognizerConfiguration)).toEqual({
      kind: 'unsupported',
      reason: 'The agent has Microsoft Copilot settings and an unknown recognizer: FutureRecognizer.',
    });
  });

  it('checks the agent settings kind before the recognizer kind', () => {
    const both = JSON.stringify({
      agentSettings: { $kind: 'FutureAgentSettings' },
      recognizer: { $kind: 'FutureRecognizer' },
    });
    expect(detectAgentHarness(both).reason).toBe('The agent settings have an unknown kind: FutureAgentSettings.');
  });

  it('returns unsupported for a Copilot template without agent settings', () => {
    expect(detectAgentHarness(standardConfiguration, 'cliagent-2.0.0')).toEqual({
      kind: 'unsupported',
      reason: 'The agent template is cliagent-2.0.0, but the configuration has no agent settings.',
    });
    expect(detectAgentHarness(null, '  CLIAgent-2.0.0 ')).toEqual({
      kind: 'unsupported',
      reason: 'The agent template is CLIAgent-2.0.0, but the configuration has no agent settings.',
    });
    expect(detectAgentHarness('{not json', 'cliagent-1.0.0').kind).toBe('unsupported');
  });
});

describe('isReviewableAgentConfiguration', () => {
  it('lists Gen AI standard agents, Microsoft Copilot agents, and unsupported harness agents', () => {
    expect(isReviewableAgentConfiguration(FX.botConfigurationStandard)).toBe(true);
    expect(isReviewableAgentConfiguration(copilotConfiguration)).toBe(true);
    expect(isReviewableAgentConfiguration(JSON.stringify({ agentSettings: null }))).toBe(true);
    expect(isReviewableAgentConfiguration(futureSettingsConfiguration)).toBe(true);
    expect(isReviewableAgentConfiguration(classicConfiguration, 'cliagent-2.0.0')).toBe(true);
  });

  it('does not list classic standard agents or agents without a configuration', () => {
    expect(isReviewableAgentConfiguration(classicConfiguration)).toBe(false);
    expect(isReviewableAgentConfiguration(JSON.stringify({ settings: {} }), 'default-2.1.0')).toBe(false);
    expect(isReviewableAgentConfiguration(null)).toBe(false);
    expect(isReviewableAgentConfiguration('{not json')).toBe(false);
    expect(isReviewableAgentConfiguration('null')).toBe(false);
  });
});

describe('UnsupportedHarnessError', () => {
  it('uses the exact unsupported harness message', () => {
    const error = new UnsupportedHarnessError();
    expect(UNSUPPORTED_HARNESS_MESSAGE).toBe(
      'This agent uses a harness that the Agent Review Tool does not support yet. No checks ran.',
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UnsupportedHarnessError');
    expect(error.message).toBe(UNSUPPORTED_HARNESS_MESSAGE);
  });
});
