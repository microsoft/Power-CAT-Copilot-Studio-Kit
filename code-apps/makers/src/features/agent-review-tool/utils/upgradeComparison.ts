import type { AgentsExperienceModel } from '../agents-experience/contracts/AgentsExperienceModel';
import { redactSecrets } from '../agents-experience/services/skill/resourceScanners';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { isSystemTopic } from './systemTopic';

/** The result of 1 compared item. Only the instructions can be "changed". */
export type UpgradeItemState = 'same' | 'missing-in-copy' | 'new-in-copy';

/** The result of the instructions comparison. */
export type UpgradeInstructionsState = 'same' | 'changed' | 'missing-in-copy' | 'new-in-copy';

/** The kind of a matched or new item in the copy. */
export type UpgradeCopyKind = 'tool' | 'workflow' | 'skill';

/** 1 row of a comparison table. A side that has no item has no key. */
export interface UpgradeItemComparison {
  original?: string;
  copy?: string;
  copyKind?: UpgradeCopyKind;
  state: UpgradeItemState;
}

/** The instructions result. The lengths are of the masked text with normalized white space. */
export interface UpgradeInstructionsComparison {
  state: UpgradeInstructionsState;
  originalLength: number;
  copyLength: number;
}

/** The comparison of an original standard agent with its upgraded copy. */
export interface UpgradeComparison {
  instructions: UpgradeInstructionsComparison;
  tools: UpgradeItemComparison[];
  knowledge: UpgradeItemComparison[];
  /** The custom topics of the original, compared with the skills and the workflows of the copy. */
  topics: UpgradeItemComparison[];
  /** The names of the system topics of the original. They are not compared. */
  systemTopics: string[];
}

interface OriginalItem {
  label: string;
  keys: Set<string>;
}

interface CopyCandidate {
  label: string;
  keys: Set<string>;
  kind: UpgradeCopyKind | undefined;
  claimed: boolean;
}

/**
 * The match key of a name: the NFC form in lowercase, with only the letters, the marks
 * (for example, vowel signs and accents), and the digits. An empty key matches nothing.
 */
function normalizeName(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Mask secrets as a saved review does. A saved text can have a mask where the other
 * text has the secret. redactSecrets masks a mask again as "[REDACTED]]", so the
 * extra brackets are removed.
 */
function maskSecrets(value: string): string {
  return redactSecrets(value).replace(/\[REDACTED\]\]+/g, '[REDACTED]');
}

function keySet(...values: (string | undefined)[]): Set<string> {
  return new Set(values.map((value) => normalizeName(value ?? '')).filter((key) => key !== ''));
}

function displayLabel(preferred?: string, fallback?: string): string {
  return preferred?.trim() || fallback?.trim() || '';
}

function candidate(label: string, keys: Set<string>, kind: UpgradeCopyKind | undefined): CopyCandidate {
  return { label, keys, kind, claimed: false };
}

function sharesKey(item: OriginalItem, copy: CopyCandidate): boolean {
  return [...item.keys].some((key) => copy.keys.has(key));
}

function nonEmpty<T extends { label: string }>(items: T[]): T[] {
  return items.filter((item) => item.label !== '');
}

/** Give each item of the original the first unclaimed copy candidate with a shared key. */
function matchOriginals(items: OriginalItem[], candidates: CopyCandidate[]): UpgradeItemComparison[] {
  return items.map((item): UpgradeItemComparison => {
    const match = candidates.find((copy) => !copy.claimed && sharesKey(item, copy));
    if (!match) return { original: item.label, state: 'missing-in-copy' };
    match.claimed = true;
    return {
      original: item.label,
      copy: match.label,
      ...(match.kind ? { copyKind: match.kind } : {}),
      state: 'same',
    };
  });
}

function unclaimed(candidates: CopyCandidate[]): UpgradeItemComparison[] {
  return candidates
    .filter((copy) => !copy.claimed)
    .map((copy): UpgradeItemComparison => ({
      copy: copy.label,
      ...(copy.kind ? { copyKind: copy.kind } : {}),
      state: 'new-in-copy',
    }));
}

function compareInstructions(original: string, copy: string): UpgradeInstructionsComparison {
  const originalText = normalizeText(maskSecrets(original));
  const copyText = normalizeText(maskSecrets(copy));
  const lengths = { originalLength: originalText.length, copyLength: copyText.length };
  if (originalText === copyText) return { state: 'same', ...lengths };
  if (copyText === '') return { state: 'missing-in-copy', ...lengths };
  if (originalText === '') return { state: 'new-in-copy', ...lengths };
  return { state: 'changed', ...lengths };
}

function originalTools(original: LocalStageAOutput): OriginalItem[] {
  const details = original.toolDetails ?? [];
  if (details.length > 0) {
    return details.map((detail) => ({
      label: displayLabel(detail.displayName, detail.name),
      keys: keySet(detail.name, detail.displayName),
    }));
  }
  return (original.tools ?? []).map((name) => ({ label: displayLabel(name), keys: keySet(name) }));
}

function originalKnowledge(original: LocalStageAOutput): OriginalItem[] {
  const details = original.knowledgeDetails ?? [];
  const names = details.length > 0 ? details.map((detail) => detail.name) : original.knowledgeSources ?? [];
  return names.map((name) => ({ label: displayLabel(name), keys: keySet(name) }));
}

/**
 * Compare the saved Stage A snapshot of an original standard agent with the Copilot review
 * model of its upgraded copy. Name matches ignore case, spaces, and punctuation, but not
 * vowel signs or accents. The composed and the decomposed forms of a letter match.
 * Aliases also match: a tool or workflow display name, a skill front-matter name, and a
 * topic model name.
 */
export function compareUpgradePair(original: LocalStageAOutput, copy: AgentsExperienceModel): UpgradeComparison {
  const customTopics: OriginalItem[] = [];
  const systemTopics: string[] = [];
  for (const topic of original.topicComponents ?? []) {
    const label = displayLabel(topic.TopicName);
    if (label === '') continue;
    if (isSystemTopic(topic)) systemTopics.push(label);
    else customTopics.push({ label, keys: keySet(topic.TopicName, topic.ModelName) });
  }

  const copyTools = nonEmpty(copy.tools.map((item) => candidate(
    displayLabel(item.displayName, item.name), keySet(item.name, item.displayName), 'tool',
  )));
  const workflows = nonEmpty((copy.workflowTools ?? []).map((item) => candidate(
    displayLabel(item.displayName, item.name), keySet(item.name, item.displayName), 'workflow',
  )));
  const skills = nonEmpty(copy.skills.map((item) => candidate(
    displayLabel(item.frontmatterName, item.name), keySet(item.name, item.frontmatterName), 'skill',
  )));
  const knowledge = nonEmpty(copy.knowledge.map((item) => candidate(
    displayLabel(item.name), keySet(item.name), undefined,
  )));

  // The upgrade can rebuild an agent flow tool as a workflow, so the tools claim the workflows first.
  const tools = [
    ...matchOriginals(nonEmpty(originalTools(original)), [...copyTools, ...workflows]),
    ...unclaimed(copyTools),
  ];
  const topics = [
    ...matchOriginals(customTopics, [...skills, ...workflows]),
    ...unclaimed([...skills, ...workflows]),
  ];

  return {
    instructions: compareInstructions(original.agentInstructions ?? '', copy.agentSettings.instructions),
    tools,
    knowledge: [...matchOriginals(nonEmpty(originalKnowledge(original)), knowledge), ...unclaimed(knowledge)],
    topics,
    systemTopics,
  };
}
