/**
 * Microsoft Copilot harness review orchestrator (spec 013 §6). Deterministic-first; AI stages
 * degrade gracefully rather than throwing out of the review.
 */
import type { BotComponent } from '../../contracts/ServiceContracts';
import type { AgentsExperienceReviewPayload, ReviewStageStatus } from '../../contracts/ReviewResult';
import type { GroundedFinding, GroundedSkillFinding, RuleEvaluationResult } from '../contracts/Findings';
import type { SkillBundleEvaluation, SkillSafetyFinding } from '../contracts/SkillEvaluation';
import type { InstructionCoverageResult } from '../contracts/AiCoverage';
import type {
  SkillBundle,
  RetrievalIssue,
  SkillReviewProgress,
} from '../contracts/SkillBundle';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import { ReviewJobError } from '../contracts/ReviewJob';
import { detectAgentHarness, UnsupportedHarnessError } from './detection';
import { AI_MODEL_IDS, UNPROVISIONED_AI_MODEL_ID } from '../../contracts/Constants';
import { parseAgentsExperience } from './AgentsExperienceParser';
import { runRules } from './GroundedRuleEngine';
import { analyzeSkillL0 } from './skill/L0SkillAnalyzer';
import { computeCoverage } from './EvaluationCoverageService';
import { computeGroundedScore, computePillarBreakdown, severityCounts, summarizeRuleResults } from './scoring';
import { gateFindings, gateSkillEval } from './CitationGate';
import { classifyInstructionCoverage } from './skill/InstructionCoverageValidator';
import {
  crossSkillConflictFindings,
  instructionCoverageFindings,
  instructionCoverageRuleResults,
  skillBandFindings,
  unknownSchemaFindings,
} from './rules/skillCoverageAdapters';
import { INS_07 } from '../../review-core/rules/instructions.rules';
import type { InstructionCoverageAssessment } from '../../review-core/rules/skill-coverage.rules';
import {
  executeSkillBundleReview,
  type SkillBundleReviewResult,
} from './SkillBundleReviewService';
import { buildOrchestrationPromptInput } from './skill/SkillPromptPayloadBuilder';
import type { CrossSkillOrchestrationEvaluation } from '../contracts/SkillEvaluation';
import type { OrchestrationValidationResult } from './skill/SkillEvaluationValidator';
import type { CopilotRuleContext } from '../contracts/UnifiedReview';
import {
  buildCrossSkillSourceCorpus, getCrossSkillScope, modelWithCapturedSkillText,
} from './copilotSkillCapture';
import { withCopilotFindingGuidance } from './copilotContextualGuidance';

/** Injectable AI surface (subset of AIService) so the orchestrator is testable. */
export interface ReviewAiPort {
  /** Selects resource handling without using a model identifier as backend evidence. */
  aiBackend?: 'prompt' | 'workflow';
  invokeSkillBundleEvaluator(input: {
    skillMarkdown: string; agentInstructions: string; siblingDescriptions: string; skillResources: string;
  }): Promise<SkillBundleEvaluation>;
  /**
   * Instruction coverage.
   *
   * Returns null when the backend served no result (D-4: the workflow port does
   * not fall back to a paid AI Builder prompt), which the caller treats as the
   * stage being unavailable.
   */
  invokeInstructionCoverage(instructions: string, capabilityNames: string): Promise<InstructionCoverageResult | null>;
  /** Task 7 structured evaluator. When provided, the canonical bundle path uses it directly. */
  invokeStandardSkillBundleEvaluator?: (
    payload: import('./skill/SkillPromptPayloadBuilder').StandardPromptPayload,
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator').StandardValidationResult>;
  /** Deep P2-R: resource chunk evaluator (optional — only needed for deep mode). */
  invokeSkillResourceChunkEvaluator?: (
    payload: import('./skill/SkillPromptPayloadBuilder').ResourcePromptPayload,
    chunk: import('../contracts/SkillBundle').ResourceChunk,
  ) => Promise<import('./skill/SkillEvaluationValidator').ChunkValidationResult>;
  /** Deep P2-F: file synthesizer (optional — only needed for deep mode). */
  invokeSkillFileSynthesizer?: (
    payload: import('./skill/SkillPromptPayloadBuilder').FileSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator').ResourceValidationResult>;
  /** Deep P2-B: bundle synthesizer (optional — only needed for deep mode). */
  invokeDeepSkillBundleSynthesizer?: (
    payload: import('./skill/SkillPromptPayloadBuilder').BundleSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator').DeepBundleValidationResult>;
  /** Agent-level P2-O: cross-skill orchestration evaluator (optional). Null when unserved. */
  invokeCrossSkillOrchestrator?: (
    payload: import('./skill/SkillPromptPayloadBuilder').OrchestrationPromptPayload,
    knownSkills: string[],
    sourceCorpus: string,
  ) => Promise<OrchestrationValidationResult | null>;
}

export interface ReviewDeps {
  getBotComponents(botId: string): Promise<BotComponent[]>;
  /** Hosts with a partial capture must declare it rather than asserting an empty inventory. */
  availability?: CopilotRuleContext['availability'];
  /** Agent authentication mode from the bot record or bot.xml; undefined when not captured. */
  authenticationMode?: number;
  /** Agent template from the bot record or bot.xml. Rule 2 of the harness check needs it (issue 947). */
  template?: string;
  ai: ReviewAiPort;
  /** Provisioned AI model ids; the zero GUID means the prompt is not available. */
  skillEvalModelId?: string;
  coverageModelId?: string;
  /** Deep AI model ids. Zero GUID means the prompt is not provisioned. */
  skillResourceEvalModelId?: string;
  fileSynthesisModelId?: string;
  deepBundleSynthesisModelId?: string;
  /** Agent-level orchestration model id. Zero GUID means the prompt is not provisioned. */
  crossSkillOrchestrationModelId?: string;
  /** Retrieves assembled skill bundles. When supplied, replaces the legacy `skillResources: "[]"` path. */
  getSkillBundles?(
    botId: string,
    model: AgentsExperienceModel,
    orgUrl?: string | null,
    signal?: AbortSignal,
  ): Promise<SkillBundle[]>;
  /** Optional progress callback forwarded to each executeSkillBundleReview invocation (Task 9 events). */
  onSkillProgress?: (p: SkillReviewProgress) => void;
  /** Optional host context for stable effect identity across concurrently evaluated bundles. */
  runBundleReview?(
    bundle: SkillBundle, execute: () => Promise<SkillBundleReviewResult>,
  ): Promise<SkillBundleReviewResult>;
}

const isProvisioned = (id?: string): boolean => !!id && id !== UNPROVISIONED_AI_MODEL_ID;

function skl05FromSafety(
  skillName: string,
  safetyFindings: SkillSafetyFinding[],
): GroundedFinding | null {
  if (safetyFindings.length === 0) return null;
  const blocking = safetyFindings.some(
    f => f.safetyDisposition !== 'advisory'
      && (f.severity === 'critical' || f.severity === 'high'),
  );
  const platformOverlap = safetyFindings.every(f => f.platformOverlap === 'observed')
    ? 'observed'
    : 'unverified';
  return {
    id: 'SKL-05',
    family: 'Skills',
    severity: blocking ? 'error' : 'warning',
    referenceId: 'owasp-llm01',
    ai: false,
    title: blocking
      ? `Skill "${skillName}" contains an unverified security risk`
      : `Skill "${skillName}" contains a prepublish injection advisory`,
    fact: safetyFindings.map(f => `${f.id}: ${f.evidence}`).join('\n'),
    why: blocking
      ? 'The directive is hidden, obfuscated, or otherwise outside the platform behavior validated by ART.'
      : 'Copilot Studio runtime mitigation was observed for this visible injection category; ART still reports it as defense-in-depth authoring hygiene.',
    fix: 'Review the flagged directives and remove anything that overrides system or safety behavior before publishing.',
    safetyDisposition: blocking ? 'blocking' : 'advisory',
    platformOverlap,
    skipAiEvaluation: safetyFindings.some(
      f => f.skipAiEvaluation ?? (f.severity === 'critical' || f.severity === 'high'),
    ),
  };
}

/** Maps GroundedSkillFinding (skill severity) to GroundedFinding (display severity) for top-level merge. */
function mapSkillFindingToGrounded(sf: GroundedSkillFinding, skillName: string): GroundedFinding | null {
  if (!sf.referenceId) return null;
  const severity: GroundedFinding['severity'] =
    sf.safetyDisposition === 'advisory' ? 'warning'
    : sf.severity === 'critical' || sf.severity === 'high' ? 'error'
    : sf.severity === 'medium' ? 'warning' : 'info';
  return {
    id: sf.ruleId || sf.id, family: sf.family || 'Skills', severity,
    title: sf.title || `[${skillName}] ${sf.ruleId}`,
    fact: sf.fact || sf.evidence, why: sf.why, fix: sf.fix || sf.recommendation,
    referenceId: sf.referenceId, ai: sf.ai,
    safetyDisposition: sf.safetyDisposition,
    platformOverlap: sf.platformOverlap,
    skipAiEvaluation: sf.skipAiEvaluation,
    remediation: sf.remediation,
    findingTitle: sf.findingTitle,
    whyItMatters: sf.whyItMatters,
    makerAction: sf.makerAction,
    acceptanceCheck: sf.acceptanceCheck,
    suggestedText: sf.suggestedText,
  };
}

export async function executeCopilotReview(
  botId: string,
  configuration: string,
  deps: ReviewDeps,
  onProgress?: (stage: string) => void,
  signal?: AbortSignal,
): Promise<AgentsExperienceReviewPayload> {
  if (detectAgentHarness(configuration, deps.template).kind === 'unsupported') throw new UnsupportedHarnessError();
  onProgress?.('Loading components');
  if (signal?.aborted) throw new Error('Review cancelled');
  const components = await deps.getBotComponents(botId);
  const model = parseAgentsExperience(configuration, components, { authenticationMode: deps.authenticationMode });

  if (signal?.aborted) throw new Error('Review cancelled');
  onProgress?.('Running grounded rules');
  let outcome = runRules(model, deps.availability);
  const findings: GroundedFinding[] = [...outcome.findings];

  // L0 skill analysis — frontmatter, structure, and safety gate
  //
  // A zip-bundle skill's `markdown` here is only the `bic:bundle` marker: the
  // real SKILL.md is a child component that the bundle pipeline downloads later.
  // Analysing the marker reports the skill as having no name, no description and
  // an empty body — measured on ZAVA Training Hub, whose SKILL.md in fact
  // carries valid frontmatter and a four-step body. Those skills are analysed
  // properly by `computeDeterministicFindings` once their content is assembled,
  // so the marker is skipped here rather than judged.
  const l0Byskill = new Map<string, ReturnType<typeof analyzeSkillL0>>();
  for (const skill of model.skills) {
    if (skill.source === 'zip-bundle') continue;
    const l0 = analyzeSkillL0(skill);
    l0Byskill.set(skill.schemaname, l0);
    findings.push(...l0.frontmatterFindings);
    const skl05 = skl05FromSafety(l0.skillName, l0.safetyFindings);
    if (skl05) findings.push(skl05);
  }

  // Explicit deterministic rule-instance outcomes merged for score v2 (Task 3):
  // engine-level rules (one instance each) + per-skill L0 rule instances.
  const deterministicResults: RuleEvaluationResult[] = [
    ...outcome.ruleResults,
    ...[...l0Byskill.values()].flatMap(result => result.ruleResults),
  ];

  // Coverage + EVL-02
  onProgress?.('Computing coverage');
  const coverage = computeCoverage(model, deps.availability);
  if (coverage.finding) findings.push(coverage.finding);
  // Coverage judges per capability, so it contributes per-capability outcomes rather than one.
  // Without these the EVL-02 finding has no rows behind it and cannot be set aside capability by
  // capability; the Evaluation pillar reads coverage signals directly, so they carry no weight.
  deterministicResults.push(...coverage.ruleResults);

  // Unknown kinds → one warning finding
  findings.push(...unknownSchemaFindings(model));

  // ── Deterministic work is complete. ──
  // From this point, every post-deterministic branch uses a live signal?.aborted check
  // (not a stale snapshot) so that cancellation between individual branches is honoured.
  // AI stages are skipped on abort; the caller persists a meaningful partial result.

  // AI skill evaluation — use canonical bundles when available, fall back to legacy path
  const skillEvaluations: SkillBundleEvaluation[] = [];
  const skillBundleReviews: SkillBundleReviewResult[] = [];
  const bundleRetrievalIssues: RetrievalIssue[] = [];
  const capturedBundles: SkillBundle[] = [];
  let crossSkillOrchestration: CrossSkillOrchestrationEvaluation | undefined;
  const standardModelProvisioned = isProvisioned(deps.skillEvalModelId ?? AI_MODEL_IDS.SKILL_BUNDLE_EVAL);
  // Deep is the only review depth. When its prompts are unprovisioned the pipeline
  // silently degrades to the whole-skill pass and the payload records that reduced depth.
  const deepModelProvisioned =
    isProvisioned(deps.skillResourceEvalModelId ?? AI_MODEL_IDS.SKILL_RESOURCE_EVAL)
    && isProvisioned(deps.fileSynthesisModelId ?? AI_MODEL_IDS.SKILL_FILE_SYNTHESIS)
    && isProvisioned(deps.deepBundleSynthesisModelId ?? AI_MODEL_IDS.SKILL_DEEP_BUNDLE_SYNTHESIS);

  if (!signal?.aborted && deps.getSkillBundles) {
    onProgress?.('Assembling skill bundles');
    let bundles: SkillBundle[] = [];
    try {
      bundles = await deps.getSkillBundles(botId, model, undefined, signal);
    } catch (err) {
      if (err instanceof ReviewJobError && err.code === 'workflow-unavailable') {
        throw err;
      }
      // Distinguish cancellation from a genuine retrieval failure.
      // Either way, retrieval is non-fatal — deterministic results can still be persisted.
      if (signal?.aborted) {
        bundleRetrievalIssues.push({
          code: 'bundle-retrieval-cancelled',
          message: 'Skill bundle retrieval cancelled',
          severity: 'warning',
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        bundleRetrievalIssues.push({
          code: 'bundle-retrieval-failed',
          message: `Skill bundle retrieval failed: ${message}`,
          severity: 'error',
        });
      }
    }

    capturedBundles.push(...bundles);
    const capturedModel = modelWithCapturedSkillText(model, bundles);
    if (capturedModel !== model) {
      // Settle deferred content checks from the actual archive, not its marker.
      // Replace the base-engine prefixes so counts stay base-engine counts.
      const resolved = runRules(capturedModel, deps.availability);
      findings.splice(0, outcome.findings.length, ...resolved.findings);
      deterministicResults.splice(0, outcome.ruleResults.length, ...resolved.ruleResults);
      outcome = resolved;
    }
    // Always evaluate returned bundles — even when signal is already aborted.
    // executeSkillBundleReview honours the signal internally: it runs deterministic
    // work regardless, then returns a 'cancelled' result (with findings) before AI.
    if (bundles.length > 0) {
      onProgress?.('Evaluating skill bundles');

      // Use Task 7's structured evaluator when available; fall back to legacy adapter.
      // NOTE: the legacy adapter cannot produce structured findings, resourcePurposeAlignment,
      // operationalAssumptions, or unreviewedResources — those fields are always empty.
      const bundleAiPort: import('./SkillBundleReviewService').SkillBundleReviewAiPort = {
        aiBackend: deps.ai.aiBackend,
        invokeStandardSkillBundleEvaluator: deps.ai.invokeStandardSkillBundleEvaluator
          ? deps.ai.invokeStandardSkillBundleEvaluator
          : (payload) =>
              deps.ai.invokeSkillBundleEvaluator({
                skillMarkdown: payload.skill_markdown,
                agentInstructions: payload.agent_instructions,
                siblingDescriptions: payload.sibling_descriptions_json,
                skillResources: payload.resource_excerpts_json,
              }).then(legacy => ({
                evaluation: {
                  status: 'complete' as const,
                  dimensions: legacy.dimensions,
                  findings: [],
                  resourcePurposeAlignment: [],
                  operationalAssumptions: [],
                  unreviewedResources: [],
                  summary: legacy.summary,
                  referenceIds: legacy.citations?.map(c => c.id) ?? [],
                },
                issues: [],
              })),
        // Wire deep AI methods through when available
        invokeSkillResourceChunkEvaluator: deps.ai.invokeSkillResourceChunkEvaluator,
        invokeSkillFileSynthesizer: deps.ai.invokeSkillFileSynthesizer,
        invokeDeepSkillBundleSynthesizer: deps.ai.invokeDeepSkillBundleSynthesizer,
      };

      const latestProgress = new Map<number, SkillReviewProgress>();
      const reportBundleProgress = (bundleIndex: number, progress: SkillReviewProgress) => {
        if (!deps.onSkillProgress) return;
        latestProgress.set(bundleIndex, progress);
        const current = [...latestProgress.values()];
        deps.onSkillProgress({
          ...progress,
          percent: Math.round(
            bundles.reduce((sum, _, index) => sum + (latestProgress.get(index)?.percent ?? 0), 0)
              / bundles.length,
          ),
          completedUnits: current.reduce((sum, item) => sum + item.completedUnits, 0),
          totalUnits: current.reduce((sum, item) => sum + item.totalUnits, 0),
          partialFailures: current.reduce((sum, item) => sum + item.partialFailures, 0),
        });
      };

      const bundleResults = await Promise.allSettled(
        bundles.map((b, index) => {
          const execute = () => executeSkillBundleReview(b, {
            ai: bundleAiPort,
            standardProvisioned: standardModelProvisioned,
            deepProvisioned: deepModelProvisioned,
          }, (progress) => reportBundleProgress(index, progress), signal);
          return deps.runBundleReview ? deps.runBundleReview(b, execute) : execute();
        }),
      );
      for (const r of bundleResults) {
        if (r.status === 'fulfilled') {
          skillBundleReviews.push(r.value);
        } else {
          // Rejected promises are also propagated as explicit failures
          bundleRetrievalIssues.push({
            code: 'bundle-review-rejected',
            message: `Bundle review rejected: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
            severity: 'error',
          });
        }
      }
    }

    const guidanceContext = {
      model: modelWithCapturedSkillText(model, capturedBundles), skillBundleReviews,
    };
    // Merge bundle findings into top-level; skip SKL-prefixed ones (already added by orchestrator L0 pass).
    for (const review of skillBundleReviews) {
      const subjects = model.skills.filter(skill => skill.schemaname === review.skillSchemaName);
      const subjectId = subjects.length === 1 ? subjects[0].componentIdUnique : undefined;
      // Merge deterministic findings from bundle review (exclude orchestrator-level L0)
      for (const sf of review.deterministicFindings) {
        if (sf.ruleId.startsWith('SKL-')) continue; // already in findings from L0 pass
        const mapped = mapSkillFindingToGrounded(
          withCopilotFindingGuidance(sf, guidanceContext, subjectId), review.skillName,
        );
        if (mapped) findings.push(mapped);
      }
      // Merge validated AI findings from standard evaluation
      if (review.standardEvaluation?.findings) {
        for (const sf of review.standardEvaluation.findings) {
          const mapped = mapSkillFindingToGrounded(
            withCopilotFindingGuidance(sf, guidanceContext, subjectId), review.skillName,
          );
          if (mapped) findings.push(mapped);
        }
      }
    }

  } else if (!signal?.aborted && standardModelProvisioned) {
    // Legacy path: no assembled bundles available; use old `skillResources: "[]"` approach
    onProgress?.('Evaluating skills');
    // Every skill is evaluated. The old gate skipped skills with critical safety
    // findings, but the evaluator has no tools, and skipping produced the same
    // empty result a manipulated evaluator would — so it bought no safety while
    // losing the evaluation. The deterministic SKL-05 error stands regardless.
    const targets = model.skills;
    const results = await Promise.allSettled(targets.map(skill =>
      deps.ai.invokeSkillBundleEvaluator({
        skillMarkdown: skill.markdown,
        agentInstructions: model.agentSettings.instructions,
        siblingDescriptions: JSON.stringify(model.skills.filter(s => s !== skill)
          .map(s => ({ name: s.frontmatterName, description: s.frontmatterDescription }))),
        skillResources: '[]',
      })));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const gated = gateSkillEval(r.value);
      if (!gated) continue;
      skillEvaluations.push(gated);
      findings.push(...skillBandFindings(gated));
      findings.push(...crossSkillConflictFindings(gated));
      for (const s of gated.safety.findings.filter(f => f.category === 'insufficient-guardrails')) {
        findings.push({
          id: 'SKL-10', family: 'Skills', severity: 'warning', referenceId: 'owasp-llm06', ai: true,
          title: `Skill "${gated.name}" lacks a guardrail for a risky action`,
          fact: s.evidence, why: s.rationale, fix: s.recommendation,
        });
      }
    }
  }

  let crossSkillOrchestrationStatus: ReviewStageStatus;
  const crossSkillScope = getCrossSkillScope(
    model, deps.getSkillBundles ? capturedBundles : undefined, bundleRetrievalIssues, deps.availability,
  );
  if (signal?.aborted) {
    crossSkillOrchestrationStatus = { state: 'cancelled', reason: 'review-cancelled' };
  } else if (crossSkillScope.state !== 'applicable') {
    crossSkillOrchestrationStatus = crossSkillScope;
  } else if (!deps.ai.invokeCrossSkillOrchestrator
    || !isProvisioned(deps.crossSkillOrchestrationModelId ?? AI_MODEL_IDS.SKILL_CROSS_SKILL_ORCHESTRATION)) {
    crossSkillOrchestrationStatus = { state: 'unavailable', reason: 'unprovisioned' };
  } else {
    onProgress?.('Evaluating cross-skill orchestration');
    try {
      const knownSkills = capturedBundles.map(bundle => bundle.skillName);
      const sourceCorpus = buildCrossSkillSourceCorpus(model, capturedBundles);
      const prompt = buildOrchestrationPromptInput(capturedBundles, model.agentSettings.instructions);
      // The workflow has already run during prime(). This guard controls interpretation
      // and the later result read; it does not remove that workflow's AI call.
      const result = await deps.ai.invokeCrossSkillOrchestrator(prompt, knownSkills, sourceCorpus);
      if (!result) {
        crossSkillOrchestrationStatus = { state: 'unavailable', reason: 'missing-output' };
      } else {
        const complete = result.evaluation.status === 'complete'
          && !result.evaluation.parseError && result.issues.length === 0;
        crossSkillOrchestration = { ...result.evaluation, status: complete ? 'complete' : 'partial' };
        crossSkillOrchestrationStatus = complete
          ? { state: 'complete' } : { state: 'partial', reason: 'incomplete-response' };
      }
    } catch (err) {
      console.warn('[CopilotReview] cross-skill orchestration unavailable', err);
      crossSkillOrchestrationStatus = { state: 'failed', reason: 'invocation-failed' };
    }
  }

  // AI instruction coverage → INS-02..06, owned by the skill-coverage rules.
  // Infrastructure status (Task 4) is tracked explicitly and independently of
  // findings — a classifier that never ran, failed, or was cancelled must
  // never be silently conflated with "no missing elements found".
  let instructionCoverageStatus: ReviewStageStatus;
  // Carried out of the chain so the rows can be built once, below, for every
  // path. A bad path leaves `coverageAssessment` undefined and the rules then
  // answer `could-not-run` for all six ids rather than passing them.
  let coverageAssessment: InstructionCoverageAssessment | undefined;
  // Tri-state. `undefined` means no stage judged INS-07, which is distinct from
  // a completed stage that judged it and raised nothing.
  let namedCapability: boolean | undefined;
  const coverageModelId = deps.coverageModelId ?? AI_MODEL_IDS.INSTRUCTION_COVERAGE;
  const instructionsPresent = model.agentSettings.instructions.trim().length > 0;

  if (signal?.aborted) {
    instructionCoverageStatus = { state: 'cancelled', reason: 'review-cancelled' };
  } else if (!isProvisioned(coverageModelId)) {
    instructionCoverageStatus = { state: 'unavailable', reason: 'unprovisioned' };
  } else if (!instructionsPresent) {
    instructionCoverageStatus = { state: 'not-applicable', reason: 'empty-instructions' };
  } else {
    onProgress?.('Classifying instruction coverage');
    try {
      const capabilityNames = JSON.stringify([
        ...model.tools.map(t => t.name), ...model.skills.map(s => s.frontmatterName ?? s.name),
        ...model.connectedAgents.map(a => a.name), ...model.knowledge.map(k => k.name),
      ]);
      const rawCov = await deps.ai.invokeInstructionCoverage(model.agentSettings.instructions, capabilityNames);
      if (!rawCov) {
        // The workflow served no coverage row, and D-4 leaves no paid fallback to
        // stand in for it. Report the stage as unavailable rather than letting an
        // empty result read as five passing elements.
        instructionCoverageStatus = { state: 'failed', reason: 'invocation-failed' };
      } else {
        const classification = classifyInstructionCoverage(rawCov, model.agentSettings.instructions);
        instructionCoverageStatus = classification.status;
        coverageAssessment = classification;
        // INS-02..06 and the "covers all five" positive are now owned by the
        // skill-coverage rules; this projects their rows into the finding shape
        // the UI and the export already read.
        findings.push(...instructionCoverageFindings(classification));
        // INS-07 is judged on the same node but is not one of the five coverage
        // elements, so it leaves as a finding rather than as an element. The AI
        // Builder prompt path cannot judge it and says so by omitting `findings`
        // altogether; that absence stays `undefined` here so the rule answers
        // `could-not-run` rather than being credited a pass it never earned.
        const coverageFindings = rawCov.findings;
        namedCapability = coverageFindings?.some(finding => finding.id === INS_07.id);
        findings.push(...(coverageFindings ?? []));
      }
    } catch (err) {
      console.warn('[CopilotReview] instruction coverage unavailable', err);
      instructionCoverageStatus = { state: 'failed', reason: 'invocation-failed' };
      // Discard a classification that was taken before the throw: the stage is
      // failed, and letting a half-applied assessment survive would publish
      // passes under a status that says nothing was established.
      coverageAssessment = undefined;
      namedCapability = undefined;
    }
  }

  // INS-02..07 score. Until now the coverage rules produced findings and no
  // rows, so the scorer never saw them and setting one aside moved nothing.
  // Built for every path, including the bad ones: the rules answer
  // `could-not-run` when the classifier produced no verdict, which the scorer
  // drops from both sides of the ratio, so an unreachable AI workflow leaves
  // the deterministic score and its dismissals untouched.
  //
  // A row this review already carries wins: if something upstream genuinely
  // executed one of these rules, its verdict is better evidence than a
  // projection of the same assessment.
  deterministicResults.push(...instructionCoverageRuleResults(
    coverageAssessment ?? { status: instructionCoverageStatus, elements: [] },
    namedCapability,
  ).filter(row => !deterministicResults.some(existing => existing.ruleId === row.ruleId)));

  // Gate everything (defence in depth) and score (score v2 — Task 3).
  const gated = gateFindings(findings);
  const counts = severityCounts(gated);
  const passed = outcome.passedRuleIds.length;
  const scoreInput = {
    model,
    findings: gated,
    ruleResults: deterministicResults,
    coverage: { covered: coverage.covered, total: coverage.total, basis: coverage.basis },
  };
  const grounded = computeGroundedScore(scoreInput);
  const pillars = computePillarBreakdown(scoreInput);
  const { hasFailed } = summarizeRuleResults(deterministicResults);
  const guidanceContext = {
    model: modelWithCapturedSkillText(model, capturedBundles), skillBundleReviews,
  };

  return {
    model, findings: gated.map(finding => withCopilotFindingGuidance(finding, guidanceContext)),
    skillEvaluations, skillBundleReviews, bundleRetrievalIssues,
    crossSkillOrchestration,
    skillReviewMode: deepModelProvisioned ? 'deep' : 'standard',
    coverage: coverage.rows.map(r => ({ name: r.name, kind: r.kind, cases: r.cases })),
    coverageBasis: coverage.basis,
    coverageSets: coverage.sets,
    analysisStatus: {
      instructionCoverage: instructionCoverageStatus,
      crossSkillOrchestration: crossSkillOrchestrationStatus,
    },
    // Every evaluated rule instance and its outcome. Without this on the payload
    // there is nothing for persistence to save, and the "All checks" tab can
    // only ever say the per-check list was not recorded -- which it did, while
    // the summary rail cheerfully reported "13 of 25 passed" from `score`.
    ruleResults: deterministicResults,
    score: {
      grounded, passed, warnings: counts.warnings, errors: counts.errors, evaluated: outcome.evaluated,
      basisVersion: 2,
      status: hasFailed ? 'partial' : 'complete',
      pillars,
    },
  };
}
