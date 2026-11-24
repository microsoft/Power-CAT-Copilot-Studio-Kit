/**
 * Typed contracts for reviewing an uploaded Agent Skill or Scout automation
 * (spec 018).
 *
 * These extend the existing skill-review contracts rather than replacing them:
 * `ArtifactFinding` builds on `GroundedSkillFinding`, and the bucket scores
 * reuse `SkillBundleScores` so results render through the same shared review
 * shell as the other two review types.
 */
import type { GroundedSkillFinding, SkillRubricDimension } from '../../agents-experience/contracts/Findings';
import { SKILL_DIMENSION_BUCKET, SKILL_DIMENSION_WEIGHTS } from '../../review-core/pillars';
import type { SkillBundleScores } from '../../agents-experience/contracts/SkillBundle';

/**
 * What was uploaded. Always derived from the files themselves — the user is
 * never asked, because the file already determines the answer.
 */
export type ArtifactKind = 'skill' | 'automation';

/** Which runtime the artifact is intended for. Chosen by the user, one or many. */
export type TargetRuntime = 'cowork' | 'scout' | 'copilot-studio';

export const TARGET_RUNTIMES: readonly TargetRuntime[] = ['cowork', 'scout', 'copilot-studio'];

/** Display label for a runtime. Kept here so the UI never hardcodes strings. */
export const RUNTIME_LABELS: Record<TargetRuntime, string> = {
  // Microsoft Learn names the product "Microsoft 365 Copilot Cowork", short
  // form "Copilot Cowork". "Microsoft Cowork" is not an official form.
  cowork: 'Copilot Cowork',
  scout: 'Microsoft Scout',
  'copilot-studio': 'Copilot Studio',
};

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  skill: 'Agent skill',
  automation: 'Scout automation',
};

/** One file from the upload, already normalised and decoded where possible. */
export interface UploadedFile {
  /** Forward-slashed path relative to the archive root. */
  path: string;
  /** Uncompressed size in bytes. */
  bytes: number;
  /** Decoded text. Absent when the file is binary or failed to decode. */
  text?: string;
  isBinary: boolean;
}

/** The whole upload. */
export interface UploadedArtifact {
  /** Original file name as chosen by the user. */
  fileName: string;
  files: UploadedFile[];
  compressedBytes: number;
  uncompressedBytes: number;
  /**
   * Top-level folder inside the archive, when the archive has exactly one.
   *
   * `PKG-NAME` compares this against the frontmatter `name`. That mismatch is
   * the single most common upload failure, so the value is captured up front
   * rather than recomputed by the rule.
   */
  rootFolderName?: string;
  /** SHA-256 over every file path and its content. Identifies the exact bytes reviewed. */
  hash: string;
}

/** Outcome of artifact-kind detection. */
export interface ArtifactDetection {
  kind?: ArtifactKind;
  /** Path of the file that decided the outcome. */
  primaryPath?: string;
  /** Stated when `kind` is absent, so the user learns what was expected. */
  reason?: string;
}

/** Where a finding came from. */
export type FindingSource = 'deterministic' | 'ai';

/**
 * A finding about an uploaded artifact.
 *
 * Adds only what upload review needs on top of the existing grounded finding:
 * which runtimes it applies to and how it was produced.
 *
 * Every finding here is a verdict. A check that cannot be reduced to one —
 * because it needs to tell a dependency apart from a mention — is declared
 * `execution: 'ai'` and answered by the standalone-skill node instead.
 */
export interface ArtifactFinding extends GroundedSkillFinding {
  /** Runtimes this finding applies to. Empty means it applies to all of them. */
  runtimes: TargetRuntime[];
  source: FindingSource;
  /** 1-based line number, when the evidence sits in a text file. */
  line?: number;
}

/** The six dimensions of Microsoft's published skill-authoring rubric. */
export type RubricDimensionId =
  | 'trigger-clarity'
  | 'task-focus'
  | 'instruction-quality'
  | 'portability'
  | 'safety-evidence'
  | 'packaging-quality';

export const RUBRIC_DIMENSION_IDS: readonly RubricDimensionId[] = [
  'trigger-clarity',
  'task-focus',
  'instruction-quality',
  'portability',
  'safety-evidence',
  'packaging-quality',
];

export const RUBRIC_DIMENSION_LABELS: Record<RubricDimensionId, string> = {
  'trigger-clarity': 'Trigger clarity',
  'task-focus': 'Task focus',
  'instruction-quality': 'Instruction quality',
  portability: 'Portability',
  'safety-evidence': 'Safety and evidence discipline',
  'packaging-quality': 'Packaging quality',
};

/**
 * What each dimension measures, in one sentence.
 *
 * A score with no definition beside it cannot be argued with, and a rubric the
 * reader cannot argue with is a rubric they cannot act on. These are shown on
 * the dimension cards and on the landing page, so the author knows what will be
 * judged before the upload rather than after it.
 */
export const RUBRIC_DIMENSION_DESCRIPTIONS: Record<RubricDimensionId, string> = {
  'trigger-clarity':
    'Whether the name and description tell the agent exactly when to use the skill — and, just as important, when not to.',
  'task-focus':
    'Whether the skill does one job well, rather than bundling several loosely related jobs into one file.',
  'instruction-quality':
    'Whether the steps are ordered, unambiguous and executable without the author standing next to the agent.',
  portability:
    'Whether the skill runs on every runtime you selected, or quietly depends on a capability only one of them has.',
  'safety-evidence':
    'Whether the skill avoids destructive or exfiltrating behaviour, and cites a source for anything it asserts.',
  'packaging-quality':
    'Whether the folder name, frontmatter name and file layout agree, so the runtime can actually install it.',
};

/** Concise action shown when a dimension scores below 100%. */
export const RUBRIC_DIMENSION_IMPROVEMENTS: Record<RubricDimensionId, string> = {
  'trigger-clarity':
    'State the exact situations that should trigger this skill and the nearby cases that should not.',
  'task-focus':
    'Keep one primary outcome and move secondary responsibilities into separate skills.',
  'instruction-quality':
    'Make each step explicit, ordered, and executable, including its required inputs, decisions, and outputs.',
  portability:
    'Use only capabilities available in every intended runtime, or document the runtime-specific dependency.',
  'safety-evidence':
    'Remove risky behavior and support factual claims with authoritative sources.',
  'packaging-quality':
    'Align the folder and frontmatter names, and reference every required bundled file.',
};

/**
 * The same six dimensions asked as a question, for the landing page.
 *
 * The landing page is read *before* an upload, where the useful framing is a
 * checklist the author can hold their own file against. {@link
 * RUBRIC_DIMENSION_DESCRIPTIONS} is read *after* the review, where the useful
 * framing is a definition of what was measured. Same idea, different job — and
 * the shorter form is what lets the legend card stay one row tall.
 */
export const RUBRIC_DIMENSION_QUESTIONS: Record<RubricDimensionId, string> = {
  'trigger-clarity': 'Does the name and description say exactly when to use this — and when not to?',
  'task-focus': 'Does it do one job well, rather than bundling several loosely related jobs?',
  'instruction-quality': 'Are the steps ordered, unambiguous and executable without the author present?',
  portability: 'Does it run on every runtime you pick, or depend on a capability only one has?',
  'safety-evidence': 'Does it avoid destructive or exfiltrating behaviour, and cite what it asserts?',
  'packaging-quality': 'Do the folder name, frontmatter and file references agree, so it can install?',
};

/**
 * How much each dimension moves the overall score. Percentages, totalling 100.
 *
 * These weights are this tool's own. Microsoft's published rubric names the six
 * dimensions and scores each out of 5, but states no weighting, so the choice
 * is ours and is declared here — and shown in the UI — rather than buried in an
 * averaging function where nobody could disagree with it.
 *
 * Safety carries the most because an unsafe skill is the one outcome the reader
 * cannot correct after the fact. Packaging carries the least because a
 * packaging fault stops the install immediately, which the author discovers
 * without this tool.
 */
/**
 * The skill rubric's weights, taken from the one table in `review-core/pillars.ts`.
 *
 * `SkillDimension` and {@link RubricDimensionId} are the same six ids under two
 * names. The annotation below is deliberate: it is what fails the build if the
 * two unions ever drift apart.
 */
export const RUBRIC_DIMENSION_WEIGHTS: Record<RubricDimensionId, number> = SKILL_DIMENSION_WEIGHTS;

/**
 * Fixed mapping from the published six dimensions onto the four score buckets
 * the Agent Review Tool already uses, so this tab stays consistent with the
 * other two.
 *
 * Taken from the one table in `review-core/pillars.ts`, the same way
 * {@link RUBRIC_DIMENSION_WEIGHTS} is. The annotation below is deliberate: it is
 * what fails the build if {@link RubricDimensionId} or `SkillRubricDimension`
 * ever drift from the unions that table is written against.
 */
export const DIMENSION_TO_BUCKET: Record<RubricDimensionId, SkillRubricDimension> =
  SKILL_DIMENSION_BUCKET;

/** One scored dimension. `score` is null when the dimension was not evaluated. */
export interface RubricDimensionScore {
  id: RubricDimensionId;
  score: number | null;
  assessment: string;
  evidence?: string;
  improvement?: string;
}

/** One dimension returned by the standard AI skill-bundle evaluator. */
export interface ArtifactAiDimensionAssessment {
  key: 'Clarity' | 'Actionability' | 'Scope discipline' | 'Composability';
  score: number;
  rationale: string;
  evidence?: string;
  improvement?: string;
}

/**
 * The AI judgement retained independently of findings.
 *
 * Optional on stored results so reviews written before this contract addition
 * remain readable.
 */
export interface ArtifactAiAssessment {
  status: 'complete' | 'partial';
  portionsAssessed: number;
  dimensions: ArtifactAiDimensionAssessment[];
}

/** Complete output of the artifact AI stage. */
export interface ArtifactAiStageResult {
  findings: ArtifactFinding[];
  assessment: ArtifactAiAssessment;
}

/**
 * Where a runtime verdict landed.
 *
 * `not-applicable` is not a weaker `not-evaluated`. "Not evaluated" means the
 * runtime could have run this and we had nothing to judge it against.
 * "Not applicable" means the runtime cannot install this format at all, so
 * there is no compatibility question in the first place. Collapsing the two
 * would put a Scout automation back on the same footing as a skill Copilot
 * Studio simply publishes no tool list for.
 */
export type RuntimeVerdictValue =
  | 'runs'
  | 'runs-with-issues'
  | 'will-not-run'
  | 'not-evaluated'
  | 'not-applicable';

export const RUNTIME_VERDICT_LABELS: Record<RuntimeVerdictValue, string> = {
  runs: 'Runs',
  'runs-with-issues': 'Runs with issues',
  'will-not-run': 'Will not run',
  'not-evaluated': 'Not evaluated',
  'not-applicable': 'Not applicable',
};

/**
 * One verdict per selected runtime.
 *
 * Separate verdicts are the whole point of the runtime multi-select. A single
 * blended score would hide exactly the answer the user came for.
 */
export interface RuntimeVerdict {
  runtime: TargetRuntime;
  verdict: RuntimeVerdictValue;
  /** 0–100. Null when the runtime was not evaluated. */
  score: number | null;
  findingIds: string[];
  catalogueVersion: string;
  catalogueSnapshotDate: string;
  /** Set when the catalogue snapshot is old enough to reduce finding severity. */
  stalenessNote?: string;
  /**
   * What the verdict was actually decided against.
   *
   * The three runtimes do not publish the same kind of evidence. Cowork and
   * Scout publish a tool list, so their verdict answers "will the tools this
   * skill calls exist here?". Copilot Studio publishes no tool list — tools are
   * per-agent configuration — but it does publish a skill package contract, so
   * its verdict answers "is this a valid Copilot Studio skill package?".
   *
   * Both are real compatibility claims. They are simply not the same claim, and
   * the card has to say which one it made, or a reader will take a Copilot
   * Studio "Runs" as a promise about tools that we never checked.
   */
  basis: RuntimeVerdictBasis;
  /**
   * Why this runtime cannot install the artifact. Set only for `not-applicable`.
   *
   * Carried on the verdict rather than derived in the card because the card is
   * not the only reader — the stored row is replayed months later, and the
   * sentence must not silently change under it.
   */
  notApplicableReason?: string;
}

/** The kind of published evidence a runtime verdict was decided against. */
export type RuntimeVerdictBasis = 'tool-catalogue' | 'package-contract' | 'none';

/**
 * Where a review got to.
 *
 * `in-progress` is a *stored* state, not only a screen state. The row is
 * written before the AI call starts, so a review that outlives the browser tab
 * is still listed afterwards. Without it, a reader who closed the window came
 * back to an empty grid with no evidence the review had ever run — while the
 * workflow carried on and the AI call was still paid for.
 *
 * A row in this state carries no score, no rubric dimensions and no runtime
 * verdicts, because none of those have been decided yet. Anything reading a
 * stored review must therefore treat it as an announcement, not an assessment.
 */
export type ArtifactReviewStatus =
  | 'complete'
  | 'partial'
  | 'in-progress'
  | 'failed'
  | 'cancelled';

/** Stored states that carry a finished assessment. */
export function isAssessedStatus(status: ArtifactReviewStatus): boolean {
  return status === 'complete' || status === 'partial';
}

/** Published recommendation vocabulary. Do not invent alternatives. */
export type ArtifactRecommendation = 'submit' | 'revise' | 'keep-private';

export const RECOMMENDATION_LABELS: Record<ArtifactRecommendation, string> = {
  submit: 'Submit',
  revise: 'Revise',
  'keep-private': 'Keep private',
};

/** Increments whenever evaluator semantics change enough to invalidate reuse. */
export const ARTIFACT_EVALUATOR_VERSION = 3;

/** Why a reviewed file's text is not stored with the review. */
export type ReviewedFileOmission = 'binary' | 'undecodable' | 'too-large' | 'budget';

/**
 * One file as it is kept with the completed review.
 *
 * Every file that was read appears here, whether or not its text survives. That
 * is the point: the list is the evidence that the whole bundle was read, so it
 * must never be filtered. Text is dropped rather than truncated when it does not
 * fit — a partial file that looks whole would put the reader on the wrong line.
 */
export interface ReviewedFile {
  path: string;
  bytes: number;
  isBinary: boolean;
  /** Decoded text. Absent when `omitted` says why. */
  text?: string;
  omitted?: ReviewedFileOmission;
}

export interface ArtifactReviewResult {
  status: ArtifactReviewStatus;
  /** Rule-set version that produced this result. Absent only on legacy rows. */
  evaluatorVersion?: number;
  /**
   * Absent when detection failed or the review was cancelled.
   *
   * Optional rather than defaulted: an unidentified upload has no kind, and
   * naming one anyway would put a guess where the report shows a fact.
   */
  artifactKind?: ArtifactKind;
  artifactName: string;
  artifactHash: string;
  selectedRuntimes: TargetRuntime[];
  /** Runtime targets established by authoritative package metadata. */
  declaredRuntimes?: TargetRuntime[];
  scores: SkillBundleScores;
  dimensions: RubricDimensionScore[];
  /** Actual standard-evaluator scores and rationales, when the AI stage ran. */
  aiAssessment?: ArtifactAiAssessment;
  runtimeVerdicts: RuntimeVerdict[];
  findings: ArtifactFinding[];
  /**
   * Every file that was read, newest contract addition.
   *
   * Optional because a review stored before this field existed has none, and
   * dropping those rows would lose real history. The explorer degrades to
   * "file list unavailable" rather than claiming the bundle was empty.
   */
  files?: ReviewedFile[];
  /** Total uncompressed size of the bundle, in bytes. */
  uncompressedBytes?: number;
  recommendation: ArtifactRecommendation;
  /** False marks a deterministic-only review, presented as partial. */
  aiAvailable: boolean;
  reviewedAt: string;
  /** Present when status is 'failed'. */
  error?: string;
  /**
   * The workflow run this review is waiting on, when one was started.
   *
   * Written onto a reserved row so a review found in `in-progress` after a
   * reload can be matched back to the job that is still running, rather than
   * being restarted at the cost of a second AI call.
   */
  jobId?: string;
  /**
   * When the run was reserved, for a row that is still `in-progress`.
   *
   * Separate from `reviewedAt` on purpose: the grid says "Started 6 min ago"
   * for a running row and "Reviewed 6 min ago" for a finished one, and reusing
   * one field for both would make a running row claim it had been reviewed.
   */
  startedAt?: string;
}

/**
 * Progress reported while a review runs.
 *
 * The optional fields below exist because the AI stage can run for minutes on
 * the workflow agent, and a static percentage gives the user no way to tell a
 * slow review from a dead one. Every one of them is measured, not estimated:
 * the counts come from the parsed archive and the last-completed line comes
 * from the job row the workflow itself writes. A field is omitted rather than
 * guessed when its value is not yet known.
 */
export interface ArtifactReviewProgress {
  stage: 'reading' | 'detecting' | 'deterministic' | 'ai' | 'scoring' | 'complete';
  percent: number;
  message: string;
  /**
   * Skills found in the archive.
   *
   * Distinct from {@link fileCount}: one skill owns many files. Naming this
   * `skillCount` rather than reusing the agent pipeline's word "component"
   * keeps the dialog readable next to a folder listing.
   */
  skillCount?: number;
  /** Files found in the archive, across every skill. */
  fileCount?: number;
  /**
   * The last unit of work the backend actually finished, verbatim from the job
   * row. Absent until the workflow writes its first status.
   */
  lastCompleted?: string;
  /**
   * Parts of the archive the agent has finished, when the archive was split.
   *
   * Counted from the job's child rows, which each iteration inserts for itself.
   * The workflow's own `cat_laststatus` ping cannot be used for this: parallel
   * iterations overwrite each other, so it names whichever part finished most
   * recently rather than how many have.
   */
  completedParts?: number;
  /**
   * Parts the archive was split into for parallel review.
   *
   * Absent when the archive was small enough to review in one call, which is
   * what keeps the split invisible to a user whose upload was never split.
   */
  totalParts?: number;
}
