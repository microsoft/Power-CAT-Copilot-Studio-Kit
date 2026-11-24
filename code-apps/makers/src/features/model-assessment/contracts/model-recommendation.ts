import { parseResultReason, sameModel, type CreditsVM, type EvaluationRunVM } from './model-assessment';
import { creditsTotal } from './credits';
import { kitResultStatus, type KitTestRow } from './kit-results';
import { metricDisplayName } from './metric-display';

/** AI Builder prompt that turns a two-run comparison into a model recommendation. */
export const RECOMMENDATION_PROMPT_NAME = 'Recommend Model from Assessment Comparison';
/** Input variable of {@link RECOMMENDATION_PROMPT_NAME}. */
export const RECOMMENDATION_PROMPT_INPUT = 'ComparisonData';

export type RecommendationKind = 'evaluations' | 'kit';

const KIND_LABEL: Record<RecommendationKind, string> = {
  evaluations: 'Copilot Studio evaluations',
  kit: 'Copilot Agent Kit tests',
};

/** Outcome of one check (a metric of a test case, or a Kit test) in one run. */
export interface RecommendationOutcome {
  status?: string;
  reason?: string;
}

/** One check across the two runs; `a`/`b` are undefined when the run did not include it. */
export interface RecommendationCheck {
  testSet?: string;
  question: string;
  metric: string;
  a?: RecommendationOutcome;
  b?: RecommendationOutcome;
}

export interface RecommendationRun {
  run: EvaluationRunVM;
  /** Display name of the run's model. */
  model: string;
  /** Raw model code, used to detect two runs of the same model. */
  modelCode?: string;
}

/** A Copilot Studio evaluation check pivoted across runs (keyed by assessment run id). */
export interface EvaluationCheckRow {
  testSet?: string;
  question: string;
  metric: string;
  byRun: ReadonlyMap<string, { status?: string; reason?: string; metric?: string }>;
}

/** Evaluation checks of two runs, with grader reasons as readable text. */
export function evaluationChecks(rows: readonly EvaluationCheckRow[], runIdA: string, runIdB: string): RecommendationCheck[] {
  const outcome = (row: EvaluationCheckRow, runId: string): RecommendationOutcome | undefined => {
    const result = row.byRun.get(runId);
    return result && { status: result.status, reason: parseResultReason(result.reason, result.metric ?? row.metric) };
  };
  return rows.map((row) => ({
    testSet: row.testSet,
    question: row.question,
    metric: metricDisplayName(row.metric),
    a: outcome(row, runIdA),
    b: outcome(row, runIdB),
  }));
}

/** Kit test checks of two runs, matched by each run's Kit test run. */
export function kitChecks(rows: readonly KitTestRow[], runA: EvaluationRunVM, runB: EvaluationRunVM): RecommendationCheck[] {
  const outcome = (row: KitTestRow, run: EvaluationRunVM): RecommendationOutcome | undefined => {
    const id = run.kit?.testRunId?.toLowerCase();
    const result = id ? row.byRun.get(id) : undefined;
    return result && { status: kitResultStatus(result.code), reason: result.reason };
  };
  return rows.map((row) => ({
    testSet: row.testSetName,
    question: row.questions?.length ? row.questions.join(' → ') : row.utterance,
    metric: row.metric,
    a: outcome(row, runA),
    b: outcome(row, runB),
  }));
}

type Outcome = 'pass' | 'fail' | 'error' | 'other';

const outcomeOf = (status: string | undefined): Outcome | undefined => {
  const value = (status ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!value) return undefined;
  if (value === 'pass' || value === 'passed' || value === 'success') return 'pass';
  if (value === 'fail' || value === 'failed') return 'fail';
  if (value === 'error') return 'error';
  // Excluded, Pending and Unknown results are not scored.
  return 'other';
};

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

const clip = (value: string | undefined, max: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Evaluations runs have Copilot Studio results; Kit-mode runs only have a Kit test run. */
export function runKind(run: EvaluationRunVM, resultRunIds: ReadonlySet<string>): RecommendationKind {
  return resultRunIds.has(run.id.toLowerCase()) ? 'evaluations' : 'kit';
}

interface RunTally { total: number; pass: number; fail: number; error: number; other: number }

const emptyTally = (): RunTally => ({ total: 0, pass: 0, fail: 0, error: 0, other: 0 });

function tally(target: RunTally, outcome: Outcome | undefined) {
  if (!outcome) return;
  target.total += 1;
  target[outcome] += 1;
}

const EVIDENCE_LIMIT = 6;

const MATERIAL_CREDIT_PERCENT = 15;
const QUALITY_POINTS = 5;
const QUALITY_NET_CHECKS = 2;
const MIN_SHARED = 3;
const MAX_ERROR_SHARE = 50;
const CRITICAL_PASS_RATE = 75;
const LOW_SHARED = 8;
const LOW_ERROR_SHARE = 20;
const MEDIUM_SHARED = 20;
const MEDIUM_COVERAGE_SHARE = 0.1;
const MEDIUM_NET_CHECKS = 4;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Pre-computes credit percentages so the prompt never has to do the arithmetic.
 * Compares credits per check, so runs that ran a different number of checks
 * can still be compared; with the same checks this equals comparing totals.
 */
function creditComparison(bothReported: boolean, totalA: number, totalB: number, checksA: number, checksB: number) {
  const perCheckA = bothReported && checksA > 0 ? totalA / checksA : 0;
  const perCheckB = bothReported && checksB > 0 ? totalB / checksB : 0;
  const low = Math.min(perCheckA, perCheckB);
  const high = Math.max(perCheckA, perCheckB);
  if (!bothReported || low <= 0) {
    return { perCheckA: null, perCheckB: null, cheaperRun: null, savingPercent: null, extraCostPercent: null, material: false } as const;
  }
  const extraCostPercent = Math.round(((high - low) / low) * 1000) / 10;
  return {
    perCheckA: round2(perCheckA),
    perCheckB: round2(perCheckB),
    cheaperRun: perCheckA === perCheckB ? 'same' : perCheckA < perCheckB ? 'A' : 'B',
    savingPercent: Math.round(((high - low) / high) * 1000) / 10,
    extraCostPercent,
    material: extraCostPercent >= MATERIAL_CREDIT_PERCENT,
  } as const;
}

function creditsOf(credits: CreditsVM | undefined) {
  if (!credits) return null;
  return {
    total: Math.round(creditsTotal(credits) * 100) / 100,
    toAnswer: Math.round(credits.conversation * 100) / 100,
    toScore: Math.round(credits.evaluators * 100) / 100,
    partial: Boolean(credits.partial),
  };
}

/** The JSON the recommendation prompt reads as `ComparisonData`. */
export interface RecommendationPayload {
  kind: string;
  agentName: string | null;
  sameModel: boolean;
  runA: ReturnType<typeof runSummary>;
  runB: ReturnType<typeof runSummary>;
  shared: {
    scored: number;
    bothPass: number;
    onlyAPass: number;
    onlyBPass: number;
    bothFail: number;
    passRateA: number | null;
    passRateB: number | null;
    differencePoints: number | null;
    /** The run whose shared-check quality is clearly better (≥5 points and a net of ≥2 checks), else null. */
    qualityLeader: 'A' | 'B' | null;
  };
  coverage: { onlyInA: number; onlyInB: number; errorOrUnresolvedInEither: number; sameChecks: boolean };
  testSets: Array<{ name: string; a: Omit<RunTally, 'total' | 'other'>; b: Omit<RunTally, 'total' | 'other'> }>;
  credits: {
    bothReported: boolean;
    /** Copilot Credits per check each run ran (total ÷ checks), the basis of every comparison below. */
    perCheckA: number | null;
    perCheckB: number | null;
    /** The run with fewer credits per check. */
    cheaperRun: 'A' | 'B' | 'same' | null;
    /** How much less the cheaper run cost per check, as a percentage of the costlier run. */
    savingPercent: number | null;
    /** How much more the costlier run cost per check, as a percentage of the cheaper run. */
    extraCostPercent: number | null;
    material: boolean;
    /** The cheaper run when credits can settle a quality tie, else null. */
    tieBreak: 'A' | 'B' | null;
    comparableCoverage: boolean;
    note: string | null;
  };
  evidence: Record<'onlyAPass' | 'onlyBPass' | 'bothFail' | 'errors', EvidenceItem[]>;
  evidenceIsSample: boolean;
  /**
   * Pre-written count sentences naming each model, so the prompt never has to
   * derive per-model counts from the joint `shared` buckets (it misread
   * `bothPass`/`bothFail` as each model's own score).
   */
  facts: string[];
  /** Verdict and confidence decided by the app; the prompt only explains them. */
  decision: RecommendationDecision;
}

export type RecommendationBasis =
  | 'too-few-shared-checks'
  | 'too-many-errors'
  | 'both-below-quality-bar'
  | 'same-model'
  | 'better-quality'
  | 'same-quality-fewer-credits'
  | 'no-meaningful-difference';

export type ConfidenceFactor =
  | 'small-sample'
  | 'mostly-different-checks'
  | 'many-errors'
  | 'completed-with-errors'
  | 'moderate-sample'
  | 'coverage-differs'
  | 'narrow-quality-margin'
  | 'partial-credits';

export interface RecommendationDecision {
  verdict: RecommendationVerdict;
  confidence: RecommendationConfidence;
  basis: RecommendationBasis;
  /** Model name of the recommended run, or null when no run is recommended. */
  recommendedModel: string | null;
  /** Why confidence is not high; empty when it is. */
  confidenceFactors: ConfidenceFactor[];
}

interface EvidenceItem {
  testSet: string | null;
  question: string;
  metric: string;
  a: string;
  b: string;
  reasonA: string | null;
  reasonB: string | null;
}

interface RunBreakdown {
  /** Every check in the run. */
  all: RunTally;
  /** Checks scored in both runs. */
  shared: { pass: number; fail: number };
  /** Checks the other run did not include. */
  onlyHere: RunTally;
}

function runSummary(label: 'A' | 'B', input: RecommendationRun, counts: RunBreakdown) {
  const { run } = input;
  const { all, shared, onlyHere } = counts;
  return {
    label,
    model: input.model,
    completedOn: run.completedOn ?? run.startedOn ?? null,
    runStatus: run.status,
    regressionStatus: run.regression,
    checks: { ...all },
    passRate: percent(all.pass, all.pass + all.fail),
    errorShare: percent(all.error, all.total),
    sharedChecks: { ...shared, passRate: percent(shared.pass, shared.pass + shared.fail) },
    checksOnlyInThisRun: { pass: onlyHere.pass, fail: onlyHere.fail, error: onlyHere.error, other: onlyHere.other },
    credits: creditsOf(run.credits),
  };
}

const checksText = (n: number) => `${n} check${n === 1 ? '' : 's'}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Count sentences that bind every figure to a model name. */
function countFacts(
  names: [string, string],
  breakdowns: [RunBreakdown, RunBreakdown],
  shared: { scored: number; bothPass: number; onlyAPass: number; onlyBPass: number; bothFail: number },
): string[] {
  const [nameA, nameB] = names;
  const facts = breakdowns.map(({ shared: own }, i) =>
    `${capitalize(names[i])} passed ${own.pass} and failed ${own.fail} of the ${checksText(shared.scored)} both runs scored `
    + `(${percent(own.pass, shared.scored)}% pass rate).`);
  facts.push(
    `On those checks, ${checksText(shared.bothPass)} passed in both runs and ${checksText(shared.bothFail)} failed in both runs.`,
    `${capitalize(checksText(shared.onlyAPass))} passed with ${nameA} but failed with ${nameB}; `
      + `${checksText(shared.onlyBPass)} passed with ${nameB} but failed with ${nameA}.`,
  );
  breakdowns.forEach(({ onlyHere }, i) => {
    if (!onlyHere.total) return;
    const parts = [`${onlyHere.pass} passed`, `${onlyHere.fail} failed`];
    if (onlyHere.error) parts.push(`${onlyHere.error} errored`);
    if (onlyHere.other) parts.push(`${onlyHere.other} not scored`);
    facts.push(`${capitalize(names[i])} also ran ${checksText(onlyHere.total)} that ${names[1 - i]} did not: ${parts.join(', ')}.`);
  });
  return facts;
}

/** Why no recommendation is requested, or the payload to request one with. */
export type RecommendationRequest =
  | { state: 'select-two'; selected: number }
  | { state: 'mixed-kinds' }
  | { state: 'loading' }
  | { state: 'data-error' }
  | { state: 'no-shared-checks' }
  | { state: 'ready'; key: string; payload: RecommendationPayload; runA: RecommendationRun; runB: RecommendationRun };

export interface BuildRecommendationInput {
  /** Selected runs, oldest first. */
  runs: RecommendationRun[];
  resultRunIds: ReadonlySet<string>;
  checks: RecommendationCheck[];
  agentName?: string;
  /** Kit results still loading or failed to load. */
  kitLoading?: boolean;
  kitError?: boolean;
}

interface DecisionInput {
  shared: { scored: number; onlyAPass: number; onlyBPass: number; passRateA: number | null; passRateB: number | null; qualityLeader: 'A' | 'B' | null };
  errorShares: [number, number];
  maxTotal: number;
  withErrors: boolean;
  differentChecks: number;
  sameModel: boolean;
  tieBreak: 'A' | 'B' | null;
  partialCredits: boolean;
  models: [string, string];
}

/**
 * Deterministic verdict and confidence. The first matching rule decides:
 * too little evidence → both below the quality bar → same model → clearly
 * better quality → same quality but materially fewer credits → equivalent.
 */
function decide(input: DecisionInput): RecommendationDecision {
  const { shared } = input;
  let verdict: RecommendationVerdict;
  let basis: RecommendationBasis;
  if (shared.scored < MIN_SHARED) [verdict, basis] = ['insufficient', 'too-few-shared-checks'];
  else if (input.errorShares.some((share) => share >= MAX_ERROR_SHARE)) [verdict, basis] = ['insufficient', 'too-many-errors'];
  else if ((shared.passRateA ?? 0) < CRITICAL_PASS_RATE && (shared.passRateB ?? 0) < CRITICAL_PASS_RATE) {
    [verdict, basis] = ['neither', 'both-below-quality-bar'];
  } else if (input.sameModel) [verdict, basis] = ['equivalent', 'same-model'];
  else if (shared.qualityLeader) [verdict, basis] = [shared.qualityLeader, 'better-quality'];
  else if (input.tieBreak) [verdict, basis] = [input.tieBreak, 'same-quality-fewer-credits'];
  else [verdict, basis] = ['equivalent', 'no-meaningful-difference'];

  const low: ConfidenceFactor[] = [];
  if (shared.scored < LOW_SHARED) low.push('small-sample');
  if (shared.scored < input.maxTotal / 2) low.push('mostly-different-checks');
  if (input.errorShares.some((share) => share >= LOW_ERROR_SHARE)) low.push('many-errors');
  if (input.withErrors) low.push('completed-with-errors');
  const medium: ConfidenceFactor[] = [];
  if (shared.scored >= LOW_SHARED && shared.scored < MEDIUM_SHARED) medium.push('moderate-sample');
  if (input.differentChecks > shared.scored * MEDIUM_COVERAGE_SHARE) medium.push('coverage-differs');
  if (basis === 'better-quality' && Math.abs(shared.onlyAPass - shared.onlyBPass) < MEDIUM_NET_CHECKS) medium.push('narrow-quality-margin');
  if (basis === 'same-quality-fewer-credits' && input.partialCredits) medium.push('partial-credits');
  const confidence: RecommendationConfidence = verdict === 'insufficient' || low.length
    ? 'low'
    : medium.length ? 'medium' : 'high';

  return {
    verdict,
    confidence,
    basis,
    recommendedModel: verdict === 'A' ? input.models[0] : verdict === 'B' ? input.models[1] : null,
    confidenceFactors: confidence === 'high' ? [] : [...low, ...medium],
  };
}

/**
 * Decide whether the selected runs can be recommended between and, if so, build
 * the prompt payload. Only two runs of the same kind with at least one check
 * scored in both are sent to AI: Copilot Studio evaluations and Copilot Agent
 * Kit tests score different things and are never compared.
 */
export function buildRecommendationRequest({
  runs, resultRunIds, checks, agentName, kitLoading, kitError,
}: BuildRecommendationInput): RecommendationRequest {
  if (runs.length !== 2) return { state: 'select-two', selected: runs.length };
  const [runA, runB] = runs;
  const kind = runKind(runA.run, resultRunIds);
  if (kind !== runKind(runB.run, resultRunIds)) return { state: 'mixed-kinds' };
  if (kind === 'kit' && kitError) return { state: 'data-error' };
  if (kind === 'kit' && kitLoading) return { state: 'loading' };

  const countsA = emptyTally();
  const countsB = emptyTally();
  const onlyInA = emptyTally();
  const onlyInB = emptyTally();
  const shared = { scored: 0, bothPass: 0, onlyAPass: 0, onlyBPass: 0, bothFail: 0 };
  const coverage = { onlyInA: 0, onlyInB: 0, errorOrUnresolvedInEither: 0 };
  const sets = new Map<string, { name: string; a: RunTally; b: RunTally }>();
  const evidence: RecommendationPayload['evidence'] = { onlyAPass: [], onlyBPass: [], bothFail: [], errors: [] };
  let sampled = false;

  const add = (bucket: keyof RecommendationPayload['evidence'], check: RecommendationCheck) => {
    if (evidence[bucket].length >= EVIDENCE_LIMIT) {
      sampled = true;
      return;
    }
    evidence[bucket].push({
      testSet: check.testSet?.trim() || null,
      question: clip(check.question, 240) || '(question not recorded)',
      metric: check.metric,
      a: check.a?.status ?? 'Not run',
      b: check.b?.status ?? 'Not run',
      reasonA: clip(check.a?.reason, 300) || null,
      reasonB: clip(check.b?.reason, 300) || null,
    });
  };

  for (const check of checks) {
    const a = outcomeOf(check.a?.status);
    const b = outcomeOf(check.b?.status);
    if (!a && !b) continue;
    tally(countsA, a);
    tally(countsB, b);
    const setName = check.testSet?.trim() || 'Test set unavailable';
    const set = sets.get(setName.toLowerCase()) ?? { name: setName, a: emptyTally(), b: emptyTally() };
    tally(set.a, a);
    tally(set.b, b);
    sets.set(setName.toLowerCase(), set);

    if (!a) {
      coverage.onlyInB += 1;
      tally(onlyInB, b);
    } else if (!b) {
      coverage.onlyInA += 1;
      tally(onlyInA, a);
    }
    if (a === 'error' || b === 'error') add('errors', check);
    const scoredA = a === 'pass' || a === 'fail';
    const scoredB = b === 'pass' || b === 'fail';
    if (a && b && !(scoredA && scoredB)) coverage.errorOrUnresolvedInEither += 1;
    if (!scoredA || !scoredB) continue;
    shared.scored += 1;
    if (a === 'pass' && b === 'pass') shared.bothPass += 1;
    else if (a === 'pass') {
      shared.onlyAPass += 1;
      add('onlyAPass', check);
    } else if (b === 'pass') {
      shared.onlyBPass += 1;
      add('onlyBPass', check);
    } else {
      shared.bothFail += 1;
      add('bothFail', check);
    }
  }

  if (shared.scored === 0) return { state: 'no-shared-checks' };

  const passRateA = percent(shared.bothPass + shared.onlyAPass, shared.scored);
  const passRateB = percent(shared.bothPass + shared.onlyBPass, shared.scored);
  const sameChecks = coverage.onlyInA === 0 && coverage.onlyInB === 0;
  const creditsA = runA.run.credits;
  const creditsB = runB.run.credits;
  const bothReported = Boolean(creditsA && creditsB);
  const totalA = creditsA ? creditsTotal(creditsA) : 0;
  const totalB = creditsB ? creditsTotal(creditsB) : 0;
  const creditsNote = kind === 'kit'
    ? 'Copilot Agent Kit tests do not report Copilot Credits.'
    : !creditsA && !creditsB
      ? 'Copilot Credits are reported only for agents that run on the Microsoft Copilot harness.'
      : !bothReported
        ? 'Only one run reported Copilot Credits.'
        : null;
  const differencePoints = passRateA !== null && passRateB !== null
    ? Math.round((passRateB - passRateA) * 10) / 10
    : null;
  const netChecks = shared.onlyBPass - shared.onlyAPass;
  const qualityLeader = differencePoints !== null
    && Math.abs(differencePoints) >= QUALITY_POINTS
    && Math.abs(netChecks) >= QUALITY_NET_CHECKS
    && Math.sign(differencePoints) === Math.sign(netChecks)
    ? (differencePoints > 0 ? 'B' : 'A')
    : null;
  const creditFacts = creditComparison(bothReported, totalA, totalB, countsA.total, countsB.total);
  const tieBreak = creditFacts.material
    && (creditFacts.cheaperRun === 'A' || creditFacts.cheaperRun === 'B')
    ? creditFacts.cheaperRun
    : null;

  const isSameModel = sameModel(runA.modelCode ?? runA.model, runB.modelCode ?? runB.model);
  const decision = decide({
    shared: { ...shared, passRateA, passRateB, qualityLeader },
    errorShares: [percent(countsA.error, countsA.total) ?? 0, percent(countsB.error, countsB.total) ?? 0],
    maxTotal: Math.max(countsA.total, countsB.total),
    withErrors: [runA.run.status, runB.run.status].includes('Completed With Errors'),
    differentChecks: coverage.onlyInA + coverage.onlyInB,
    sameModel: isSameModel,
    tieBreak,
    partialCredits: Boolean(creditsA?.partial || creditsB?.partial),
    models: [runA.model, runB.model],
  });

  const breakdownA: RunBreakdown = {
    all: countsA,
    shared: { pass: shared.bothPass + shared.onlyAPass, fail: shared.onlyBPass + shared.bothFail },
    onlyHere: onlyInA,
  };
  const breakdownB: RunBreakdown = {
    all: countsB,
    shared: { pass: shared.bothPass + shared.onlyBPass, fail: shared.onlyAPass + shared.bothFail },
    onlyHere: onlyInB,
  };
  const factNames: [string, string] = isSameModel ? ['the earlier run', 'the later run'] : [runA.model, runB.model];

  const payload: RecommendationPayload = {
    kind: KIND_LABEL[kind],
    agentName: agentName?.trim() || null,
    sameModel: isSameModel,
    runA: runSummary('A', runA, breakdownA),
    runB: runSummary('B', runB, breakdownB),
    shared: {
      ...shared,
      passRateA,
      passRateB,
      differencePoints,
      qualityLeader,
    },
    coverage: { ...coverage, sameChecks },
    testSets: [...sets.values()]
      .sort((x, y) => x.name.localeCompare(y.name))
      .map((set) => ({
        name: set.name,
        a: { pass: set.a.pass, fail: set.a.fail, error: set.a.error },
        b: { pass: set.b.pass, fail: set.b.fail, error: set.b.error },
      })),
    credits: {
      bothReported,
      ...creditFacts,
      tieBreak,
      comparableCoverage: sameChecks,
      note: creditsNote,
    },
    evidence,
    evidenceIsSample: sampled,
    facts: countFacts(factNames, [breakdownA, breakdownB], shared),
    decision,
  };
  return {
    state: 'ready',
    key: JSON.stringify([runA.run.id.toLowerCase(), runB.run.id.toLowerCase(), checks.length, shared]),
    payload,
    runA,
    runB,
  };
}

export type RecommendationVerdict = 'A' | 'B' | 'equivalent' | 'neither' | 'insufficient';
export type RecommendationConfidence = 'high' | 'medium' | 'low';

/** Parsed prompt output. */
export interface ModelRecommendation {
  verdict: RecommendationVerdict;
  confidence: RecommendationConfidence;
  headline: string;
  reasons: string[];
  tradeoffs: string[];
  caveats: string[];
}

const VERDICTS: readonly RecommendationVerdict[] = ['A', 'B', 'equivalent', 'neither', 'insufficient'];

/** Prompt lists may come back as plain strings or as `{ item: string }` objects, depending on the saved output format. */
const listText = (item: unknown): string => {
  if (typeof item === 'string') return item.trim();
  const value = (item as { item?: unknown } | null)?.item;
  return typeof value === 'string' ? value.trim() : '';
};

const strings = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .map(listText)
    .filter((item) => item.length > 0)
    .slice(0, max);

/**
 * Validate the prompt output. The verdict and confidence always come from the
 * app's decision; the prompt only supplies the wording. Text written for a
 * different verdict is rejected so the card never contradicts itself.
 */
export function parseRecommendation(value: unknown, decision: RecommendationDecision): ModelRecommendation {
  const raw = (typeof value === 'string' ? JSON.parse(value) : value) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new Error('The recommendation was empty.');
  const headline = typeof raw.headline === 'string' ? raw.headline.trim() : '';
  if (!headline) throw new Error('The recommendation was not in the expected format.');
  const verdictText = String(raw.verdict ?? '').trim().toLowerCase();
  const echoed = VERDICTS.find((item) => item.toLowerCase() === verdictText);
  if (echoed && echoed !== decision.verdict) throw new Error('The recommendation did not match the comparison.');
  return {
    verdict: decision.verdict,
    confidence: decision.confidence,
    headline,
    reasons: strings(raw.reasons, 4),
    tradeoffs: strings(raw.tradeoffs, 2),
    caveats: strings(raw.caveats, 3),
  };
}
