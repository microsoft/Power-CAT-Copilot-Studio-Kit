import type {
  RejectedStandardReviewCandidate,
  StandardReviewCandidate,
  StandardReviewCandidateNormalization,
  StandardReviewCandidateEvidence,
  StandardReviewNotAssessed,
  StandardReviewRule,
  StandardReviewUnit,
  StandardReviewUnitResult,
  ValidatedStandardReviewCandidate,
  ValidatedStandardReviewEvidence,
} from '../contracts/StandardReviewWorkflow';
import type { ContextualRemediation } from '../contracts/StageOutputs';
import { getStandardWorkflowRule } from './standardReviewWorkflowRules';
import { hasInstructionText } from './instructionEvidence';
import { parseArc2StandardUnitResult } from '../agents-experience/services/jobs/aiWorkflowNodeOutput';

export interface StandardReviewUnitValidation {
  accepted: ValidatedStandardReviewCandidate[];
  notAssessed: StandardReviewNotAssessed[];
  rejected: RejectedStandardReviewCandidate[];
  normalizations: StandardReviewCandidateNormalization[];
  incomplete: boolean;
  unattributedIncomplete: boolean;
}

const FINDING_TITLE_MAX_LENGTH = 200;
const FINDING_TITLE_INPUT_MAX_LENGTH = 4000;
const FINDING_TITLE_NORMALIZATION_REASON =
  'The generated title exceeded the display limit and was shortened.';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function remediationText(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= maximumLength ? text : undefined;
}

export function parseContextualRemediation(
  value: unknown,
): ContextualRemediation | undefined | null {
  if (value === undefined) return undefined;
  const row = record(value);
  if (!row) return null;
  const keys = [
    'findingTitle',
    'whyItMatters',
    'makerAction',
    'suggestedText',
    'acceptanceCheck',
  ];
  if (!keys.some((key) => row[key] !== undefined)) return undefined;
  const rawFindingTitle = remediationText(row.findingTitle, FINDING_TITLE_INPUT_MAX_LENGTH);
  const findingTitle = rawFindingTitle && rawFindingTitle.length > FINDING_TITLE_MAX_LENGTH
    ? `${rawFindingTitle.slice(0, FINDING_TITLE_MAX_LENGTH - 3)}...`
    : rawFindingTitle;
  const whyItMatters = remediationText(row.whyItMatters, 2000);
  const makerAction = remediationText(row.makerAction, 2000);
  const acceptanceCheck = remediationText(row.acceptanceCheck, 2000);
  const suggestedText = row.suggestedText === undefined
    ? undefined
    : remediationText(row.suggestedText, 4000);
  if (!findingTitle || !whyItMatters || !makerAction || !acceptanceCheck
    || (row.suggestedText !== undefined && !suggestedText)) return null;
  return {
    findingTitle,
    whyItMatters,
    makerAction,
    ...(suggestedText ? { suggestedText } : {}),
    acceptanceCheck,
  };
}

interface ParsedStandardReviewCandidate {
  value: StandardReviewCandidate;
  normalizations: StandardReviewCandidateNormalization[];
}

function candidate(
  value: unknown,
  unit: StandardReviewUnit,
): ParsedStandardReviewCandidate | undefined {
  const row = record(value);
  if (!row || typeof row.ruleId !== 'string'
    || !Array.isArray(row.affectedComponentIds)
    || !row.affectedComponentIds.every((item) => typeof item === 'string' && item.trim())
    || !Array.isArray(row.evidence)) return undefined;
  const evidence = row.evidence.flatMap((item): StandardReviewCandidateEvidence[] => {
    const detail = record(item);
    return detail
      && typeof detail.componentId === 'string'
      && typeof detail.fieldPath === 'string'
      && typeof detail.quote === 'string'
      ? [{
        componentId: detail.componentId,
        fieldPath: detail.fieldPath,
        quote: detail.quote,
      }]
      : [];
  });
  if (evidence.length !== row.evidence.length) return undefined;
  const remediation = parseContextualRemediation(row);
  if (remediation === null) return undefined;
  const originalTitle = typeof row.findingTitle === 'string'
    ? row.findingTitle.trim()
    : undefined;
  return {
    value: {
      ruleId: row.ruleId,
      affectedComponentIds: row.affectedComponentIds,
      evidence,
      ...(remediation ?? {}),
    },
    normalizations: originalTitle
      && remediation?.findingTitle
      && originalTitle.length > FINDING_TITLE_MAX_LENGTH
      ? [{
          unitId: unit.unitId,
          ruleId: row.ruleId,
          field: 'findingTitle',
          originalLength: originalTitle.length,
          normalizedLength: remediation.findingTitle.length,
          reason: FINDING_TITLE_NORMALIZATION_REASON,
        }]
      : [],
  };
}

function notAssessed(value: unknown): StandardReviewNotAssessed | undefined {
  const row = record(value);
  return row && typeof row.ruleId === 'string'
    && typeof row.reason === 'string' && row.reason.trim()
    ? { ruleId: row.ruleId, reason: row.reason }
    : undefined;
}

/**
 * Parse the strict envelope returned by one Standard Review workflow unit.
 *
 * Two envelopes arrive here and they are told apart by contract, not by
 * guesswork: an ARC2 `arc2-node-output-v4` payload is projected first, because
 * it nests its arrays under `result` and names the failures `exceptions`, so
 * every field the legacy read below looks for is `undefined` and a complete
 * review would throw. Anything else is read as the ART shape exactly as before.
 */
export function parseStandardReviewUnitResult(value: unknown): StandardReviewUnitResult {
  const arc2 = parseArc2StandardUnitResult(value);
  if (arc2) return arc2;
  const row = record(value);
  if (!row || !Array.isArray(row.findings) || !Array.isArray(row.notAssessed)) {
    throw new Error('The Standard Review workflow returned an unreadable result envelope.');
  }
  return {
    status: row.status === 'complete' ? 'complete' : 'partial',
    findings: row.findings as StandardReviewCandidate[],
    notAssessed: row.notAssessed as StandardReviewNotAssessed[],
  };
}

function fieldValue(component: ValidatedStandardReviewEvidence['component'], path: string): unknown {
  let value: unknown = component;
  for (const part of path.split('.')) {
    const row = record(value);
    if (!row || !Object.prototype.hasOwnProperty.call(row, part)) return undefined;
    value = row[part];
  }
  return value;
}

function exactFieldContains(value: unknown, quote: string): boolean {
  if (typeof value === 'string') {
    return value.includes(quote)
      || value.replace(/\s+/g, ' ').trim().includes(quote.replace(/\s+/g, ' ').trim());
  }
  if (Array.isArray(value)) return value.some((item) => exactFieldContains(item, quote));
  const row = record(value);
  return row ? Object.values(row).some((item) => exactFieldContains(item, quote)) : false;
}

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'been', 'being', 'can', 'does',
  'detail', 'for', 'from', 'handle', 'has', 'have', 'information', 'into',
  'only', 'provide', 'related', 'request', 'should', 'that', 'the', 'their',
  'them', 'then', 'this', 'topic', 'tool', 'use', 'user', 'users', 'when',
  'where', 'which', 'with', 'your',
]);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.map((word) =>
    word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word)) ?? [];
}

function bigrams(text: string): Set<string> {
  const words = tokens(text);
  return new Set(words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`));
}

function provesSharedIntent(
  affectedComponentIds: string[],
  evidence: ValidatedStandardReviewEvidence[],
): boolean {
  if (affectedComponentIds.length < 2) return false;
  const descriptions = affectedComponentIds.map((componentId) =>
    evidence.filter((item) => item.componentId === componentId)
      .map((item) => item.quote).join(' '));
  const phraseSets = descriptions.map((description) =>
    bigrams(description));
  if (phraseSets.some((set) => set.size === 0)) return false;
  const commonPhrases = [...phraseSets[0]].filter((phrase) =>
    phraseSets.slice(1).every((set) => set.has(phrase)));
  if (commonPhrases.length > 0) return true;
  const termSets = descriptions.map((description) =>
    new Set(tokens(description)));
  if (termSets.some((set) => set.size < 2)) return false;
  const commonTerms = [...termSets[0]].filter((term) =>
    termSets.slice(1).every((set) => set.has(term)));
  return commonTerms.length >= 2;
}

function semanticTermsMatch(rule: StandardReviewRule, evidence: ValidatedStandardReviewEvidence[]): boolean {
  if (evidence.some((item) => item.evidenceMode === 'complete-field-review')) return true;
  const template = getStandardWorkflowRule(rule.ruleId);
  const terms = template?.semanticTerms ?? [];
  if (terms.length === 0) return true;
  const text = evidence.map((item) => item.quote).join(' ').toLowerCase();
  return terms.some((term) => text.includes(term));
}

function variableFieldIsBlank(
  finding: StandardReviewCandidate,
  evidence: ValidatedStandardReviewEvidence[],
): boolean {
  if (finding.ruleId !== 'STD-PATTERN-INPUT-DESCRIPTION'
    && finding.ruleId !== 'STD-PATTERN-OUTPUT-DESCRIPTION') return false;
  return evidence.some((item) => {
    const value = fieldValue(item.component, item.fieldPath);
    return Array.isArray(value) && value.some((entry) => {
      const variable = record(entry);
      return variable?.description === '' && JSON.stringify(variable).includes(item.quote);
    });
  });
}

function reject(
  unit: StandardReviewUnit,
  ruleId: string | undefined,
  reason: string,
  outcomeImpact: RejectedStandardReviewCandidate['outcomeImpact'] = 'incomplete',
): RejectedStandardReviewCandidate {
  return { unitId: unit.unitId, ruleId, reason, outcomeImpact };
}

function isMisclassifiedInstructionFinding(
  finding: StandardReviewCandidate,
): boolean {
  if (finding.ruleId !== 'scope-definition'
    && finding.ruleId !== 'tool-routing-hints') return false;
  const text = [
    finding.findingTitle,
    finding.whyItMatters,
    finding.makerAction,
    ...finding.evidence.map((item) => item.quote),
  ].filter(Boolean).join(' ').toLowerCase();
  return /\boverlap|\bcollid|same (?:request|intent)/.test(text);
}

function completeInstructionsDefineFallback(
  evidence: ValidatedStandardReviewEvidence[],
): boolean {
  const instructions = evidence.map((item) => item.component.fields.instructions)
    .find(hasInstructionText);
  if (typeof instructions !== 'string') return false;
  const hasFailureCondition =
    /\b(?:fail(?:s|ed)?(?:\s+to)?|unable|unavailable|uncertain|unknown|unresolved|no (?:usable )?(?:answer|response)|did not help|does not help|didn't help)\b/i
      .test(instructions);
  const hasNextStep =
    /\b(?:ticket|escalat\w*|contact|support|handoff|hand-off|transfer|redirect|route)\b/i
      .test(instructions);
  return hasFailureCondition && hasNextStep;
}

function completeInstructionsDefineScope(
  evidence: ValidatedStandardReviewEvidence[],
): boolean {
  const instructions = evidence.map((item) => item.component.fields.instructions)
    .find(hasInstructionText);
  if (typeof instructions !== 'string') return false;
  const routingClauses = instructions.split(/\r?\n/).filter((line) =>
    /\b(?:if|when)\b.{0,120}\b(?:query|request|question)\b.{0,800}\b(?:route|call|use|redirect|transfer)\b/i
      .test(line));
  return routingClauses.length >= 2;
}

function validateCandidate(
  raw: StandardReviewCandidate,
  unit: StandardReviewUnit,
): ValidatedStandardReviewCandidate | RejectedStandardReviewCandidate {
  const rule = unit.corpus.standardReview.rules.find((item) => item.ruleId === raw.ruleId);
  if (!getStandardWorkflowRule(raw.ruleId)) {
    return reject(unit, raw.ruleId, 'The candidate uses an unregistered rule ID.', 'discarded');
  }
  if (!rule) {
    return reject(unit, raw.ruleId, 'The rule does not belong to this review unit.', 'discarded');
  }
  if (rule.applicability.status !== 'applicable') {
    return reject(
      unit,
      raw.ruleId,
      `The rule is ${rule.applicability.status} for this snapshot.`,
      'discarded',
    );
  }
  if (raw.affectedComponentIds.length === 0
    || new Set(raw.affectedComponentIds).size !== raw.affectedComponentIds.length) {
    return reject(unit, raw.ruleId, 'The candidate must identify distinct affected components.');
  }
  const components = new Map(unit.corpus.agent.components.map((item) => [item.componentId, item]));
  const eligible = new Set(rule.applicability.eligibleComponentIds);
  if (raw.affectedComponentIds.some((id) => !components.has(id))) {
    return reject(unit, raw.ruleId, 'An affected component is not in the reviewed unit snapshot.');
  }
  if (raw.affectedComponentIds.some((id) => !eligible.has(id))) {
    return reject(unit, raw.ruleId, 'An affected component is not eligible for this rule.');
  }
  if (raw.evidence.length === 0) {
    return reject(unit, raw.ruleId, 'The candidate has no exact evidence.');
  }
  const allowed = new Set(rule.requiredEvidence.allowedFieldPaths);
  const evidence: ValidatedStandardReviewEvidence[] = [];
  for (const item of raw.evidence) {
    const component = components.get(item.componentId);
    const isEligibleRoutingContext = raw.ruleId === 'STD-PATTERN-TOOL-ROUTING-GAP'
      && eligible.has(item.componentId);
    if (!component
      || (!raw.affectedComponentIds.includes(item.componentId) && !isEligibleRoutingContext)) {
      return reject(unit, raw.ruleId, 'Evidence refers to a component outside the candidate.');
    }
    const reviewedField = fieldValue(component, item.fieldPath);
    const isAbsenceEvidence = item.quote.trim().length === 0;
    if (isAbsenceEvidence) {
      if (!allowed.has(item.fieldPath)
        || !rule.requiredEvidence.allowEmptyQuoteForAbsence
        || item.fieldPath !== 'fields.instructions'
        || !hasInstructionText(reviewedField)) {
        return reject(
          unit,
          raw.ruleId,
          'Empty evidence is allowed only for a missing-guidance assessment of complete agent instructions.',
        );
      }
      evidence.push({
        ...item,
        component,
        evidenceMode: 'complete-field-review',
      });
      continue;
    }
    const validated: ValidatedStandardReviewEvidence = {
      ...item,
      component,
      evidenceMode: 'exact-quote',
    };
    if (variableFieldIsBlank(raw, [validated])) {
      return reject(
        unit,
        raw.ruleId,
        'A deterministic missing-field rule owns this blank variable description.',
        'discarded',
      );
    }
    if (!allowed.has(item.fieldPath)) {
      return reject(unit, raw.ruleId, 'Evidence uses a field that this rule does not allow.');
    }
    if (!exactFieldContains(reviewedField, item.quote)) {
      return reject(unit, raw.ruleId, 'An evidence quote does not exactly match the stated component field.');
    }
    evidence.push(validated);
  }
  const evidenced = new Set(evidence.map((item) => item.componentId));
  let affectedComponentIds = raw.affectedComponentIds;
  if (raw.affectedComponentIds.some((id) => !evidenced.has(id))) {
    if (rule.category !== 'instructions') {
      return reject(unit, raw.ruleId, 'Every affected component must have exact evidence.');
    }
    affectedComponentIds = raw.affectedComponentIds.filter((id) => evidenced.has(id));
    if (affectedComponentIds.length === 0) {
      return reject(unit, raw.ruleId, 'No affected component has exact evidence.');
    }
  }
  if (raw.ruleId === 'STD-ROUTE-TOPIC-OVERLAP'
    && !provesSharedIntent(affectedComponentIds, evidence)) {
    return reject(
      unit,
      raw.ruleId,
      'The evidence does not establish a shared multi-word intent across distinct components.',
      'discarded',
    );
  }
  if (isMisclassifiedInstructionFinding(raw)) {
    return reject(
      unit,
      raw.ruleId,
      'The candidate describes routing overlap owned by the routing review unit.',
      'discarded',
    );
  }
  if (raw.ruleId === 'scope-definition'
    && completeInstructionsDefineScope(evidence)) {
    return reject(
      unit,
      raw.ruleId,
      'The complete instructions already define the supported domains through explicit routing rules.',
      'discarded',
    );
  }
  if (raw.ruleId === 'fallback-when-uncertain'
    && completeInstructionsDefineFallback(evidence)) {
    return reject(
      unit,
      raw.ruleId,
      'The complete instructions already define a failure condition and an escalation or support path.',
      'discarded',
    );
  }
  if (!semanticTermsMatch(rule, evidence)) {
    // Unlike the guards above, this is not a positive determination that the rule is
    // satisfied or owned elsewhere - the relevance of the evidence simply could not be
    // confirmed. A 'discarded' outcome would render the criterion as a pass.
    return reject(
      unit,
      raw.ruleId,
      'The exact evidence is not relevant to the registered rule.',
    );
  }
  const remediation = parseContextualRemediation(raw);
  if (!remediation) {
    return reject(
      unit,
      raw.ruleId,
      'Every finding must include a complete contextual remediation.',
    );
  }
  return {
    ...raw,
    affectedComponentIds,
    remediation,
    unitId: unit.unitId,
    componentIndex: unit.componentIndex,
    rule,
    evidence,
  };
}

function signature(value: ValidatedStandardReviewCandidate): string {
  return JSON.stringify([
    value.ruleId,
    [...value.affectedComponentIds].sort(),
    value.evidence.map((item) =>
      [item.componentId, item.fieldPath, item.quote]).sort(),
  ]);
}

/** Validate and deduplicate all candidates returned for one review unit. */
export function validateStandardReviewUnit(
  unit: StandardReviewUnit,
  rawValue: unknown,
): StandardReviewUnitValidation {
  const raw = parseStandardReviewUnitResult(rawValue);
  const accepted: ValidatedStandardReviewCandidate[] = [];
  const rejected: RejectedStandardReviewCandidate[] = [];
  const normalizations: StandardReviewCandidateNormalization[] = [];
  let incomplete = raw.status !== 'complete';
  let unattributedIncomplete = raw.status !== 'complete';
  for (const value of raw.findings) {
    const parsed = candidate(value, unit);
    if (!parsed) {
      incomplete = true;
      const row = record(value);
      const ruleId = typeof row?.ruleId === 'string' ? row.ruleId : undefined;
      if (!ruleId) unattributedIncomplete = true;
      const reason = row
        && parseContextualRemediation(row) === null
        ? 'The workflow returned an invalid contextual remediation block.'
        : 'The workflow returned an unreadable candidate.';
      rejected.push(reject(unit, ruleId, reason));
      continue;
    }
    normalizations.push(...parsed.normalizations);
    const result = validateCandidate(parsed.value, unit);
    if ('reason' in result && !('evidence' in result)) rejected.push(result);
    else accepted.push(result as ValidatedStandardReviewCandidate);
  }
  const assessed: StandardReviewNotAssessed[] = [];
  for (const value of raw.notAssessed) {
    const parsed = notAssessed(value);
    if (!parsed) {
      incomplete = true;
      const row = record(value);
      const ruleId = typeof row?.ruleId === 'string' ? row.ruleId : undefined;
      if (!ruleId) unattributedIncomplete = true;
      rejected.push(reject(
        unit,
        ruleId,
        'The workflow returned an unreadable not-assessed result.',
      ));
      continue;
    }
    if (!unit.corpus.standardReview.rules.some((item) => item.ruleId === parsed.ruleId)) {
      incomplete = true;
      rejected.push(reject(unit, parsed.ruleId, 'A not-assessed rule does not belong to this unit.'));
      continue;
    }
    assessed.push(parsed);
    const rule = unit.corpus.standardReview.rules.find((item) =>
      item.ruleId === parsed.ruleId);
    if (rule?.applicability.status === 'applicable') incomplete = true;
  }
  const seen = new Set<string>();
  return {
    accepted: accepted.filter((item) => {
      const key = signature(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    notAssessed: assessed,
    rejected,
    normalizations,
    incomplete: incomplete || rejected.some((item) => item.outcomeImpact === 'incomplete'),
    unattributedIncomplete,
  };
}
