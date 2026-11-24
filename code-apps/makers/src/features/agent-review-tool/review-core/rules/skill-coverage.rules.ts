/**
 * The AI-decided coverage and skill-quality rules of the Copilot agent path.
 *
 * These eight ids lived inline in `CopilotReviewService` and in no registry at
 * all, which is why `scoring.ts`'s `FAMILY_TO_PILLAR` table cannot be deleted:
 * an unregistered id resolves to `undefined` and silently leaves the scoring
 * denominator. Declaring them here is what lets that table go.
 *
 * Seven of the eight do not own their verdict. `INS-02`…`INS-06` are decided by
 * the instruction-coverage classifier and `SKL-04` / `SKL-06` by the skill
 * bundle evaluator; `InstructionCoverageValidator` and `gateSkillEval` only
 * *filter* the model's answer, they do not reach one. So those seven declare
 * `execution: 'ai'` and carry no `check` — the registry's invariant — and the
 * assessment functions below are the one authority that both the registry-facing
 * outcome and the legacy `GroundedFinding` adapter read. One authority, two
 * shapes, as on the Standard seam. `AEX-01` is the exception: it is a plain
 * predicate over `model.unknownKinds`, so it is `deterministic` with a `check`.
 *
 * The population discipline is the score-sensitive part. A classifier that never
 * ran, was never provisioned, was cancelled, or returned nothing usable for an
 * element yields `could-not-run` — never `pass`. An agent with no instructions,
 * or no skills, yields `not-applicable`. Both leave the numerator *and* the
 * denominator, which is the only way "every instruction element is covered" over
 * an agent with zero instructions avoids handing out full unearned credit.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import type { InstructionCoverageElement } from '../../agents-experience/contracts/AiCoverage';
import type { SkillBundleEvaluation } from '../../agents-experience/contracts/SkillEvaluation';
import { INSTRUCTION_RULE_IDS } from '../../agents-experience/services/skill/InstructionCoverageValidator';
import type { ReviewStageStatus } from '../../contracts/ReviewResult';
import {
  couldNotRun, fail, failWith, notApplicable, pass, rule,
  type Rule, type RuleInstance, type RuleOutcome,
} from '../rule';

export type InstructionElementKey = InstructionCoverageElement['key'];

/**
 * The maker-facing name of each coverage element.
 *
 * Lives here rather than in `CopilotReviewService` because it is now part of
 * two legacy strings the rules own — the finding title and the fix — and a
 * second copy beside the emitter is how those two drift apart.
 */
export const ELEMENT_LABELS: Readonly<Record<InstructionElementKey, string>> = Object.freeze({
  role: 'role and purpose',
  tone: 'tone and style',
  boundaries: 'decline/redirect boundaries',
  ambiguity: 'ambiguous-input handling',
  escalation: 'escalation triggers',
});

/** The five documented elements, in the order the published guidance lists them. */
export const INSTRUCTION_ELEMENT_ORDER: readonly InstructionElementKey[] = Object.freeze([
  'role', 'tone', 'boundaries', 'ambiguity', 'escalation',
] as const);

// ---------------------------------------------------------------------------
// Seam — instruction coverage
// ---------------------------------------------------------------------------

/**
 * What the orchestrator knows after the coverage stage, whether or not it ran.
 *
 * `status` is the stage's own verdict on its infrastructure and is deliberately
 * independent of `elements`: "the classifier never ran" and "the classifier ran
 * and found nothing missing" are different answers, and conflating them is the
 * free-credit bug this seam exists to prevent.
 */
export interface InstructionCoverageAssessment {
  readonly status: ReviewStageStatus;
  /** Only the well-formed, evidence-grounded elements the classifier returned. */
  readonly elements: readonly InstructionCoverageElement[];
}

/**
 * One element's verdict.
 *
 * An element missing from `elements` was dropped by the classifier's validator as
 * malformed, duplicated or fabricated — or was never returned at all. The rule
 * was therefore not answered for that element, so it is `could-not-run`. Reading
 * a missing element as "present" would be a fabricated pass, and reading it as
 * "absent" would be a fabricated failure.
 */
export function assessInstructionElement(
  key: InstructionElementKey, assessment: InstructionCoverageAssessment,
): RuleOutcome {
  const { status, elements } = assessment;
  if (status.state === 'not-applicable') {
    return notApplicable(
      'The agent has no instructions, so there is no instruction text for this element to be stated in. '
      + 'INS-01 owns the missing-instructions failure.');
  }
  if (status.state === 'unavailable' || status.state === 'failed' || status.state === 'cancelled') {
    return couldNotRun(
      `The instruction coverage classifier did not produce a verdict (${status.state}${status.reason ? `: ${status.reason}` : ''}).`);
  }
  const element = elements.find(el => el.key === key);
  if (!element) {
    return couldNotRun(
      `The classifier returned no well-formed, evidence-grounded verdict for "${key}".`);
  }
  if (element.present) {
    return pass(`element "${key}" found in instructions`, element.evidence ? [element.evidence] : undefined);
  }
  return failWith([{
    title: `Instructions do not state ${ELEMENT_LABELS[key]}`,
    detail: `element "${key}" not found in instructions`,
    why: 'Effective instructions cover the agent\'s role, tone, boundaries, ambiguity handling, and escalation.',
    makerAction: `Add ${ELEMENT_LABELS[key]} to the agent instructions.`,
    reference: 'ms-authoring-instructions',
  }]);
}

/**
 * Whether the stage earned the "covers all five" positive.
 *
 * Only a `complete` classification can: a `partial` one that happens to have
 * every *returned* element present has not established the other elements, and
 * reporting it as full coverage is the same fabricated pass in aggregate form.
 */
export function coversAllFiveElements(assessment: InstructionCoverageAssessment): boolean {
  return assessment.status.state === 'complete' && assessment.elements.every(el => el.present);
}

/**
 * `INS-07` — whether the instructions name a capability the agent does not have.
 *
 * The instruction coverage node decides this alongside the five elements, so it
 * has the same four outcomes and the same refusal to invent one. `named` is
 * whether that node raised INS-07; the node reports only exceptions, so silence
 * on a *completed* run is the pass.
 *
 * `named` is tri-state, and `undefined` is load-bearing: it means the stage that
 * ran could not judge INS-07 at all, which the AI Builder prompt path reports by
 * omitting `findings` entirely. Silence from a path that was never asked is not
 * the same as silence from one that looked and found nothing, and reading it as
 * the pass would credit a high-severity rule no backend evaluated.
 *
 * Anything other than `complete` is `could-not-run`, including `partial` —
 * silence from a run that was cut short establishes nothing, and crediting it
 * would be the fabricated pass this seam exists to prevent. That is the same
 * reading {@link coversAllFiveElements} takes of a partial classification.
 */
export function assessNamedCapabilityReferences(
  assessment: InstructionCoverageAssessment, named: boolean | undefined,
): RuleOutcome {
  const { status } = assessment;
  if (status.state === 'not-applicable') {
    return notApplicable(
      'The agent has no instructions, so there is no instruction text to name a capability in. '
      + 'INS-01 owns the missing-instructions failure.');
  }
  if (status.state !== 'complete') {
    return couldNotRun(
      `The instruction coverage classifier did not produce a verdict (${status.state}${status.reason ? `: ${status.reason}` : ''}).`);
  }
  if (named === undefined) {
    return couldNotRun(
      'The instruction coverage stage completed but returned no INS-07 verdict, so whether the '
      + 'instructions name a missing capability was never established.');
  }
  if (named) {
    return fail(
      'The instructions name a capability the agent does not have.',
      'Either configure the capability the instructions name, or remove the reference from the instructions.');
  }
  return pass('instructions name no capability the agent lacks');
}

// ---------------------------------------------------------------------------
// Seam — skill bundle evaluation
// ---------------------------------------------------------------------------

/**
 * What the orchestrator knows after the skill bundle evaluator stage.
 *
 * `capturedSkills` is carried separately from `evaluations` because they answer
 * different questions. No captured skills means the rule has no population and
 * is `not-applicable`; captured skills with no surviving evaluation means the
 * population exists but the evaluator produced nothing usable, which is
 * `could-not-run`. Collapsing the two would let an agent whose evaluator failed
 * score as though its skills had been judged.
 */
export interface SkillEvaluationAssessment {
  readonly capturedSkills: number;
  readonly evaluations: readonly SkillBundleEvaluation[];
}

/**
 * A rule instance plus the legacy per-finding severity.
 *
 * `Rule` carries one severity for the whole rule, by design — severity is a
 * property of the claim, not of an occurrence. `SKL-06` is the one id in this
 * family whose legacy emitter varies severity per conflict from an AI-supplied
 * field, so that value is surfaced alongside the instance rather than forced
 * onto `Rule`, and the adapter reproduces it verbatim.
 */
export interface SeveritiedInstance {
  readonly instance: RuleInstance;
  readonly severity: 'error' | 'warning';
}

/** An outcome together with the rows behind it, so the adapter never re-derives either. */
export interface InstanceAssessment<T> {
  readonly outcome: RuleOutcome;
  readonly rows: readonly T[];
}

function skillPrecondition(assessment: SkillEvaluationAssessment): RuleOutcome | undefined {
  if (assessment.capturedSkills === 0) {
    return notApplicable('The agent has no skills, so there is no skill for this rule to judge.');
  }
  if (assessment.evaluations.length === 0) {
    return couldNotRun(
      'The agent has skills, but the skill bundle evaluator returned no usable evaluation for any of them.');
  }
  return undefined;
}

/** `SKL-04` rows for one evaluated skill — none when it reached the Strong band. */
export function skillBandRowsFor(evaluation: SkillBundleEvaluation): readonly RuleInstance[] {
  if (evaluation.band === 'Strong') return [];
  return [{
    subject: evaluation.name,
    title: `Skill "${evaluation.name}" scored ${evaluation.overallScorePercent}% (${evaluation.band})`,
    detail: evaluation.dimensions.map(d => `${d.key}: ${d.score}/10`).join(' · '),
    why: evaluation.summary
      || 'One or more quality dimensions (clarity, actionability, scope, composability) need work.',
    makerAction: evaluation.dimensions.filter(d => d.score < 7).map(d => d.rationale).join(' ')
      || 'Strengthen the weaker dimensions.',
    reference: 'ms-skills-overview',
  }];
}

/** `SKL-06` rows for one evaluated skill — one per conflict the evaluator reported. */
export function crossSkillConflictRowsFor(
  evaluation: SkillBundleEvaluation,
): readonly SeveritiedInstance[] {
  return (evaluation.crossSkillConflicts ?? []).map(conflict => ({
    severity: conflict.severity === 'error' ? 'error' as const : 'warning' as const,
    instance: {
      subject: evaluation.name,
      title: `Skill "${evaluation.name}" ${conflict.type} with "${conflict.withSkill}"`,
      detail: conflict.evidence,
      why: conflict.rationale,
      makerAction: 'Differentiate the skills so the orchestrator can select unambiguously.',
      reference: 'ms-skills-overview',
    },
  }));
}

/** `SKL-04` — every evaluated skill reaches the Strong band. */
export function assessSkillBand(
  assessment: SkillEvaluationAssessment,
): InstanceAssessment<RuleInstance> {
  const precondition = skillPrecondition(assessment);
  if (precondition) return { outcome: precondition, rows: [] };

  const rows = assessment.evaluations.flatMap(evaluation => [...skillBandRowsFor(evaluation)]);
  return {
    outcome: rows.length > 0 ? failWith(rows) : pass('Every evaluated skill reached the Strong band.'),
    rows,
  };
}

/**
 * `SKL-06` — no evaluated skill overlaps or contradicts a sibling.
 *
 * A limit rule, so it passes on an empty conflict set — but only once a pair of
 * skills exists for a conflict to be possible between. With fewer than two
 * skills the evaluator is given no siblings to compare against, so a clean
 * result is structural rather than earned, and passing on it would be credit for
 * a check that could not have failed.
 */
export function assessCrossSkillConflicts(
  assessment: SkillEvaluationAssessment,
): InstanceAssessment<SeveritiedInstance> {
  if (assessment.capturedSkills < 2) {
    return {
      outcome: notApplicable(
        'A cross-skill conflict needs a pair of skills; this agent has fewer than two, so the evaluator is given no sibling to compare against.'),
      rows: [],
    };
  }
  const precondition = skillPrecondition(assessment);
  if (precondition) return { outcome: precondition, rows: [] };

  const rows = assessment.evaluations.flatMap(
    evaluation => [...crossSkillConflictRowsFor(evaluation)]);
  return {
    outcome: rows.length > 0
      ? failWith(rows.map(row => row.instance))
      : pass('No evaluated skill overlaps or contradicts a sibling.'),
    rows,
  };
}

// ---------------------------------------------------------------------------
// INS-02…INS-06 — instruction coverage
// ---------------------------------------------------------------------------

interface ElementDeclaration {
  readonly key: InstructionElementKey;
  readonly title: string;
  readonly question: string;
  readonly summary: string;
  readonly why: string;
  readonly fix: string;
  // Each element asks about a different subject, so the subject-axis tag varies
  // per declaration rather than being stamped once by the factory below.
  readonly tags: readonly string[];
}

const ELEMENT_DECLARATIONS: readonly ElementDeclaration[] = Object.freeze([
  {
    key: 'role',
    title: 'Instructions state the agent\'s role and purpose',
    question: 'Do the instructions say what this agent is for?',
    summary: 'Classify the instruction text for a stated role and purpose.',
    why: 'An agent whose instructions never state its role has nothing to resolve an off-topic request against.',
    fix: 'Open with a sentence naming who the agent is and what it is for.',
    tags: ['quality', 'scope'],
  },
  {
    key: 'tone',
    title: 'Instructions state tone and style',
    question: 'Do the instructions say how this agent should sound?',
    summary: 'Classify the instruction text for a stated tone and style.',
    why: 'Unstated tone is decided by the model, so the agent\'s voice drifts between turns and between releases.',
    fix: 'State the register, length and formality the agent should answer in.',
    tags: ['quality', 'ux'],
  },
  {
    key: 'boundaries',
    title: 'Instructions state decline/redirect boundaries',
    question: 'Do the instructions say what this agent should refuse or hand off?',
    summary: 'Classify the instruction text for stated decline and redirect boundaries.',
    why: 'Without a stated boundary the agent answers outside its competence instead of declining or redirecting.',
    fix: 'List the request types the agent should decline, and where it should send them instead.',
    tags: ['quality', 'scope'],
  },
  {
    key: 'ambiguity',
    title: 'Instructions state ambiguous-input handling',
    question: 'Do the instructions say what this agent should do with an unclear request?',
    summary: 'Classify the instruction text for stated ambiguous-input handling.',
    why: 'An agent with no instruction for unclear input guesses at intent rather than asking, and a wrong guess is acted on.',
    fix: 'Say whether the agent should ask a clarifying question, and what it should ask for.',
    tags: ['quality'],
  },
  {
    key: 'escalation',
    title: 'Instructions state escalation triggers',
    question: 'Do the instructions say when this agent should hand off to a person?',
    summary: 'Classify the instruction text for stated escalation triggers.',
    why: 'Without a stated trigger the agent keeps trying on requests that need a person, and the handoff never happens.',
    fix: 'Name the conditions that should route the conversation to a human, and the route.',
    tags: ['quality', 'routing'],
  },
] as const);

function instructionElementRule(declaration: ElementDeclaration): Rule<AgentsExperienceModel> {
  return rule<AgentsExperienceModel>({
    id: INSTRUCTION_RULE_IDS[declaration.key],
    title: declaration.title,
    harnesses: ['copilot'],
    pillar: 'instructions',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: declaration.tags,
    references: ['ms-authoring-instructions'],
    prose: {
      question: declaration.question,
      summary: declaration.summary,
      why: declaration.why,
      fix: declaration.fix,
      passWhen: [
        `The classifier found ${ELEMENT_LABELS[declaration.key]} in the instructions and quoted the text it found it in.`,
      ],
      failWhen: [
        `The classifier read the whole instruction text and found no statement of ${ELEMENT_LABELS[declaration.key]}.`,
      ],
      notApplicableWhen: [
        'The agent has no instructions, so there is no text for the element to be stated in.',
      ],
    },
    evidence: {
      fieldPaths: ['agentSettings.instructions'],
      populations: ['instructions'],
    },
  });
}

export const INS_02 = instructionElementRule(ELEMENT_DECLARATIONS[0]);
export const INS_03 = instructionElementRule(ELEMENT_DECLARATIONS[1]);
export const INS_04 = instructionElementRule(ELEMENT_DECLARATIONS[2]);
export const INS_05 = instructionElementRule(ELEMENT_DECLARATIONS[3]);
export const INS_06 = instructionElementRule(ELEMENT_DECLARATIONS[4]);

/** The five element rules, keyed so an adapter cannot pair a key with the wrong id. */
export const INSTRUCTION_COVERAGE_RULES: ReadonlyMap<InstructionElementKey, Rule<AgentsExperienceModel>> =
  new Map([
    ['role', INS_02], ['tone', INS_03], ['boundaries', INS_04],
    ['ambiguity', INS_05], ['escalation', INS_06],
  ] as const);

// ---------------------------------------------------------------------------
// SKL-04, SKL-06 — skill bundle quality
// ---------------------------------------------------------------------------

/**
 * Declared on the `copilot-skill` harness, not `copilot`.
 *
 * The verdict is produced by the per-skill bundle evaluator, which is the
 * `copilot-skill` AI node, and `nodesFor` derives that node from the harness. A
 * `copilot` harness would file an AI skill rule under `copilot-instructions`,
 * and `subjectScope: 'agent'` with a skill harness is rejected outright. It
 * still scores into the host agent's Skills pillar, which is what
 * `FAMILY_TO_PILLAR` gives the legacy `family: 'Skills'` today.
 */
export const SKL_04: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'SKL-04',
  title: 'Evaluated skills reach the Strong quality band',
  harnesses: ['copilot-skill'],
  pillar: 'skills',
  subjectScope: 'skill',
  execution: 'ai',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-overview'],
  prose: {
    question: 'Does every skill on this agent score in the Strong band on the published rubric?',
    summary: 'Score each captured skill bundle against the published authoring rubric.',
    why: 'A skill below the Strong band is weak on a rubric dimension the orchestrator depends on to select and run it correctly.',
    fix: 'Strengthen the dimensions the evaluator scored below seven.',
    passWhen: ['Every skill the evaluator judged reached the Strong band.'],
    failWhen: ['A skill the evaluator judged scored in the Good or Needs work band.'],
    notApplicableWhen: ['The agent has no skills, so there is no skill to score.'],
  },
  evidence: {
    fieldPaths: ['skills.markdown'],
    populations: ['skills'],
  },
});

export const SKL_06: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'SKL-06',
  title: 'Skills do not overlap or contradict one another',
  harnesses: ['copilot-skill'],
  pillar: 'skills',
  subjectScope: 'skill',
  execution: 'ai',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-overview'],
  prose: {
    question: 'Does any skill on this agent overlap or contradict one of its siblings?',
    summary: 'Compare each captured skill against its siblings for overlapping or contradictory scope.',
    why: 'Two skills that claim the same ground give the orchestrator no basis to choose between them, so selection becomes arbitrary.',
    fix: 'Differentiate the skills so the orchestrator can select unambiguously.',
    passWhen: ['The evaluator compared the skills against their siblings and reported no conflict.'],
    failWhen: ['The evaluator reported a skill overlapping or contradicting a named sibling.'],
    notApplicableWhen: [
      'The agent has fewer than two skills, so there is no pair for a conflict to exist between.',
    ],
  },
  evidence: {
    fieldPaths: ['skills.frontmatterDescription'],
    populations: ['skills'],
  },
});

// ---------------------------------------------------------------------------
// AEX-01 — capture completeness
// ---------------------------------------------------------------------------

/**
 * The one deterministic rule of the family, and the one that scores nothing.
 *
 * Its legacy `family: 'Parsing'` is not a key of `FAMILY_TO_PILLAR`, so today it
 * reaches no pillar and carries no weight. `Rule` requires a pillar, so this
 * follows the precedent the other unscored copilot families already set — Model
 * and Lifecycle are likewise absent from that table and are registered on
 * `orchestration` at `severity: 'info'`. `creditFor` returns `null` for `info`,
 * which keeps the rule out of both sides of every ratio: visible, and still
 * weightless (D-2.3-I).
 *
 * It is a `fail`, not a `record`: an unparsed component is a defect in the
 * capture, not an inventory fact, and the legacy emitter has always shown it as
 * a warning. `info` is what makes it non-scoring; `record` would additionally
 * make it unfailable.
 */
export const AEX_01: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'AEX-01',
  title: 'Every captured component matched a known schema',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality'],
  references: ['ms-agents-overview'],
  prose: {
    question: 'Did every component in the captured agent match a schema this tool knows how to read?',
    summary: 'Count the captured components the parser could not resolve to a known schema.',
    why: 'These components were inventoried but not reviewed — extracted values may be incomplete.',
    fix: 'Verify the components render as expected; newer export shapes may need tool updates.',
    passWhen: ['Every captured component resolved to a known schema.'],
    failWhen: ['A captured component did not resolve to a known schema and was inventoried unreviewed.'],
    notApplicableWhen: [
      'Never. Every capture has a component inventory, so this rule always has a population to read.',
    ],
  },
  evidence: {
    fieldPaths: ['unknownKinds'],
    populations: ['configuration'],
  },
  check(model) {
    const instances: RuleInstance[] = model.unknownKinds.map(unknown => ({
      subjectId: unknown.componentIdUnique?.trim() || unknown.componentId?.trim() || undefined,
      subject: unknown.schemaname,
      title: `Component "${unknown.schemaname}" did not match a known schema`,
      detail: `${unknown.schemaname}: ${unknown.kind ?? 'parse error'}`,
      why: 'These components were inventoried but not reviewed — extracted values may be incomplete.',
      makerAction: 'Verify the components render as expected; newer export shapes may need tool updates.',
      reference: 'ms-agents-overview',
      subjectRef: {
        id: unknown.componentIdUnique?.trim() || unknown.componentId?.trim() || undefined,
        schemaName: unknown.schemaname,
        quote: unknown.kind ?? 'parse error',
      },
    }));
    return instances.length > 0
      ? failWith(instances)
      : pass('Every captured component resolved to a known schema.');
  },
});

export const skillCoverageRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([
  INS_02, INS_03, INS_04, INS_05, INS_06, SKL_04, SKL_06, AEX_01,
]);
