import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import type { GroundedFinding } from '../../contracts/Findings';
import type { ReferenceId } from '../../contracts/references';
import type {
  CopilotRuleContext, UnifiedAvailability, UnifiedCopilotRule, UnifiedEvidence,
  UnifiedOutcome, UnifiedPopulation, UnifiedRuleMetadata,
} from '../../contracts/UnifiedReview';
import type {
  Rule as CoreRule, RuleEvidenceRef, RuleInstance, RuleOutcome as CoreOutcome,
} from '../../../review-core/rule';
import { SEVERITY_TO_LEGACY } from '../../../review-core/severity';
import type { Rule } from './ruleTypes';
import { unifiedAssessment } from './unifiedAssessment';
import type { CopilotFindingDetail } from './copilotEvidence';

type LegacyResult = GroundedFinding | GroundedFinding[] | null;
export interface CopilotInspection {
  outcome: UnifiedOutcome;
  legacy: LegacyResult;
  reason?: string;
  evidence?: readonly UnifiedEvidence[];
  findingDetails?: readonly CopilotFindingDetail[];
  incomplete?: boolean;
}

export interface CopilotRuleSpec extends Omit<Rule, 'check' | 'evaluate'> {
  title: string;
  fact: string;
  why: string;
  fix: string;
  tags?: readonly string[];
  populations: readonly UnifiedPopulation[];
  fieldPath: string;
  optionalPopulation?: 'tools' | 'skills' | 'connectedAgents' | 'knowledge';
  completeForFailure?: readonly UnifiedPopulation[];
  inlineSkillsOnly?: boolean;
  inspect(model: AgentsExperienceModel): CopilotInspection;
}

/** Outcomes are selected by the predicate/inspection, never inferred from finding presence. */
export function copilotResult(
  outcome: CopilotInspection['outcome'], legacy: LegacyResult, reason?: string,
  evidence?: readonly UnifiedEvidence[],
): CopilotInspection {
  return { outcome, legacy, reason, evidence };
}

/**
 * ART-only facts about a rule that `review-core` deliberately does not model.
 *
 * `family` is the display grouping ART has always shown and persisted; it is not
 * a second classification axis (D-10 settled that harness is the only one), so it
 * stays here as a label rather than going back onto `Rule`. The two availability
 * switches are ART's capture-completeness machinery, which `review-core` expresses
 * as `appliesWhen` but which is not re-derived during a relocation — moving a rule
 * must not change what it decides.
 */
export interface CoreCopilotOptions {
  family: string;
  kind?: 'check' | 'record';
  optionalPopulation?: CopilotRuleSpec['optionalPopulation'];
  inlineSkillsOnly?: boolean;
  /**
   * Evidence the rule quotes rather than evidence synthesized from its findings.
   *
   * `review-core` cannot express this: `UnifiedEvidence` is an ART contract, and the
   * default projection builds one row *from* each finding, which is right only for a
   * rule whose evidence is the finding. A rule that quotes something else — the
   * instructions it compared against, a connector id it matched — has to say so.
   *
   * Applied on `fail` only, matching the hand-written rules: a passing rule published
   * no quote. Three families each wrote a private copy of this before it was hoisted.
   */
  evidence?: (model: AgentsExperienceModel) => readonly UnifiedEvidence[];
}

const CAPTURED_REASON = 'Captured static configuration; no runtime behavior was observed.';

function findingFrom(
  core: CoreRule<AgentsExperienceModel>, instance: RuleInstance, options: CoreCopilotOptions,
): GroundedFinding {
  const finding: GroundedFinding = {
    id: core.id,
    family: options.family,
    severity: SEVERITY_TO_LEGACY[core.severity],
    title: instance.title,
    fact: instance.detail,
    why: instance.why ?? core.prose.why,
    fix: instance.makerAction,
    referenceId: (instance.reference ?? core.references[0]) as ReferenceId,
    ai: false,
  };
  return instance.subjectId === undefined
    ? finding : { ...finding, componentIdUnique: instance.subjectId };
}

function detailFrom(
  core: CoreRule<AgentsExperienceModel>, instance: RuleInstance, finding: GroundedFinding,
): CopilotFindingDetail | undefined {
  if (instance.subject === undefined) return undefined;
  const fieldPath = core.evidence.fieldPaths[0];
  const refs = instance.subjectRef === undefined ? []
    : Array.isArray(instance.subjectRef) ? instance.subjectRef : [instance.subjectRef as RuleEvidenceRef];
  if (!refs.length) {
    return {
      finding, subject: instance.subject, subjectId: instance.subjectId,
      evidence: [{
        componentId: instance.subjectId, fieldPath, quote: instance.detail,
        status: 'verified', reason: CAPTURED_REASON,
      }],
    };
  }
  const evidence = refs.map(ref => {
    const componentId = ref.id?.trim() || undefined;
    const schemaName = ref.schemaName?.trim() || undefined;
    const verified = Boolean(componentId || schemaName);
    return {
      componentId, schemaName, fieldPath: ref.fieldPath ?? fieldPath, quote: ref.quote,
      status: verified ? ('verified' as const) : ('unavailable' as const),
      reason: verified ? CAPTURED_REASON : 'This captured component has no stable ID or schema name.',
    };
  });
  return {
    finding, subject: instance.subject,
    subjectId: evidence[0].componentId ?? evidence[0].schemaName,
    evidence,
  };
}

/**
 * Project one `review-core` verdict onto the inspection shape ART already consumes.
 *
 * The rule-level `detail` becomes the legacy `reason`, and the per-instance rows
 * become the legacy findings. An empty `detail` is treated as absent so that a
 * rule reporting only instances produces exactly the `reason: undefined` the
 * hand-written rules produced.
 */
function inspectionFrom(
  core: CoreRule<AgentsExperienceModel>, outcome: CoreOutcome, options: CoreCopilotOptions,
  model: AgentsExperienceModel,
): CopilotInspection {
  if (outcome.outcome === 'not-applicable' || outcome.outcome === 'could-not-run') {
    return copilotResult(outcome.outcome, null, outcome.because);
  }
  const instances = outcome.instances ?? [];
  const findings = instances.map(i => findingFrom(core, i, options));
  const details = instances.flatMap((instance, index) => {
    const detail = detailFrom(core, instance, findings[index]);
    return detail ? [detail] : [];
  });
  return {
    outcome: outcome.outcome,
    legacy: findings.length ? findings : null,
    reason: outcome.detail || undefined,
    evidence: outcome.outcome === 'fail' ? options.evidence?.(model) : undefined,
    findingDetails: details.length ? details : undefined,
  };
}

/**
 * Publish a `review-core` rule through ART's existing Copilot machinery.
 *
 * Every projection ART performs — availability cascades, evidence synthesis,
 * verified-finding filtering, instance ids — is left exactly as it was. This only
 * changes where the rule's wording, severity, references and predicate are read
 * from, which is the whole point of the move: one rule, declared once.
 */
export function defineCoreCopilotRule(
  core: CoreRule<AgentsExperienceModel>, options: CoreCopilotOptions,
): { legacy: Rule; unified: UnifiedCopilotRule } {
  const check = core.check;
  if (!check) throw new Error(`Rule ${core.id} has no check and cannot be a deterministic Copilot rule.`);
  return defineCopilotRule({
    id: core.id,
    family: options.family,
    severity: SEVERITY_TO_LEGACY[core.severity],
    referenceId: core.references[0] as ReferenceId,
    kind: options.kind,
    title: core.title,
    fact: core.prose.summary ?? core.prose.question,
    why: core.prose.why,
    fix: core.prose.fix,
    tags: core.tags,
    populations: (core.evidence.populations ?? []) as readonly UnifiedPopulation[],
    fieldPath: core.evidence.fieldPaths[0],
    completeForFailure: core.evidence.completeForFailure as readonly UnifiedPopulation[] | undefined,
    optionalPopulation: options.optionalPopulation,
    inlineSkillsOnly: options.inlineSkillsOnly,
    inspect: model => inspectionFrom(core, check(model), options, model),
  });
}

/** Resolve declared capture availability without treating an unknown component inventory as complete. */
export function copilotPopulationAvailability(context: CopilotRuleContext, population: UnifiedPopulation): UnifiedAvailability {
  const explicit = context.availability?.[population];
  if (explicit) return explicit;
  if (context.availability?.configuration === 'unavailable') return 'unavailable';
  if (context.availability?.configuration === 'partial') return 'partial';
  if (population !== 'instructions' && population !== 'configuration' && context.model.unknownKinds.length) return 'partial';
  return 'complete';
}

/** Build native and legacy projections around one explicit Copilot inspection algorithm. */
export function defineCopilotRule(spec: CopilotRuleSpec): { legacy: Rule; unified: UnifiedCopilotRule } {
  const meta: UnifiedRuleMetadata = {
    id: spec.id, family: spec.family, title: spec.title, fact: spec.fact, why: spec.why, fix: spec.fix,
    severity: spec.severity === 'error' ? 'high' : spec.severity === 'warning' ? 'medium' : 'info',
    kind: spec.kind ?? 'check', tags: spec.tags ?? ['quality'], referenceIds: [spec.referenceId],
    supportedHarnesses: ['copilot'],
  };
  const definition: { legacy: Rule; unified: UnifiedCopilotRule } = {
    legacy: {
      id: spec.id, family: spec.family, severity: spec.severity, referenceId: spec.referenceId, kind: spec.kind,
      check: model => spec.inspect(model).legacy,
    },
    unified: {
      ...meta, harness: 'copilot',
      evaluate(context) {
        const partial = spec.populations.filter(p => copilotPopulationAvailability(context, p) === 'partial');
        const bundles = spec.inlineSkillsOnly && context.model.skills.some(s => s.source === 'zip-bundle');
        if (bundles && !partial.includes('skills')) partial.push('skills');
        const model = spec.inlineSkillsOnly
          ? { ...context.model, skills: context.model.skills.filter(s => s.source === 'inline-markdown') }
          : context.model;
        if (spec.optionalPopulation && model[spec.optionalPopulation].length === 0) {
          const incomplete = copilotPopulationAvailability(context, spec.optionalPopulation) !== 'complete' || !!bundles;
          return unifiedAssessment(meta, 'copilot', incomplete ? 'could-not-run' : 'not-applicable', {
            fact: incomplete ? `A complete ${spec.optionalPopulation} population was not captured.`
              : `The complete captured ${spec.optionalPopulation} inventory is empty.`,
            reason: bundles ? 'CP2 boundary: bundle content is not assessed as inline markdown in the CP1 base registry.'
              : incomplete ? 'Missing evidence cannot establish an empty population.' : 'No components are in scope.',
            evidence: [{ fieldPath: spec.optionalPopulation, status: incomplete ? 'unavailable' : 'verified', quote: '0 captured components' }],
          });
        }
        const unavailable = spec.populations.filter(p => copilotPopulationAvailability(context, p) === 'unavailable');
        if (unavailable.length) return unifiedAssessment(meta, 'copilot', 'could-not-run', {
          fact: `Required captured evidence is unavailable: ${unavailable.join(', ')}.`,
          reason: `Unavailable populations: ${unavailable.join(', ')}.`,
          evidence: unavailable.map(fieldPath => ({ fieldPath, status: 'unavailable' })),
        });
        const inspection = spec.inspect(model);
        let outcome: UnifiedOutcome = inspection.outcome;
        const completeFailure = (spec.completeForFailure ?? []).every(p => !partial.includes(p));
        if (partial.length && (outcome !== 'fail' || !completeFailure)) outcome = 'could-not-run';
        const findings = inspection.legacy === null ? [] : Array.isArray(inspection.legacy) ? inspection.legacy : [inspection.legacy];
        const captured = [
          ...model.tools, ...model.skills, ...model.knowledge, ...model.connectedAgents,
          ...model.evaluationSets, ...model.testCases,
        ];
        const evidenceFor = (finding: GroundedFinding): UnifiedEvidence[] => {
          const detail = inspection.findingDetails?.find(d => d.finding === finding);
          if (detail) return [...detail.evidence];
          const matches = finding.componentIdUnique
            ? captured.filter(c => c.componentIdUnique === finding.componentIdUnique) : [];
          const component = matches.length === 1 ? matches[0] : undefined;
          return [{
            componentId: finding.componentIdUnique, schemaName: component?.schemaname,
            fieldPath: spec.fieldPath, quote: finding.fact,
            status: finding.componentIdUnique && !component ? 'unverified' : 'verified',
            reason: 'Static captured configuration; no runtime behavior was observed.',
          }];
        };
        const evidence = inspection.evidence ?? (findings.length ? findings.flatMap(evidenceFor)
          : [{ fieldPath: spec.fieldPath, status: 'verified' as const, quote: spec.fact }]);
        const unverified = evidence.some(e => e.status !== 'verified');
        const verifiedFindings = findings.filter(f => evidenceFor(f).every(e => e.status === 'verified'));
        if (outcome === 'fail' && (!evidence.some(e => e.status === 'verified')
          || (findings.length > 0 && !verifiedFindings.length))) outcome = 'could-not-run';
        if (outcome === 'pass' && (unverified || inspection.incomplete)) outcome = 'could-not-run';
        const reason = partial.length || unverified ? [
          partial.length ? `Incomplete captured populations: ${partial.join(', ')}.` : '',
          bundles ? 'Bundle integrity/resource/security and per-skill L0 checks are deferred to CP2.' : '',
          unverified ? 'Some component identities or field evidence could not be verified.' : '',
          inspection.reason ?? '',
        ].filter(Boolean).join(' ') : inspection.reason
          ?? (outcome === 'could-not-run' ? 'Required field evidence could not be completely assessed.' : undefined);
        return unifiedAssessment(meta, 'copilot', outcome, {
          fact: outcome === 'could-not-run' ? reason ?? 'Required evidence is incomplete.'
            : findings.length ? findings.map(f => f.fact).join('\n') : inspection.reason ?? meta.fact,
          reason, incomplete: partial.length > 0 || unverified || !!inspection.incomplete || outcome === 'could-not-run',
          evidence,
          findings: outcome === 'fail' || meta.kind === 'record' ? (meta.kind === 'record' ? findings : verifiedFindings)
            .map(f => {
              const detail = inspection.findingDetails?.find(d => d.finding === f);
              const subjectId = detail?.subjectId ?? f.componentIdUnique ?? 'agent';
              const subjectEvidence = inspection.evidence ?? evidenceFor(f);
              const relatedSubjects = subjectEvidence.map(e => e.componentId ?? e.schemaName ?? 'agent').join('|');
              return {
                id: spec.id,
                instanceId: `copilot:${spec.id}:${encodeURIComponent(subjectId)}:${encodeURIComponent(relatedSubjects)}:${encodeURIComponent(f.fact)}`,
                title: f.title, fact: f.fact, why: meta.why, fix: f.fix, severity: meta.severity,
                subject: detail?.subject, subjectId, evidence: subjectEvidence, referenceIds: [f.referenceId],
                compatibility: { copilot: f },
              };
            }) : [],
          compatibility: { copilot: findings },
        });
      },
    },
  };
  definition.legacy.evaluate = definition.unified.evaluate;
  return definition;
}
