/**
 * Artifact review orchestrator (spec 018).
 *
 * Runs the deterministic rule groups, optionally adds the AI judgement stage,
 * then turns the combined findings into six rubric dimensions, a per-runtime
 * verdict and an overall recommendation.
 *
 * Two behaviours here matter more than the arithmetic:
 *
 * 1. A failed or unavailable AI stage produces a `partial` result, never a
 *    quietly lower score. Dimensions that only the AI can judge report `null`
 *    rather than 0, because "we could not assess this" and "this is bad" are
 *    different answers and only one of them is true.
 * 2. Verdicts are per runtime, not blended. A skill can be sound on Scout and
 *    unusable on Cowork; a single averaged number would hide exactly the
 *    answer the author came for.
 */
import type {
  ArtifactFinding,
  ArtifactAiAssessment,
  ArtifactAiStageResult,
  ArtifactKind,
  ArtifactRecommendation,
  ArtifactReviewProgress,
  ArtifactReviewResult,
  ReviewedFile,
  RubricDimensionId,
  RubricDimensionScore,
  RuntimeVerdict,
  RuntimeVerdictBasis,
  RuntimeVerdictValue,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { ARTIFACT_EVALUATOR_VERSION } from '../contracts/ArtifactReview';
import {
  DIMENSION_TO_BUCKET,
  RUBRIC_DIMENSION_IDS,
  RUBRIC_DIMENSION_LABELS,
} from '../contracts/ArtifactReview';
import type { SkillFindingSeverity, SkillRubricDimension } from '../../agents-experience/contracts/Findings';
import type { QualifiedSkillScore, SkillBundleScores } from '../../agents-experience/contracts/SkillBundle';
import { resolveCatalogue, verdictBasisFor } from '../data/catalogueResolver';
import { resolveStaleness } from '../contracts/PlatformCatalogue';
import { detectArtifactKind } from './artifactDetector';
import { scanArtifactContent } from './artifactContentScan';
import { evaluatePackaging } from './packagingRules';
import { retainFiles } from './reviewedFiles';
import { scanForSecrets } from './secretScanner';
import { evaluateShape } from './shapeRules';
import { evaluateAutomation } from './automationValidator';
import {
  describeDimensionInapplicability,
  describeInapplicability,
  dimensionAppliesTo,
  runtimeAcceptsKind,
} from './runtimeApplicability';
import {
  runtimeTargetIsEstablished,
  runtimeTargetsFromPackage,
} from './runtimeTargeting';

/** Penalty applied to a 0–5 score for each finding, by severity. */
export const FINDING_SCORE_PENALTY: Readonly<Record<SkillFindingSeverity, number>> = {
  critical: 2.5,
  high: 1.5,
  medium: 0.75,
  low: 0.35,
  info: 0,
};

/**
 * Which rubric dimension each rule prefix rolls up to.
 *
 * Kept as a prefix map rather than per-rule entries so adding a rule to an
 * existing family needs no change here, and an unmapped prefix is visible
 * immediately rather than silently landing in a default bucket.
 */
const PREFIX_TO_DIMENSION: Record<string, RubricDimensionId> = {
  PKG: 'packaging-quality',
  LIM: 'packaging-quality',
  INST: 'packaging-quality',
  SEC: 'safety-evidence',
  SHP: 'trigger-clarity',
  AUTO: 'instruction-quality',
  RT: 'portability',
  COWORK: 'portability',
};

/** Rules whose dimension differs from their family's default. */
const RULE_TO_DIMENSION: Record<string, RubricDimensionId> = {
  'SHP-BODYLEN': 'task-focus',
  'SHP-HEADINGS': 'instruction-quality',
  'SHP-STEPS': 'instruction-quality',
  'AUTO-UNATTENDED': 'safety-evidence',
  'AUTO-DESTRUCTIVE': 'safety-evidence',
};

/**
 * Dimensions no deterministic rule can judge on its own.
 *
 * Whether a skill does one job well, and whether its instructions are followable
 * by an agent that has never seen the task, are judgements. Reporting a number
 * for them without the AI stage would be inventing a measurement.
 */
const AI_DEPENDENT_DIMENSIONS: readonly RubricDimensionId[] = ['task-focus', 'instruction-quality'];

/**
 * Dimensions that still score without the AI stage, but only from part of their
 * evidence.
 *
 * Distinct from {@link AI_DEPENDENT_DIMENSIONS}, which cannot be scored at all.
 * Safety is described to the reader as "avoids destructive or exfiltrating
 * behaviour, and cites a source for anything it asserts" — a judgement only the
 * AI stage makes. The deterministic half is the secret scan alone, which is a
 * narrow slice of that promise. Scoring it null would be worse, because a real
 * hardcoded credential is genuine evidence and must still count; so the score
 * stands and the assessment names what did not run.
 */
const AI_ASSISTED_DIMENSIONS: readonly RubricDimensionId[] = ['safety-evidence'];

function aiDimensionKey(
  dimension: RubricDimensionId,
): ArtifactAiAssessment['dimensions'][number]['key'] | undefined {
  switch (dimension) {
    case 'trigger-clarity':
      return 'Clarity';
    case 'task-focus':
      return 'Scope discipline';
    case 'instruction-quality':
      return 'Actionability';
    default:
      return undefined;
  }
}

export interface ArtifactReviewDeps {
  /**
   * Optional AI judgement stage.
   *
   * Left undefined the review still completes and reports itself as partial,
   * rather than presenting a deterministic-only score as a full assessment.
   */
  runAiStage?: (
    artifact: UploadedArtifact,
    runtimes: readonly TargetRuntime[],
    withheldPaths: readonly string[],
    signal?: AbortSignal,
  ) => Promise<ArtifactAiStageResult | ArtifactFinding[]>;
  /**
   * Announce the review before the AI stage runs.
   *
   * Called once, with a result whose status is `in-progress`, at the last
   * moment when everything durable is already known — the artifact identity,
   * the runtimes and the deterministic findings — and before the minutes-long
   * AI call begins. Persisting there is what lets a review survive the browser
   * closing: the grid can list it as running instead of showing nothing at all.
   *
   * Optional and never awaited for correctness of the review itself. A failed
   * announcement costs visibility, not the assessment, so it must not abort a
   * run the user has already started paying for.
   *
   * Kept as a dependency rather than an import so `reviewArtifact` stays pure
   * and unit-testable without a Dataverse client.
   */
  onReserve?: (reserved: ArtifactReviewResult) => Promise<void> | void;
  now?: Date;
}

export interface ArtifactReviewRequest {
  artifact: UploadedArtifact;
  runtimes: TargetRuntime[];
  onProgress?: (progress: ArtifactReviewProgress) => void;
  signal?: AbortSignal;
}

/**
 * Rubric dimension a registry bucket falls back to.
 *
 * Inverts {@link DIMENSION_TO_BUCKET}. The registry's four buckets are coarser
 * than the rubric's six dimensions, so each maps to the dimension that carries
 * its meaning most directly: 'quality' covers three rubric dimensions, and
 * instruction quality is the one a rule outside this feature's own families is
 * most likely to be about.
 */
const BUCKET_TO_DIMENSION: Record<SkillRubricDimension, RubricDimensionId> = {
  quality: 'instruction-quality',
  integrity: 'packaging-quality',
  safety: 'safety-evidence',
  readiness: 'portability',
};

/**
 * Map a finding to the rubric dimension it counts against.
 *
 * Rules this feature owns are mapped by id or family prefix. Anything else —
 * every rule from the shared skill registry that the AI stage can raise, such as
 * the SCR, HTML, MD, BND, SKL, RES, OPS and TOL families — is mapped through its
 * own declared registry bucket. Defaulting those to a single dimension would
 * quietly load one score with findings that have nothing to do with it.
 */
export function dimensionForFinding(finding: ArtifactFinding): RubricDimensionId {
  const ruleId = finding.ruleId ?? finding.id.split(':')[0];
  const exact = RULE_TO_DIMENSION[ruleId];
  if (exact) return exact;
  const prefix = ruleId.split('-')[0];
  const byPrefix = PREFIX_TO_DIMENSION[prefix];
  if (byPrefix) return byPrefix;
  // `dimension` is optional on the shared finding contract, so an unregistered
  // rule can arrive without one.
  return finding.dimension ? BUCKET_TO_DIMENSION[finding.dimension] : 'instruction-quality';
}

/**
 * Bundle scope carried on every progress event.
 *
 * Measured from the parsed archive, never estimated. The file count is the
 * number the user can verify against their own folder listing, which is the
 * point: the old message counted skills but said "components", so an archive
 * of fourteen files reported "1 components" and looked broken.
 */
interface ProgressScope {
  skillCount: number;
  fileCount: number;
}

function emit(
  onProgress: ((p: ArtifactReviewProgress) => void) | undefined,
  stage: ArtifactReviewProgress['stage'],
  percent: number,
  message: string,
  scope?: ProgressScope,
) {
  onProgress?.({ stage, percent, message, ...scope });
}

/** Score one dimension from the findings attributed to it. */
function scoreDimension(
  dimension: RubricDimensionId,
  findings: ArtifactFinding[],
  aiAvailable: boolean,
  artifactKind: ArtifactKind | undefined,
  aiAssessment?: ArtifactAiAssessment,
): RubricDimensionScore {
  if (dimension === 'portability') {
    return {
      id: dimension,
      score: null,
      assessment: 'Not assessed — portability requires a connected runtime review.',
    };
  }

  const relevant = findings.filter((f) => dimensionForFinding(f) === dimension);
  const aiKey = aiDimensionKey(dimension);
  const aiDimension = aiKey
    ? aiAssessment?.dimensions.find((candidate) => candidate.key === aiKey)
    : undefined;

  // Two dimensions ask about parts a bare automation does not have — a package
  // to install, and a second runtime to be portable to. Scoring those out of 5
  // would grade an author on a property of the format they chose.
  //
  // The `relevant.length === 0` guard is the safety catch, not a nicety. Rule
  // families are mapped onto dimensions by prefix, so a future automation rule
  // could land on `portability` legitimately. Dropping the dimension anyway
  // would delete real evidence from the score without a trace. Evidence wins
  // over the applicability table, every time.
  if (relevant.length === 0 && !dimensionAppliesTo(dimension, artifactKind) && artifactKind) {
    return {
      id: dimension,
      score: null,
      assessment: describeDimensionInapplicability(dimension, artifactKind),
    };
  }

  if (!aiAvailable && AI_DEPENDENT_DIMENSIONS.includes(dimension)) {
    return {
      id: dimension,
      score: null,
      assessment: 'Not assessed — the AI review stage did not run.',
    };
  }

  if (aiAvailable && AI_DEPENDENT_DIMENSIONS.includes(dimension) && !aiDimension) {
    return {
      id: dimension,
      score: null,
      assessment: 'Not assessed — the AI review returned no score for this dimension.',
    };
  }

  if (aiDimension) {
    return {
      id: dimension,
      score: aiDimension.score / 2,
      assessment: aiDimension.rationale,
      evidence:
        aiDimension.evidence ??
        (relevant.length > 0 ? relevant.slice(0, 3).map((f) => f.title).join('; ') : undefined),
      improvement: aiDimension.improvement,
    };
  }

  const penalty = relevant.reduce(
    (total, finding) => total + FINDING_SCORE_PENALTY[finding.severity],
    0,
  );

  const score = Math.round(Math.max(0, Math.min(5, 5 - penalty)) * 10) / 10;
  const label = RUBRIC_DIMENSION_LABELS[dimension];

  const summary =
    relevant.length === 0
      ? `${label}: no issues found.`
      : `${label}: ${relevant.length} ${relevant.length === 1 ? 'issue' : 'issues'} found.`;

  // The gap matters most when nothing was found. "No issues found" on the
  // heaviest-weighted dimension reads as a clearance, and without the AI stage
  // only the deterministic checks actually ran.
  const partialCoverage = !aiAvailable && AI_ASSISTED_DIMENSIONS.includes(dimension);

  return {
    id: dimension,
    score,
    assessment: partialCoverage
      ? `${summary} The AI review stage did not run, so only the deterministic checks contributed.`
      : summary,
    evidence: relevant.length > 0 ? relevant.slice(0, 3).map((f) => f.title).join('; ') : undefined,
  };
}

/** Roll the six dimensions up into the four buckets the existing UI renders. */
function toBundleScores(dimensions: RubricDimensionScore[], findings: ArtifactFinding[]): SkillBundleScores {
  const bucketOf = (bucket: keyof Omit<SkillBundleScores, 'safetyGate'>): QualifiedSkillScore => {
    const members = dimensions.filter((d) => DIMENSION_TO_BUCKET[d.id] === bucket);
    const assessed = members.filter((d) => d.score !== null);

    if (assessed.length === 0) {
      return {
        value: null,
        status: 'unavailable',
        coveragePercent: 0,
        note: 'No dimension in this area could be assessed.',
      };
    }

    const mean = assessed.reduce((sum, d) => sum + (d.score as number), 0) / assessed.length;
    const coveragePercent = Math.round((assessed.length / members.length) * 100);

    return {
      // The existing score cards render 0–100.
      value: Math.round((mean / 5) * 100),
      status: coveragePercent === 100 ? 'complete' : 'partial',
      coveragePercent,
      note:
        coveragePercent === 100
          ? undefined
          : 'Some dimensions in this area could not be assessed without the AI review stage.',
    };
  };

  const confirmedCritical = findings.some((f) => f.severity === 'critical');
  const confirmedHigh = findings.some((f) => f.severity === 'high');

  return {
    quality: bucketOf('quality'),
    integrity: bucketOf('integrity'),
    safety: bucketOf('safety'),
    readiness: bucketOf('readiness'),
    safetyGate: confirmedCritical ? 'error' : confirmedHigh ? 'warning' : 'none',
  };
}

/**
 * Decide a verdict for one runtime from the findings raised against it.
 *
 * Only findings scoped to this runtime count. That sounds obvious, and it was
 * not what this did: an unscoped finding used to apply to every runtime, so a
 * broken documentation link — a packaging defect that names no runtime at all —
 * turned into "Will not run" on all three at once, and `recommend` then read
 * that as "Keep private". A real review of agent-harness-explorer scored 94%
 * overall and still told the author not to publish, on the strength of one
 * missing markdown file.
 *
 * The tell was that all three runtimes returned an identical score from an
 * identical finding list. Three different capability surfaces cannot agree by
 * coincidence; they agreed because no runtime-specific evidence existed. "Will
 * not run" is a compatibility claim, and only a finding that names the runtime
 * can support one. Everything else still reaches the reader through the rubric
 * dimensions and the recommendation, which is where "do not publish this yet"
 * belongs.
 */
function verdictFor(
  runtime: TargetRuntime,
  findings: ArtifactFinding[],
  artifactKind: ArtifactKind | undefined,
  declaredRuntimes: readonly TargetRuntime[],
  now?: Date,
): RuntimeVerdict {
  const catalogue = resolveCatalogue(runtime);
  const staleness = resolveStaleness(catalogue, now);

  // Applicability is settled before any finding is read, because it is not a
  // question about this artifact's quality — it is a question about its format.
  // A Scout automation raises no Cowork finding for the same reason it raises no
  // Cowork verdict: Cowork has no automation import to fail. Reading the empty
  // finding list first is what produced "Runs, 100 / 100" for a file that runtime
  // cannot open.
  if (artifactKind && !runtimeAcceptsKind(runtime, artifactKind)) {
    return {
      runtime,
      verdict: 'not-applicable',
      score: null,
      findingIds: [],
      catalogueVersion: catalogue.version,
      catalogueSnapshotDate: catalogue.snapshotDate,
      stalenessNote: undefined,
      basis: 'none',
      notApplicableReason: describeInapplicability(runtime, artifactKind),
    };
  }

  const applicable = findings.filter((f) => f.runtimes.includes(runtime));

  // A runtime can only be judged against evidence it publishes, and the three
  // runtimes do not publish the same kind. The rule lives in the catalogue
  // resolver because the store back-fills it onto rows saved before the field
  // existed, and a reloaded review must caption itself the same way a fresh one
  // does.
  //
  // Before the contract was added, Copilot Studio had no surface at all and so
  // abstained on almost every upload: its only live rule was the name pattern,
  // and most names already pass it. "Not evaluated" was therefore the normal
  // outcome rather than the exception, which read as a runtime we had silently
  // skipped. `none` is now reserved for a runtime that publishes neither.
  const basis: RuntimeVerdictBasis = verdictBasisFor(runtime);

  const confirmedBlocking = applicable.filter(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );

  if (confirmedBlocking.length === 0 && !runtimeTargetIsEstablished(runtime, artifactKind, declaredRuntimes)) {
    return {
      runtime,
      verdict: 'not-evaluated',
      score: null,
      findingIds: applicable.map((finding) => finding.id),
      catalogueVersion: catalogue.version,
      catalogueSnapshotDate: catalogue.snapshotDate,
      stalenessNote: staleness.note,
      basis: 'none',
    };
  }

  let verdict: RuntimeVerdictValue;
  if (confirmedBlocking.length > 0) {
    verdict = 'will-not-run';
  } else if (applicable.some((f) => f.severity === 'medium')) {
    verdict = 'runs-with-issues';
  } else {
    verdict = 'runs';
  }

  const penalty = applicable.reduce(
    (total, finding) => total + FINDING_SCORE_PENALTY[finding.severity],
    0,
  );
  const score = Math.round(Math.max(0, Math.min(5, 5 - penalty)) * 20);

  return {
    runtime,
    verdict,
    score,
    findingIds: applicable.map((f) => f.id),
    catalogueVersion: catalogue.version,
    catalogueSnapshotDate: catalogue.snapshotDate,
    stalenessNote: staleness.note,
    basis,
  };
}

/**
 * Derive the overall recommendation, using the published rubric's vocabulary.
 *
 * Findings are read directly rather than inferred from the runtime verdicts.
 * They used to be inferred, and that was the whole defect: a finding that named
 * no runtime was pushed onto every runtime, the verdict became "Will not run",
 * and this function turned that into "Keep private". A packaging defect was
 * being laundered into a compatibility claim on its way to the reader.
 *
 * So the two questions are now answered by the evidence that belongs to each:
 *
 * - "Will it run on the runtime I picked?" — runtime-scoped findings only.
 * - "Should I publish it?" — the rubric, plus any confirmed blocker wherever it
 *   was raised.
 *
 * A confirmed critical still means keep it private: that is a safety blocker,
 * and a skill can run perfectly while doing something it should not. A
 * confirmed high means revise — worth fixing before publication, not worth
 * suppressing the artifact over.
 *
 * Exported so the thresholds can be tested directly. The reason shown to the
 * reader comes from `decideRecommendation` below, which this delegates to, so
 * the label and the explanation cannot disagree.
 */
export function recommend(
  dimensions: RubricDimensionScore[],
  verdicts: RuntimeVerdict[],
  findings: ArtifactFinding[],
): ArtifactRecommendation {
  return decideRecommendation(dimensions, verdicts, findings).recommendation;
}

/**
 * Decide the recommendation and say, in one sentence, what decided it.
 *
 * The two travel together on purpose. A reader who sees 94% beside "Revise"
 * will ask why, and a generic rule listing three possible causes still leaves
 * them to work out which one fired. Naming the finding answers the question at
 * the point it is asked.
 *
 * This is the only place the rules live. `recommend` delegates here, so the
 * label and the explanation can never disagree, and the explanation can be
 * recomputed for a review stored long before this function existed.
 */
export function decideRecommendation(
  dimensions: RubricDimensionScore[],
  _verdicts: RuntimeVerdict[],
  findings: ArtifactFinding[],
): { recommendation: ArtifactRecommendation; reason: string } {
  const confirmed = (severity: ArtifactFinding['severity']) =>
    findings.filter((f) => f.severity === severity);

  const critical = confirmed('critical');
  if (critical.length > 0) {
    return {
      recommendation: 'keep-private',
      reason: blockerAction(critical, 'critical', true),
    };
  }

  const assessed = dimensions.filter((d) => d.score !== null).map((d) => d.score as number);
  if (assessed.length === 0) {
    return {
      recommendation: 'revise',
      reason: 'Run the review again when assessment is available. No rubric dimension was assessed, so this artifact is not ready to publish.',
    };
  }

  const high = confirmed('high');
  if (high.length > 0) {
    return {
      recommendation: 'revise',
      reason: blockerAction(high, 'high-severity', false),
    };
  }

  const lowest = Math.min(...assessed);
  const mean = assessed.reduce((sum, s) => sum + s, 0) / assessed.length;

  if (lowest < 3) {
    const weakest = dimensions.find((d) => d.score === lowest);
    const label = weakest ? RUBRIC_DIMENSION_LABELS[weakest.id] : 'One dimension';
    return {
      recommendation: 'revise',
      reason: `Improve ${label} before publishing. It scored ${lowest} out of 5; the minimum is 3. Then review again.`,
    };
  }

  if (mean < 4) {
    return {
      recommendation: 'revise',
      reason: `Improve the rubric result before publishing. The average is ${mean.toFixed(1)} out of 5; 4 is needed to share. Then review again.`,
    };
  }

  return {
    recommendation: 'submit',
    reason: `Every dimension passed the minimum, the average is ${mean.toFixed(1)} out of 5, and no confirmed blocker remains. Review the evidence, then submit when ready.`,
  };
}

function completeSentence(text: string): string {
  const value = text.trim();
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/** Name the first blocker and give its next action. */
function blockerAction(
  blockers: ArtifactFinding[],
  severity: string,
  keepPrivate: boolean,
): string {
  const first = blockers[0];
  const prefix =
    blockers.length === 1
      ? `${keepPrivate ? 'Keep this artifact private until' : 'Fix'} "${first.title}"${
          keepPrivate ? ' is fixed' : ' before publishing'
        }.`
      : `${keepPrivate ? 'Keep this artifact private until' : 'Fix'} all ${blockers.length} confirmed ${severity} findings, starting with "${first.title}".`;
  const nextAction = first.fixSteps?.[0]?.action ?? first.recommendation;
  const action = nextAction ? ` ${completeSentence(nextAction)}` : '';

  return `${prefix}${action} Then review again.`;
}

/**
 * Keep the first finding for each id.
 *
 * Rules can legitimately match the same problem from two directions, and the
 * AI stage can restate something the deterministic pass already found. Two
 * rows with one id break DataGrid keys and double the score penalty.
 */
function dedupeById(findings: ArtifactFinding[]): ArtifactFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

/** Run a full review of an uploaded artifact. */
export async function reviewArtifact(
  request: ArtifactReviewRequest,
  deps: ArtifactReviewDeps = {},
): Promise<ArtifactReviewResult> {
  const { artifact, runtimes, onProgress, signal } = request;
  const reviewedAt = (deps.now ?? new Date()).toISOString();
  const declaredRuntimes = runtimeTargetsFromPackage(artifact);

  // One upload is one skill bundle — `toSkillBundle` produces exactly one —
  // so the skill count is known up front and does not depend on detection.
  const scope: ProgressScope = { skillCount: 1, fileCount: artifact.files.length };

  emit(onProgress, 'detecting', 8, 'Identifying the artifact type', scope);
  const detection = detectArtifactKind(artifact);

  if (!detection.kind) {
    return {
      status: 'failed',
      evaluatorVersion: ARTIFACT_EVALUATOR_VERSION,
      artifactName: artifact.fileName,
      artifactHash: artifact.hash,
      selectedRuntimes: runtimes,
      declaredRuntimes,
      scores: toBundleScores([], []),
      dimensions: [],
      runtimeVerdicts: runtimes.map((runtime) => {
        const catalogue = resolveCatalogue(runtime);
        return {
          runtime,
          verdict: 'not-evaluated' as const,
          score: null,
          findingIds: [],
          catalogueVersion: catalogue.version,
          catalogueSnapshotDate: catalogue.snapshotDate,
          // The artifact type could not be identified, so no rule of any kind
          // ran. This is the one place where "nothing to check it against" is
          // true of every runtime, whatever each one publishes.
          basis: 'none' as const,
        };
      }),
      findings: [],
      files: retainFiles(artifact),
      uncompressedBytes: artifact.uncompressedBytes,
      recommendation: 'revise',
      aiAvailable: false,
      reviewedAt,
      error: detection.reason ?? 'The upload could not be identified as a skill or Scout automation.',
    };
  }

  emit(onProgress, 'deterministic', 25, 'Checking packaging, structure and safety', scope);
  const deterministic: ArtifactFinding[] = [];

  const secrets = scanForSecrets(artifact);
  deterministic.push(...secrets.findings);

  // Runs for every artifact kind. What the text says -- an injection phrase, a
  // shell-execution directive -- is a safety property of the file itself, not
  // of how it is packaged, so it cannot depend on the artifact being a skill
  // and it must not depend on the AI stage being reachable.
  deterministic.push(...scanArtifactContent(artifact));

  if (detection.kind === 'skill') {
    deterministic.push(...evaluatePackaging({ artifact, runtimes }));
    deterministic.push(...evaluateShape(artifact, runtimes));
  } else if (detection.kind === 'automation') {
    deterministic.push(...evaluateAutomation(artifact));
  }

  if (signal?.aborted) {
    return cancelled(artifact, runtimes, reviewedAt, declaredRuntimes);
  }

  let aiFindings: ArtifactFinding[] = [];
  let aiAssessment: ArtifactAiAssessment | undefined;
  let aiAvailable = false;
  let error: string | undefined;

  if (deps.runAiStage) {
    // Announce the review before the slow part starts.
    //
    // Everything durable is already known here: what the artifact is, which
    // runtimes it is judged against, and what the deterministic pass found.
    // What follows can run for minutes, and until now nothing outside this
    // browser tab knew the review existed — so closing the tab lost it
    // silently while the workflow carried on and the AI call was still
    // charged. Reserving here is what makes that recoverable.
    //
    // The reserved record carries a placeholder `recommendation`, because the
    // field is required and nothing has been decided yet. Anything rendering a
    // stored review must therefore branch on `status` before reading it.
    await announce(deps, {
      status: 'in-progress',
      evaluatorVersion: ARTIFACT_EVALUATOR_VERSION,
      artifactKind: detection.kind,
      artifactName: artifact.fileName,
      artifactHash: artifact.hash,
      selectedRuntimes: runtimes,
      declaredRuntimes,
      scores: toBundleScores([], []),
      dimensions: [],
      runtimeVerdicts: [],
      findings: deterministic,
      files: retainFiles(artifact),
      uncompressedBytes: artifact.uncompressedBytes,
      recommendation: 'revise',
      aiAvailable: false,
      reviewedAt,
      startedAt: reviewedAt,
    });

    emit(onProgress, 'ai', 60, 'Running the AI review stage', scope);
    try {
      const aiOutput = await deps.runAiStage(artifact, runtimes, [...secrets.withheldPaths], signal);
      if (Array.isArray(aiOutput)) {
        aiFindings = aiOutput;
      } else {
        aiFindings = aiOutput.findings;
        aiAssessment = aiOutput.assessment;
      }
      aiAvailable = true;
    } catch (aiError) {
      if (signal?.aborted) return cancelled(artifact, runtimes, reviewedAt, declaredRuntimes);
      // A failed AI stage degrades the result to partial. It never silently
      // lowers a score, because a missing judgement is not a bad one.
      error =
        aiError instanceof Error
          ? `The AI review stage did not complete: ${aiError.message}`
          : 'The AI review stage did not complete.';
    }
  } else {
    error = 'The AI review stage was not run, so this is a deterministic-only review.';
  }

  emit(onProgress, 'scoring', 85, 'Scoring against the published authoring rubric', scope);

  if (signal?.aborted) {
    return cancelled(artifact, runtimes, reviewedAt, declaredRuntimes);
  }

  // Without the AI stage a hybrid candidate stays on the report, flagged and at
  // reduced severity. Dropping it would hide a real possibility; promoting it
  // would assert something that was never confirmed.
  //
  // Ids are de-duplicated because a repeated id would both break DataGrid's row
  // keys and count the same problem twice against the score.
  emit(onProgress, 'complete', 100, 'Review complete', scope);

  return assembleArtifactReview({
    artifactKind: detection.kind,
    artifactName: artifact.fileName,
    artifactHash: artifact.hash,
    runtimes,
    declaredRuntimes,
    files: retainFiles(artifact),
    uncompressedBytes: artifact.uncompressedBytes,
    deterministic,
    aiFindings,
    aiAssessment,
    aiAvailable,
    reviewedAt,
    error,
    now: deps.now,
  });
}

/** Everything the scored result is built from, once both passes have run. */
export interface ArtifactAssemblyInput {
  artifactKind?: ArtifactKind;
  artifactName: string;
  artifactHash: string;
  runtimes: TargetRuntime[];
  declaredRuntimes?: TargetRuntime[];
  files?: ReviewedFile[];
  uncompressedBytes?: number;
  deterministic: ArtifactFinding[];
  aiFindings: ArtifactFinding[];
  aiAssessment?: ArtifactAiAssessment;
  aiAvailable: boolean;
  reviewedAt: string;
  error?: string;
  now?: Date;
}

/**
 * Turns both passes' findings into the scored result.
 *
 * Split out of {@link reviewArtifact} so a review resumed after a reload is
 * scored by this code and not by a second copy of it. The resume path has no
 * archive and no live pipeline — only the deterministic findings the first pass
 * stored and the ones the workflow produced — so everything here is a pure
 * function of the arguments. Any rule that needs the archive belongs in the
 * deterministic pass, before the row is reserved.
 *
 * De-duplication happens here rather than in the callers because a repeated id
 * would both break DataGrid's row keys and count the same problem twice against
 * the score, and a caller that forgot would produce a plausible-looking result.
 */
export function assembleArtifactReview(
  input: ArtifactAssemblyInput,
): ArtifactReviewResult {
  const { aiAvailable, runtimes } = input;
  const findings = dedupeById([...input.deterministic, ...input.aiFindings]);

  const dimensions = RUBRIC_DIMENSION_IDS.map((d) =>
    scoreDimension(d, findings, aiAvailable, input.artifactKind, input.aiAssessment),
  );
  const runtimeVerdicts = runtimes.map((runtime) =>
    verdictFor(runtime, findings, input.artifactKind, input.declaredRuntimes ?? [], input.now),
  );

  return {
    status: aiAvailable ? 'complete' : 'partial',
    evaluatorVersion: ARTIFACT_EVALUATOR_VERSION,
    artifactKind: input.artifactKind,
    artifactName: input.artifactName,
    artifactHash: input.artifactHash,
    selectedRuntimes: runtimes,
    declaredRuntimes: input.declaredRuntimes ?? [],
    scores: toBundleScores(dimensions, findings),
    dimensions,
    aiAssessment: input.aiAssessment,
    runtimeVerdicts,
    findings,
    files: input.files,
    uncompressedBytes: input.uncompressedBytes,
    recommendation: recommend(dimensions, runtimeVerdicts, findings),
    aiAvailable,
    reviewedAt: input.reviewedAt,
    error: input.error,
  };
}

/**
 * Report the reservation, without letting it endanger the review.
 *
 * A reservation is a visibility aid. If Dataverse is slow or refuses the write,
 * the correct outcome is a review the reader can still see on screen, not a run
 * abandoned after the deterministic work is already done. So the failure is
 * swallowed here rather than raised — the live result is unaffected, and the
 * only thing lost is recoverability after a reload.
 *
 * Swallowed, but not hidden. A rejected write is invisible by design: the
 * review still runs and still finishes, so nothing on screen looks wrong, and
 * only the running row is missing. That is precisely how a broken reservation
 * survived unnoticed once already, so the reason is logged.
 */
async function announce(
  deps: ArtifactReviewDeps,
  reserved: ArtifactReviewResult,
): Promise<void> {
  if (!deps.onReserve) return;
  try {
    await deps.onReserve(reserved);
  } catch (error) {
    console.warn('[SkillsReview] Could not record the review as running:', error);
  }
}

function cancelled(
  artifact: UploadedArtifact,
  runtimes: TargetRuntime[],
  reviewedAt: string,
  declaredRuntimes: TargetRuntime[],
): ArtifactReviewResult {
  return {
    status: 'cancelled',
    evaluatorVersion: ARTIFACT_EVALUATOR_VERSION,
    artifactName: artifact.fileName,
    artifactHash: artifact.hash,
    selectedRuntimes: runtimes,
    declaredRuntimes,
    scores: toBundleScores([], []),
    dimensions: [],
    runtimeVerdicts: [],
    findings: [],
    files: retainFiles(artifact),
    uncompressedBytes: artifact.uncompressedBytes,
    recommendation: 'revise',
    aiAvailable: false,
    reviewedAt,
    error: 'The review was cancelled before it finished.',
  };
}
