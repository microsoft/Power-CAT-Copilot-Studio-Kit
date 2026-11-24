import type {
  ComplianceIssue,
  InstructionEvaluation,
  LocalStageAOutput,
  Pattern,
  PatternEvaluation,
  PatternTopic,
} from '../contracts/StageOutputs';
import type {
  StandardReviewCorpusComponent,
  StandardReviewRule,
  StandardReviewValidationDiagnostics,
  StandardReviewWorkflowCorpus,
  ValidatedStandardReviewCandidate,
  ValidatedStandardReviewEvidence,
} from '../contracts/StandardReviewWorkflow';
import { validateStandardPatternEvaluation } from './standardPatternValidation';
import { STANDARD_REVIEW_POLICY_VERSION } from './reviewAssessment';
import {
  STANDARD_INSTRUCTION_WORKFLOW_RULES,
  STANDARD_PATTERN_WORKFLOW_RULES,
  workflowPatternId,
} from './standardReviewWorkflowRules';
import {
  validateStandardReviewUnit,
  type StandardReviewUnitValidation as UnitValidation,
} from './standardReviewCandidateValidation';

export interface StandardReviewWorkflowEvaluation {
  patternEvaluation: PatternEvaluation;
  instructionEvaluation: InstructionEvaluation;
  rejectedCandidateCount: number;
  validationDiagnostics: StandardReviewValidationDiagnostics;
}

function sourceComponentId(component: StandardReviewCorpusComponent): string | undefined {
  return typeof component.facts.sourceComponentId === 'string'
    && component.facts.sourceComponentId.trim()
    ? component.facts.sourceComponentId
    : undefined;
}

function variableValue(
  evidence: ValidatedStandardReviewEvidence,
  want: 'name' | 'description',
): { name?: string; current?: string } {
  const field = evidence.fieldPath.split('.').at(-1);
  const value = field ? evidence.component.fields[field] : undefined;
  if (!Array.isArray(value)) return {};
  const matches = value.flatMap((item): Array<{ name?: string; description?: string }> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (![row.name, row.description].some((entry) =>
      typeof entry === 'string' && entry.includes(evidence.quote))) return [];
    return [{
      name: typeof row.name === 'string' ? row.name : undefined,
      description: typeof row.description === 'string' ? row.description : undefined,
    }];
  });
  if (matches.length !== 1) return {};
  return { name: matches[0].name, current: matches[0][want] };
}

function patternReference(
  finding: ValidatedStandardReviewCandidate,
  evidence: ValidatedStandardReviewEvidence,
): PatternTopic {
  const variableRule = evidence.fieldPath.includes('Variable');
  const wantsName = finding.ruleId === 'STD-PATTERN-INPUT-NAME'
    || finding.ruleId === 'STD-PATTERN-OUTPUT-NAME';
  const variable = variableRule ? variableValue(evidence, wantsName ? 'name' : 'description') : {};
  const current = variableRule
    ? variable.current
    : typeof evidence.component.fields[evidence.fieldPath.split('.').at(-1) ?? ''] === 'string'
      ? evidence.component.fields[evidence.fieldPath.split('.').at(-1) ?? ''] as string
      : evidence.quote;
  const setting = evidence.fieldPath.includes('inputVariable')
    ? wantsName ? 'Input variable name' : 'Input variable description'
    : evidence.fieldPath.includes('outputVariable')
      ? wantsName ? 'Output variable name' : 'Output variable description'
    : finding.ruleId === 'STD-PATTERN-MISSING-TRIGGERS'
      ? 'Trigger phrases'
      : finding.ruleId === 'STD-PATTERN-TOOL-ROUTING-GAP'
        || finding.ruleId === 'STD-ROUTE-TOPIC-OVERLAP'
        ? 'Selection description'
        : evidence.fieldPath === 'fields.description'
          ? 'Selection description'
        : evidence.fieldPath === 'fields.instructions'
            ? 'Agent instructions'
            : evidence.fieldPath === 'fields.modelName'
              ? 'Model-facing name'
              : 'Model description';
  return {
    item: evidence.component.name,
    variable: variable.name,
    current,
    suggested: finding.remediation?.suggestedText,
    componentId: sourceComponentId(evidence.component),
    schemaName: evidence.component.schemaName,
    setting,
    evidence: {
      source: evidence.fieldPath === 'fields.instructions' ? 'instructions' : 'configuration',
      status: 'verified',
      setting,
      quote: variableRule ? variable.current : evidence.quote,
      reason: 'The exact workflow evidence was verified against the reviewed snapshot.',
    },
    assessmentStatus: 'fail',
    assessmentReason: 'The workflow candidate passed the registered rule and exact-evidence checks.',
    remediation: finding.remediation,
  };
}

function references(finding: ValidatedStandardReviewCandidate): PatternTopic[] {
  return finding.affectedComponentIds.flatMap((componentId) => {
    const evidence = finding.evidence
      .filter((item) => item.componentId === componentId)
      .sort((left, right) => right.quote.length - left.quote.length)[0];
    return evidence ? [patternReference(finding, evidence)] : [];
  });
}

function patternStatus(
  rules: StandardReviewRule[],
  validations: UnitValidation[],
  accepted: ValidatedStandardReviewCandidate[],
): Pick<Pattern, 'Status' | 'AssessmentStatus' | 'AssessmentReason'> {
  if (accepted.length > 0) {
    return {
      Status: false,
      AssessmentStatus: 'fail',
      AssessmentReason: 'At least one independent workflow candidate passed deterministic validation.',
    };
  }
  const ruleIds = new Set(rules.map((rule) => rule.ruleId));
  const rejected = validations.some((result) =>
    result.rejected.some((item) => item.outcomeImpact === 'incomplete'
      && (!item.ruleId || ruleIds.has(item.ruleId))));
  if (rules.length > 0
    && rules.every((rule) => rule.applicability.status === 'not-applicable')) {
    return {
      Status: false,
      AssessmentStatus: 'not-applicable',
      AssessmentReason: rules[0]?.applicability.reason ?? 'This check is not applicable.',
    };
  }
  if (validations.some((result) => result.unattributedIncomplete)
    || rejected
    || rules.some((rule) => rule.applicability.status === 'not-assessed')) {
    return {
      Status: false,
      AssessmentStatus: 'not-assessed',
      AssessmentReason: 'The workflow did not establish a complete, valid outcome for this check.',
    };
  }
  return {
    Status: true,
    AssessmentStatus: 'pass',
    AssessmentReason: 'The workflow completed the applicable registered checks without a validated finding.',
  };
}

function projectPatterns(
  stageA: LocalStageAOutput,
  corpus: StandardReviewWorkflowCorpus,
  validations: UnitValidation[],
): PatternEvaluation {
  const workflowRules = corpus.standardReview.reviewUnits.flatMap((unit) =>
    unit.corpus.standardReview.rules);
  const patterns = [...new Set(STANDARD_PATTERN_WORKFLOW_RULES.map((rule) => rule.patternName))]
    .map((patternName): Pattern => {
      const templates = STANDARD_PATTERN_WORKFLOW_RULES.filter((rule) =>
        rule.patternName === patternName);
      const ruleIds = new Set(templates.map((rule) => rule.ruleId));
      const rules = workflowRules.filter((rule) => ruleIds.has(rule.ruleId));
      const relevantValidations = corpus.standardReview.reviewUnits.flatMap((unit, index) =>
        unit.corpus.standardReview.rules.some((rule) => ruleIds.has(rule.ruleId))
          ? [validations[index]]
          : []);
      const accepted = validations.flatMap((result) => result.accepted)
        .filter((finding) => ruleIds.has(finding.ruleId));
      return {
        PatternId: workflowPatternId(patternName),
        PatternName: patternName,
        Description: [...new Set(templates.map((rule) => rule.description))].join(' '),
        Recommendation: [...new Set(templates.map((rule) => rule.recommendation))].join(' '),
        Topics: accepted.flatMap(references),
        ...patternStatus(rules, relevantValidations, accepted),
      };
    });
  return validateStandardPatternEvaluation({ Patterns: patterns }, stageA);
}

function primaryEvidence(
  finding: ValidatedStandardReviewCandidate,
): ValidatedStandardReviewEvidence {
  return finding.evidence.find((item) => item.fieldPath === 'fields.instructions')
    ?? finding.evidence[0];
}

function instructionIssue(
  finding: ValidatedStandardReviewCandidate,
  index: number,
): ComplianceIssue {
  const template = STANDARD_INSTRUCTION_WORKFLOW_RULES.find((item) =>
    item.ruleId === finding.ruleId)!;
  const evidence = primaryEvidence(finding);
  const names = [...new Set(finding.evidence.map((item) => item.component.name))];
  const completeFieldReview = evidence.evidenceMode === 'complete-field-review';
  return {
    id: `${finding.ruleId}-${index + 1}`,
    criteriaId: finding.ruleId,
    title: finding.remediation?.findingTitle ?? template.title,
    description: finding.remediation?.whyItMatters
      ?? `${template.title} is incomplete for ${names.join(', ')}.`,
    recommendation: finding.remediation?.makerAction ?? template.recommendation,
    severity: template.severity,
    category: template.criterionCategory,
    assessmentStatus: 'fail',
    assessmentReason: completeFieldReview
      ? 'The workflow reviewed the complete instruction field and identified missing guidance.'
      : 'The workflow candidate passed the registered rule and exact-evidence checks.',
    coverage: 'incomplete',
    remediation: finding.remediation,
    evidence: {
      source: evidence.fieldPath === 'fields.instructions' ? 'instructions' : 'configuration',
      status: completeFieldReview ? 'unverified' : 'verified',
      setting: evidence.fieldPath,
      ...(evidence.quote ? { quote: evidence.quote } : {}),
      reason: completeFieldReview
        ? 'The complete instruction field was reviewed. Missing guidance has no exact quotation.'
        : 'The exact workflow evidence was verified against the reviewed snapshot.',
    },
  };
}

function projectInstructions(
  corpus: StandardReviewWorkflowCorpus,
  validations: UnitValidation[],
): InstructionEvaluation {
  const instructionUnits = corpus.standardReview.reviewUnits
    .map((unit, index) => ({ unit, validation: validations[index] }))
    .filter(({ unit }) => unit.corpus.standardReview.rules.every((rule) =>
      rule.category === 'instructions'));
  if (instructionUnits.length === 0) {
    throw new Error('Instruction review units are missing from the workflow corpus.');
  }
  const issues = instructionUnits.flatMap(({ validation }) =>
    validation.accepted).map(instructionIssue);
  const criterionAssessments = STANDARD_INSTRUCTION_WORKFLOW_RULES.map((template) => {
    const pair = instructionUnits.find(({ unit }) =>
      unit.corpus.standardReview.rules.some((item) => item.ruleId === template.ruleId));
    const rule = pair?.unit.corpus.standardReview.rules.find((item) =>
      item.ruleId === template.ruleId);
    const validation = pair?.validation;
    if (rule?.applicability.status === 'not-applicable') {
      return {
        criteriaId: template.ruleId,
        status: 'not-applicable' as const,
        reason: rule.applicability.reason,
      };
    }
    if (!validation) {
      return {
        criteriaId: template.ruleId,
        status: 'not-assessed' as const,
        reason: 'A complete validated workflow outcome is unavailable.',
      };
    }
    const accepted = validation.accepted.some((item) => item.ruleId === template.ruleId);
    const rejected = validation.rejected.find((item) =>
      item.outcomeImpact === 'incomplete'
      && (!item.ruleId || item.ruleId === template.ruleId));
    const unavailable = validation.notAssessed.find((item) => item.ruleId === template.ruleId);
    if (accepted) {
      return { criteriaId: template.ruleId, status: 'fail' as const,
        reason: 'A validated workflow finding exists for this criterion.' };
    }
    if (!rule || validation.unattributedIncomplete || rejected || unavailable
      || rule.applicability.status === 'not-assessed') {
      return { criteriaId: template.ruleId, status: 'not-assessed' as const,
        reason: unavailable?.reason
          ?? rejected?.reason
          ?? 'A complete validated workflow outcome is unavailable.' };
    }
    return { criteriaId: template.ruleId, status: 'pass' as const,
      reason: 'The workflow completed this applicable rule without a validated finding.' };
  });
  const completed = criterionAssessments.some((item) =>
    item.status === 'pass' || item.status === 'fail');
  return {
    compliancePercentage: 0,
    issues,
    criterionAssessments,
    assessmentStatus: completed ? undefined : 'not-assessed',
    assessmentReason: instructionUnits.some(({ validation }) =>
      validation.rejected.length || validation.incomplete)
      ? `${instructionUnits.reduce((count, { validation }) =>
        count + validation.rejected.length, 0)} workflow candidate(s) were rejected by deterministic validation.`
      : undefined,
    policyVersion: STANDARD_REVIEW_POLICY_VERSION,
    scoreAvailable: false,
  };
}

/**
 * Validate all workflow units and project accepted candidates into the existing UI models.
 */
export function projectStandardReviewWorkflow(
  stageA: LocalStageAOutput,
  corpus: StandardReviewWorkflowCorpus,
  results: ReadonlyMap<number, unknown>,
): StandardReviewWorkflowEvaluation {
  const validations = corpus.standardReview.reviewUnits.map((unit) =>
    validateStandardReviewUnit(unit, results.get(unit.componentIndex)));
  const validationDiagnostics: StandardReviewValidationDiagnostics = {
    rejectedCandidates: validations.flatMap(result => result.rejected),
    normalizations: validations.flatMap(result => result.normalizations),
  };
  return {
    patternEvaluation: projectPatterns(stageA, corpus, validations),
    instructionEvaluation: projectInstructions(corpus, validations),
    rejectedCandidateCount: validationDiagnostics.rejectedCandidates.length,
    validationDiagnostics,
  };
}
