import { parseStandardComponents } from '../../utils/stageAParser';
import { resolveOrchestrationMode, recordValue } from '../../utils/topicApplicability';
import { classifyComponent } from '../../utils/componentClassification';
import type {
  CapturedDeterministicReviewInput, UnifiedReviewComparison, UnifiedRuleChange,
} from '../contracts/UnifiedReviewComparison';
import type { UnifiedRuleAssessment, UnifiedRuleContext } from '../contracts/UnifiedReview';
import { parseAgentsExperience } from './AgentsExperienceParser';
import { evaluateUnifiedComparisonRules } from './UnifiedRuleEngine';
import { scoreUnifiedDeterministic } from './unifiedScoring';
import { legacyDeterministicBaseline, previousDeterministicAssessments } from './comparisonLegacy';
import { parseNormalizedEvaluationEvidence } from './evaluation/normalizedEvaluationEvidence';

export { UNIFIED_COMPARISON_POLICY_VERSION } from './UnifiedRuleEngine';
export { parseNormalizedEvaluationEvidence } from './evaluation/normalizedEvaluationEvidence';
export type { NormalizedEvaluationEvidence, EvaluationConfiguration, EvaluationCaseAssertion } from '../contracts/EvaluationEvidence';
export type {
  CapturedDeterministicReviewInput, CapturedReviewMetadata, LegacyDeterministicBaseline,
  UnifiedReviewComparison, UnifiedRuleChange, DeterministicComparisonContext,
} from '../contracts/UnifiedReviewComparison';

/** Compare the previous and current deterministic interpretations of the SAME typed capture. */
export function compareUnifiedDeterministicReview(context: UnifiedRuleContext): UnifiedReviewComparison {
  const previous = previousDeterministicAssessments(context);
  const current = evaluateUnifiedComparisonRules(context);
  return assembleComparison(context, previous, current);
}

function assembleComparison(
  context: UnifiedRuleContext, previous: UnifiedRuleAssessment[], current: UnifiedReviewComparison['current'],
): UnifiedReviewComparison {
  const previousByKey = new Map(previous.map(a => [a.key, a]));
  const currentByKey = new Map(current.assessments.map(a => [a.key, a]));
  const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);
  const changes: UnifiedRuleChange[] = [...keys].map(key => {
    const before = previousByKey.get(key) ?? null;
    const after = currentByKey.get(key) ?? null;
    const ruleId = (after ?? before)!.ruleId;
    const isNew = context.harness === 'standard' && ruleId.startsWith('EVL-');
    const changed = before?.outcome !== after?.outcome || before?.kind !== after?.kind;
    return {
      key, ruleId, previous: before, current: after,
      previousOutcome: before?.outcome ?? null, currentOutcome: after?.outcome ?? null,
      classification: isNew ? 'new' : changed ? 'evidence-semantics' : 'existing',
      predicateChanged: false,
      reason: isNew ? 'Existing shared evaluation predicate is newly applied to Standard normalized set/case evidence.'
        : ruleId === 'local-pattern-8' && context.harness === 'standard'
          ? 'The existing >=10 configured-test-component threshold remains a scored check once. It counts components, not usable cases or successful runs, and is distinct from the added EVL predicates.'
          : changed ? 'The underlying predicate is retained; applicability, evidence completeness or record treatment differs.'
            : 'Same underlying predicate and outcome; numeric differences can still result from scoring policy.',
    };
  });
  const identical = changes.filter(c => c.previous && c.current
    && c.previous.kind === 'check' && c.current.kind === 'check'
    && c.previous.severity !== 'info' && c.current.severity !== 'info'
    && c.previous.outcome === c.current.outcome
    && (c.current.outcome === 'pass' || c.current.outcome === 'fail'));
  return {
    harness: context.harness,
    previous: { assessments: previous, score: legacyDeterministicBaseline(context.harness, previous) },
    current, changes,
    sameRule: {
      previous: legacyDeterministicBaseline(context.harness, identical.map(c => c.previous!)),
      current: scoreUnifiedDeterministic(identical.map(c => c.current!)),
    },
    evaluation: context.harness === 'standard' ? context.evaluation : undefined,
    scope: [
      'Both sides are recomputed from the same capture, not historical before/after runs. Saved ART ratings may include AI and must be displayed separately.',
      'Existing underlying predicates are unchanged. Explicit outcome/evidence semantics can differ from legacy null-as-pass behavior.',
      'Previous uses Standard local completed-check arithmetic or Copilot base-rule legacy credit arithmetic; it is not the saved ART mixed-AI overall or the full six-pillar score.',
      'Same-rule comparison includes completed existing quality checks with identical outcomes. Completeness flags remain visible but do not remove matching outcomes from the weighting comparison.',
      context.harness === 'standard'
        ? 'Current retains all 11 Standard local checks and their completed predicate decisions, including the >=10 configured-test-component threshold once, and adds the distinct EVL-01/03/04/05/06 checks/records. Evidence limitations remain explicit.'
        : 'Copilot comparison covers the 29 BASE definitions only. Per-skill L0, bundle checks and EVL-02 instances are not included.',
      'EVL-01 retains its existing set-presence predicate: a configured set is not proof of usable cases, valid graders, capability coverage or successful execution.',
      'Standard evaluation supports EvaluationSet/TestSetDefinition, every EvaluationData row, MultiTurnEvaluationCase, and legacy single-SendUserActivity TestCaseDefinition transcripts through shared mappings. Legacy assertions are retained as configuration, not inferred set graders or execution results. Other shapes remain incomplete.',
      'No AI invocation, test execution, Dataverse write, dismissal adjustment or saved-rating rescore is performed.',
    ],
  };
}

/** Pure entry for real captured metadata/components; the host alone performs authenticated reads. */
export function compareCapturedDeterministicReview(input: CapturedDeterministicReviewInput): UnifiedReviewComparison {
  const source = input.source ?? 'live';
  const availability = { ...input.availability };
  if (input.expectedComponentCount !== undefined && input.expectedComponentCount !== input.components.length
    && availability.components !== 'unavailable') availability.components = 'partial';
  if (input.components.some(c => !c.data?.trim() && !c.content?.trim()
    && classifyComponent(c, undefined).category === 'unknown') && availability.components !== 'unavailable') {
    availability.components = 'partial';
  }
  let context: UnifiedRuleContext;
  if (input.harness === 'standard') {
    const model = parseStandardComponents([...(input.standardComponents ?? input.components)], input.metadata.botId, input.metadata.name,
      resolveOrchestrationMode(input.metadata.configuration), source);
    if (availability.components === 'partial') {
      model.parsingErrors = [...(model.parsingErrors ?? []), 'The host captured only part of the component inventory.'];
    }
    context = {
      harness: 'standard', model,
      evaluation: parseNormalizedEvaluationEvidence(input.components, {
        source, availability: availability.evaluation ?? availability.components,
        expectedComponentCount: input.expectedComponentCount,
      }),
    };
  } else {
    const model = parseAgentsExperience(
      input.metadata.configuration ?? '',
      [...input.components],
      { authenticationMode: input.metadata.authenticationMode },
    );
    try {
      const configuration = recordValue(JSON.parse(input.metadata.configuration ?? ''));
      const settings = recordValue(configuration?.agentSettings);
      if (!settings) {
        availability.configuration = 'unavailable';
      } else {
        const instructions = settings.instructions;
        const content = recordValue(instructions);
        const readable = instructions === undefined || instructions === null || typeof instructions === 'string'
          || typeof content?.value === 'string'
          || (Array.isArray(content?.segments) && content.segments.every(segment => typeof recordValue(segment)?.value === 'string'));
        if (!readable) availability.instructions = 'unavailable';
      }
    } catch { availability.configuration = 'unavailable'; }
    for (const population of ['tools', 'skills', 'knowledge', 'connectedAgents', 'evaluation'] as const) {
      availability[population] ??= availability.components;
    }
    context = { harness: 'copilot', model, availability };
  }
  const comparison = compareUnifiedDeterministicReview(context);
  const unavailable = availability.components === 'unavailable' || availability.configuration === 'unavailable';
  if (!unavailable) return { ...comparison, metadata: input.metadata };
  const reason = 'Required source configuration or component capture was unavailable; parser defaults are not a completed review.';
  const mask = (a: UnifiedRuleAssessment): UnifiedRuleAssessment => ({
    ...a, outcome: 'could-not-run', incomplete: true, fact: reason, reason,
    findings: [], evidence: [{ fieldPath: 'capture', status: 'unavailable', reason }],
  });
  const previous = comparison.previous.assessments.map(mask);
  const assessments = comparison.current.assessments.map(mask);
  return {
    ...assembleComparison(context, previous, { ...comparison.current, assessments, score: scoreUnifiedDeterministic(assessments) }),
    metadata: input.metadata,
  };
}
