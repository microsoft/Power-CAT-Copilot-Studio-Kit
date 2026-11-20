/**
 * Workflow-backed implementation of the review AI surface (spec 014).
 *
 * The orchestrator calls `invokeStandardSkillBundleEvaluator` once per skill,
 * but the workflow reviews an entire agent in one run — paying the Dataverse
 * trigger latency once instead of once per skill. This provider bridges the two
 * shapes: `prime()` submits every component as a single job, and each per-skill
 * call is served from the completed batch.
 *
 * The agent node returns judgement and evidence only. Titles, explanations,
 * fixes and references come from the rule registry here, and every finding then
 * passes through the same `validateStandardEvaluation` gate the AI Prompt path
 * uses — so an unregistered rule or ungrounded evidence is dropped identically
 * on both backends.
 */
import type { SkillBundle } from '../../contracts/SkillBundle';
import type { GroundedSkillFinding } from '../../contracts/Findings';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import type {
  StandardSkillBundleEvaluation,
  SkillResourceEvaluation,
  CrossSkillOrchestrationEvaluation,
} from '../../contracts/SkillEvaluation';
import type { StandardPromptPayload } from '../skill/SkillPromptPayloadBuilder';
import type {
  StandardValidationResult,
  OrchestrationValidationResult,
} from '../skill/SkillEvaluationValidator';
import {
  validateStandardEvaluation,
  validateOrchestrationEvaluation,
} from '../skill/SkillEvaluationValidator';
import type { InstructionCoverageResult } from '../../contracts/AiCoverage';
import { validateInstructionCoverage } from '../skill/InstructionCoverageValidator';
import { createRegisteredFinding, getRule } from '../skill/skillRuleRegistry';
import { evidenceNamesCapability } from '../skill/capabilityEvidence';
import { buildReviewCorpus } from '../jobs/reviewCorpusBuilder';
import type { ReviewCorpus } from '../../contracts/ReviewJob';
import { AGENT_LEVEL_INDEX } from '../jobs/reviewJobMapping';
import { readWorkflowResourceResults } from '../jobs/workflowResourceResults';
import {
  arc2ToInstructionCoverage,
  arc2ToOrchestrationEvaluation,
  isArc2NodeOutput,
  parseArc2NodeOutput,
  parseBareArc2Result,
} from '../jobs/aiWorkflowNodeOutput';
import type { NodeKind } from '../../../review-core/rule';
import { pollReviewJob } from '../jobs/reviewJobPolling';
import {
  ReviewJobError,
  type AgentComponentResult,
  type AgentFinding,
  type ReviewCorpusKind,
  type ReviewHarnessName,
  type ReviewJobRow,
} from '../../contracts/ReviewJob';

/** Progress emitted while the workflow runs. */
export interface WorkflowJobProgress {
  phase: 'submitting' | 'queued' | 'running' | 'complete';
  message: string;
  componentCount: number;
  /** Components finished so far, counted from the child rows. */
  completedComponents?: number;
  /** Liveness ping from the workflow's last completed iteration, when present. */
  lastCompleted?: string;
}

export interface WorkflowProviderOptions {
  botId: string;
  botName: string;
  sourceEnvironment: string;
  onProgress?: (p: WorkflowJobProgress) => void;
  signal?: AbortSignal;
  /** Reports the durable Dataverse job id for app restart recovery. */
  onJobSubmitted?: (jobId: string) => void;
  /**
   * Attach to a job that is already running instead of submitting a new one.
   *
   * Set when a review is resumed after the browser that started it went away.
   * The corpus is already uploaded and the agent has either finished or is
   * still working, so submitting again would pay for the same AI call twice and
   * leave a duplicate job in the history.
   */
  existingJobId?: string;
  /**
   * Which workflow branch judges this job.
   *
   * The corpus carries this field and the workflow routes on it. Omit it for a
   * tenant agent review, which is the default and the only behaviour that
   * existed before uploads were split into portions.
   */
  jobKind?: ReviewCorpusKind;
  /** Harness that produced the agent. Recorded on the job row for trigger routing. */
  harness?: ReviewHarnessName;
  /** Durable hosts surface transport failures instead of treating them as missing stage output. */
  strictTransportErrors?: boolean;
}

/** Exact-job I/O injected at the host boundary; no generated SDK is imported by this core. */
export interface WorkflowJobPort {
  createReviewJob(corpus: ReviewCorpus, signal?: AbortSignal): Promise<string>;
  getReviewJob(jobId: string): Promise<ReviewJobRow>;
  getReviewJobResults(jobId: string, node?: NodeKind): Promise<AgentComponentResult[]>;
  getAgentLevelResult(jobId: string, index: number): Promise<unknown | null>;
  countCompletedComponents(jobId: string): Promise<number | undefined>;
}

/**
 * Batch-then-serve provider for the Standard skill bundle stage.
 *
 * Construct once per review, call {@link prime} with the assembled bundles, then
 * pass the instance's bound methods into `ReviewDeps.ai`.
 */
export class WorkflowReviewAiProviderCore {
  private batch: Promise<Map<string, AgentComponentResult>> | null = null;
  private bundlesByMarkdown = new Map<string, string>();
  private jobId: string | null = null;
  private submissionError: Error | null = null;
  private readonly options: WorkflowProviderOptions;
  private readonly jobs: WorkflowJobPort;

  /** Supply the original workflow semantics with host-specific exact-job transport. */
  constructor(options: WorkflowProviderOptions, jobs: WorkflowJobPort) {
    this.options = options;
    this.jobs = jobs;
  }

  /** Job row id, once submitted. Enables resume via `?job=`. */
  get submittedJobId(): string | null {
    return this.jobId;
  }

  /**
   * Submits every bundle as one review job and begins polling.
   *
   * Returns as soon as the job is created; the poll runs in the background so
   * the orchestrator can continue its deterministic work while the workflow
   * runs. The first per-skill call awaits completion.
   *
   * Browser defaults never throw; strict durable hosts opt into propagation.
   * A submission failure is otherwise recorded and re-raised from the
   * per-skill call instead, where the review service already degrades that
   * skill to a partial result and keeps its deterministic findings. Throwing
   * here would abort bundle assembly and lose the whole review — a backend
   * being unavailable must never be worse than that backend being disabled.
   *
   * Returns without submitting when there are no bundles to review.
   *
   * @param bundles - Every assembled skill bundle in the review.
   * @param findingsByBundle - Deterministic findings keyed by skill schema name.
   * @param model - Parsed agent model, for the configured-capability list.
   */
  async prime(
    bundles: SkillBundle[],
    findingsByBundle: Map<string, GroundedSkillFinding[]>,
    model: AgentsExperienceModel,
  ): Promise<void> {
    if (this.batch || this.submissionError) return;

    // Nothing to review. Submitting would create a job the workflow completes
    // with zero components, which costs a run and confuses the job history.
    if (bundles.length === 0) return;

    try {
      await this.submit(bundles, findingsByBundle, model);
      console.info(
        this.options.existingJobId
          ? `[CopilotReview] Attached to running workflow job ${this.jobId}.`
          : `[CopilotReview] Workflow job ${this.jobId} submitted for ${bundles.length} component(s).`,
      );
    } catch (err) {
      this.submissionError =
        err instanceof Error ? err : new Error(String(err));
      if (this.options.strictTransportErrors) throw this.submissionError;
      // Every skill call re-raises this, but a review with no AI-eligible skill
      // never makes one — so log here too rather than lose the cause entirely.
      console.error(
        '[CopilotReview] Workflow job submission failed; the review will fall back to deterministic findings.',
        this.submissionError,
      );
    }
  }

  /** The submission itself; separated so {@link prime} stays non-throwing. */
  private async submit(
    bundles: SkillBundle[],
    findingsByBundle: Map<string, GroundedSkillFinding[]>,
    model: AgentsExperienceModel,
  ): Promise<void> {
    // Correlate a later port call back to its component. The port payload
    // carries no skill name, so the unredacted markdown is the join key.
    this.bundlesByMarkdown = new Map(
      bundles.map((b) => [b.skillMarkdown, b.skillName]),
    );

    const { onProgress, signal, existingJobId } = this.options;

    const jobId = existingJobId ?? (await this.createJob(bundles, findingsByBundle, model));
    this.jobId = jobId;
    this.options.onJobSubmitted?.(jobId);

    if (existingJobId) {
      onProgress?.({
        phase: 'running',
        message: 'Collecting a review that was already running',
        componentCount: bundles.length,
      });
    } else {
      onProgress?.({
        phase: 'queued',
        message: 'Handing off to the review agent',
        componentCount: bundles.length,
      });
    }

    const batch = (async () => {
      await pollReviewJob({
        getJob: () => this.jobs.getReviewJob(jobId),
        signal,
        // One failed unit marks the whole job Failed, so without this every
        // component that *did* complete is thrown away with it: the agent-level
        // cross-skill reviewer failing would discard four healthy skill results
        // and report them as "did not complete". The rows that exist are read
        // either way — a component that genuinely failed still arrives marked
        // unassessed — and a job with no rows at all still fails hard.
        hasSalvageableResults: async () =>
          (await this.jobs.getReviewJobResults(jobId, this.componentNode())).length > 0,
        onPoll: async (row: ReviewJobRow) => {
          // A failed count must not fail the poll — progress is cosmetic, the
          // job row is what decides the outcome.
          const completed = await this.jobs.countCompletedComponents(jobId).catch(
            () => undefined,
          );
          onProgress?.({
            phase: 'running',
            message: `Review agent is analysing ${bundles.length} components`,
            componentCount: bundles.length,
            completedComponents: completed,
            lastCompleted: row.cat_laststatus,
          });
        },
      });

      const results = await this.jobs.getReviewJobResults(jobId, this.componentNode());

      onProgress?.({
        phase: 'complete',
        message: 'Review complete',
        componentCount: bundles.length,
      });

      return new Map(results.map((r) => [r.skillName, r]));
    })();

    // A review with no AI-eligible skills never awaits this promise, so give
    // the rejection a handler here to keep it off `unhandledrejection`.
    // `batch` itself stays rejected for the per-skill callers.
    batch.catch(() => undefined);
    this.batch = batch;
  }

  /** Builds the corpus and creates the job row. Only for a fresh submission. */
  private async createJob(
    bundles: SkillBundle[],
    findingsByBundle: Map<string, GroundedSkillFinding[]>,
    model: AgentsExperienceModel,
  ): Promise<string> {
    const { botId, botName, sourceEnvironment, onProgress } = this.options;

    onProgress?.({
      phase: 'submitting',
      message: 'Collecting agent components',
      componentCount: bundles.length,
    });

    const corpus = buildReviewCorpus(bundles, findingsByBundle, model, {
      correlationId: crypto.randomUUID(),
      botId,
      botName,
      sourceEnvironment,
      jobKind: this.options.jobKind,
      harness: this.options.harness,
    });

    return await this.jobs.createReviewJob(corpus, this.options.signal);
  }

  /**
   * Serves one skill's evaluation from the completed batch.
   *
   * Matches the port payload to its component by skill markdown, hydrates each
   * agent finding from the rule registry, then applies the standard validator.
   *
   * @param payload - Port payload built by `buildStandardPromptInput`.
   * @param sourceCorpus - Skill text used for evidence grounding.
   */
  invokeStandardSkillBundleEvaluator = async (
    payload: StandardPromptPayload,
    sourceCorpus: string,
  ): Promise<StandardValidationResult> => {
    // Surfaced here rather than from prime() so the review service's existing
    // per-skill handler degrades this skill and keeps its deterministic findings.
    if (this.submissionError) throw this.submissionError;

    if (!this.batch) {
      throw new ReviewJobError(
        'workflow-failed',
        'The workflow provider was used before prime() submitted the review job.',
      );
    }

    const results = await this.batch;
    const skillName = this.bundlesByMarkdown.get(payload.skill_markdown);
    const result = skillName ? results.get(skillName) : undefined;

    const deterministicFindings = parseDeterministicFindings(
      payload.deterministic_findings_json,
    );

    if (!result) {
      // The workflow returned nothing for this skill. Degrade to a partial
      // evaluation rather than failing the whole review.
      return validateStandardEvaluation(
        emptyEvaluation(
          `No workflow result was returned for "${skillName ?? 'this skill'}".`,
        ),
        sourceCorpus,
        deterministicFindings,
      );
    }

    return validateStandardEvaluation(
      toStandardEvaluation(result, sourceCorpus),
      sourceCorpus,
      deterministicFindings,
    );
  };

  /**
   * Cross-skill orchestration from the agent-level row (TASK 9000).
   *
   * Returns `null` when the workflow produced nothing, which the caller treats
   * as "use the AI Prompt backend for this stage". The node is optional: an
   * environment whose workflow predates it, or one where it failed while the
   * per-component rows succeeded, still gets the stage.
   *
   * @param knownSkills - Skill names the evaluation may reference.
   * @param sourceCorpus - Text used to ground the cited evidence.
   */
  invokeCrossSkillOrchestrator = async (
    knownSkills: string[],
    sourceCorpus: string,
  ): Promise<OrchestrationValidationResult | null> => {
    const raw = await this.readAgentLevelRow(AGENT_LEVEL_INDEX.ORCHESTRATION);
    if (!raw) return null;

    // A v4 node reports exceptions against component GUIDs; this stage is
    // validated in terms of skill names and a single grounded quote. Translate
    // at the boundary rather than loosening the validator, so every guard
    // downstream keeps running against a shape it already understands.
    //
    // The workflow writes this node's structured output with no v4 envelope
    // around it, so the bare reader is what matches in practice; the envelope
    // branch stays for rows written before that change.
    const v4 = parseArc2NodeOutput(raw) ?? parseBareArc2Result(raw, 'cross-skill');
    if (v4) {
      return validateOrchestrationEvaluation(
        arc2ToOrchestrationEvaluation(
          v4,
          await this.componentIdToSkillName(),
          knownSkills,
          sourceCorpus,
        ),
        knownSkills,
        sourceCorpus,
      );
    }

    // A row that announces itself as v4 and is still rejected by the v4 reader is
    // malformed, not legacy, and must not be re-read as the older shape. The
    // legacy validator defaults an absent `status` to "complete" and an absent
    // `findings` to `[]`, and a v4 envelope carries its findings under `result` --
    // so casting one here publishes a complete cross-skill evaluation with zero
    // findings. That is the same silent all-clear the v4 reader rejects the
    // payload to prevent, reached by a second route. Fall back instead.
    if (isArc2NodeOutput(raw)) return null;

    // The row is untyped JSON from the agent node; the validator is what decides
    // whether it is usable, so the cast only gets it past the signature.
    return validateOrchestrationEvaluation(
      raw as CrossSkillOrchestrationEvaluation,
      knownSkills,
      sourceCorpus,
    );
  };

  /**
   * Instruction coverage from the agent-level row (TASK 9001).
   *
   * Its validator throws on a malformed payload rather than degrading, so the
   * throw is caught here and turned into the same `null` the absent case uses --
   * a bad row must fall back, not fail the review.
   *
   * @param instructions - Agent instructions the coverage was computed against.
   */
  invokeInstructionCoverage = async (
    instructions: string,
  ): Promise<InstructionCoverageResult | null> => {
    const raw = await this.readAgentLevelRow(AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE);
    if (!raw) return null;

    // The v4 payload is translated and returned without the strict validator.
    // That validator exists to police *model* output -- exactly five elements,
    // each present one carrying a quote grounded in the instructions -- and an
    // exception-only node satisfies none of that by design: it names only the
    // rules it failed. The caller already runs `classifyInstructionCoverage`,
    // which is the lenient gate this shape is built for.
    //
    // The bare reader is what matches today: the node's output is written with
    // no v4 envelope, which the strict validator below rejects outright -- so
    // every coverage finding was being dropped and the stage reported as failed.
    const v4 = parseArc2NodeOutput(raw) ?? parseBareArc2Result(raw, 'copilot-instructions');
    if (v4) return arc2ToInstructionCoverage(v4);

    // As above: a rejected v4 envelope is malformed rather than legacy. The
    // strict validator below happens to reject it too, so this changes no
    // behaviour today -- it pins that outcome to the payload's own contract
    // rather than to a validator that is free to start degrading instead.
    if (isArc2NodeOutput(raw)) return null;

    try {
      return validateInstructionCoverage(raw as InstructionCoverageResult, instructions);
    } catch (err) {
      console.warn(
        '[CopilotReview] Workflow instruction coverage was malformed; falling back to the AI Prompt backend.',
        err,
      );
      return null;
    }
  };

  /**
   * Which reviewer produced this review's component rows.
   *
   * A component row looks identical whichever skill harness ran, so the node
   * cannot be read back off the row; the job's kind is what distinguishes them.
   * It matters because the two harnesses map the same shared rules onto
   * different pillars, so a failed component must name the right set.
   */
  private componentNode(): NodeKind {
    return this.options.jobKind === 'ArtifactBundle' ? 'standalone-skill' : 'copilot-skill';
  }

  /**
   * Maps a component GUID to the skill name the rest of the app keys on.
   *
   * The cross-skill node cites components by id, while every consumer of this
   * stage -- the validator's known-skill check included -- speaks skill names.
   * The map is recovered by inverting the batch the provider already holds:
   * each component result carries the `unitId` the node cited alongside the
   * name it was looked up by, so no extra read or corpus parse is needed.
   *
   * An empty map is a safe answer: the translator then falls back to naming the
   * whole known set, which is the right subject for a set-level finding anyway.
   */
  private async componentIdToSkillName(): Promise<ReadonlyMap<string, string>> {
    const byId = new Map<string, string>();
    if (!this.batch) return byId;
    let results: Map<string, AgentComponentResult>;
    try {
      results = await this.batch;
    } catch {
      return byId;
    }
    for (const [skillName, result] of results) {
      const unitId = result.arc2?.unitId;
      if (unitId && skillName) byId.set(unitId, skillName);
    }
    return byId;
  }

  /**
   * Reads one agent-level row once the batch has settled.
   *
   * Every failure resolves to `null` so a missing row, a failed job and a
   * transient read error are indistinguishable to the caller -- all three mean
   * the same thing: this stage must fall back.
   */
  private async readAgentLevelRow(index: number): Promise<unknown | null> {
    if (this.submissionError || !this.batch || !this.jobId) return null;
    try {
      await this.batch;
    } catch {
      // A failed job can still have written a usable agent-level row.
    }
    if (this.options.strictTransportErrors) return this.jobs.getAgentLevelResult(this.jobId, index);
    return this.jobs.getAgentLevelResult(this.jobId, index).catch(() => null);
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/** Deterministic findings arrive as JSON text on the port payload. */
function parseDeterministicFindings(json: string): GroundedSkillFinding[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as GroundedSkillFinding[]) : [];
  } catch {
    return [];
  }
}

/** A valid but empty evaluation, used when a component has no workflow result. */
function emptyEvaluation(summary: string): StandardSkillBundleEvaluation {
  return {
    status: 'partial',
    dimensions: [],
    findings: [],
    resourcePurposeAlignment: [],
    operationalAssumptions: [],
    unreviewedResources: [],
    summary,
    referenceIds: [],
  };
}

/**
 * The per-instance narrative a v4 node attaches to one finding.
 *
 * Deterministic findings carry none of it, which is what makes the overlay in
 * {@link applyAiNarrative} safe: a scanner finding keeps the registry wording.
 */
type AiNarrative = Pick<
  AgentFinding,
  'findingTitle' | 'whyItMatters' | 'makerAction' | 'acceptanceCheck' | 'suggestedText'
>;

/**
 * Overlays a node's per-instance narrative onto a registry-built finding.
 *
 * The registry owns the *rule* — its reference, its ordered remediation steps,
 * its rubric dimension — and the model owns this *instance* of it. Before this,
 * every v4 narrative field a node returned was discarded at the
 * `createRegisteredFinding` rebuild, so a grounded, agent-specific headline such
 * as "unslop forbids the exact closing phrase react-email-v2 mandates" was
 * replaced by the static rule title "Contradictory Skill Guidance" and the
 * maker never saw the reasoning the review paid for.
 *
 * AI wins wherever the model spoke. `title`, `why` and `fix` are the fields the
 * list and detail panes already render, so the narrative is written into them
 * *as well as* being carried separately — a pane that has not been taught the
 * new fields still shows the better text.
 */
function applyAiNarrative<T extends GroundedSkillFinding>(
  finding: T,
  narrative?: AiNarrative,
): T {
  if (!narrative) return finding;
  const findingTitle = narrative.findingTitle?.trim() || undefined;
  const whyItMatters = narrative.whyItMatters?.trim() || undefined;
  const makerAction = narrative.makerAction?.trim() || undefined;
  const acceptanceCheck = narrative.acceptanceCheck?.trim() || undefined;
  const suggestedText = narrative.suggestedText?.trim() || undefined;

  return {
    ...finding,
    title: findingTitle ?? finding.title,
    why: whyItMatters ?? finding.why,
    fix: makerAction ?? finding.fix,
    recommendation: makerAction ?? finding.recommendation,
    findingTitle,
    whyItMatters,
    makerAction,
    acceptanceCheck,
    suggestedText,
  };
}

/**
 * Converts one agent result into the evaluation contract the validator expects.
 *
 * Findings carrying an unregistered `ruleId` are dropped here rather than being
 * passed on for the validator to reject — the outcome is identical and the
 * reason is clearer. That only holds while the registry is complete: every rule
 * a node can cite must be registered, or a well-evidenced finding disappears
 * here with no log and no error. The `SKL-AI-*` projection in
 * `skillRuleRegistry.ts` exists for exactly that reason.
 *
 * @param result - Raw structured output from one workflow agent action.
 * @param sourceCorpus - Submitted text used to verify a contradiction's second quote.
 */
export function toStandardEvaluation(
  result: AgentComponentResult,
  sourceCorpus: string = '',
): StandardSkillBundleEvaluation {
  const findings: GroundedSkillFinding[] = [];
  const findingIndexes = new Map<string, number>();

  const addFinding = (
    ruleId: string | undefined,
    evidenceValue: string | undefined,
    resourcePathValue: string | undefined,
    narrative?: AiNarrative,
    quotes?: readonly string[],
  ): void => {
    const rule = ruleId ? getRule(ruleId) : undefined;
    const fact = canonicalizeQuotedEvidence(evidenceValue);
    if (!rule || !fact) return;

    // `fact` reads well; only a verbatim quote survives the grounding check.
    // They are the same string on every path that supplies no quotes, so the
    // legacy shapes below are unaffected.
    const evidence = selectGroundedEvidence(quotes, sourceCorpus) ?? fact;

    const resourcePath = (resourcePathValue ?? '').trim() || undefined;
    const key = `${rule.ruleId}\u0000${fact.toLowerCase()}`;
    const hydrated = applyAiNarrative(
      {
        ...createRegisteredFinding(rule.ruleId, {
          resourcePath,
          evidence,
          fact,
        }),
        ai: true,
      },
      narrative,
    );
    const existingIndex = findingIndexes.get(key);

    if (existingIndex === undefined) {
      findingIndexes.set(key, findings.length);
      findings.push(hydrated);
      return;
    }

    // Custom structured output can omit a required field. Prefer the checklist
    // copy when it adds a path, but never show the same quoted fact twice.
    if (!findings[existingIndex].resourcePath && resourcePath) {
      findings[existingIndex] = hydrated;
    }
  };

  for (const finding of result.findings ?? []) {
    addFinding(finding?.ruleId, finding?.evidence, finding?.resourcePath, finding, finding?.evidenceQuotes);
  }

  const referenceIds = [
    ...new Set(findings.flatMap((f) => f.referenceIds as string[])),
  ];
  const resourceResults = readWorkflowResourceResults(result.resources);

  return {
    // Custom structured output does not enforce `required` — default it.
    status: resourceResults.rejected
      || resourceResults.resources?.some(resource => resource.status !== 'complete')
      ? 'partial' : result.status ?? 'complete',
    dimensions: normalizeDimensions(result.dimensions),
    findings,
    resourcePurposeAlignment: result.resourcePurposeAlignment ?? [],
    operationalAssumptions: result.operationalAssumptions ?? [],
    unreviewedResources: result.unreviewedResources ?? [],
    summary: result.summary ?? '',
    referenceIds,
    resources: mapResources(resourceResults.resources),
    capabilityEdges: mapCapabilityEdges(result.capabilityEdges),
  };
}

function canonicalizeQuotedEvidence(value: string | undefined): string {
  const evidence = (value ?? '').trim();
  const withoutListMarker = evidence.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
  return withoutListMarker || evidence;
}

/**
 * Picks the quote that is provably present in the reviewed source.
 *
 * The validator grounds a finding with a literal substring test, so a quote that
 * is merely *a* quote is not enough — it has to be a quote from *this* corpus. A
 * node legitimately cites across scopes (a skill rule may quote the parent
 * agent's instructions to show the mismatch it is reporting), and when the
 * review submits only the skill bundle, that quote is real but ungroundable
 * here. Scanning in order and taking the first grounded quote keeps the finding
 * alive on the evidence this review can actually verify.
 *
 * The first quote is returned unchanged when none is grounded, rather than
 * nothing: that leaves the finding to be judged by the validator — which is the
 * component that owns the decision — instead of being discarded silently by a
 * helper. Quotes are canonicalised first, because that is the form that will be
 * stored and therefore the form the validator will test.
 */
function selectGroundedEvidence(
  quotes: readonly string[] | undefined,
  sourceCorpus: string,
): string | undefined {
  if (!quotes?.length) return undefined;
  const canonical = quotes
    .map((quote) => canonicalizeQuotedEvidence(quote))
    .filter((quote) => quote.length > 0);
  if (canonical.length === 0) return undefined;
  if (!sourceCorpus) return canonical[0];

  const haystack = sourceCorpus.toLowerCase();
  return canonical.find((quote) => haystack.includes(quote.toLowerCase())) ?? canonical[0];
}

const RISK_LEVELS = ['none', 'info', 'medium', 'high', 'critical'] as const;
const READINESS = ['ready', 'needs-configuration', 'unsupported', 'unknown'] as const;

function isMember<T extends string>(value: unknown, values: readonly T[]): value is T {
  return values.some(candidate => candidate === value);
}

/**
 * Per-resource analysis returned alongside the skill evaluation.
 *
 * The workflow agent receives every resource's text in one payload, so it
 * analyses them in the same call. Its presence is what lets the deep facade skip
 * the chunk/synthesise cascade entirely -- see `executeDeepSkillBundleReview`.
 *
 * An absent list stays unassessed. Workflow mode never falls back to deep prompts.
 */
function mapResources(
  resources: ReturnType<typeof readWorkflowResourceResults>['resources'],
): SkillResourceEvaluation[] | undefined {
  if (!Array.isArray(resources) || resources.length === 0) return undefined;

  return resources
    .filter((r) => r?.resourcePath)
    .map((r) => {
      const findings: GroundedSkillFinding[] = [];
      for (const f of r.findings ?? []) {
        if (!f?.ruleId || !getRule(f.ruleId) || !f.evidence) continue;
        findings.push(
          applyAiNarrative(
            {
              ...createRegisteredFinding(f.ruleId, {
                resourcePath: f.resourcePath ?? r.resourcePath,
                evidence: f.evidence,
                fact: f.evidence,
              }),
              ai: true,
            },
            f,
          ),
        );
      }

      return {
        resourcePath: r.resourcePath,
        status: r.status,
        riskLevel: isMember(r.riskLevel, RISK_LEVELS)
          ? r.riskLevel
          : 'info',
        readiness: isMember(r.readiness, READINESS)
          ? r.readiness
          : 'unknown',
        observedBehaviors: r.observedBehaviors ?? [],
        dependencies: r.dependencies ?? [],
        externalEndpoints: r.externalEndpoints ?? [],
        capabilities: r.capabilities ?? [],
        runtimeAssumptions: r.runtimeAssumptions ?? [],
        findings,
        purposeAlignment: r.purposeAlignment ?? { matches: false, rationale: '' },
        analyzedChunks: r.status === 'complete' || r.status === 'partial' ? 1 : 0,
        totalChunks: 1,
        referenceIds: [...new Set(findings.flatMap((f) => f.referenceIds as string[]))],
      } satisfies SkillResourceEvaluation;
    });
}

const EDGE_USAGES = ['read', 'write', 'invoke', 'delegate', 'reference'] as const;
const EDGE_CONFIDENCE = ['high', 'medium', 'low'] as const;

/**
 * TASK 7 capability edges, de-duplicated and evidence-gated.
 *
 * An edge whose cited evidence does not actually name the capability is dropped:
 * a line on a diagram reads as fact, and the model has been observed citing a
 * span that names a different capability entirely.
 */
function mapCapabilityEdges(
  edges: AgentComponentResult['capabilityEdges'],
): StandardSkillBundleEvaluation['capabilityEdges'] {
  if (!Array.isArray(edges)) return undefined;

  const seen = new Set<string>();
  const mapped: NonNullable<StandardSkillBundleEvaluation['capabilityEdges']> = [];

  for (const edge of edges) {
    const capabilityName = (edge?.capabilityName ?? '').trim();
    const evidence = (edge?.evidence ?? '').trim();
    if (!capabilityName || !evidence) continue;
    if (!evidenceNamesCapability(capabilityName, evidence)) continue;
    if (seen.has(capabilityName)) continue;

    seen.add(capabilityName);
    mapped.push({
      capabilityName,
      usage: (EDGE_USAGES as readonly string[]).includes(edge.usage ?? '')
        ? edge.usage
        : 'reference',
      evidence,
      confidence: (EDGE_CONFIDENCE as readonly string[]).includes(edge.confidence ?? '')
        ? edge.confidence
        : 'low',
    } as NonNullable<StandardSkillBundleEvaluation['capabilityEdges']>[number]);
  }

  return mapped;
}

/** The four rubric dimension keys the validator accepts. */
const DIMENSION_KEYS = [
  'Clarity',
  'Actionability',
  'Scope discipline',
  'Composability',
] as const;
type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * Drops any dimension whose key is outside the fixed rubric. The validator
 * rejects the whole evaluation on an unknown key, so filtering here degrades a
 * malformed dimension list instead of losing every finding with it.
 */
function normalizeDimensions(
  dimensions: Array<{
    key: string;
    score: number;
    rationale: string;
    evidence?: string;
    improvement?: string;
  }> | undefined,
): StandardSkillBundleEvaluation['dimensions'] {
  if (!Array.isArray(dimensions)) return [];
  return dimensions
    .filter((d): d is {
      key: DimensionKey;
      score: number;
      rationale: string;
      evidence?: string;
      improvement?: string;
    } =>
      (DIMENSION_KEYS as readonly string[]).includes(d?.key),
    )
    .map((d) => ({
      key: d.key,
      score: d.score,
      rationale: d.rationale,
      ...(d.evidence?.trim() ? { evidence: d.evidence.trim() } : {}),
      ...(d.improvement?.trim() ? { improvement: d.improvement.trim() } : {}),
    }));
}
