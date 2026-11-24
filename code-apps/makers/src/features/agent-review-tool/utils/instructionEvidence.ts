import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import { MISSING_INSTRUCTION_INPUT_ID } from '../contracts/StageOutputs';
import type { ComplianceIssue, CriterionAssessment, InstructionEvaluation, ReviewEvidence } from '../contracts/StageOutputs';
import { getInstructionAssessments, getIssueCriterionId, isAssessmentStatus, STANDARD_REVIEW_POLICY_VERSION } from './reviewAssessment';
import { recordValue, textValue } from './topicApplicability';

const missingAssessment = 'No explicit assessment was supplied for this criterion. An omitted issue does not establish Pass.';
const incompleteResponse = 'Per-criterion completion evidence is missing, unreadable, ambiguous, or contradicted. An issue list or model percentage does not establish Pass.';
const evidenceSetting = 'Agent instructions';
const verifiedQuoteReason = 'The exact quotation matches the reviewed instruction snapshot; this does not establish complete coverage or runtime behavior.';
const scopeCriteria = new Set(['scope-definition', 'out-of-scope-handling']);
const guidanceCriteria = new Set(['escalation-guidance', 'fallback-when-uncertain']);
const severities = new Set(['High', 'Medium', 'Low']);
const legacySeverityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const evidenceSources = new Set(['instructions', 'configuration', 'ai-response']);
const evidenceStatuses = new Set(['verified', 'unverified', 'unavailable']);

/** Check for instruction text without changing the snapshot sent for assessment. */
export function hasInstructionText(instructions: unknown): instructions is string {
  return typeof instructions === 'string' && !!instructions.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function appendReason(previous: string | undefined, reason: string): string {
  return previous?.includes(reason) ? previous : previous ? `${previous} ${reason}` : reason;
}

function needsAssessment(issue: ComplianceIssue, reason: string): ComplianceIssue {
  return { ...issue, assessmentStatus: 'not-assessed', assessmentReason: appendReason(issue.assessmentReason, reason) };
}

function hasOptionalText(row: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => row[key] === undefined || typeof row[key] === 'string');
}

function normalizeSeverity(value: unknown): ComplianceIssue['severity'] | undefined {
  if (typeof value !== 'string') return undefined;
  return legacySeverityMap[value.toLowerCase()] ?? (severities.has(value) ? value as ComplianceIssue['severity'] : undefined);
}

function fallbackIssueTitle(row: Record<string, unknown>): string | undefined {
  const criterionId = getIssueCriterionId({
    id: textValue(row.id) ?? '',
    criteriaId: textValue(row.criteriaId),
  });
  return COMPLIANCE_CRITERIA.find(criterion => criterion.id === criterionId)?.name
    ?? textValue(row.guidelineReference)?.trim()
    ?? 'Legacy instruction finding';
}

function normalizeIssue(value: unknown): ComplianceIssue | undefined {
  const row = recordValue(value);
  const id = textValue(row?.id);
  const description = textValue(row?.description);
  const recommendation = textValue(row?.recommendation);
  const severity = normalizeSeverity(row?.severity);
  const hasSuppliedTitle = !!row && Object.prototype.hasOwnProperty.call(row, 'title');
  const suppliedTitle = row?.title;
  if (hasSuppliedTitle && suppliedTitle !== undefined && (typeof suppliedTitle !== 'string' || !suppliedTitle.trim())) {
    return undefined;
  }
  const title = hasSuppliedTitle ? textValue(suppliedTitle) : row ? fallbackIssueTitle(row) : undefined;
  if (!row || !id?.trim() || !description?.trim() || recommendation === undefined || !title?.trim() || !severity
    || !hasOptionalText(row, ['criteriaId', 'category', 'assessmentReason', 'uncoveredSituation', 'guidelineReference'])
    || (row.assessmentStatus !== undefined && row.assessmentStatus !== 'fail' && row.assessmentStatus !== 'not-assessed')
    || (row.coverage !== undefined && (typeof row.coverage !== 'string'
      || !['missing', 'incomplete', 'unclear'].includes(row.coverage)))) return undefined;
  if (row.evidence !== undefined) {
    const evidence = recordValue(row.evidence);
    if (!evidence || typeof evidence.source !== 'string' || !evidenceSources.has(evidence.source)
      || typeof evidence.status !== 'string' || !evidenceStatuses.has(evidence.status)
      || !hasOptionalText(evidence, ['setting', 'quote', 'reason'])) return undefined;
  }
  return {
    id,
    criteriaId: textValue(row.criteriaId),
    title,
    description,
    recommendation,
    severity,
    guidelineReference: textValue(row.guidelineReference),
    category: textValue(row.category),
    assessmentStatus: row.assessmentStatus,
    assessmentReason: textValue(row.assessmentReason),
    uncoveredSituation: textValue(row.uncoveredSituation),
    coverage: row.coverage as ComplianceIssue['coverage'] | undefined,
    evidence: row.evidence === undefined ? undefined : {
      source: recordValue(row.evidence)!.source as ReviewEvidence['source'],
      status: recordValue(row.evidence)!.status as ReviewEvidence['status'],
      setting: textValue(recordValue(row.evidence)!.setting),
      quote: textValue(recordValue(row.evidence)!.quote),
      reason: textValue(recordValue(row.evidence)!.reason),
    },
  };
}

function readableIssue(value: unknown): value is ComplianceIssue {
  return normalizeIssue(value) !== undefined;
}

function readableAssessments(value: unknown): value is CriterionAssessment[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(item => {
    const row = recordValue(item);
    return !!row && typeof row.criteriaId === 'string' && isAssessmentStatus(row.status)
      && getIssueCriterionId({ id: row.criteriaId }) !== undefined && hasOptionalText(row, ['reason']);
  }));
}

function normalizeAssessments(value: unknown): CriterionAssessment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CriterionAssessment[] => {
    const row = recordValue(item);
    const id = textValue(row?.criteriaId);
    const criteriaId = id === undefined ? undefined : getIssueCriterionId({ id });
    if (!row || !criteriaId) return [];
    if (!isAssessmentStatus(row.status) || !hasOptionalText(row, ['reason'])) {
      return [{ criteriaId, status: 'not-assessed', reason: 'The returned criterion outcome is unreadable.' }];
    }
    return [{ criteriaId, status: row.status, reason: textValue(row.reason) }];
  });
}

function unreadableIssue(value: unknown, index: number): ComplianceIssue {
  const row = recordValue(value);
  const raw = JSON.stringify(value) ?? String(value);
  return {
    id: textValue(row?.id) ?? `unreadable-instruction-issue-${index + 1}`,
    criteriaId: textValue(row?.criteriaId),
    title: textValue(row?.title) ?? 'Unreadable instruction finding',
    description: textValue(row?.description) ?? 'The original Stage C finding could not be read.',
    recommendation: textValue(row?.recommendation) ?? 'Review the original Stage C response before reassessing.',
    severity: 'Low', assessmentStatus: 'not-assessed',
    assessmentReason: 'The result entry is unreadable; the placeholder severity is not an assessed failure.',
    evidence: {
      source: 'ai-response', status: 'unverified', quote: raw,
      reason: 'The original unreadable result entry is retained as unverified response evidence.',
    },
  };
}

function validateEvidence(issue: ComplianceIssue, instructions: string): ComplianceIssue {
  const evidence = issue.evidence;
  if (evidence && evidence.source !== 'instructions') {
    const reason = 'Instruction text cannot verify evidence attributed to configuration or an AI response.';
    return needsAssessment({
      ...issue, evidence: { ...evidence, status: 'unverified', reason: appendReason(evidence.reason, reason) },
    }, reason);
  }
  const quote = evidence?.quote;
  const status = !quote?.trim() ? 'unavailable' : instructions.includes(quote) ? 'verified' : 'unverified';
  const reason = status === 'verified'
    ? verifiedQuoteReason
    : status === 'unavailable' ? 'No exact reviewed instruction quotation was supplied.'
      : 'The quotation does not exactly match the reviewed instruction snapshot.';
  const result: ComplianceIssue = {
    ...issue,
    evidence: {
      ...evidence, source: 'instructions', setting: evidence?.setting ?? evidenceSetting,
      status, reason: appendReason(evidence?.reason, reason),
    },
  };
  return status === 'unverified' ? needsAssessment(result, reason) : result;
}

function isBroadAbsence(issue: ComplianceIssue, criterionId: string): boolean {
  if ((!scopeCriteria.has(criterionId) && !guidanceCriteria.has(criterionId))
    || issue.uncoveredSituation?.trim() || (issue.coverage && issue.coverage !== 'missing')) return false;
  // Preserve localized legacy gaps even when the old prompt omitted uncoveredSituation.
  const context = issue.description.replace(
    /\b(?:when|if) (?:(?:the )?(?:agent|assistant|you) )?(?:cannot help|can't help|(?:is |are )?(?:uncertain|unsure|unable to help)|lacks? (?:information|knowledge))\b/gi, '',
  );
  if (/\b(when|if|after|during|unless|except)\b/i.test(context)) return false;
  const text = `${issue.title} ${issue.description}`;
  const absence = /\b(no|without|missing|lacks?|absent|absence|not (?:provided|specified|defined|included)|does not (?:provide|specify|define|include))\b/i;
  const subject = scopeCriteria.has(criterionId)
    ? /\b(scope|boundar(?:y|ies)|exclusions?|assignments?|services?|responsibilit(?:y|ies))\b/i
    : /\b(escalation|handoff|hand-off|uncertainty|uncertain|fallback|human support)\b/i;
  return absence.test(text) && subject.test(text);
}

function findGuidance(instructions: string, criterionId: string): string | undefined {
  const sentences = instructions.match(/[^.!?\r\n]+[.!?]?/g) ?? [];
  return sentences.map(sentence => sentence.trim()).find(sentence => {
    const text = sentence.replace(/^(?:[-*]|\d+[.)])\s+/, '');
    if (/\b(example|sample|evaluator|quoted)\b/i.test(text)) return false;
    if (scopeCriteria.has(criterionId)) {
      return /^(?:(?:you|the agent) (?:must|should) )?(?:do not|never|only) (?:provide|handle|manage|answer|support|process)\b.+\b(services?|requests?|registrations?|bookings?|questions?)\b/i.test(text)
        || /^(?:excluded services|out-of-scope services|service exclusions|service assignments):\s*\S/i.test(text)
        || /\b(?:is|are) responsible for\s+\S/i.test(text)
        || /^(?:route|direct|refer|assign)\b.+\brequests?\b.+\bto\b.+/i.test(text);
    }
    if (/\b(?:do not|don't|never|must not)\s+(?:escalate|contact|direct|refer|ask|hand off)\b/i.test(text)) return false;
    const action = /\b(contact|ask|direct|refer|escalate|hand off|explain|say|tell|suggest|admit|decline)\b/i;
    const uncertainty = /\b(unknown|uncertain|unsure|cannot|can't|unavailable|missing|unable|lack)\b/i;
    const destination = /\b(human|desk|team|coordinator|support|operator)\b/i;
    const directive = /^(?:if|when|for)\b/i.test(text)
      || /^(?:(?:you (?:must|should)|always) )?(?:contact|ask|direct|refer|escalate|hand off|admit|decline)\b/i.test(text);
    return directive && action.test(text)
      && (criterionId === 'fallback-when-uncertain' ? uncertainty.test(text) : destination.test(text) || uncertainty.test(text));
  });
}

function validateIssue(issue: ComplianceIssue, instructions: string, inputAvailable: boolean): ComplianceIssue {
  let result = validateEvidence({ ...issue, assessmentStatus: issue.assessmentStatus ?? 'fail' }, instructions);
  if (issue.id === MISSING_INSTRUCTION_INPUT_ID) {
    return inputAvailable
      ? needsAssessment(result, 'A non-empty instruction snapshot was supplied; the missing-instructions claim cannot be used.')
      : { ...result, coverage: 'missing', assessmentReason: appendReason(result.assessmentReason, 'No instructions were supplied.') };
  }
  const criterionId = getIssueCriterionId(issue);
  if (!criterionId) return needsAssessment(result, 'The finding does not identify a supported instruction criterion.');
  if (!isBroadAbsence(issue, criterionId)) return result;
  const guidance = findGuidance(instructions, criterionId);
  if (guidance && !issue.evidence?.quote?.trim()
    && (!issue.evidence || issue.evidence.source === 'instructions')) {
    const evidence: ReviewEvidence = {
      source: 'instructions', status: 'verified', setting: evidenceSetting, quote: guidance,
      reason: verifiedQuoteReason,
    };
    result = { ...result, evidence };
  }
  return needsAssessment({ ...result, coverage: 'unclear' }, guidance
    ? 'The snapshot contains potentially relevant guidance. It may be partial and does not establish complete coverage. Identify a specific uncovered situation through semantic assessment instead of asserting total absence.'
    : 'Local text checks cannot establish that guidance is absent. Identify a specific uncovered situation through semantic assessment; no complete coverage or failure is mechanically established.');
}

function criterionAssessments(
  evaluation: InstructionEvaluation, supplied: unknown, missingInput: boolean, incomplete: boolean,
): CriterionAssessment[] {
  const normalized = normalizeAssessments(supplied);
  const assessments: CriterionAssessment[] = COMPLIANCE_CRITERIA.map(criterion => {
    if (missingInput) return { criteriaId: criterion.id, status: 'fail', reason: 'No instructions were supplied.' };
    const issues = evaluation.issues.filter(issue => getIssueCriterionId(issue) === criterion.id);
    const failed = issues.find(issue => issue.assessmentStatus === 'fail');
    if (failed) return { criteriaId: criterion.id, status: 'fail', reason: failed.assessmentReason };
    if (issues.length) return {
      criteriaId: criterion.id, status: 'not-assessed', reason: issues[0].assessmentReason,
    };
    const matches = normalized.filter(assessment => assessment.criteriaId === criterion.id);
    if (matches.length === 1) return incomplete && matches[0].status !== 'fail'
      ? { criteriaId: criterion.id, status: 'not-assessed', reason: incompleteResponse } : matches[0];
    return {
      criteriaId: criterion.id, status: 'not-assessed',
      reason: matches.length > 1 ? 'The response supplied conflicting or duplicate criterion assessments.' : missingAssessment,
    };
  });
  return getInstructionAssessments({ ...evaluation, criterionAssessments: assessments });
}

/**
 * Validate Stage C findings against the unchanged instruction snapshot before scoring.
 * Exact quotations are checked, not semantic completeness. Original finding text is retained.
 * Scores are deliberately invalidated; the caller must use the shared assessment-based scorer.
 */
export function validateInstructionEvaluation(
  evaluation: InstructionEvaluation, instructions: string,
): InstructionEvaluation {
  const row = recordValue(evaluation);
  const source = typeof instructions === 'string' ? instructions : '';
  const inputAvailable = hasInstructionText(instructions);
  const rawIssues: unknown[] = Array.isArray(row?.issues) ? row.issues
    : row?.issues !== undefined ? [row.issues] : [];
  const validAssessments = readableAssessments(row?.criterionAssessments);
  const malformed = !row || !Array.isArray(row.issues) || !rawIssues.every(readableIssue)
    || typeof row.compliancePercentage !== 'number' || !Number.isFinite(row.compliancePercentage)
    || row.compliancePercentage < 0 || row.compliancePercentage > 100 || !validAssessments
    || !hasOptionalText(row, ['summary', 'assessmentReason'])
    || (row.compliance !== undefined && typeof row.compliance !== 'boolean')
    || (row.assessmentStatus !== undefined && !isAssessmentStatus(row.assessmentStatus));
  const issues = rawIssues.map((value, index) => {
    const issue = normalizeIssue(value);
    return issue ? validateIssue(issue, source, inputAvailable) : unreadableIssue(value, index);
  });
  const missingInput = typeof instructions === 'string' && !inputAvailable
    && issues.some(issue => issue.id === MISSING_INSTRUCTION_INPUT_ID && issue.assessmentStatus === 'fail');
  const result: InstructionEvaluation = {
    ...row, issues, summary: textValue(row?.summary),
    assessmentStatus: row?.assessmentStatus === 'not-assessed' || row?.assessmentStatus === 'not-applicable'
      ? row.assessmentStatus : undefined,
    assessmentReason: textValue(row?.assessmentReason),
    compliancePercentage: 0, compliance: undefined, scoreAvailable: false,
    policyVersion: STANDARD_REVIEW_POLICY_VERSION,
  };
  if (malformed) {
    result.assessmentReason = appendReason(result.assessmentReason,
      'Stage C returned a partially unreadable evaluation. Independently established failures are retained; other completion claims require assessment.');
  }
  if (!inputAvailable && !missingInput) {
    const reason = 'No readable instruction snapshot was supplied. No instruction assessment is asserted.';
    result.assessmentStatus = 'not-assessed';
    result.assessmentReason = appendReason(result.assessmentReason, reason);
    result.issues = result.issues.map(issue => needsAssessment(issue, reason));
  }
  result.criterionAssessments = criterionAssessments(
    result, row?.criterionAssessments, missingInput,
    malformed || issues.some(issue => getIssueCriterionId(issue) === undefined),
  );
  if (result.criterionAssessments.some(assessment => assessment.status === 'not-assessed')) {
    result.assessmentReason = appendReason(result.assessmentReason, incompleteResponse);
  }
  if (result.assessmentStatus !== 'not-applicable'
    && !result.criterionAssessments.some(assessment => assessment.status === 'pass' || assessment.status === 'fail')) {
    result.assessmentStatus = 'not-assessed';
    result.assessmentReason = appendReason(result.assessmentReason, 'No completed instruction criterion assessment is available.');
  }
  return result;
}
