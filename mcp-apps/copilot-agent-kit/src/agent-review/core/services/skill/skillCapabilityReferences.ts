import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel.js';
import type {
  SkillCapabilityReference,
  SkillCapabilityReferenceIssue,
} from '../../contracts/SkillBundle.js';
import { redactSecrets } from './resourceScanners.js';

const MIN_CAPABILITY_NAME_CHARACTERS = 4;
const MAX_EVIDENCE_CHARACTERS = 240;
const STRONG_REFERENCE_MIN_TOKENS = 3;
const STRONG_REFERENCE_MIN_COVERAGE = 0.7;
const FILE_EXTENSION_TOKENS = new Set([
  'csv', 'doc', 'docx', 'md', 'pdf', 'ppt', 'pptx', 'txt', 'xls', 'xlsx',
]);
const ACTION_STYLE_TOOL_VERBS = new Set([
  'add', 'approve', 'copy', 'create', 'delete', 'download', 'execute', 'forward',
  'get', 'insert', 'list', 'move', 'post', 'read', 'reject', 'remove', 'reply',
  'retrieve', 'run', 'search', 'send', 'start', 'stop', 'trigger', 'update',
  'upload', 'write',
]);
const EXPLICIT_TOOL_CONTEXT_NOUNS = new Set([
  'action', 'actions', 'capability', 'capabilities', 'connector', 'connectors',
  'operation', 'operations', 'tool', 'tools',
]);
const EXPLICIT_TOOL_INVOCATION_VERBS = new Set([
  'call', 'execute', 'invoke', 'run', 'trigger',
]);

interface CapabilityTarget {
  category: SkillCapabilityReference['category'];
  label: string;
  schemaName: string;
  componentId?: string;
  componentIdUnique?: string;
}

interface TextMatch {
  lineNumber: number;
  evidence: string;
  start: number;
  end: number;
  matchedText?: string;
}

interface AcceptedMatch extends TextMatch {
  targetSchemaName: string;
}

export interface SkillCapabilityReferenceAnalysis {
  references: SkillCapabilityReference[];
  issues: SkillCapabilityReferenceIssue[];
}

function normalizeReferenceText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function isWordCharacter(value: string | undefined): boolean {
  return value ? /[\p{L}\p{N}]/u.test(value) : false;
}

function isEligibleName(value: string): boolean {
  return normalizeReferenceText(value).replace(/[^\p{L}\p{N}]/gu, '').length
    >= MIN_CAPABILITY_NAME_CHARACTERS;
}

function words(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?? [];
}

function clausePrefix(line: string, start: number): string {
  const prefix = line.slice(0, start);
  const boundary = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf(':'),
  );
  return prefix.slice(boundary + 1);
}

function isNegatedReference(line: string, start: number): boolean {
  const prefix = words(clausePrefix(line, start)).join(' ');
  return /\b(?:not|never|cannot|avoid|without|forbid|forbidden|prohibit|prohibited)\b/u
    .test(prefix) ||
    /\b(?:don|doesn|didn|mustn|shouldn|can|couldn|wouldn|won) t\b/u.test(prefix) ||
    /\brefrain from\b/u.test(prefix);
}

function isActionStyleToolName(authoredName: string): boolean {
  const [firstWord] = words(authoredName);
  return firstWord ? ACTION_STYLE_TOOL_VERBS.has(firstWord) : false;
}

function hasExplicitToolContext(line: string, start: number, end: number): boolean {
  const before = words(clausePrefix(line, start)).slice(-4);
  const after = words(line.slice(end)).slice(0, 4);
  if (
    EXPLICIT_TOOL_CONTEXT_NOUNS.has(before.at(-1) ?? '') ||
    EXPLICIT_TOOL_CONTEXT_NOUNS.has(after[0] ?? '')
  ) {
    return true;
  }
  return before.some(word => EXPLICIT_TOOL_INVOCATION_VERBS.has(word));
}

function findExactReference(
  markdown: string,
  authoredName: string,
  requireExplicitToolContext: boolean,
): TextMatch | undefined {
  const needle = normalizeReferenceText(authoredName);
  if (!needle || !isEligibleName(needle)) return undefined;

  const lines = markdown.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const normalizedLine = normalizeReferenceText(rawLine);
    let searchFrom = 0;
    while (searchFrom <= normalizedLine.length - needle.length) {
      const start = normalizedLine.indexOf(needle, searchFrom);
      if (start < 0) break;
      const end = start + needle.length;
      if (
        !isWordCharacter(normalizedLine[start - 1]) &&
        !isWordCharacter(normalizedLine[end])
      ) {
        if (
          isNegatedReference(normalizedLine, start) ||
          (requireExplicitToolContext && !hasExplicitToolContext(normalizedLine, start, end))
        ) {
          searchFrom = start + 1;
          continue;
        }
        const evidence = redactSecrets(rawLine.trim());
        return {
          lineNumber: lineIndex + 1,
          evidence: evidence.length > MAX_EVIDENCE_CHARACTERS
            ? `${evidence.slice(0, MAX_EVIDENCE_CHARACTERS - 1)}…`
            : evidence,
          start,
          end,
        };
      }
      searchFrom = start + 1;
    }
  }
  return undefined;
}

function referenceTokens(value: string): string[] {
  return words(value)
    .filter(token =>
      !FILE_EXTENSION_TOKENS.has(token) &&
      !/^(?:v?\d+|\d+[a-z])$/u.test(token));
}

function findStrongKnowledgeReference(
  markdown: string,
  authoredName: string,
): TextMatch | undefined {
  const targetTokens = referenceTokens(authoredName);
  if (targetTokens.length < STRONG_REFERENCE_MIN_TOKENS) return undefined;

  const lines = markdown.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const lineTokens = referenceTokens(rawLine);
    const matched: Array<{ targetIndex: number; token: string }> = [];
    let lastTargetIndex = -1;

    lineTokens.forEach(token => {
      const targetIndex = targetTokens.indexOf(token, lastTargetIndex + 1);
      if (targetIndex < 0) return;
      matched.push({ targetIndex, token });
      lastTargetIndex = targetIndex;
    });

    const coverage = matched.length / targetTokens.length;
    if (
      matched.length < STRONG_REFERENCE_MIN_TOKENS ||
      coverage < STRONG_REFERENCE_MIN_COVERAGE ||
      matched[0]?.targetIndex !== 0 ||
      matched.at(-1)?.targetIndex !== targetTokens.length - 1 ||
      new Set(matched.map(item => item.token)).size < STRONG_REFERENCE_MIN_TOKENS
    ) {
      continue;
    }

    const normalizedLine = normalizeReferenceText(rawLine);
    const firstToken = matched[0].token;
    const lastToken = matched.at(-1)?.token ?? firstToken;
    const start = normalizedLine.indexOf(firstToken);
    const end = normalizedLine.lastIndexOf(lastToken) + lastToken.length;
    if (isNegatedReference(normalizedLine, start)) continue;
    const evidence = redactSecrets(rawLine.trim());
    return {
      lineNumber: lineIndex + 1,
      evidence: evidence.length > MAX_EVIDENCE_CHARACTERS
        ? `${evidence.slice(0, MAX_EVIDENCE_CHARACTERS - 1)}…`
        : evidence,
      start,
      end,
      matchedText: matched.map(item => item.token).join(' '),
    };
  }
  return undefined;
}

function configuredTargets(model: AgentsExperienceModel): CapabilityTarget[] {
  return [
    ...model.tools.map(tool => ({
      category: 'tool' as const,
      label: tool.displayName ?? tool.name,
      schemaName: tool.schemaname,
      componentId: tool.componentId,
      componentIdUnique: tool.componentIdUnique,
    })),
    ...model.knowledge.map(source => ({
      category: 'knowledge' as const,
      label: source.name,
      schemaName: source.schemaname,
      componentId: source.componentId,
      componentIdUnique: source.componentIdUnique,
    })),
  ];
}

function overlaps(left: TextMatch, right: TextMatch): boolean {
  return left.lineNumber === right.lineNumber && left.start < right.end && right.start < left.end;
}

/**
 * Resolve exact, uniquely named tool and knowledge references in one assembled skill file.
 *
 * This deliberately excludes fuzzy/semantic matches and connected agents. A result identifies
 * only a possible authored reference to the configured component, not runtime use.
 */
export function analyzeSkillCapabilityReferences(
  markdown: string,
  model: AgentsExperienceModel,
): SkillCapabilityReferenceAnalysis {
  const targets = configuredTargets(model);
  const aliases = new Map<string, { authoredName: string; targets: CapabilityTarget[] }>();
  targets.forEach(target => {
    if (!isEligibleName(target.label)) return;
    const key = normalizeReferenceText(target.label);
    const entry = aliases.get(key) ?? { authoredName: target.label, targets: [] };
    if (!entry.targets.some(candidate =>
      candidate.category === target.category &&
      candidate.schemaName === target.schemaName &&
      candidate.componentIdUnique === target.componentIdUnique
    )) {
      entry.targets.push(target);
    }
    aliases.set(key, entry);
  });

  const references: SkillCapabilityReference[] = [];
  const issues: SkillCapabilityReferenceIssue[] = [];
  const accepted: AcceptedMatch[] = [];
  const linkedTargets = new Set<string>();

  [...aliases.values()]
    .sort((left, right) =>
      normalizeReferenceText(right.authoredName).length -
        normalizeReferenceText(left.authoredName).length ||
      left.authoredName.localeCompare(right.authoredName))
    .forEach(entry => {
      const requireExplicitToolContext =
        entry.targets.every(target => target.category === 'tool') &&
        isActionStyleToolName(entry.authoredName);
      const match = findExactReference(
        markdown,
        entry.authoredName,
        requireExplicitToolContext,
      );
      if (!match) return;
      if (accepted.some(candidate => overlaps(candidate, match))) return;

      if (entry.targets.length !== 1) {
        issues.push({
          code: 'ambiguous-capability-name',
          matchedName: entry.authoredName,
          matchKind: 'exact',
          lineNumber: match.lineNumber,
          evidence: match.evidence,
          candidateSchemaNames: entry.targets
            .map(target => target.schemaName)
            .sort((left, right) => left.localeCompare(right)),
        });
        return;
      }

      const [target] = entry.targets;
      const targetIdentity = [
        target.category,
        target.componentIdUnique ?? target.componentId ?? target.schemaName,
      ].join(':');
      if (linkedTargets.has(targetIdentity)) return;

      linkedTargets.add(targetIdentity);
      accepted.push({ ...match, targetSchemaName: target.schemaName });
      references.push({
        category: target.category,
        targetSchemaName: target.schemaName,
        targetComponentId: target.componentId,
        targetComponentIdUnique: target.componentIdUnique,
        matchedName: entry.authoredName,
        matchKind: 'exact',
        lineNumber: match.lineNumber,
        evidence: match.evidence,
      });
    });

  const strongMatches = new Map<string, Array<{
    target: CapabilityTarget;
    match: TextMatch;
  }>>();
  targets
    .filter(target => target.category === 'knowledge')
    .filter(target => !linkedTargets.has([
      target.category,
      target.componentIdUnique ?? target.componentId ?? target.schemaName,
    ].join(':')))
    .forEach(target => {
      const match = findStrongKnowledgeReference(markdown, target.label);
      if (!match || accepted.some(candidate => overlaps(candidate, match))) return;
      // Different configured titles can qualify through different token subsets
      // of the same authored phrase. Group by phrase span so that evidence is
      // accepted only when exactly one configured knowledge source qualifies.
      const key = [match.lineNumber, match.start, match.end].join('|');
      const entries = strongMatches.get(key) ?? [];
      entries.push({ target, match });
      strongMatches.set(key, entries);
    });

  strongMatches.forEach(entries => {
    const [{ match }] = entries;
    if (entries.length !== 1) {
      issues.push({
        code: 'ambiguous-capability-name',
        matchedName: match.matchedText ?? 'knowledge reference',
        matchKind: 'strong',
        lineNumber: match.lineNumber,
        evidence: match.evidence,
        candidateSchemaNames: entries
          .map(entry => entry.target.schemaName)
          .sort((left, right) => left.localeCompare(right)),
      });
      return;
    }

    const [{ target }] = entries;
    const targetIdentity = [
      target.category,
      target.componentIdUnique ?? target.componentId ?? target.schemaName,
    ].join(':');
    if (linkedTargets.has(targetIdentity)) return;
    linkedTargets.add(targetIdentity);
    accepted.push({ ...match, targetSchemaName: target.schemaName });
    references.push({
      category: target.category,
      targetSchemaName: target.schemaName,
      targetComponentId: target.componentId,
      targetComponentIdUnique: target.componentIdUnique,
      matchedName: target.label,
      matchKind: 'strong',
      lineNumber: match.lineNumber,
      evidence: match.evidence,
    });
  });

  return {
    references: references.sort((left, right) =>
      left.lineNumber - right.lineNumber ||
      left.category.localeCompare(right.category) ||
      left.targetSchemaName.localeCompare(right.targetSchemaName)),
    issues: issues.sort((left, right) =>
      left.lineNumber - right.lineNumber ||
      left.matchedName.localeCompare(right.matchedName)),
  };
}
