import type { LocalPattern, ParsedBotData } from '../../../contracts/ServiceContracts';
import {
  couldNotRun, failWith, notApplicable, pass,
  type Rule, type RuleInstance, type RuleOutcome,
} from '../../../review-core/rule';
import type { PatternTopic } from '../../../contracts/StageOutputs';
import { assessPatternReference } from '../../../utils/patternReferenceAssessment';
import { aggregateTopicScope } from '../../../utils/topicApplicability';
import type {
  UnifiedEvidence, UnifiedFinding, UnifiedOutcome, UnifiedRuleAssessment, UnifiedRuleMetadata,
  UnifiedStandardRule,
} from '../../contracts/UnifiedReview';
import { unifiedAssessment } from './unifiedAssessment';

/** Preserve per-reference outcomes and reasons exactly at the old AI assembly boundary. */
function finalizePattern(pattern: LocalPattern): LocalPattern {
  const status = pattern.assessmentStatus ?? (pattern.status ? 'pass' : 'fail');
  return {
    ...pattern,
    affectedItems: pattern.affectedItems?.map(reference => {
      const reason = (status === 'not-assessed' || status === 'not-applicable' ? pattern.assessmentReason
        : reference.evidence?.reason) ?? pattern.assessmentReason ?? 'This is a local assessment of the reviewed configuration.';
      return assessPatternReference(reference, status, { status: 'applicable', reason },
        reference.evidence?.status === 'verified', reason);
    }),
  };
}

function itemEvidence(item: PatternTopic, field: string): UnifiedEvidence {
  const identified = !!(item.componentId?.trim() || item.schemaName?.trim());
  return {
    componentId: item.componentId, schemaName: item.schemaName,
    fieldPath: item.variable ? `${field}[${JSON.stringify(item.variable)}]` : field,
    quote: item.evidence?.quote ?? item.current, status: identified ? item.evidence?.status ?? 'unavailable' : 'unavailable',
    reason: identified ? item.assessmentReason ?? item.evidence?.reason : 'The captured subject has no stable component ID or schema name.',
  };
}

/** Metadata is derived once so the legacy rule and the core rule cannot drift apart. */
export function standardMetaFrom(core: Rule<ParsedBotData>, family: string): UnifiedRuleMetadata {
  return {
    id: core.id, title: core.title, family, severity: core.severity,
    fact: core.prose.summary ?? core.prose.question,
    why: core.prose.why, fix: core.prose.fix,
    referenceIds: core.references,
    supportedHarnesses: ['standard'], kind: 'check', tags: core.tags,
  };
}

/** The Standard verdict, computed once and projected two ways. */
export function assessStandard(
  meta: UnifiedRuleMetadata,
  fieldPath: string,
  legacyPattern: (model: ParsedBotData) => LocalPattern | undefined,
  model: ParsedBotData,
): UnifiedRuleAssessment {
  const pattern = legacyPattern(model);
  if (!pattern) {
    const unavailable = model.configurationAvailable === false || !!model.unknownComponents?.length || !!model.parsingErrors?.length;
    return unifiedAssessment(meta, 'standard', unavailable ? 'could-not-run' : 'not-applicable', {
      fact: unavailable ? 'The captured inventory cannot establish whether embedded child agents are present.'
        : 'The complete captured inventory contains no embedded child agents.',
      reason: unavailable ? 'The captured component population is incomplete.' : 'No embedded child agents are present.',
      evidence: [{ fieldPath, status: unavailable ? 'unavailable' : 'verified', quote: '0 captured child agents' }],
    });
  }
  const status = pattern.assessmentStatus;
  if (!status) throw new Error(`${meta.id} did not provide an explicit Standard outcome.`);
  let outcome: UnifiedOutcome = status === 'not-assessed' ? 'could-not-run' : status;
  let reason = pattern.assessmentReason;
  const items = pattern.affectedItems ?? [];
  const unknown = model.configurationAvailable === false || !!model.unknownComponents?.length
    || !!model.parsingErrors?.length;
  const topicRule = meta.family === 'Skills';
  const missingTopics = topicRule && model.topicComponents === undefined;
  const scope = model.ruleScopes?.[meta.title]
    ?? (topicRule && meta.id !== 'local-pattern-11' && model.topicComponents
      ? aggregateTopicScope(model.topicComponents, meta.title, model.unknownComponents?.length ?? 0) : undefined);
  let incomplete = unknown || missingTopics || scope?.status === 'not-assessed'
    || items.some(item => item.assessmentStatus === 'not-assessed' || itemEvidence(item, fieldPath).status !== 'verified');
  if (outcome === 'pass' && incomplete) outcome = 'could-not-run';
  if (outcome === 'pass' && scope?.status === 'not-applicable') {
    outcome = 'not-applicable';
    reason = scope.reason;
  }
  if (meta.id === 'local-pattern-8' && model.source === 'zip') {
    outcome = 'could-not-run';
    reason = 'CP1 compatibility limitation: a solution ZIP does not establish complete evaluation evidence. This rule only counts configured test components; shared set/case parsing is deferred.';
  }
  if (meta.id === 'local-pattern-11' && outcome !== 'fail') {
    const referenceScope = aggregateTopicScope(model.topicComponents ?? [], 'Unclear Model Description',
      model.unknownComponents?.length ?? 0);
    if (model.configurationAvailable === false || missingTopics || referenceScope.status === 'not-assessed') {
      outcome = 'could-not-run';
      reason = missingTopics ? 'The captured topic metadata is unavailable.' : referenceScope.reason;
    } else if (referenceScope.status === 'not-applicable') {
      outcome = 'not-applicable';
      reason = referenceScope.reason;
    }
  }
  // Unbound legacy names cannot prove a component-level failure.
  if (outcome === 'fail' && pattern.evidenceKind === 'configuration-fact'
    && !items.some(item => item.assessmentStatus === 'fail' && itemEvidence(item, fieldPath).status === 'verified')) {
    outcome = 'could-not-run';
    reason = 'The reported component failure has no verified, uniquely identified configuration evidence.';
  }
  incomplete ||= outcome === 'could-not-run';
  if (incomplete) reason = [
    reason,
    unknown ? 'The captured component population is incomplete.' : '',
    missingTopics ? 'Captured topic metadata is unavailable.' : '',
    items.some(item => item.assessmentStatus === 'not-assessed') ? 'Some reported fields could not be verified.' : '',
  ].filter(Boolean).join(' ') || 'The captured evidence is incomplete.';
  const evidence: UnifiedEvidence[] = items.map(item => itemEvidence(item, fieldPath));
  if (meta.id === 'local-pattern-7' || meta.id === 'local-pattern-8' || meta.id === 'local-pattern-10') {
    const count = meta.id === 'local-pattern-7' ? model.toolCount + (model.connectedAgents?.length ?? 0)
      : meta.id === 'local-pattern-8' ? model.testCaseCount : model.childAgents?.length ?? 0;
    evidence.push({
      componentId: model.botId, fieldPath, quote: String(count),
      status: outcome === 'could-not-run' ? 'unavailable' : 'verified',
      reason: unknown ? 'The captured count is a lower bound, not a complete population count.'
        : 'Count of captured configuration components, not an executed runtime measurement.',
    });
  }
  if (!evidence.length) evidence.push({
    fieldPath, status: outcome === 'could-not-run' ? 'unavailable' : 'verified',
    quote: pattern.description, reason: reason ?? 'Captured aggregate configuration assessment.',
  });
  const findings: UnifiedFinding[] = outcome === 'fail'
    ? items.filter(item => item.assessmentStatus === 'fail' && itemEvidence(item, fieldPath).status === 'verified').map(item => {
      const e = itemEvidence(item, fieldPath);
      const subjectId = item.componentId || item.schemaName;
      return {
        id: meta.id,
        instanceId: `standard:${meta.id}:${encodeURIComponent(subjectId ?? 'agent')}:${encodeURIComponent(e.fieldPath)}:${encodeURIComponent(item.current ?? '')}`,
        title: item.remediation?.findingTitle ?? `${meta.title}: ${item.item}`,
        fact: `${item.item}: ${item.setting ?? fieldPath} ${item.current?.trim() ? `is "${item.current}"` : 'has no nonblank value'}.`,
        why: item.remediation?.whyItMatters ?? meta.why,
        fix: item.remediation?.makerAction ?? pattern.recommendation,
        severity: meta.severity, subject: item.item, subjectId,
        evidence: [e], referenceIds: meta.referenceIds, compatibility: { standard: item },
      };
    }) : [];
  if (outcome === 'fail' && !findings.length) findings.push({
    id: meta.id, instanceId: `standard:${meta.id}:agent`, title: meta.title,
    fact: pattern.description, why: meta.why, fix: pattern.recommendation, severity: meta.severity,
    subject: model.botName, subjectId: model.botId, evidence, referenceIds: meta.referenceIds,
  });
  return unifiedAssessment(meta, 'standard', outcome, {
    fact: outcome === 'could-not-run' || outcome === 'not-applicable'
      ? reason ?? 'The captured evidence is insufficient for this check.'
      : pattern.description,
    fix: pattern.recommendation, reason: incomplete && !reason ? 'The captured population is incomplete.' : reason,
    incomplete, evidence, findings, compatibility: { standard: pattern },
  });
}

export interface CoreStandardOptions {
  /** ART display grouping. Kept off Rule by D-10, and it still selects topic-scope behavior. */
  family: string;
  fieldPath: string;
  build: (model: ParsedBotData) => LocalPattern | undefined;
}

function finalized(build: CoreStandardOptions['build']) {
  return (model: ParsedBotData) => {
    const pattern = build(model);
    return pattern ? finalizePattern(pattern) : undefined;
  };
}

/**
 * A Standard rule's verdict comes from `assessStandard`, never from a second algorithm.
 *
 * The copilot seam does not transfer here. A copilot rule's `check` *is* its algorithm;
 * a Standard rule's algorithm is a LocalPattern builder plus roughly a hundred lines of
 * shared outcome arbitration with per-id special cases. Re-deriving a verdict inside
 * `check` would be a second implementation of that arbitration and would drift from it.
 * So `check` projects the same `UnifiedRuleAssessment` the adapter publishes: one
 * authority, two shapes.
 */
export function standardCheck(
  core: Rule<ParsedBotData>, options: CoreStandardOptions, model: ParsedBotData,
): RuleOutcome {
  const assessment = assessStandard(
    standardMetaFrom(core, options.family), options.fieldPath, finalized(options.build), model,
  );
  if (assessment.outcome === 'not-applicable') return notApplicable(assessment.reason ?? assessment.fact);
  if (assessment.outcome === 'could-not-run') return couldNotRun(assessment.reason ?? assessment.fact);
  if (assessment.outcome === 'pass') return pass(assessment.fact);
  const instances: RuleInstance[] = assessment.findings.map(finding => ({
    subjectId: finding.subjectId, subject: finding.subject, title: finding.title,
    detail: finding.fact, why: finding.why, makerAction: finding.fix,
    reference: finding.referenceIds?.[0],
    subjectRef: finding.evidence?.map(row => ({
      id: row.componentId, schemaName: row.schemaName, quote: row.quote, fieldPath: row.fieldPath,
    })),
  }));
  return failWith(instances, assessment.fact);
}

/** Register a Standard rule declared in review-core; the LocalPattern stays a compatibility payload. */
export function defineCoreStandardRule(
  core: Rule<ParsedBotData>, options: CoreStandardOptions,
): UnifiedStandardRule {
  const meta = standardMetaFrom(core, options.family);
  const legacyPattern = finalized(options.build);
  return {
    ...meta, harness: 'standard', legacyPattern,
    evaluate({ model }) {
      return assessStandard(meta, options.fieldPath, legacyPattern, model);
    },
  };
}
