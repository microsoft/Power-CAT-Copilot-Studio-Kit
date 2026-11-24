import type { BotMetadata } from '../contracts/ReviewResult';

/** "(Upgraded)" at the end of a trimmed name, in any case, with optional spaces in the parentheses. */
const UPGRADED_SUFFIX = /\(\s*upgraded\s*\)$/i;

/** Remove the trailing "(Upgraded)" from the name of an upgraded copy. The result is the base name of the copy. */
export function originalNameOf(copyName: string): string {
  return copyName.trim().replace(UPGRADED_SUFFIX, '').trim();
}

/** True when the name ends with "(Upgraded)" and has a base name before it. */
export function isUpgradedCopyName(name: string): boolean {
  return UPGRADED_SUFFIX.test(name.trim()) && originalNameOf(name) !== '';
}

export interface OriginalAgentMatch {
  candidates: BotMetadata[];
  /** exact: the agent names are the base name of the copy. prefix: the agent names start with the base name of the copy. */
  match: 'exact' | 'prefix';
}

function isStandardAgent(agent: BotMetadata): boolean {
  return agent.harness === undefined || agent.harness === 'standard';
}

/** The words of a name, in lowercase. The character classes are the same as in the name match of upgradeComparison.ts. */
function nameWords(name: string): string[] {
  return name.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((word) => word !== '');
}

/**
 * Find the standard harness agents that can be the original agent of an upgraded copy.
 * The base name is the copy name without "(Upgraded)". The base name can be shorter than the original name.
 * 1. Exact match: the agent name after trim is the base name. When 1 or more agents match, the result has only these agents.
 * 2. Prefix match: else, the agents whose names start with the words of the base name, in the same sequence.
 *    The match ignores case. Spaces and punctuation only separate the words.
 * An agent with no harness value is a standard agent.
 */
export function findOriginalAgents(copyName: string, agents: BotMetadata[]): OriginalAgentMatch {
  if (!isUpgradedCopyName(copyName)) return { candidates: [], match: 'exact' };
  const baseName = originalNameOf(copyName);
  const standardAgents = agents.filter(isStandardAgent);
  const exact = standardAgents.filter((agent) => agent.name.trim() === baseName);
  if (exact.length > 0) return { candidates: exact, match: 'exact' };
  const baseWords = nameWords(baseName);
  if (baseWords.length === 0) return { candidates: [], match: 'prefix' };
  const candidates = standardAgents.filter((agent) => {
    const words = nameWords(agent.name);
    return baseWords.every((word, index) => words[index] === word);
  });
  return { candidates, match: 'prefix' };
}
