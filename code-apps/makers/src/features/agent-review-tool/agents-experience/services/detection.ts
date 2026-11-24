import type { AgentHarnessKind } from '../../contracts/ReviewResult';

/**
 * Harness detection (spec 013 §7, GitHub issue 947).
 *
 * The rule uses positive signatures only. A value that ART knows never becomes
 * 'unsupported', so known agents keep the behavior of today.
 *
 * 1. The configuration JSON has the key `agentSettings`:
 *    a. `agentSettings.$kind` is a non-empty string that is not `AgentSettings` → unsupported.
 *    b. Else `recognizer.$kind` is a non-empty string that is not `CLICopilotRecognizer` → unsupported.
 *    c. Else → copilot (the rule of today: the key `agentSettings` exists).
 * 2. Else, the bot template starts with `cliagent-` (trimmed, any case) → unsupported.
 *    Else → standard (also for a null, empty, or bad configuration).
 *
 * Reasons: in a test environment with 221 active agents (180 standard, 41 Microsoft Copilot),
 * all Microsoft Copilot agents have the template `cliagent-1.0.0`, `agentSettings.$kind`
 * `AgentSettings`, and `recognizer.$kind` `CLICopilotRecognizer`. Standard agents have the
 * recognizer `GenerativeAIRecognizer` or no recognizer. One standard agent has a null
 * configuration. `runtimeprovider` is 0 on all agents, so it gives no signal. A `$kind` that is
 * not a string, or that has only white space, gives no signal. Microsoft Learn: "A functioning
 * standard harness agent doesn't need to move simply because another harness is available."
 */
export interface AgentHarnessDetection {
  kind: AgentHarnessKind;
  reason?: string;
}

export const UNSUPPORTED_HARNESS_MESSAGE = 'This agent uses a harness that the Agent Review Tool does not support yet. No checks ran.';

const COPILOT_AGENT_SETTINGS_KIND = 'AgentSettings';
const COPILOT_RECOGNIZER_KIND = 'CLICopilotRecognizer';
const COPILOT_TEMPLATE_PREFIX = 'cliagent-';

/** Stops a review run for an unsupported harness. The message is UNSUPPORTED_HARNESS_MESSAGE. */
export class UnsupportedHarnessError extends Error {
  constructor() {
    super(UNSUPPORTED_HARNESS_MESSAGE);
    this.name = 'UnsupportedHarnessError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConfigurationObject(configuration: string | null | undefined): Record<string, unknown> | undefined {
  if (!configuration) return undefined;
  try {
    const parsed: unknown = JSON.parse(configuration);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readKind(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;
  const kind = value['$kind'];
  if (typeof kind !== 'string') return undefined;
  const trimmed = kind.trim();
  return trimmed ? trimmed : undefined;
}

export function detectAgentHarness(
  configuration: string | null | undefined,
  template?: string | null,
): AgentHarnessDetection {
  const config = parseConfigurationObject(configuration);
  if (config && Object.prototype.hasOwnProperty.call(config, 'agentSettings')) {
    const settingsKind = readKind(config['agentSettings']);
    if (settingsKind && settingsKind !== COPILOT_AGENT_SETTINGS_KIND) {
      return { kind: 'unsupported', reason: `The agent settings have an unknown kind: ${settingsKind}.` };
    }
    const recognizerKind = readKind(config['recognizer']);
    if (recognizerKind && recognizerKind !== COPILOT_RECOGNIZER_KIND) {
      return {
        kind: 'unsupported',
        reason: `The agent has Microsoft Copilot settings and an unknown recognizer: ${recognizerKind}.`,
      };
    }
    return { kind: 'copilot' };
  }
  const trimmedTemplate = template?.trim() ?? '';
  if (trimmedTemplate.toLowerCase().startsWith(COPILOT_TEMPLATE_PREFIX)) {
    return {
      kind: 'unsupported',
      reason: `The agent template is ${trimmedTemplate}, but the configuration has no agent settings.`,
    };
  }
  return { kind: 'standard' };
}

/** Spec 013 §7: true only for the Microsoft Copilot harness. An unsupported harness gives false. */
export function usesCopilotHarness(configuration: string | null | undefined): boolean {
  return detectAgentHarness(configuration).kind === 'copilot';
}

/**
 * Agent list filter (issue 947): Gen AI standard agents, Microsoft Copilot agents, and
 * unsupported harness agents. The list shows unsupported agents so that it can show the message.
 */
export function isReviewableAgentConfiguration(
  configuration: string | null | undefined,
  template?: string | null,
): boolean {
  if (detectAgentHarness(configuration, template).kind !== 'standard') return true;
  const settings = parseConfigurationObject(configuration)?.['settings'];
  return isPlainObject(settings) && Boolean(settings['GenerativeActionsEnabled']);
}
