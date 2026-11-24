/**
 * Resolving capability names out of authored prose.
 *
 * Two rules ask the same mechanical question of different text — INS-09 of the
 * agent instructions, SKL-15 of each inline skill body — so the detector is
 * declared here once rather than copied into either family. It is a seam in the
 * same sense as `standard.ts`: shared algorithm, no rule of its own.
 *
 * The question it answers is deliberately narrow. Deciding whether a phrase
 * *means* a capability is a reading task and belongs to the AI rules that judge
 * the same text (INS-07, SKL-09). Deciding whether a name the author already
 * wrote in an invocation frame matches the captured inventory is not: it is a
 * string comparison, it costs nothing, and it still answers when the AI workflow
 * is unreachable.
 */

import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { norm } from '../../agents-experience/services/rules/ruleTypes';

/**
 * Filler words that occupy the capability slot without naming one.
 *
 * "Use the appropriate tool" is guidance, not a reference, so `appropriate` must
 * never be resolved against the inventory.
 */
const GENERIC_CAPABILITY_NAMES = new Set([
  'a', 'an', 'the', 'appropriate', 'available', 'configured', 'correct',
  'existing', 'selected', 'required', 'requested', 'relevant', 'another',
  'any', 'own', 'live', 'external', 'synthetic',
  'this', 'that', 'these', 'those', 'your', 'our', 'its', 'their', 'my',
  'same', 'current', 'next', 'previous',
]);

/** `use the "X" tool` / `call the \`X\` skill` / `invoke the x-y action`. */
const DELIMITED_REFERENCE =
  /\b(?:the|use|call|invoke|run)\s+(?:the\s+)?(?:"([^"\r\n]{3,80})"|`([^`\r\n]{3,80})`|([a-z0-9][\w-]{2,40}))\s+(?:tool|skill|agent|action|flow)\b/gi;

/** `use the Meeting Management tool` — Title Case standing in for a proper name. */
const TITLE_CASE_REFERENCE =
  /\b(?:[Tt]he|[Uu]se|[Cc]all|[Ii]nvoke|[Rr]un)\s+(?:[Tt]he\s+)?([A-Z][\w-]{1,40}(?:\s+[A-Z][\w-]{1,40}){1,5})\s+(?:tool|skill|agent|action|flow)\b/g;

/**
 * The names a block of text points at as capabilities, filler removed.
 *
 * A capability is only read out of an explicit invocation frame, which is what
 * keeps ordinary prose from being mistaken for a reference.
 */
export function namedCapabilityReferences(text: string): string[] {
  const delimited = [...text.matchAll(DELIMITED_REFERENCE)]
    .filter(match => match[1] !== undefined || match[2] !== undefined
      || !GENERIC_CAPABILITY_NAMES.has(norm(match[3])))
    .map(match => norm(match[1] ?? match[2] ?? match[3]));
  const titleCase = [...text.matchAll(TITLE_CASE_REFERENCE)].map(match => norm(match[1]));
  return [...new Set([...delimited, ...titleCase])];
}

/** Everything the agent can actually call, as one normalised list. */
export function configuredCapabilityNames(model: AgentsExperienceModel): string[] {
  return [
    ...model.tools.map(tool => tool.name),
    ...model.skills.map(skill => skill.frontmatterName ?? skill.name),
    ...model.connectedAgents.map(agent => agent.name),
    ...model.knowledge.map(source => source.name),
  ].map(norm);
}

/**
 * Names the text invokes that resolve to nothing the agent has.
 *
 * Matching is substring-tolerant in both directions because a captured display
 * name and the name an author types rarely agree exactly — "Meeting Management"
 * should resolve against "Meeting Management MCP Server".
 *
 * There is deliberately no requirement that some *other* reference in the same
 * text resolved first. Anchoring on a successful match is how the retired SKL-09
 * detector came to stay silent on a skill whose references were *all* missing,
 * which is the worst case rather than an uninteresting one.
 */
export function missingCapabilityReferences(
  text: string,
  configured: readonly string[],
): string[] {
  return namedCapabilityReferences(text).filter(
    name => !configured.some(c => c === name || c.includes(name) || name.includes(c)),
  );
}
