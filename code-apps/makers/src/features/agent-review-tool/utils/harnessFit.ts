import type { AgentsExperienceModel } from '../agents-experience/contracts/AgentsExperienceModel';
import { withoutRecognisedSystemKinds } from '../agents-experience/services/recognisedSystemKinds';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { buildUpgradeReadiness, CHOOSE_HARNESS_URL, type LearnQuote } from './upgradeReadiness';

/**
 * Limits for the harness fit advice (GitHub issue #949). The advice is
 * information only. It changes no score and adds no rule.
 *
 * The issue also names these signals. The review data has no source for
 * them, so the advice does not use them:
 * - Microsoft Copilot harness, no file capability: the review model has no
 *   file field, and a saved review clears `agentSettings.raw`.
 * - Standard harness, file handling on: Stage A does not read this setting.
 * - Standard harness, a custom topic with 30 or more nodes: Stage A has no
 *   node count.
 */
export const HARNESS_FIT_LIMITS = {
  copilotSimple: {
    maxTools: 3,
    maxSkills: 0,
    maxConnectedAgents: 0,
    maxInstructionCharacters: 1500,
  },
  standardComplex: {
    minTools: 10,
    minChildAndConnectedAgents: 3,
    minCustomTopics: 25,
  },
} as const;

export type HarnessFitVerdict = 'copilot-possibly-not-needed' | 'copilot-can-fit' | 'no-advice';

export interface HarnessFitAdvice {
  verdict: HarnessFitVerdict;
  /** Short texts in a fixed order. Empty for 'no-advice'. */
  reasons: string[];
}

/** Microsoft Learn, word for word. */
export const HARNESS_FIT_OVERWORK_QUOTE: LearnQuote = {
  text: 'without optimization, a more capable harness can overwork a simple problem, increasing Copilot Credit consumption and latency without improving the outcome.',
  url: CHOOSE_HARNESS_URL,
};

/** Equal to an item of UPGRADE_BENEFIT_QUOTES. A test keeps them equal. */
export const HARNESS_FIT_CLEAR_BENEFIT_QUOTE: LearnQuote = {
  lead: 'A migration',
  text: 'should be driven by a clear benefit such as better quality, more efficient orchestration, long-running execution, or access to a specific reasoning model or needed new capability.',
  url: CHOOSE_HARNESS_URL,
};

/** Equal to an item of UPGRADE_BENEFIT_QUOTES. A test keeps them equal. */
export const HARNESS_FIT_NO_MOVE_QUOTE: LearnQuote = {
  text: "A functioning standard harness agent doesn't need to move simply because another harness is available.",
  url: CHOOSE_HARNESS_URL,
};

function noAdvice(): HarnessFitAdvice {
  return { verdict: 'no-advice', reasons: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

function countText(count: number, singular: string, plural: string): string {
  if (count === 0) return `no ${plural}`;
  if (count === 1) return `1 ${singular}`;
  return `${formatCount(count)} ${plural}`;
}

/** A saved snapshot is JSON. A value that is not a finite number above 0 counts as 0. */
function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function atMostReason(count: number, singular: string, plural: string, limit: number): string {
  if (count === 0) return `The agent has no ${plural}.`;
  return `The agent has ${countText(count, singular, plural)} (${formatCount(limit)} or fewer).`;
}

function instructionsReason(length: number, limit: number): string {
  if (length === 0) return 'The agent has no instructions.';
  return `The instructions have ${countText(length, 'character', 'characters')} (${formatCount(limit)} or fewer).`;
}

/**
 * Advice for an agent on the Microsoft Copilot harness. Reads the loaded
 * review model only (saved or live). Damaged data, or a component that did
 * not match a known schema, gives 'no-advice'.
 */
export function assessCopilotHarnessFit(model: AgentsExperienceModel): HarnessFitAdvice {
  const limits = HARNESS_FIT_LIMITS.copilotSimple;
  const tools: unknown = model.tools;
  const workflowTools: unknown = model.workflowTools;
  const skills: unknown = model.skills;
  const connectedAgents: unknown = model.connectedAgents;
  const unknownKinds: unknown = model.unknownKinds;
  const settings: unknown = model.agentSettings;
  const instructions: unknown = isRecord(settings) ? settings.instructions : undefined;
  if (
    !Array.isArray(tools) ||
    (workflowTools !== undefined && workflowTools !== null && !Array.isArray(workflowTools)) ||
    !Array.isArray(skills) ||
    !Array.isArray(connectedAgents) ||
    !Array.isArray(unknownKinds) ||
    typeof instructions !== 'string'
  ) {
    return noAdvice();
  }

  // A component that did not match a known schema can be a tool, a skill, or a
  // connected agent. Then the counts are not complete, so give no advice.
  if (withoutRecognisedSystemKinds(unknownKinds).length > 0) return noAdvice();

  // Agent flows are tools in Copilot Studio. The model keeps them in workflowTools, not in tools.
  // A review that was saved before the parser read agent flows keeps them in unknownKinds.
  const legacyAgentFlowCount = unknownKinds.filter(
    (entry: unknown) => isRecord(entry) && entry.kind === 'WorkflowTool',
  ).length;
  const toolCount =
    tools.length + (Array.isArray(workflowTools) ? workflowTools.length : 0) + legacyAgentFlowCount;
  if (
    toolCount > limits.maxTools ||
    skills.length > limits.maxSkills ||
    connectedAgents.length > limits.maxConnectedAgents ||
    instructions.length > limits.maxInstructionCharacters
  ) {
    return noAdvice();
  }

  return {
    verdict: 'copilot-possibly-not-needed',
    reasons: [
      atMostReason(toolCount, 'tool', 'tools', limits.maxTools),
      atMostReason(skills.length, 'skill', 'skills', limits.maxSkills),
      atMostReason(
        connectedAgents.length,
        'connected agent',
        'connected agents',
        limits.maxConnectedAgents,
      ),
      instructionsReason(instructions.length, limits.maxInstructionCharacters),
    ],
  };
}

/**
 * Advice for an agent on the standard harness. Reads the saved Stage A
 * snapshot only. Uses the same child agent names and custom topic names as
 * the Upgrade readiness tab.
 */
export function assessStandardHarnessFit(stageA: LocalStageAOutput): HarnessFitAdvice {
  const limits = HARNESS_FIT_LIMITS.standardComplex;
  const readiness = buildUpgradeReadiness(stageA);
  const reasons: string[] = [];

  const toolCount = finiteCount(stageA.toolCount);
  if (toolCount >= limits.minTools) {
    reasons.push(
      `The agent has ${countText(toolCount, 'tool', 'tools')} (${formatCount(limits.minTools)} or more).`,
    );
  }

  const childAgentCount = readiness.childAgents?.length ?? 0;
  const connectedAgentCount = listLength(stageA.connectedAgents);
  if (childAgentCount + connectedAgentCount >= limits.minChildAndConnectedAgents) {
    reasons.push(
      `The agent has ${countText(childAgentCount, 'child agent', 'child agents')} and ${countText(connectedAgentCount, 'connected agent', 'connected agents')} (${formatCount(limits.minChildAndConnectedAgents)} or more in total).`,
    );
  }

  const customTopicCount = readiness.customTopics.length;
  if (customTopicCount >= limits.minCustomTopics) {
    reasons.push(
      `The agent has ${countText(customTopicCount, 'custom topic', 'custom topics')} (${formatCount(limits.minCustomTopics)} or more). System topics are not in this count.`,
    );
  }

  return reasons.length > 0 ? { verdict: 'copilot-can-fit', reasons } : noAdvice();
}
