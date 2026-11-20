/**
 * The host-neutral half of the uploaded-artifact AI stage.
 *
 * Everything that decides what the AI stage *means* lives here: how a bundle is adapted, how a
 * returned finding is grounded against the uploaded bytes, which findings are dropped as
 * uncorroborated, and how several portions are combined into one assessment. None of it knows where
 * the AI came from.
 *
 * What is *not* here is how to reach a model. Building the AI Builder port, deciding whether the
 * workflow backend is configured, submitting a job row and naming the thing being reviewed are all
 * host decisions, because each host has its own Dataverse identity and its own job table access.
 * They arrive through {@link ArtifactAiStageCoreDeps}.
 *
 * Two hosts bind this today. The Agent Review Tool reviews one upload against its own review rows,
 * and identifies it by the artifact hash. The Architecture Workbench reviews an upload as one agent
 * inside a snapshot, over its own job port, and identifies it by a subject id that survives an edit.
 * Neither may change a rule, a weight or a threshold — those are this file's, and only this file's.
 *
 * The reasoning behind reusing the agent-review pipeline at all is unchanged:
 *
 * - The agent returns a rule id, a judgement and evidence. All user-visible wording comes from the
 *   client-side rule registry, so a model cannot invent the text of a finding.
 * - Withheld files never reach the prompt, so a credential found by the scanner is not forwarded to
 *   a service in the course of reviewing it.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import type { GroundedSkillFinding } from '../../agents-experience/contracts/Findings';
import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import { AI_MODEL_IDS } from '../../contracts/Constants';
import {
  computeDeterministicFindingsByBundle,
  executeSkillBundleReview,
  type SkillBundleReviewAiPort,
  type SkillBundleReviewResult,
} from '../../agents-experience/services/SkillBundleReviewService';
import type { ReviewAiPort } from '../../agents-experience/services/CopilotReviewService';
import type {
  ArtifactAiAssessment,
  ArtifactAiStageResult,
  ArtifactFinding,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { classifyScannerRule } from '../../agents-experience/services/skill/resourceScanners';
import { findFile } from './artifactUtils';
import { toSkillBundle } from './uploadBundleAdapter';

const CAPABILITY_GROUNDED_RULE = 'SKL-09';
const RETIRED_UNPROVABLE_RULES = new Set(['PKG-ORPHAN', 'SHP-HEADINGS']);

/**
 * An uploaded archive has no parent agent configuration.
 *
 * Keep every capability collection empty rather than treating runtime
 * selection or a catalogue as evidence that a capability is configured.
 */
function emptyCapabilityModel(): AgentsExperienceModel {
  const model = {
    agentSettings: { instructions: '', raw: {} },
    tools: [],
    skills: [],
    connectedAgents: [],
    knowledge: [],
    evaluationSets: [],
    testCases: [],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [],
    /*
      The cast is deliberate and narrow in effect. `AeTool` and `AeSkill` carry
      Dataverse identity fields (componentId, schemaname, markdown) that exist
      only for a real Copilot Studio agent. An uploaded artifact has no such
      row, and inventing those values would be worse than omitting them. The
      one consumer, `collectConfiguredCapabilities`, reads only the name
      fields, which are set. Keep that true if this object grows a new reader.
    */
  } as unknown as AgentsExperienceModel;

  return model;
}

/** Adapt an agent-review finding into an artifact finding. */
function toArtifactFinding(finding: GroundedSkillFinding): ArtifactFinding {
  return {
    ...finding,
    // An AI finding is about the writing, which is platform-independent. An
    // empty list means it applies to every selected runtime.
    runtimes: [],
    source: 'ai',
  };
}

/**
 * Build the AI port for this review.
 *
 * The workflow backend overrides only the standard skill-bundle stage; the
 * legacy evaluator serves as the fallback shape when a backend supplies no
 * structured evaluator, exactly as the agent review does.
 */
function buildBundlePort(port: ReviewAiPort): SkillBundleReviewAiPort {
  return {
    invokeStandardSkillBundleEvaluator: port.invokeStandardSkillBundleEvaluator
      ? port.invokeStandardSkillBundleEvaluator
      : (payload) =>
          port
            .invokeSkillBundleEvaluator({
              skillMarkdown: payload.skill_markdown,
              agentInstructions: payload.agent_instructions,
              siblingDescriptions: payload.sibling_descriptions_json,
              skillResources: payload.resource_excerpts_json,
            })
            .then((legacy) => ({
              evaluation: {
                status: 'complete' as const,
                dimensions: legacy.dimensions,
                findings: [],
                resourcePurposeAlignment: [],
                operationalAssumptions: [],
                unreviewedResources: [],
                summary: legacy.summary,
                referenceIds: legacy.citations?.map((c) => c.id) ?? [],
              },
              issues: [],
            })),
  };
}

/**
 * What the AI stage knows about its own progress at one moment.
 *
 * Carries the backend's real signals rather than a rendered sentence, so the
 * dialog decides the wording and this module stays free of presentation.
 */
export interface ArtifactAiStageProgress {
  /** Human-readable phase text, already worded for the skills domain. */
  message: string;
  /**
   * Verbatim last-completed line from the job row, when the workflow has
   * written one. Undefined before the first unit of work finishes.
   */
  lastCompleted?: string;
  /** Parts finished so far, when the archive was split. */
  completedParts?: number;
  /** Parts the archive was split into. Undefined when it was not split. */
  totalParts?: number;
}

export interface ArtifactAiStageOptions {
  /** Progress for the AI stage, forwarded to the progress dialog. */
  onStageProgress?: (progress: ArtifactAiStageProgress) => void;
  /**
   * Collect a job that is already running rather than starting a new one.
   *
   * Set only by the resume path, which finds the job from the review row after
   * the browser that started it has gone.
   */
  existingJobId?: string;
}

/**
 * A workflow backend bound by the host for one review.
 *
 * The core never constructs this. Priming is what submits the job, so whoever owns the job table
 * owns this object.
 */
export interface ArtifactWorkflowBinding {
  /** The AI port to evaluate through, with the workflow's stages overriding the prompt's. */
  port: ReviewAiPort;
  /**
   * Submit the portions as one job.
   *
   * Priming every portion at once creates ONE job with N components, which is what lets the
   * workflow's Loop review them in parallel.
   */
  prime(
    portions: readonly SkillBundle[],
    deterministicFindings: ReturnType<typeof computeDeterministicFindingsByBundle>,
    capabilityModel: AgentsExperienceModel,
  ): Promise<void>;
}

/** What the host needs in order to bind a workflow for this particular review. */
export interface ArtifactWorkflowContext {
  artifact: UploadedArtifact;
  /**
   * The original upload's name, never a portion label.
   *
   * This is what the user sees and what the job row is identified by.
   */
  bundleName: string;
  /** True when the archive was split, so progress must report a count rather than a ping. */
  split: boolean;
  /** How many portions were primed. 1 when the archive was not split. */
  portionCount: number;
  signal?: AbortSignal;
}

export interface ArtifactAiStageCoreDeps {
  /**
   * The AI Builder port.
   *
   * Serves the stage outright when no workflow is bound, and remains the per-stage fallback shape
   * when one is: a workflow node that returns nothing degrades to this rather than losing the stage.
   */
  promptPort: ReviewAiPort;
  /**
   * Bind the workflow backend for this review, or return null to run on the prompt port alone.
   *
   * Called after the portion plan is known, because `jobKind` is fixed at job-creation time and must
   * only say `ArtifactBundle` when there really is more than one portion.
   */
  bindWorkflow?: (context: ArtifactWorkflowContext) => ArtifactWorkflowBinding | null;
  /**
   * Split a large bundle into portions reviewed in parallel.
   *
   * Omitted means no split, which is the single-component path every host started on. Only a
   * workflow backend gains from a split — its Loop reviews the portions at once; a prompt backend
   * has no such loop, so splitting there buys N times the calls and none of the time saving.
   */
  planPortions?: (bundle: SkillBundle) => { portions: SkillBundle[]; split: boolean };
  /**
   * Whether the prompt backend has a provisioned standard evaluator.
   *
   * Defaults to ART's compiled model ids. A host with its own model ids passes its own answer,
   * because claiming a model that is not provisioned turns an unavailable stage into a silent 5/5.
   */
  promptProvisioned?: boolean;
}

/**
 * Build the `runAiStage` dependency for `reviewArtifact`.
 *
 * A thrown error here degrades the review to `partial` and keeps every
 * deterministic finding, so an unavailable backend costs the AI dimensions
 * rather than the whole review.
 */
export function createArtifactAiStageCore(deps: ArtifactAiStageCoreDeps) {
  return async function runAiStage(
    artifact: UploadedArtifact,
    runtimes: readonly TargetRuntime[],
    withheldPaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<ArtifactAiStageResult> {
    const bundle: SkillBundle = toSkillBundle({ artifact, withheldPaths });
    const capabilityModel = emptyCapabilityModel();

    // Split before the port is bound. `jobKind` is fixed at job-creation time,
    // and it must only say `ArtifactBundle` when there really is more than one
    // portion — otherwise a small upload would be routed to the workflow's newer
    // branch for no benefit, and would carry that branch's risk.
    const plan = deps.planPortions
      ? deps.planPortions(bundle)
      : { portions: [bundle], split: false };
    const { portions, split } = plan;

    const workflow =
      deps.bindWorkflow?.({
        artifact,
        bundleName: bundle.skillName,
        split,
        portionCount: portions.length,
        ...(signal ? { signal } : {}),
      }) ?? null;

    const port = workflow ? workflow.port : deps.promptPort;

    if (workflow) {
      // The agent is asked to build on the deterministic layer, so it receives
      // that layer's real output rather than an empty list.
      await workflow.prime(
        portions,
        computeDeterministicFindingsByBundle(portions),
        capabilityModel,
      );
    }

    // One call per portion. They share the single primed job, so these resolve
    // together as the workflow completes rather than running end to end.
    const settled = await Promise.allSettled(
      portions.map((portion) =>
        executeSkillBundleReview(
          portion,
          {
            ai: buildBundlePort(port),
            standardProvisioned:
              workflow !== null ||
              (deps.promptProvisioned ?? Boolean(AI_MODEL_IDS.SKILL_BUNDLE_EVAL)),
            // Deep review walks every resource with several prompts per file. That
            // cost is not justified for a single uploaded artifact, and the standard
            // stage already covers the wording dimensions this review scores.
            deepProvisioned: false,
          },
          undefined,
          signal,
        ),
      ),
    );

    return collectPortionResults(settled, artifact);
  };
}

/**
 * Reduces every portion's outcome to one finding list, or throws.
 *
 * The review reports a single score for the whole archive, so a portion that
 * never produced a judgement cannot be quietly dropped: that would restore the
 * silent file loss this split was built to remove. Any failure therefore throws,
 * which degrades the review to `partial`, keeps all deterministic findings and
 * marks the AI dimensions as not assessed.
 *
 * @param settled - One settled result per portion, in portion order.
 * @param capabilitiesGrounded - False when no runtime publishes a tool surface.
 * @param artifact - Source files used to verify or repair each finding path.
 */
function collectPortionResults(
  settled: readonly PromiseSettledResult<SkillBundleReviewResult>[],
  artifact: UploadedArtifact,
): ArtifactAiStageResult {
  const unjudged: string[] = [];
  const reasons: string[] = [];
  const findings: GroundedSkillFinding[] = [];
  const evaluations: NonNullable<SkillBundleReviewResult['standardEvaluation']>[] = [];

  settled.forEach((outcome, index) => {
    // Numbered, never named. The portion label carries an internal marker that
    // means nothing to the person who uploaded one archive, so an error must
    // not repeat it back to them.
    const label = `part ${index + 1} of ${settled.length}`;

    if (outcome.status === 'rejected') {
      unjudged.push(label);
      reasons.push(describeReason(outcome.reason));
      return;
    }

    const result = outcome.value;

    if (result.status === 'unavailable') {
      unjudged.push(label);
      reasons.push('the AI review stage is not available in this environment');
      return;
    }
    if (result.status === 'blocked') {
      unjudged.push(label);
      reasons.push('it contains content that cannot be sent to a model');
      return;
    }
    // A failed AI call comes back as `status: 'partial'` carrying an `error` and
    // no `standardEvaluation` — not as a thrown exception. Treating that as an
    // empty finding list would be read by the caller as "the AI ran and found
    // nothing", which scores the AI-dependent dimensions a clean 5/5 and
    // recommends submitting.
    if (!result.standardEvaluation) {
      unjudged.push(label);
      reasons.push(result.error ?? 'it returned no evaluation');
      return;
    }

    evaluations.push(result.standardEvaluation);
    findings.push(...result.standardEvaluation.findings);
  });

  if (unjudged.length > 0) {
    throw new Error(
      `The AI review stage did not complete for ${unjudged.length} of ${settled.length} part(s) of this archive ` +
        `(${unjudged.join(', ')}): ${[...new Set(reasons)].join('; ')}.`,
    );
  }

  const artifactFindings = dedupeFindings(
    findings.flatMap((finding) => {
      const resolved = resolveFindingPath(finding, artifact);
      return resolved ? [resolved] : [];
    }),
  )
    .filter(
      (finding) =>
        finding.ruleId !== CAPABILITY_GROUNDED_RULE &&
        !RETIRED_UNPROVABLE_RULES.has(finding.ruleId),
    )
    .flatMap((finding) => {
      const corroborated = corroborateScannerFinding(finding, artifact);
      return corroborated ? [corroborated] : [];
    })
    .map(toArtifactFinding);

  return {
    findings: artifactFindings,
    assessment: combineAssessments(evaluations, artifact, artifactFindings),
  };
}

function combineAssessments(
  evaluations: readonly NonNullable<SkillBundleReviewResult['standardEvaluation']>[],
  artifact: UploadedArtifact,
  confirmedFindings: readonly ArtifactFinding[],
): ArtifactAiAssessment {
  const keys = ['Clarity', 'Actionability', 'Scope discipline', 'Composability'] as const;
  const dimensions = keys.flatMap((key) => {
    const values = evaluations.flatMap((evaluation, portionIndex) => {
      const dimension = (evaluation.dimensions ?? []).find((candidate) => candidate.key === key);
      return dimension ? [{ ...dimension, portionIndex }] : [];
    });
    if (values.length === 0) return [];

    const rationales = values
      .map((value) => value.rationale.trim())
      .filter((rationale, index, all) => rationale.length > 0 && all.indexOf(rationale) === index);
    const rationale =
      rationales.length <= 1
        ? (rationales[0] ?? '')
        : values
            .filter(
              (value, index, all) =>
                value.rationale.trim().length > 0 &&
                all.findIndex((candidate) => candidate.rationale.trim() === value.rationale.trim()) === index,
            )
            .map((value) => `Part ${value.portionIndex + 1}: ${value.rationale.trim()}`)
            .join(' ');

    const normalized = values.map((value) => {
      if (!Number.isFinite(value.score) || value.score < 0 || value.score > 100) {
        throw new Error(`AI dimension "${key}" returned an invalid score of ${value.score}.`);
      }
      const score = value.score > 10 ? value.score / 10 : value.score;
      const evidence = value.evidence?.trim();
      const improvement = value.improvement?.trim();
      const evidenceExists =
        Boolean(evidence) &&
        artifact.files.some((file) => file.text?.includes(evidence ?? ''));
      const evidenceHasConfirmedFinding =
        Boolean(evidence) &&
        confirmedFindings.some(
          (finding) =>
            finding.evidence?.trim().toLowerCase() === evidence?.toLowerCase(),
        );
      const deductionSupported =
        score >= 10 ||
        (evidenceExists && evidenceHasConfirmedFinding && Boolean(improvement));
      return {
        ...value,
        score: deductionSupported ? score : 10,
        evidence: deductionSupported ? evidence : undefined,
        improvement: deductionSupported ? improvement : undefined,
      };
    });
    const strongestGap = [...normalized]
      .filter((value) => value.score < 10)
      .sort((left, right) => left.score - right.score)[0];

    return [{
      key,
      score: Math.round(
        (normalized.reduce((total, value) => total + value.score, 0) / normalized.length) * 10,
      ) / 10,
      rationale,
      ...(strongestGap?.evidence ? { evidence: strongestGap.evidence } : {}),
      ...(strongestGap?.improvement ? { improvement: strongestGap.improvement } : {}),
    }];
  });

  return {
    status: evaluations.every((evaluation) => evaluation.status === 'complete')
      ? 'complete'
      : 'partial',
    portionsAssessed: evaluations.length,
    dimensions,
  };
}

/**
 * Makes every displayed path traceable to the uploaded file that contains the
 * quoted evidence. A unique evidence match repairs an omitted path. Ambiguous
 * or ungrounded pathless findings are dropped instead of using a guessed path.
 */
type LocatedGroundedSkillFinding = GroundedSkillFinding & { line?: number };

function resolveFindingPath(
  finding: LocatedGroundedSkillFinding,
  artifact: UploadedArtifact,
): LocatedGroundedSkillFinding | null {
  const evidence = finding.evidence?.trim();
  const requestedPath = finding.resourcePath?.trim();
  const normalizedRequested = normalizeArtifactPath(requestedPath ?? '');
  const requestedFile = requestedPath
    ? artifact.files.find(
        (candidate) => normalizeArtifactPath(candidate.path) === normalizedRequested,
      ) ??
      (normalizedRequested === 'skill.md' ? findFile(artifact, 'SKILL.md') : undefined)
    : undefined;

  if (
    requestedFile &&
    (!evidence || requestedFile.text?.toLowerCase().includes(evidence.toLowerCase()))
  ) {
    return {
      ...finding,
      resourcePath: requestedFile.path,
      line: finding.line ?? deriveEvidenceLine(requestedFile.text, evidence),
    };
  }

  if (!evidence) {
    console.warn(`[CopilotReview] Dropped ${finding.ruleId}: no verifiable resource path.`);
    return null;
  }

  const matches = artifact.files.filter((candidate) =>
    candidate.text?.toLowerCase().includes(evidence.toLowerCase()),
  );
  if (matches.length !== 1) {
    console.warn(
      `[CopilotReview] Dropped ${finding.ruleId}: evidence did not resolve to exactly one uploaded file.`,
    );
    return null;
  }

  return {
    ...finding,
    resourcePath: matches[0].path,
    line: finding.line ?? deriveEvidenceLine(matches[0].text, evidence),
  };
}

function deriveEvidenceLine(text?: string, evidence?: string): number | undefined {
  if (!text || !evidence) return undefined;
  const normalizedText = text.toLowerCase();
  const normalizedEvidence = evidence.toLowerCase();
  const start = normalizedText.indexOf(normalizedEvidence);
  if (start < 0 || normalizedText.indexOf(normalizedEvidence, start + normalizedEvidence.length) >= 0) {
    return undefined;
  }
  return text.slice(0, start).split('\n').length;
}

function normalizeArtifactPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').toLowerCase();
}

/**
 * Drops an AI finding that claims a pattern-defined rule its evidence does not
 * satisfy.
 *
 * Some rules are defined *by* a regex set rather than by judgement --
 * `MD-ROLEOVR-01` is exactly four override phrasings, `MD-EXEC-01` is a shell
 * execution directive. The agent picks a rule id from the same registry the
 * scanner uses, and it can pick one whose definition its quoted evidence does
 * not meet: live runs produced `MD-ROLEOVR-01` on the sentence "If the customer
 * looks over 25, no identification is required" (retail policy prose, not an
 * override) and `MD-EXEC-01` on a documented `python scripts/charts.py` call.
 * Both are high-cost false positives -- the first alone moved the safety gate to
 * a warning.
 *
 * The same contextual classifier is applied to both the quoted evidence and
 * its full source file. A rejected candidate is dropped, and an accepted
 * candidate cannot be assigned a stronger severity than the scanner allows.
 * Rules with no scanner remain AI-judged and flow through untouched.
 */
function corroborateScannerFinding(
  finding: GroundedSkillFinding,
  artifact: UploadedArtifact,
): GroundedSkillFinding | null {
  const evidence = finding.evidence ?? '';
  const path = finding.resourcePath ?? 'unknown';
  const evidenceClassification = classifyScannerRule(finding.ruleId, evidence, path);
  if (!evidenceClassification.defined) return finding;

  const source = artifact.files.find(
    (candidate) => normalizeArtifactPath(candidate.path) === normalizeArtifactPath(path),
  )?.text;
  const sourceClassification = classifyScannerRule(
    finding.ruleId,
    source ?? evidence,
    path,
  );
  if (!evidenceClassification.severity || !sourceClassification.severity) {
    console.warn(
      `[CopilotReview] Dropped ${finding.ruleId}: the quoted evidence does not satisfy the rule's contextual checks.`,
    );
    return null;
  }

  const allowedSeverity =
    (SEVERITY_RANK[evidenceClassification.severity] ?? Number.MAX_SAFE_INTEGER) >=
    (SEVERITY_RANK[sourceClassification.severity] ?? Number.MAX_SAFE_INTEGER)
      ? evidenceClassification.severity
      : sourceClassification.severity;
  const aiRank = SEVERITY_RANK[finding.severity] ?? Number.MAX_SAFE_INTEGER;
  const allowedRank = SEVERITY_RANK[allowedSeverity] ?? Number.MAX_SAFE_INTEGER;
  if (aiRank >= allowedRank) return finding;

  return {
    ...finding,
    severity: allowedSeverity,
    safetyDisposition:
      allowedSeverity === 'critical' || allowedSeverity === 'high'
        ? 'blocking'
        : 'advisory',
  };
}

/** Severity order, strongest first, for choosing which duplicate to keep. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Removes findings that two portions both raised.
 *
 * Every portion sees the same SKILL.md, so a finding against it is expected
 * from several portions at once. Identity is the rule, the file and the quoted
 * evidence; where those match, the strongest severity is kept so a de-duplicate
 * never softens a verdict.
 */
function dedupeFindings(
  findings: readonly GroundedSkillFinding[],
): GroundedSkillFinding[] {
  const byKey = new Map<string, GroundedSkillFinding>();

  for (const finding of findings) {
    const key = [
      finding.ruleId,
      finding.resourcePath ?? '',
      (finding.evidence ?? '').trim().toLowerCase(),
    ].join('\u0000');

    const existing = byKey.get(key);
    if (
      !existing ||
      (SEVERITY_RANK[finding.severity] ?? Number.MAX_SAFE_INTEGER) <
        (SEVERITY_RANK[existing.severity] ?? Number.MAX_SAFE_INTEGER)
    ) {
      byKey.set(key, finding);
    }
  }

  return [...byKey.values()];
}

/** Turns an unknown rejection into text safe to put in an error message. */
function describeReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
