/** Skill bundle review pipeline: deterministic scan, whole-skill evaluation, then deep per-resource analysis. */
import type { GroundedSkillFinding, GroundedFinding } from '../contracts/Findings.js';
import type { ReferenceId } from '../contracts/references.js';
import { REFERENCES } from '../contracts/references.js';
import type { SkillBundle, SkillReviewMode, SkillReviewProgress, SkillBundleReviewStatus, SkillBundleReviewResult, ResourceChunk } from '../contracts/SkillBundle.js';
import type { StandardPromptPayload, ResourcePromptPayload, FileSynthesisPromptPayload, BundleSynthesisPromptPayload } from './skill/SkillPromptPayloadBuilder.js';
import type { StandardValidationResult, ChunkValidationResult, ResourceValidationResult, DeepBundleValidationResult } from './skill/SkillEvaluationValidator.js';
import { analyzeSkillL0 } from './skill/L0SkillAnalyzer.js';
import { analyzeBundleIntegrity } from './skill/bundleIntegrity.js';
import { scanSkillResource } from './skill/resourceScanners.js';
import { buildStandardPromptInput } from './skill/SkillPromptPayloadBuilder.js';
import { splitSkillMarkdown } from './AgentsExperienceParser.js';
import { executeDeepSkillBundleReview, type DeepSkillReviewAiPort } from './skill/deepFacade.js';
import { buildBundleSourceCorpus } from './skill/deepReviewHelpers.js';
// Re-export so existing consumers of SkillBundleReviewService get these types without an import path change.
export type { SkillBundleReviewStatus, SkillBundleReviewResult };

/** Injectable AI port — accepts Task 7's structured evaluator signature. */
export interface SkillBundleReviewAiPort {
  invokeStandardSkillBundleEvaluator(
    payload: StandardPromptPayload,
    sourceCorpus: string,
  ): Promise<StandardValidationResult>;
  /** Deep P2-R: resource chunk evaluator (optional — only needed for deep mode). */
  invokeSkillResourceChunkEvaluator?(
    payload: ResourcePromptPayload,
    chunk: ResourceChunk,
  ): Promise<ChunkValidationResult>;
  /** Deep P2-F: file synthesizer (optional — only needed for deep mode). */
  invokeSkillFileSynthesizer?(
    payload: FileSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<ResourceValidationResult>;
  /** Deep P2-B: bundle synthesizer (optional — only needed for deep mode). */
  invokeDeepSkillBundleSynthesizer?(
    payload: BundleSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ): Promise<DeepBundleValidationResult>;
}

export interface SkillBundleReviewDeps {
  ai: SkillBundleReviewAiPort;
  /** When false, the Standard AI prompt (P2-N) will not be invoked. */
  standardProvisioned?: boolean;
  /** When false, the Deep AI prompts (P2-R, P2-F, P2-B) will not be invoked. */
  deepProvisioned?: boolean;
}

function emitProgress(
  onProgress: ((p: SkillReviewProgress) => void) | undefined,
  stage: SkillReviewProgress['stage'],
  message: string,
  skillName: string,
  percent: number,
  completedUnits: number,
  totalUnits: number,
): void {
  if (!onProgress) return;
  onProgress({
    stage,
    percent,
    message,
    skillName,
    completedUnits,
    totalUnits,
    partialFailures: 0,
  });
}

function isUploadedArtifactBundle(bundle: SkillBundle): boolean {
  return (
    bundle.bundleMarker?.startsWith('upload:') === true &&
    bundle.skillComponentId === bundle.bundleMarker
  );
}

function removeUnknownUploadCapabilityClaims(
  result: StandardValidationResult,
  bundle: SkillBundle,
): StandardValidationResult {
  // An uploaded bundle has no target-agent configuration to compare against.
  // Package targeting can identify the product, but not tools configured on an agent.
  if (!isUploadedArtifactBundle(bundle)) {
    return result;
  }

  return {
    ...result,
    evaluation: {
      ...result.evaluation,
      findings: result.evaluation.findings.filter((finding) => finding.ruleId !== 'SKL-09'),
      missingCapabilities: [],
    },
  };
}

/** Maps raw reference string to a valid ReferenceId; unmapped values fail closed to 'owasp-llm01'. */
function toReferenceId(raw: string | undefined): ReferenceId {
  if (raw !== undefined && raw in REFERENCES) {
    return raw as ReferenceId;
  }
  return 'owasp-llm01';
}

/**
 * Every deterministic finding for one bundle, computed without any AI call.
 *
 * Exported so the workflow backend can send real scanner output in its corpus.
 * The workflow submits every component up front, long before this service runs
 * per skill, so it previously sent `deterministic_findings: []` for all of them
 * — the reviewing agent was asked to build on output it had never been given.
 *
 * Every input is pure: L0 analysis, bundle integrity and resource scanning read
 * the bundle and nothing else, so computing them early costs only CPU and
 * cannot change the review's outcome. Sharing this function is what keeps the
 * two backends from drifting apart.
 */
/**
 * Rules whose entire basis is that the skill markdown had no content.
 *
 * They are correct when the markdown was read and found empty, and misleading
 * when it was never read at all.
 */
const EMPTY_CONTENT_RULE_IDS = new Set(['SKL-01', 'SKL-02', 'SKL-03']);

/**
 * Whether the skill's own markdown was successfully retrieved.
 *
 * Measured on ZAVA Training Hub: all four resources failed to download, so
 * `skillMarkdown` was empty and the review reported the skill as having no
 * frontmatter name, no description and an empty body. Those three findings
 * describe the download, not the agent, and a maker acting on them would edit a
 * skill that was never broken. When the content was never seen, the honest
 * output is the retrieval error alone -- which `analyzeBundleIntegrity` already
 * raises as `BND-06`.
 */
function skillMarkdownWasRetrieved(bundle: SkillBundle): boolean {
  if (bundle.skillMarkdown.trim().length > 0) return true;
  return !bundle.retrievalIssues.some(issue =>
    issue.code === 'missing-skill-md' ||
    (issue.code === 'download-failed' &&
      /(^|\/)SKILL\.md$/i.test(issue.resourcePath ?? '')));
}

export function computeDeterministicFindings(bundle: SkillBundle): GroundedSkillFinding[] {
  const skillName = bundle.skillName;
  const fm = splitSkillMarkdown(bundle.skillMarkdown);
  const l0 = analyzeSkillL0({
    name: skillName,
    schemaname: bundle.skillSchemaName,
    markdown: bundle.skillMarkdown,
    frontmatterName: fm.name,
    frontmatterDescription: fm.description,
    body: fm.body,
    componentId: bundle.skillComponentId,
    componentIdUnique: bundle.skillComponentUniqueId,
    source: bundle.source,
    bundleMarker: bundle.bundleMarker,
    resourceCount: bundle.resources.length,
  } as never);

  // Findings about absent content are only meaningful if the content was read.
  const contentFindings = skillMarkdownWasRetrieved(bundle)
    ? l0.frontmatterFindings
    : l0.frontmatterFindings.filter(f => !EMPTY_CONTENT_RULE_IDS.has(f.id));

  return [
    ...contentFindings.map(adaptGroundedToSkillFinding),
    ...toSafetyEvidence(l0.safetyFindings, skillName),
    ...analyzeBundleIntegrity(bundle).findings,
    ...bundle.resources.flatMap(scanSkillResource),
  ];
}

/**
 * Deterministic findings for a whole review, keyed by skill schema name.
 *
 * One malformed bundle must not stop the corpus being submitted, so a failure
 * leaves that component with no findings — exactly what every component had
 * before this existed.
 *
 * @param bundles - Every assembled bundle in the review.
 */
export function computeDeterministicFindingsByBundle(
  bundles: readonly SkillBundle[],
): Map<string, GroundedSkillFinding[]> {
  const byBundle = new Map<string, GroundedSkillFinding[]>();
  for (const bundle of bundles) {
    try {
      byBundle.set(bundle.skillSchemaName, computeDeterministicFindings(bundle));
    } catch (err) {
      console.warn(
        `[CopilotReview] Could not pre-compute deterministic findings for "${bundle.skillName}".`,
        err,
      );
    }
  }
  return byBundle;
}

/** Map L0 safety findings onto the grounded shape used across the review. */
function toSafetyEvidence(
  safetyFindings: ReturnType<typeof analyzeSkillL0>['safetyFindings'],
  skillName: string,
): GroundedSkillFinding[] {
  return safetyFindings.map(f => ({
    id: `${f.id}:${skillName}`,
    family: 'Skills',
    severity: f.severity,
    title: `Safety: ${f.category} in "${skillName}"`,
    fact: f.evidence,
    why: f.rationale,
    fix: f.recommendation,
    referenceId: toReferenceId(f.reference),
    ai: false,
    ruleId: f.id,
    resourcePath: undefined,
    evidence: f.evidence,
    recommendation: f.recommendation,
    fixSteps: [{ order: 1, action: f.recommendation }],
    referenceIds: [toReferenceId(f.reference)],
    confidence: 'high' as const,
    dimension: 'safety' as const,
    safetyDisposition: f.safetyDisposition,
    platformOverlap: f.platformOverlap,
    skipAiEvaluation: f.skipAiEvaluation,
  }));
}

/** Adapts a GroundedFinding (L0 frontmatter shape) to GroundedSkillFinding for deterministic merge. */
function adaptGroundedToSkillFinding(gf: GroundedFinding): GroundedSkillFinding {
  const severityMap: Record<GroundedFinding['severity'], GroundedSkillFinding['severity']> = {
    error: 'high',
    warning: 'medium',
    info: 'info',
  };
  return {
    ...gf,
    severity: severityMap[gf.severity],
    ruleId: gf.id,
    evidence: gf.fact,
    recommendation: gf.fix,
    fixSteps: [{ order: 1, action: gf.fix }],
    referenceIds: [gf.referenceId],
    confidence: 'high',
  };
}

/**
 * Whether the full pipeline can run in this tenant.
 *
 * The deep phases need all three deep AI methods wired and the corresponding
 * AI Builder prompts provisioned. When either is missing the review degrades to
 * the whole-skill pass rather than failing outright.
 */
export function canRunDeepReview(deps: SkillBundleReviewDeps): boolean {
  return (
    !!deps.ai.invokeSkillResourceChunkEvaluator &&
    !!deps.ai.invokeSkillFileSynthesizer &&
    !!deps.ai.invokeDeepSkillBundleSynthesizer &&
    deps.deepProvisioned !== false
  );
}

/**
 * Execute a skill bundle review.
 *
 * There is a single review depth. Every review runs the deterministic scan, the
 * whole-skill evaluation, and then per-resource behavioural analysis and synthesis.
 * The whole-skill pass is phase one of that pipeline, not a user-selectable
 * alternative to it.
 *
 * When the deep prompts are not provisioned the review degrades to phase one alone
 * and reports `mode: 'standard'` so the results view can disclose reduced coverage.
 */
export async function executeSkillBundleReview(
  bundle: SkillBundle,
  deps: SkillBundleReviewDeps,
  onProgress?: (p: SkillReviewProgress) => void,
  signal?: AbortSignal,
): Promise<SkillBundleReviewResult> {
  if (!canRunDeepReview(deps)) {
    return executeWholeSkillReview(bundle, deps, onProgress, signal);
  }

  const deepAi: DeepSkillReviewAiPort = {
    invokeSkillResourceChunkEvaluator: deps.ai.invokeSkillResourceChunkEvaluator!,
    invokeSkillFileSynthesizer: deps.ai.invokeSkillFileSynthesizer!,
    invokeDeepSkillBundleSynthesizer: deps.ai.invokeDeepSkillBundleSynthesizer!,
  };

  return executeDeepSkillBundleReview(
    bundle,
    bundle.skillName,
    bundle.skillSchemaName,
    deepAi,
    (p, s) => executeWholeSkillReview(bundle, deps, p, s),
    onProgress,
    signal,
  );
}

/**
 * Phase one: deterministic analysis plus the whole-skill AI evaluation (P2-N).
 *
 * Runs standalone only when the deep prompts are unavailable; otherwise its result
 * is handed to the deep orchestrator as the baseline for per-resource analysis.
 */
async function executeWholeSkillReview(
  bundle: SkillBundle,
  deps: SkillBundleReviewDeps,
  onProgress?: (p: SkillReviewProgress) => void,
  signal?: AbortSignal,
): Promise<SkillBundleReviewResult> {
  const mode: SkillReviewMode = 'standard';
  const skillName = bundle.skillName;
  const skillSchemaName = bundle.skillSchemaName;

  // Note: do NOT short-circuit on signal?.aborted before deterministic work.
  // We always run L0, integrity, and resource scan so that a 'cancelled' result
  // includes real findings. The post-deterministic abort check (below) returns
  // 'cancelled' with those findings and skips AI entirely.

  emitProgress(onProgress, 'deterministic-scan', `Scanning skill "${skillName}"`, skillName, 10, 0, 3);

  const fm = splitSkillMarkdown(bundle.skillMarkdown);
  const l0skill = {
    name: skillName,
    schemaname: skillSchemaName,
    markdown: bundle.skillMarkdown,
    frontmatterName: fm.name,
    frontmatterDescription: fm.description,
    body: fm.body,
    componentId: bundle.skillComponentId,
    componentIdUnique: bundle.skillComponentUniqueId,
    source: bundle.source,
    bundleMarker: bundle.bundleMarker,
    resourceCount: bundle.resources.length,
  };
  const l0 = analyzeSkillL0(l0skill);

  emitProgress(onProgress, 'deterministic-scan', `Analyzing bundle integrity`, skillName, 30, 1, 3);

  const integrity = analyzeBundleIntegrity(bundle);

  emitProgress(onProgress, 'deterministic-scan', `Scanning resources`, skillName, 50, 2, 3);

  const resourceFindings = bundle.resources.flatMap(scanSkillResource);
  const safetyEvidence = toSafetyEvidence(l0.safetyFindings, skillName);

  // Same list the workflow corpus carries — derived from the shared helper so
  // the two backends cannot disagree about what the deterministic layer found.
  const deterministicFindings: GroundedSkillFinding[] = [
    ...l0.frontmatterFindings.map(adaptGroundedToSkillFinding),
    ...safetyEvidence,
    ...integrity.findings,
    ...resourceFindings,
  ];

  if (signal?.aborted) {
    return {
      status: 'cancelled',
      mode,
      skillName,
      skillSchemaName,
      deterministicFindings,
      blocked: l0.blocked,
    };
  }

  // A skill with a safety finding is still evaluated.
  //
  // This used to return early on `l0.skipAiEvaluation`. That gate existed to keep
  // suspicious content away from the evaluating model, but it did not achieve
  // that: the worst a manipulated evaluator can do is return no findings, which
  // is exactly what skipping guaranteed. It paid that cost with certainty to
  // avoid a possibility of the same cost — and withheld analysis from the skills
  // that most need it.
  //
  // What makes evaluating safe is that the evaluator cannot act: no tools, no
  // knowledge, no network. Its findings must carry a registered ruleId and
  // evidence that is a verbatim substring of the corpus, so it cannot invent a
  // rule or fabricate a quote. `l0.blocked` and `safetyDisposition` are
  // unchanged and still drive severity and the blocked treatment in the UI.

  const provisioned = deps.standardProvisioned !== false;

  if (!provisioned) {
    emitProgress(onProgress, 'complete', `Standard AI unavailable — deterministic only`, skillName, 100, 3, 3);
    return {
      status: 'unavailable',
      mode,
      skillName,
      skillSchemaName,
      deterministicFindings,
      blocked: l0.blocked,
      aiEvaluationSkipped: false,
      error: 'Standard skill bundle evaluator (P2-N) is not provisioned.',
    };
  }

  emitProgress(onProgress, 'standard-ai', `Evaluating skill "${skillName}" with AI`, skillName, 70, 2, 3);

  try {
    // Collect paths with high/critical severity findings; redact their content from AI excerpts.
    const highRiskPaths = new Set<string>();
    for (const finding of deterministicFindings) {
      if ((finding.severity === 'high' || finding.severity === 'critical') && finding.resourcePath) {
        highRiskPaths.add(finding.resourcePath.toLowerCase());
      }
    }

    // Clear textContent on high-risk resources so the prompt builder skips them.
    const redactedBundle: typeof bundle = highRiskPaths.size > 0
      ? {
          ...bundle,
          resources: bundle.resources.map(r =>
            highRiskPaths.has(r.originalPath.toLowerCase()) || highRiskPaths.has(r.normalizedPath.toLowerCase())
              ? { ...r, textContent: undefined }
              : r,
          ),
        }
      : bundle;

    const promptInput = buildStandardPromptInput(redactedBundle, deterministicFindings);
    const sourceCorpus = buildBundleSourceCorpus(bundle);
    const aiResult = await deps.ai.invokeStandardSkillBundleEvaluator(promptInput, sourceCorpus);
    const result = removeUnknownUploadCapabilityClaims(aiResult, bundle);

    emitProgress(onProgress, 'complete', `Review complete for "${skillName}"`, skillName, 100, 3, 3);

    return {
      status: result.evaluation.status === 'complete' ? 'complete' : 'partial',
      mode,
      skillName,
      skillSchemaName,
      deterministicFindings,
      standardEvaluation: result.evaluation,
      validationIssues: result.issues,
      // A blocked skill is now evaluated rather than skipped, so the flag has to
      // survive the AI path — it drives the blocked treatment in the UI.
      blocked: l0.blocked,
      aiEvaluationSkipped: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    emitProgress(onProgress, 'complete', `AI evaluation failed for "${skillName}"`, skillName, 100, 3, 3);

    return {
      status: 'partial',
      mode,
      skillName,
      skillSchemaName,
      deterministicFindings,
      blocked: l0.blocked,
      aiEvaluationSkipped: false,
      error: message,
    };
  }
}
