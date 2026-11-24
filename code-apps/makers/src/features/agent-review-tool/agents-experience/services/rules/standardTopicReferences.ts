import type { LocalPattern, ParsedBotData } from '../../../contracts/ServiceContracts';
import type { PatternTopic } from '../../../contracts/StageOutputs';
import { isPopulationIncomplete } from '../../../utils/patternUtils';
import { getTopicRuleScope } from '../../../utils/topicApplicability';

function normalizeTopicReference(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function schemaAlias(schemaName: string | undefined): string | undefined {
  return schemaName?.split(/[./]/).filter(Boolean).at(-1);
}

interface TopicReferenceCandidate {
  reference: string;
  target?: string;
}

interface TopicTargetMatch {
  target: string;
  matchedTerms: number;
  matchedCharacters: number;
  coverage: number;
}

const topicReferenceStopWords = new Set([
  'action',
  'agent',
  'assistant',
  'invoke',
  'task',
  'topic',
  'user',
]);

function topicNameTerms(value: string): string[] {
  return [...new Set(value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(term => term.toLowerCase())
    .filter(term => term.length >= 4 && !topicReferenceStopWords.has(term)))];
}

function referenceContainsTerm(reference: string, term: string): boolean {
  if (reference.includes(term)) return true;
  const singular = term.endsWith('s') && term.length > 4
    ? term.slice(0, -1)
    : term;
  return singular !== term && reference.includes(singular);
}

function inferRenamedTopicTarget(reference: string, topicTargets: string[]): string | undefined {
  const normalizedReference = normalizeTopicReference(reference);
  const matches = topicTargets
    .map((target): TopicTargetMatch => {
      const terms = topicNameTerms(target);
      const matched = terms.filter(term => referenceContainsTerm(normalizedReference, term));
      return {
        target,
        matchedTerms: matched.length,
        matchedCharacters: matched.reduce((sum, term) => sum + term.length, 0),
        coverage: terms.length ? matched.length / terms.length : 0,
      };
    })
    .filter(match =>
      match.matchedTerms >= 2
      && match.matchedCharacters >= 12
      && match.coverage >= 0.5)
    .sort((left, right) =>
      right.matchedTerms - left.matchedTerms
      || right.matchedCharacters - left.matchedCharacters
      || right.coverage - left.coverage);
  const [best, next] = matches;
  if (!best) return undefined;
  if (next
    && best.matchedTerms === next.matchedTerms
    && best.matchedCharacters - next.matchedCharacters < 4) {
    return undefined;
  }
  return best.target;
}

function hasRoutingReferenceContext(description: string, index: number, length: number): boolean {
  const before = description.slice(Math.max(0, index - 100), index);
  const after = description.slice(index + length, index + length + 30);
  return /\b(?:use|route|call|select|trigger|invoke)\b[^.!?]*$/i.test(before)
    || /^\s*(?:instead|directly)\b/i.test(after);
}

function isLikelyInternalTopicIdentifier(value: string): boolean {
  const segments = value.match(/[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|\d+/g) ?? [];
  return value.includes('_') || segments.length >= 3;
}

function topicReferenceCandidates(
  description: string,
  topicNames: Set<string>,
  schemaTargets: Map<string, string>,
  topicTargets: string[],
): TopicReferenceCandidate[] {
  const matches: Array<TopicReferenceCandidate & { index: number }> = [];
  for (const match of description.matchAll(/\bTopic\s+\d+\b/gi)) {
    const reference = match[0].trim();
    if (!topicNames.has(normalizeTopicReference(reference))) {
      matches.push({ reference, index: match.index });
    }
  }
  for (const match of description.matchAll(/\(([A-Za-z][A-Za-z0-9_]{5,})\)/g)) {
    const reference = match[1];
    const normalized = normalizeTopicReference(reference);
    const target = schemaTargets.get(normalized)
      ?? (hasRoutingReferenceContext(description, match.index, match[0].length)
        ? inferRenamedTopicTarget(reference, topicTargets)
        : undefined);
    const internalReference = hasRoutingReferenceContext(description, match.index, match[0].length)
      && isLikelyInternalTopicIdentifier(reference);
    if (!topicNames.has(normalized)
      && (target || internalReference)
      && (!target || normalizeTopicReference(target) !== normalized)) {
      matches.push({ reference, target, index: match.index });
    }
  }
  const seen = new Set<string>();
  return matches
    .sort((left, right) => left.index - right.index)
    .filter(({ reference }) => {
      const key = normalizeTopicReference(reference);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ reference, target }) => ({ reference, target }));
}

function invalidTopicReferences(data: ParsedBotData): PatternTopic[] {
  const topics = data.topicComponents ?? [];
  const topicNames = new Set(topics.map(topic => normalizeTopicReference(topic.TopicName)));
  const topicTargets = [...new Set(topics.map(topic => topic.TopicName))];
  const schemaTargetGroups = new Map<string, string[]>();
  for (const topic of topics) {
    const alias = schemaAlias(topic.SchemaName);
    if (!alias) continue;
    const key = normalizeTopicReference(alias);
    schemaTargetGroups.set(key, [...(schemaTargetGroups.get(key) ?? []), topic.TopicName]);
  }
  const schemaTargets = new Map([...schemaTargetGroups]
    .filter(([, targets]) => new Set(targets).size === 1)
    .map(([key, targets]) => [key, targets[0]]));
  const candidates = topics.map(topic => ({
    topic,
    candidates: topic.ModelDescription
      && getTopicRuleScope(topic, 'Unclear Model Description').status === 'applicable'
      ? topicReferenceCandidates(topic.ModelDescription, topicNames, schemaTargets, topicTargets)
      : [],
  }));
  const placeholderTargets = new Map<string, Set<string>>();
  for (const { candidates: references } of candidates) {
    const resolved = [...new Set(references.flatMap(reference =>
      reference.target ? [reference.target] : []))];
    if (resolved.length !== 1) continue;
    for (const reference of references.filter(item => !item.target)) {
      const key = normalizeTopicReference(reference.reference);
      const targets = placeholderTargets.get(key) ?? new Set<string>();
      targets.add(resolved[0]);
      placeholderTargets.set(key, targets);
    }
  }

  return candidates.flatMap(({ topic, candidates: references }) =>
    references.map((reference): PatternTopic => {
      const inferred = placeholderTargets.get(normalizeTopicReference(reference.reference));
      const target = reference.target ?? (inferred?.size === 1 ? [...inferred][0] : undefined);
      const suggestedText = target
        ? `Use /${target} instead.`
        : undefined;
      return {
        item: topic.TopicName,
        componentId: topic.TopicId,
        schemaName: topic.SchemaName,
        setting: 'Model description',
        current: reference.reference,
        suggested: suggestedText,
        evidence: {
          source: 'configuration',
          status: 'verified',
          setting: 'Model description',
          quote: reference.reference,
          reason: 'The model description uses a topic label that is not an exact reviewed topic display name.',
        },
        remediation: {
          findingTitle: `${topic.TopicName} uses unresolved topic reference "${reference.reference}"`,
          whyItMatters: `The routing description names "${reference.reference}", but that is not an exact topic display name in the reviewed agent.`,
          makerAction: target
            ? `In "${topic.TopicName}", replace "${reference.reference}" with "${target}" by selecting the target with the Copilot Studio "/" picker.`
            : `In "${topic.TopicName}", replace "${reference.reference}" with the exact target selected through the Copilot Studio "/" picker.`,
          ...(suggestedText ? { suggestedText } : {}),
          acceptanceCheck: `Search all model descriptions for "${reference.reference}". It must not remain, and a request for the intended route must select ${target ? `"${target}"` : 'the selected target topic'}.`,
        },
      };
    }));
}

/** Assess explicit topic references against the captured topic names and unambiguous aliases. */
export function buildStandardTopicReferencePattern(data: ParsedBotData): LocalPattern {
  const incompletePopulation = isPopulationIncomplete(data);
  const invalidReferences = invalidTopicReferences(data);
  const invalidReferenceStatus = invalidReferences.length
    ? 'fail'
    : incompletePopulation ? 'not-assessed' : 'pass';
  return {
    patternId: 'local-pattern-11',
    patternName: 'Invalid Topic Reference',
    description: invalidReferences.length
      ? `${invalidReferences.length} unresolved topic reference(s) were found across ${new Set(invalidReferences.map(item => item.item)).size} topic description(s).`
      : invalidReferenceStatus === 'not-assessed'
        ? 'Topic references could not be fully assessed because the reviewed component population is incomplete.'
        : 'All detected topic references use reviewed topic display names.',
    recommendation: 'Use the Copilot Studio "/" picker to insert the exact target topic name. Remove placeholder names and internal schema aliases from model descriptions.',
    status: invalidReferenceStatus === 'pass',
    assessmentStatus: invalidReferenceStatus,
    assessmentReason: invalidReferenceStatus === 'not-assessed'
      ? 'Unclassified or unavailable components prevent a complete topic-reference inventory.'
      : 'This deterministic check compares explicit placeholder and schema-alias references with reviewed topic display names.',
    topics: [...new Set(invalidReferences.map(item => item.item))],
    affectedItems: invalidReferences,
    category: 'Orchestration',
    severity: 'Medium',
    evidenceKind: 'configuration-fact',
  };
}
