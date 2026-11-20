import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import type {
  AssessmentStatus,
  InstructionEvaluation,
  LocalPattern,
  LocalStageAOutput,
  PatternEvaluation,
  StageBTopicComponent,
} from '../contracts/StageOutputs';
import type {
  StandardReviewAssessmentIdentity,
  StandardReviewComparableBaseline,
  StandardReviewConsistencyResult,
  StandardReviewEvaluatorDisagreement,
  StandardReviewOutcomeTransition,
} from '../contracts/StandardReviewConsistency';
import type {
  StandardReviewCorpusComponent,
  StandardReviewRule,
} from '../contracts/StandardReviewWorkflow';
import {
  getInstructionAssessments,
  getIssueCriterionId,
  getPatternAssessment,
  STANDARD_REVIEW_POLICY_VERSION,
} from './reviewAssessment';
// Imported by specific module path rather than through the `review-core` barrel, which would
// thread an import cycle back through the scorer.
import { AGENT_PILLAR_WEIGHTS, UNCONDITIONAL_AGENT_PILLARS } from '../review-core/pillars';
import { rulesFor } from '../review-core/registry';
import { SEVERITY_WEIGHT } from '../review-core/severity';
import { buildStandardReviewWorkflowCorpus } from './standardReviewCorpus';
import {
  STANDARD_PATTERN_WORKFLOW_RULES,
  STANDARD_WORKFLOW_RULES,
  getStandardWorkflowRule,
} from './standardReviewWorkflowRules';

interface AssertStandardReviewConsistencyInput {
  currentIdentity: StandardReviewAssessmentIdentity;
  currentPatterns: PatternEvaluation;
  currentInstructions: InstructionEvaluation;
  baseline: StandardReviewComparableBaseline;
}

interface RuleOutcome {
  name: string;
  status: AssessmentStatus;
}

function outcomeWeight(ruleId: string): {
  pillar: StandardReviewOutcomeTransition['pillar'];
  weight: number;
} {
  const criterion = COMPLIANCE_CRITERIA.find(item => item.id === ruleId);
  if (!criterion) return { pillar: 'pattern', weight: 1 };
  return {
    pillar: 'instruction',
    weight: criterion.inherentSeverity === 'High'
      ? 3
      : criterion.inherentSeverity === 'Medium'
        ? 2
        : 1,
  };
}

function pointContribution(
  status: StandardReviewOutcomeTransition['previousStatus'],
  weight: number,
): { earned: number; available: number } {
  if (status !== 'pass' && status !== 'fail') return { earned: 0, available: 0 };
  return { earned: status === 'pass' ? weight : 0, available: weight };
}

const LOCAL_POLICY_RULES = [
  { ruleId: 'local-pattern-1', name: 'Missing Model Name' },
  { ruleId: 'local-pattern-2', name: 'Missing Model Description' },
  { ruleId: 'local-pattern-3', name: 'Missing Input Variable Name' },
  { ruleId: 'local-pattern-4', name: 'Missing Input Variable Description' },
  { ruleId: 'local-pattern-5', name: 'Missing Output Variable Name' },
  { ruleId: 'local-pattern-6', name: 'Missing Output Variable Description' },
  { ruleId: 'local-pattern-7', name: 'Excessive Tools Usage', failAbove: 15 },
  {
    ruleId: 'local-pattern-8',
    name: 'Inadequate Test Cases',
    failBelow: 10,
    zipStatus: 'not-applicable',
  },
  { ruleId: 'local-pattern-9', name: 'Missing Child Agent Description' },
  { ruleId: 'local-pattern-10', name: 'Child Agent Architecture Sprawl', failAbove: 5 },
  { ruleId: 'local-pattern-11', name: 'Invalid Topic Reference' },
  { ruleId: 'local-pattern-12', name: 'Missing Tool Description' },
  { ruleId: 'local-pattern-13', name: 'Duplicate Tool Descriptions' },
] as const;

/**
 * Order two strings by code point, never by locale.
 *
 * `localeCompare` asks the *host* how to order, and a collation that ignores punctuation at
 * primary strength orders `{"gate":…` against `{"id":…` differently from one that does not. Every
 * ordering decision below feeds a hash that is now a hard gate: `policyHash` decides whether a
 * saved review is comparable at all, and a mismatch is skipped *silently*. A locale-dependent
 * order would therefore mean two makers on different browser locales never share a baseline, with
 * no error raised anywhere and no test able to see it — both apps in one browser agree. A hash
 * must depend on the data and on nothing else about the machine that computed it.
 */
function byCodePoint(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalValue)
      .sort((left, right) => byCodePoint(JSON.stringify(left), JSON.stringify(right)));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => byCodePoint(left, right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

async function hashValue(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable, so the Standard review input cannot be identified.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function ruleComponents(
  rule: StandardReviewRule,
  components: StandardReviewCorpusComponent[],
): unknown[] {
  const eligibleIds = new Set(rule.applicability.eligibleComponentIds);
  const fieldNames = rule.requiredEvidence.allowedFieldPaths
    .map(path => path.split('.').at(-1))
    .filter((field): field is string => Boolean(field));
  return components
    .filter(component => eligibleIds.has(component.componentId))
    .map(component => ({
      componentId: component.componentId,
      componentType: component.componentType,
      name: component.name,
      schemaName: component.schemaName,
      fields: Object.fromEntries(fieldNames.map(field => [
        field,
        rule.category === 'instructions' && field === 'instructions'
          ? instructionRuleClauses(rule.ruleId, component.fields[field])
          : component.fields[field],
      ])),
    }));
}

function instructionRuleClauses(ruleId: string, value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const terms = getStandardWorkflowRule(ruleId)?.semanticTerms
    .map(term => term.toLowerCase()) ?? [];
  if (terms.length === 0) return [];
  return value
    .split(/\r?\n|(?<=[.!?;])\s+/)
    .map(clause => clause.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .filter(clause => terms.some(term => clause.includes(term)));
}

function workflowRuleInputs(stageA: LocalStageAOutput): Map<string, unknown> {
  const corpus = buildStandardReviewWorkflowCorpus(stageA, {
    correlationId: 'assessment-identity',
    sourceEnvironment: '',
  });
  return new Map(corpus.standardReview.reviewUnits.flatMap(unit =>
    unit.corpus.standardReview.rules.map(rule => [rule.ruleId, {
      applicability: {
        status: rule.applicability.status,
        eligibleComponentIds: rule.applicability.eligibleComponentIds,
      },
      components: ruleComponents(rule, unit.corpus.agent.components),
    }] as const)));
}

function topicIdentity(topic: StageBTopicComponent): Record<string, unknown> {
  return {
    topicId: topic.TopicId,
    topicName: topic.TopicName,
    schemaName: topic.SchemaName,
  };
}

function localRuleInput(
  stageA: LocalStageAOutput,
  pattern: LocalPattern,
): unknown {
  const common = {
    configurationAvailable: stageA.configurationAvailable,
    unknownComponents: stageA.unknownComponents,
  };
  const topics = stageA.topicComponents;
  switch (pattern.patternId) {
    case 'local-pattern-1':
      return {
        ...common,
        topics: topics.map(topic => ({
          ...topicIdentity(topic),
          modelName: topic.ModelName,
          namingApplicability: topic.NamingApplicability,
          parseStatus: topic.ParseStatus,
        })),
      };
    case 'local-pattern-2':
      return {
        ...common,
        topics: topics.map(topic => ({
          ...topicIdentity(topic),
          modelDescription: topic.ModelDescription,
          routingApplicability: topic.RoutingApplicability,
          parseStatus: topic.ParseStatus,
        })),
      };
    case 'local-pattern-3':
    case 'local-pattern-4':
      return {
        ...common,
        topics: topics.map(topic => ({
          ...topicIdentity(topic),
          inputVariables: topic.InputVariables,
          inputVariablesStatus: topic.InputVariablesStatus,
        })),
      };
    case 'local-pattern-5':
    case 'local-pattern-6':
      return {
        ...common,
        topics: topics.map(topic => ({
          ...topicIdentity(topic),
          outputVariables: topic.OutputVariables,
          outputVariablesStatus: topic.OutputVariablesStatus,
        })),
      };
    case 'local-pattern-7':
      return {
        ...common,
        toolCount: stageA.toolCount,
        toolDetails: stageA.toolDetails,
        connectedAgents: stageA.connectedAgents,
      };
    case 'local-pattern-8':
      return {
        ...common,
        source: stageA.source,
        testCaseCount: stageA.testCaseCount,
        testCaseDetails: stageA.testCaseDetails,
      };
    case 'local-pattern-9':
    case 'local-pattern-10':
      return {
        ...common,
        orchestrationMode: stageA.orchestrationMode,
        childAgents: stageA.childAgents,
      };
    case 'local-pattern-12':
    case 'local-pattern-13':
      return {
        ...common,
        toolCount: stageA.toolCount,
        toolDetails: stageA.toolDetails,
      };
    case 'local-pattern-11':
      return {
        ...common,
        topics: topics.map(topic => ({
          ...topicIdentity(topic),
          modelDescription: topic.ModelDescription,
          routingApplicability: topic.RoutingApplicability,
          parseStatus: topic.ParseStatus,
        })),
      };
    default:
      return {
        ...common,
        patternId: pattern.patternId,
        affectedItems: pattern.affectedItems,
        topics: pattern.topics,
      };
  }
}

async function buildRuleInputHashes(stageA: LocalStageAOutput): Promise<Record<string, string>> {
  const inputs = workflowRuleInputs(stageA);
  for (const pattern of stageA.localPatterns) {
    inputs.set(`local:${pattern.patternId}`, localRuleInput(stageA, pattern));
  }
  const entries = await Promise.all([...inputs.entries()].map(async ([ruleId, input]) =>
    [ruleId, await hashValue(input)] as const));
  return Object.fromEntries(entries.sort(([left], [right]) => byCodePoint(left, right)));
}

function policyContract(): unknown {
  return {
    policyVersion: STANDARD_REVIEW_POLICY_VERSION,
    workflowRules: STANDARD_WORKFLOW_RULES,
    localRules: LOCAL_POLICY_RULES,
    scoring: {
      patternWeight: 'one-point-per-completed-category',
      instructionWeights: COMPLIANCE_CRITERIA.map(criterion => ({
        criteriaId: criterion.id,
        weight: criterion.inherentSeverity === 'High'
          ? 3
          : criterion.inherentSeverity === 'Medium'
            ? 2
            : 1,
      })),
      excludedStatuses: ['not-applicable', 'not-assessed'],
      // The headline is the six-pillar composite, so the fingerprint has to describe *that*. It
      // used to read `mean-of-available-pillars`, which outlived the rubric it named: a pillar
      // weight tweak or a registry rule change moved the real score while leaving the hash still
      // asserting the two reviews were comparable. Everything the composite actually reads is
      // enumerated below, so the guard now fires on exactly the drift it exists to catch.
      overall: 'six-pillar-weighted-composite',
      pillarWeights: AGENT_PILLAR_WEIGHTS,
      unconditionalPillars: UNCONDITIONAL_AGENT_PILLARS,
      // A rule records its severity as a *word*, but the number the scorer multiplies by lives in
      // `SEVERITY_WEIGHT`. Retuning "a failing medium rule keeps half its weight" to a third moves
      // every composite in the app while every rule still spells its severity `'medium'` — so
      // without this line the hash would declare the two reviews comparable beside a score that
      // visibly moved, which is the same class of stale fingerprint as the old `overall` label.
      severityWeights: SEVERITY_WEIGHT,
      compositeRules: rulesFor('standard')
        .map(rule => ({
          id: rule.id,
          pillar: typeof rule.pillar === 'string' ? rule.pillar : { ...rule.pillar },
          severity: rule.severity,
          weight: rule.weight ?? null,
          gate: rule.gate ?? false,
          // Which populations must have been captured decides whether the rule's pillar applies at
          // all, and an inapplicable pillar redistributes its weight across the rest — so editing
          // this list moves other pillars' contributions without touching any weight number.
          populations: rule.evidence.populations ?? [],
        }))
        // `canonicalValue` re-sorts every array before hashing, so this is belt and braces. It is
        // kept so the contract is deterministic on its own terms rather than by relying on a
        // detail of the hasher, and it uses the code-point comparator for the reason above.
        .sort((left, right) => byCodePoint(left.id, right.id)),
    },
  };
}

function patternRuleId(pattern: PatternEvaluation['Patterns'][number]): string {
  if (pattern.PatternId.startsWith('local-pattern-')) {
    return `local:${pattern.PatternId}`;
  }
  return STANDARD_PATTERN_WORKFLOW_RULES.find(rule =>
    rule.patternName === pattern.PatternName)?.ruleId
    ?? `pattern:${pattern.PatternId}`;
}

function collectOutcomes(
  patterns: PatternEvaluation,
  instructions: InstructionEvaluation,
): Map<string, RuleOutcome> {
  const outcomes = new Map<string, RuleOutcome>();
  for (const pattern of patterns.Patterns) {
    outcomes.set(patternRuleId(pattern), {
      name: pattern.PatternName,
      status: getPatternAssessment(pattern),
    });
  }
  for (const assessment of getInstructionAssessments(instructions)) {
    const criterion = COMPLIANCE_CRITERIA.find(item => item.id === assessment.criteriaId);
    outcomes.set(assessment.criteriaId, {
      name: criterion?.name ?? assessment.criteriaId,
      status: assessment.status,
    });
  }
  return outcomes;
}

function reconcilePatternOutcome(
  ruleId: string,
  current: PatternEvaluation,
  baseline: PatternEvaluation,
): void {
  const previousPattern = baseline.Patterns.find(pattern => patternRuleId(pattern) === ruleId);
  const currentIndex = current.Patterns.findIndex(pattern => patternRuleId(pattern) === ruleId);
  if (!previousPattern) {
    if (currentIndex >= 0) current.Patterns.splice(currentIndex, 1);
    return;
  }
  const acceptedPattern = structuredClone(previousPattern);
  if (currentIndex >= 0) current.Patterns[currentIndex] = acceptedPattern;
  else current.Patterns.push(acceptedPattern);
}

function reconcileInstructionOutcome(
  ruleId: string,
  current: InstructionEvaluation,
  baseline: InstructionEvaluation,
): void {
  const previousAssessment = getInstructionAssessments(baseline)
    .find(assessment => assessment.criteriaId === ruleId);
  if (!previousAssessment) return;

  const currentAssessments = Array.isArray(current.criterionAssessments)
    ? current.criterionAssessments.map(assessment => structuredClone(assessment))
    : getInstructionAssessments(current);
  const currentIndex = currentAssessments.findIndex(assessment => assessment.criteriaId === ruleId);
  if (currentIndex >= 0) currentAssessments[currentIndex] = structuredClone(previousAssessment);
  else currentAssessments.push(structuredClone(previousAssessment));
  current.criterionAssessments = currentAssessments;
  const acceptedIssues = baseline.issues
    .filter(issue => getIssueCriterionId(issue) === ruleId)
    .map(issue => structuredClone(issue));
  current.issues = [
    ...current.issues.filter(issue => getIssueCriterionId(issue) !== ruleId),
    ...acceptedIssues,
  ];
}

function reconcileOutcome(
  ruleId: string,
  pillar: StandardReviewOutcomeTransition['pillar'],
  currentPatterns: PatternEvaluation,
  currentInstructions: InstructionEvaluation,
  baseline: StandardReviewComparableBaseline,
): void {
  if (pillar === 'pattern') {
    reconcilePatternOutcome(ruleId, currentPatterns, baseline.patterns);
    return;
  }
  reconcileInstructionOutcome(ruleId, currentInstructions, baseline.instructions);
}

function isCompletedOutcome(
  status: StandardReviewOutcomeTransition['previousStatus'],
): status is 'pass' | 'fail' {
  return status === 'pass' || status === 'fail';
}

/**
 * Build stable whole-review and per-rule identities from the reviewed scoring input.
 */
export async function buildStandardReviewAssessmentIdentity(
  stageA: LocalStageAOutput,
): Promise<StandardReviewAssessmentIdentity> {
  const ruleInputHashes = await buildRuleInputHashes(stageA);
  return {
    schemaVersion: 1,
    policyVersion: STANDARD_REVIEW_POLICY_VERSION,
    policyHash: await hashValue(policyContract()),
    sourceHash: await hashValue(ruleInputHashes),
    ruleInputHashes,
  };
}

/**
 * Build the assessment identity, or give it up rather than fail the review that produced it.
 *
 * Identity is a *next* review's concern: it names this run so the one after it can be compared
 * against it. Every caller reaches here after the credit-bearing workflow has already run, so a
 * throw would discard a finished, paid review to protect a comparison that has not happened yet.
 *
 * It really can throw. `hashValue` requires `crypto.subtle`, which is absent outside a secure
 * context, and `buildRuleInputHashes` rebuilds the review corpus, so any corpus defect surfaces
 * here too. Returning `undefined` costs exactly one baseline: the assembly already treats a
 * missing identity as "no comparison", and the review after next re-establishes it.
 */
export async function tryBuildStandardReviewAssessmentIdentity(
  stageA: LocalStageAOutput,
): Promise<StandardReviewAssessmentIdentity | undefined> {
  try {
    return await buildStandardReviewAssessmentIdentity(stageA);
  } catch (error) {
    console.warn(
      '[StandardReview] Could not identify this review, so it will not serve as a baseline. The review itself is complete and unaffected.',
      error,
    );
    return undefined;
  }
}

/** Read a saved Standard review assessment identity without trusting malformed JSON. */
export function parseStandardReviewAssessmentIdentity(
  value: unknown,
): StandardReviewAssessmentIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1
    || typeof row.policyVersion !== 'string'
    || typeof row.policyHash !== 'string'
    || typeof row.sourceHash !== 'string'
    || !row.ruleInputHashes
    || typeof row.ruleInputHashes !== 'object'
    || Array.isArray(row.ruleInputHashes)) return undefined;
  const hashes = Object.entries(row.ruleInputHashes as Record<string, unknown>);
  if (hashes.some(([ruleId, hash]) => !ruleId || typeof hash !== 'string' || !hash)) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    policyVersion: row.policyVersion,
    policyHash: row.policyHash,
    sourceHash: row.sourceHash,
    ruleInputHashes: Object.fromEntries(hashes) as Record<string, string>,
  };
}

/** Read a saved Standard review consistency result without trusting malformed JSON. */
export function parseStandardReviewConsistencyResult(
  value: unknown,
): StandardReviewConsistencyResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1
    || typeof row.baselineReviewId !== 'string'
    || typeof row.baselineSourceHash !== 'string'
    || typeof row.sourceChanged !== 'boolean'
    || !Array.isArray(row.unchangedRuleIds)
    || !Array.isArray(row.changedRuleIds)
    || !Array.isArray(row.transitions)
    || [...row.unchangedRuleIds, ...row.changedRuleIds].some(item => typeof item !== 'string')) {
    return undefined;
  }
  const transitions = row.transitions.flatMap((value): StandardReviewOutcomeTransition[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const transition = value as Record<string, unknown>;
    const validStatus = (status: unknown) =>
      status === 'pass' || status === 'fail' || status === 'not-applicable'
      || status === 'not-assessed' || status === 'not-present';
    return typeof transition.ruleId === 'string'
      && typeof transition.ruleName === 'string'
      && validStatus(transition.previousStatus)
      && validStatus(transition.currentStatus)
      && (transition.pillar === 'pattern' || transition.pillar === 'instruction')
      && typeof transition.weight === 'number'
      && typeof transition.previousEarnedPoints === 'number'
      && typeof transition.currentEarnedPoints === 'number'
      && typeof transition.previousAvailablePoints === 'number'
      && typeof transition.currentAvailablePoints === 'number'
      ? [transition as unknown as StandardReviewOutcomeTransition]
      : [];
  });
  if (transitions.length !== row.transitions.length) return undefined;
  const evaluatorDisagreements = row.evaluatorDisagreements === undefined
    ? undefined
    : Array.isArray(row.evaluatorDisagreements)
      ? row.evaluatorDisagreements.flatMap((value): StandardReviewEvaluatorDisagreement[] => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const disagreement = value as Record<string, unknown>;
          const validStatus = (status: unknown) =>
            status === 'pass' || status === 'fail' || status === 'not-applicable'
            || status === 'not-assessed' || status === 'not-present';
          return typeof disagreement.ruleId === 'string'
            && typeof disagreement.ruleName === 'string'
            && validStatus(disagreement.previousStatus)
            && validStatus(disagreement.evaluatorStatus)
            && validStatus(disagreement.acceptedStatus)
            && (disagreement.pillar === 'pattern' || disagreement.pillar === 'instruction')
            ? [disagreement as unknown as StandardReviewEvaluatorDisagreement]
            : [];
        })
      : null;
  if (evaluatorDisagreements === null
    || (Array.isArray(row.evaluatorDisagreements)
      && evaluatorDisagreements !== undefined
      && evaluatorDisagreements.length !== row.evaluatorDisagreements.length)) {
    return undefined;
  }
  const scoreDelta = (() => {
    if (row.scoreDelta === undefined) return undefined;
    if (!row.scoreDelta || typeof row.scoreDelta !== 'object' || Array.isArray(row.scoreDelta)) {
      return null;
    }
    const delta = row.scoreDelta as Record<string, unknown>;
    // A withheld score persists as `null`; a saved row from before that distinction existed holds a
    // number on every field, so both shapes read back without a migration.
    const isScore = (value: unknown): value is number | null =>
      value === null || typeof value === 'number';
    const readSnapshot = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const snapshot = value as Record<string, unknown>;
      return isScore(snapshot.overallScore)
        && isScore(snapshot.patternScore)
        && isScore(snapshot.instructionScore)
        ? {
            overallScore: snapshot.overallScore,
            patternScore: snapshot.patternScore,
            instructionScore: snapshot.instructionScore,
          }
        : undefined;
    };
    const previous = readSnapshot(delta.previous);
    const current = readSnapshot(delta.current);
    return previous && current
      && isScore(delta.overall)
      && isScore(delta.pattern)
      && isScore(delta.instruction)
      ? {
          previous,
          current,
          overall: delta.overall,
          pattern: delta.pattern,
          instruction: delta.instruction,
        }
      : null;
  })();
  if (scoreDelta === null) return undefined;
  return {
    schemaVersion: 1,
    baselineReviewId: row.baselineReviewId,
    baselineSourceHash: row.baselineSourceHash,
    sourceChanged: row.sourceChanged,
    unchangedRuleIds: row.unchangedRuleIds as string[],
    changedRuleIds: row.changedRuleIds as string[],
    transitions,
    ...(evaluatorDisagreements ? { evaluatorDisagreements } : {}),
    ...(scoreDelta ? { scoreDelta } : {}),
  };
}

/**
 * Reconcile evaluator disagreements to the accepted result when a rule's input is unchanged.
 */
export function reconcileStandardReviewConsistency(
  input: AssertStandardReviewConsistencyInput,
): StandardReviewConsistencyResult {
  const { baseline, currentIdentity } = input;
  if (baseline.identity.policyVersion !== currentIdentity.policyVersion) {
    throw new Error('Standard review consistency cannot compare different policy versions.');
  }
  if (baseline.identity.policyHash !== currentIdentity.policyHash) {
    throw new Error('The Standard review scoring policy changed without a policy version change.');
  }

  const previous = collectOutcomes(baseline.patterns, baseline.instructions);
  const current = collectOutcomes(input.currentPatterns, input.currentInstructions);
  const ruleIds = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const unchangedRuleIds: string[] = [];
  const changedRuleIds: string[] = [];
  const transitions: StandardReviewOutcomeTransition[] = [];
  const evaluatorDisagreements: StandardReviewEvaluatorDisagreement[] = [];

  for (const ruleId of ruleIds) {
    const previousOutcome = previous.get(ruleId);
    const currentOutcome = current.get(ruleId);
    const previousHash = baseline.identity.ruleInputHashes[ruleId];
    const currentHash = currentIdentity.ruleInputHashes[ruleId];
    const inputChanged = previousHash !== currentHash;
    (inputChanged ? changedRuleIds : unchangedRuleIds).push(ruleId);

    const previousStatus = previousOutcome?.status ?? 'not-present';
    const currentStatus = currentOutcome?.status ?? 'not-present';
    if (previousStatus === currentStatus) continue;
    const ruleName = currentOutcome?.name ?? previousOutcome?.name ?? ruleId;
    const { pillar, weight } = outcomeWeight(ruleId);
    if (!inputChanged) {
      if (!isCompletedOutcome(previousStatus) || !isCompletedOutcome(currentStatus)) {
        continue;
      }
      evaluatorDisagreements.push({
        ruleId,
        ruleName,
        previousStatus,
        evaluatorStatus: currentStatus,
        acceptedStatus: previousStatus,
        pillar,
      });
      reconcileOutcome(
        ruleId,
        pillar,
        input.currentPatterns,
        input.currentInstructions,
        baseline,
      );
      continue;
    }
    if (!previousHash && previousOutcome || !currentHash && currentOutcome) {
      throw new Error(`Standard review consistency cannot identify the scoring input for ${ruleName}.`);
    }
    const previousPoints = pointContribution(previousStatus, weight);
    const currentPoints = pointContribution(currentStatus, weight);
    transitions.push({
      ruleId,
      ruleName,
      previousStatus,
      currentStatus,
      pillar,
      weight,
      previousEarnedPoints: previousPoints.earned,
      currentEarnedPoints: currentPoints.earned,
      previousAvailablePoints: previousPoints.available,
      currentAvailablePoints: currentPoints.available,
    });
  }

  return {
    schemaVersion: 1,
    baselineReviewId: baseline.reviewId,
    baselineSourceHash: baseline.identity.sourceHash,
    sourceChanged: baseline.identity.sourceHash !== currentIdentity.sourceHash,
    unchangedRuleIds,
    changedRuleIds,
    transitions,
    evaluatorDisagreements,
  };
}
