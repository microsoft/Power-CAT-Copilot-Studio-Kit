/**
 * GitHub Copilot harness review orchestrator (spec 013 §6). Deterministic-first; AI stages
 * degrade gracefully rather than throwing out of the review.
 */
import type { BotComponent } from '../contracts/BotComponent.js';
import type { AgentsExperienceReviewPayload, ReviewStageStatus } from '../contracts/ReviewResult.js';
import type { GroundedFinding, GroundedSkillFinding, RuleEvaluationResult } from '../contracts/Findings.js';
import type { SkillBundleEvaluation, SkillSafetyFinding } from '../contracts/SkillEvaluation.js';
import type { InstructionCoverageResult } from '../contracts/AiCoverage.js';
import type {
  SkillBundle,
  RetrievalIssue,
  SkillReviewProgress,
} from '../contracts/SkillBundle.js';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel.js';
import { AI_MODEL_IDS, UNPROVISIONED_AI_MODEL_ID } from '../contracts/reviewModelIds.js';
import { parseAgentsExperience } from './AgentsExperienceParser.js';
import { runRules } from './GroundedRuleEngine.js';
import { analyzeSkillL0 } from './skill/L0SkillAnalyzer.js';
import { computeCoverage } from './EvaluationCoverageService.js';
import { computeGroundedScore, computePillarBreakdown, severityCounts, summarizeRuleResults } from './scoring.js';
import { gateFindings, gateSkillEval } from './CitationGate.js';
import {
  classifyInstructionCoverage,
  INSTRUCTION_RULE_IDS,
} from './skill/InstructionCoverageValidator.js';
import {
  executeSkillBundleReview,
  type SkillBundleReviewResult,
} from './SkillBundleReviewService.js';
import { buildOrchestrationPromptInput } from './skill/SkillPromptPayloadBuilder.js';
import type { CrossSkillOrchestrationEvaluation } from '../contracts/SkillEvaluation.js';
import type { OrchestrationValidationResult } from './skill/SkillEvaluationValidator.js';
import type { StandardTopicReview } from '../contracts/StandardReview.js';

/** Injectable AI surface (subset of AIService) so the orchestrator is testable. */
export interface ReviewAiPort {
  invokeSkillBundleEvaluator(input: {
    skillMarkdown: string; agentInstructions: string; siblingDescriptions: string; skillResources: string;
  }): Promise<SkillBundleEvaluation>;
  invokeInstructionCoverage(instructions: string, capabilityNames: string): Promise<InstructionCoverageResult>;
  /** Task 7 structured evaluator. When provided, the canonical bundle path uses it directly. */
  invokeStandardSkillBundleEvaluator?: (
    payload: import('./skill/SkillPromptPayloadBuilder.js').StandardPromptPayload,
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator.js').StandardValidationResult>;
  /** Deep P2-R: resource chunk evaluator (optional — only needed for deep mode). */
  invokeSkillResourceChunkEvaluator?: (
    payload: import('./skill/SkillPromptPayloadBuilder.js').ResourcePromptPayload,
    chunk: import('../contracts/SkillBundle.js').ResourceChunk,
  ) => Promise<import('./skill/SkillEvaluationValidator.js').ChunkValidationResult>;
  /** Deep P2-F: file synthesizer (optional — only needed for deep mode). */
  invokeSkillFileSynthesizer?: (
    payload: import('./skill/SkillPromptPayloadBuilder.js').FileSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator.js').ResourceValidationResult>;
  /** Deep P2-B: bundle synthesizer (optional — only needed for deep mode). */
  invokeDeepSkillBundleSynthesizer?: (
    payload: import('./skill/SkillPromptPayloadBuilder.js').BundleSynthesisPromptPayload,
    knownPaths: string[],
    sourceCorpus: string,
  ) => Promise<import('./skill/SkillEvaluationValidator.js').DeepBundleValidationResult>;
  /** Agent-level P2-O: cross-skill orchestration evaluator (optional). */
  invokeCrossSkillOrchestrator?: (
    payload: import('./skill/SkillPromptPayloadBuilder.js').OrchestrationPromptPayload,
    knownSkills: string[],
    sourceCorpus: string,
  ) => Promise<OrchestrationValidationResult>;
}

export interface ReviewDeps {
  getBotComponents(botId: string): Promise<BotComponent[]>;
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
}

const ELEMENT_LABELS: Record<InstructionCoverageResult['elements'][number]['key'], string> = {
  role: 'role and purpose', tone: 'tone and style', boundaries: 'decline/redirect boundaries',
  ambiguity: 'ambiguous-input handling', escalation: 'escalation triggers',
};

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
  };
}

export interface DeterministicReviewState {
  model: AgentsExperienceModel;
  outcome: ReturnType<typeof runRules>;
  findings: GroundedFinding[];
  deterministicResults: RuleEvaluationResult[];
  coverage: ReturnType<typeof computeCoverage>;
}

export function prepareDeterministicReview(
  configuration: string,
  components: readonly BotComponent[],
  onProgress?: (stage: string) => void,
): DeterministicReviewState {
  const model = parseAgentsExperience(
    configuration,
    [...components],
  );

  onProgress?.('Running grounded rules');
  const outcome = runRules(model);
  const findings: GroundedFinding[] = [...outcome.findings];
  const l0Byskill = new Map<string, ReturnType<typeof analyzeSkillL0>>();
  for (const skill of model.skills) {
    if (skill.source === 'zip-bundle') continue;
    const l0 = analyzeSkillL0(skill);
    l0Byskill.set(skill.schemaname, l0);
    findings.push(...l0.frontmatterFindings);
    const skl05 = skl05FromSafety(l0.skillName, l0.safetyFindings);
    if (skl05) findings.push(skl05);
  }

  const deterministicResults: RuleEvaluationResult[] = [
    ...outcome.ruleResults,
    ...[...l0Byskill.values()].flatMap(result => result.ruleResults),
  ];

  onProgress?.('Computing coverage');
  const coverage = computeCoverage(model);
  if (coverage.finding) findings.push(coverage.finding);

  if (model.unknownKinds.length > 0) {
    findings.push({
      id: 'AEX-01',
      family: 'Parsing',
      severity: 'warning',
      referenceId: 'ms-agents-overview',
      ai: false,
      title: `${model.unknownKinds.length} components did not match a known schema`,
      fact: model.unknownKinds
        .map(u => `${u.schemaname}: ${u.kind ?? 'parse error'}`)
        .join('\n'),
      why: 'These components were inventoried but not reviewed — extracted values may be incomplete.',
      fix: 'Verify the components render as expected; newer export shapes may need tool updates.',
    });
  }

  return {
    model,
    outcome,
    findings,
    deterministicResults,
    coverage,
  };
}

export interface ComposeCopilotReviewPayloadInput {
  model: AgentsExperienceModel;
  deterministicFindings: readonly GroundedFinding[];
  deterministicResults: readonly RuleEvaluationResult[];
  passedRuleCount: number;
  evaluatedRuleCount: number;
  coverage: ReturnType<typeof computeCoverage>;
  skillEvaluations?: readonly SkillBundleEvaluation[];
  skillBundleReviews?: readonly SkillBundleReviewResult[];
  topicReviews?: readonly StandardTopicReview[];
  bundleRetrievalIssues?: readonly RetrievalIssue[];
  crossSkillOrchestration?: CrossSkillOrchestrationEvaluation;
  skillReviewMode: 'standard' | 'deep';
  instructionCoverageStatus: ReviewStageStatus;
  instructionCoverageElements?: InstructionCoverageResult['elements'];
}

export function composeCopilotReviewPayload(
  input: ComposeCopilotReviewPayloadInput,
): AgentsExperienceReviewPayload {
  const findings: GroundedFinding[] = [...input.deterministicFindings];
  const topicReviews = [...(input.topicReviews ?? [])];
  findings.push(...topicReviews.flatMap(review => review.findings));
  const skillBundleReviews = [...(input.skillBundleReviews ?? [])];

  for (const review of skillBundleReviews) {
    for (const finding of review.deterministicFindings) {
      if (finding.ruleId.startsWith('SKL-')) continue;
      const mapped = mapSkillFindingToGrounded(finding, review.skillName);
      if (mapped) findings.push(mapped);
    }
    for (const finding of review.standardEvaluation?.findings ?? []) {
      const mapped = mapSkillFindingToGrounded(finding, review.skillName);
      if (mapped) findings.push(mapped);
    }
  }

  const hasInstructions = input.model.agentSettings.instructions.trim().length > 0;
  if (hasInstructions) {
    for (const element of input.instructionCoverageElements ?? []) {
      if (element.present) continue;
      const ruleId = INSTRUCTION_RULE_IDS[element.key];
      findings.push({
        id: ruleId,
        family: 'Instructions',
        severity: 'warning',
        referenceId: 'ms-authoring-instructions',
        ai: true,
        title: `Instructions do not state ${ELEMENT_LABELS[element.key]}`,
        fact: `element "${element.key}" not found in instructions`,
        why: 'Effective instructions cover the agent\'s role, tone, boundaries, ambiguity handling, and escalation.',
        fix: `Add ${ELEMENT_LABELS[element.key]} to the agent instructions.`,
      });
    }
  }
  if (
    hasInstructions
    &&
    input.instructionCoverageStatus.state === 'complete'
    && (input.instructionCoverageElements ?? []).every(
      (element) => element.present,
    )
  ) {
    findings.push({
      id: 'INS-02',
      family: 'Instructions',
      severity: 'info',
      referenceId: 'ms-authoring-instructions',
      ai: true,
      title: 'Instructions cover all five documented elements',
      fact: 'role, tone, boundaries, ambiguity handling, and escalation are all present',
      why: 'Microsoft\'s authoring guidance lists these five elements for effective instructions.',
      fix: 'No action required — surfaced as a positive finding.',
    });
  }

  const gated = gateFindings(findings);
  const counts = severityCounts(gated);
  const scoreInput = {
    model: input.model,
    findings: gated,
    ruleResults: [...input.deterministicResults],
    coverage: {
      covered: input.coverage.covered,
      total: input.coverage.total,
    },
  };
  const { hasFailed } = summarizeRuleResults([
    ...input.deterministicResults,
  ]);

  return {
    model: input.model,
    findings: gated,
    skillEvaluations: [...(input.skillEvaluations ?? [])],
    skillBundleReviews,
    ...(topicReviews.length ? { topicReviews } : {}),
    bundleRetrievalIssues: [...(input.bundleRetrievalIssues ?? [])],
    crossSkillOrchestration: input.crossSkillOrchestration,
    skillReviewMode: input.skillReviewMode,
    coverage: input.coverage.rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      cases: row.cases,
    })),
    coverageBasis: input.coverage.basis,
    coverageSets: input.coverage.sets,
    analysisStatus: {
      instructionCoverage: input.instructionCoverageStatus,
    },
    ruleResults: [...input.deterministicResults],
    score: {
      grounded: computeGroundedScore(scoreInput),
      passed: input.passedRuleCount,
      warnings: counts.warnings,
      errors: counts.errors,
      evaluated: input.evaluatedRuleCount,
      basisVersion: 2,
      status: hasFailed || topicReviews.some(review => review.status !== 'complete') ? 'partial' : 'complete',
      pillars: computePillarBreakdown(scoreInput),
    },
  };
}

export async function executeCopilotReview(
  botId: string,
  configuration: string,
  deps: ReviewDeps,
  onProgress?: (stage: string) => void,
  signal?: AbortSignal,
): Promise<AgentsExperienceReviewPayload> {
  onProgress?.('Loading components');
  if (signal?.aborted) throw new Error('Review cancelled');
  const components = await deps.getBotComponents(botId);
  if (signal?.aborted) throw new Error('Review cancelled');
  const {
    model,
    outcome,
    findings,
    deterministicResults,
    coverage,
  } = prepareDeterministicReview(configuration, components, onProgress);

  // ── Deterministic work is complete. ──
  // From this point, every post-deterministic branch uses a live signal?.aborted check
  // (not a stale snapshot) so that cancellation between individual branches is honoured.
  // AI stages are skipped on abort; the caller persists a meaningful partial result.

  // AI skill evaluation — use canonical bundles when available, fall back to legacy path
  const skillEvaluations: SkillBundleEvaluation[] = [];
  const skillBundleReviews: SkillBundleReviewResult[] = [];
  const bundleRetrievalIssues: RetrievalIssue[] = [];
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

    // Always evaluate returned bundles — even when signal is already aborted.
    // executeSkillBundleReview honours the signal internally: it runs deterministic
    // work regardless, then returns a 'cancelled' result (with findings) before AI.
    if (bundles.length > 0) {
      onProgress?.('Evaluating skill bundles');

      // Use Task 7's structured evaluator when available; fall back to legacy adapter.
      // NOTE: the legacy adapter cannot produce structured findings, resourcePurposeAlignment,
      // operationalAssumptions, or unreviewedResources — those fields are always empty.
      const bundleAiPort: import('./SkillBundleReviewService.js').SkillBundleReviewAiPort = {
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
        bundles.map((b, index) => executeSkillBundleReview(b, {
          ai: bundleAiPort,
          standardProvisioned: standardModelProvisioned,
          deepProvisioned: deepModelProvisioned,
        }, (progress) => reportBundleProgress(index, progress), signal)),
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

    // Agent-level cross-skill orchestration pass (P2-O): one call with the whole set.
    // Degrades gracefully — never throws out of the review when unprovisioned or failing.
    if (
      !signal?.aborted
      && bundles.length > 0
      && deps.ai.invokeCrossSkillOrchestrator
      && isProvisioned(deps.crossSkillOrchestrationModelId ?? AI_MODEL_IDS.SKILL_CROSS_SKILL_ORCHESTRATION)
    ) {
      onProgress?.('Evaluating cross-skill orchestration');
      try {
        const knownSkills = bundles.map(b => b.skillName);
        const sourceCorpus = bundles.map(b => b.skillMarkdown ?? '').join('\n\n');
        const payload = buildOrchestrationPromptInput(bundles, model.agentSettings.instructions);
        const result = await deps.ai.invokeCrossSkillOrchestrator(payload, knownSkills, sourceCorpus);
        crossSkillOrchestration = result.evaluation;
      } catch (err) {
        console.warn('[CopilotReview] cross-skill orchestration unavailable', err);
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
      if (gated.band !== 'Strong') {
        findings.push({
          id: 'SKL-04', family: 'Skills', severity: 'warning', referenceId: 'ms-skills-overview', ai: true,
          title: `Skill "${gated.name}" scored ${gated.overallScorePercent}% (${gated.band})`,
          fact: gated.dimensions.map(d => `${d.key}: ${d.score}/10`).join(' · '),
          why: gated.summary || 'One or more quality dimensions (clarity, actionability, scope, composability) need work.',
          fix: gated.dimensions.filter(d => d.score < 7).map(d => d.rationale).join(' ') || 'Strengthen the weaker dimensions.',
        });
      }
      for (const conflict of gated.crossSkillConflicts ?? []) {
        findings.push({
          id: 'SKL-06', family: 'Skills', severity: conflict.severity === 'error' ? 'error' : 'warning',
          referenceId: 'ms-skills-overview', ai: true,
          title: `Skill "${gated.name}" ${conflict.type} with "${conflict.withSkill}"`,
          fact: conflict.evidence, why: conflict.rationale,
          fix: 'Differentiate the skills so the orchestrator can select unambiguously.',
        });
      }
      for (const s of gated.safety.findings.filter(f => f.category === 'insufficient-guardrails')) {
        findings.push({
          id: 'SKL-10', family: 'Skills', severity: 'warning', referenceId: 'owasp-llm06', ai: true,
          title: `Skill "${gated.name}" lacks a guardrail for a risky action`,
          fact: s.evidence, why: s.rationale, fix: s.recommendation,
        });
      }
    }
  }

  // AI instruction coverage → INS-02..06 using INSTRUCTION_RULE_IDS.
  // Infrastructure status (Task 4) is tracked explicitly and independently of
  // findings — a classifier that never ran, failed, or was cancelled must
  // never be silently conflated with "no missing elements found".
  let instructionCoverageStatus: ReviewStageStatus;
  let instructionCoverageElements: InstructionCoverageResult['elements'] = [];
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
      const classification = classifyInstructionCoverage(rawCov, model.agentSettings.instructions);
      instructionCoverageStatus = classification.status;
      instructionCoverageElements = classification.elements;
    } catch (err) {
      console.warn('[CopilotReview] instruction coverage unavailable', err);
      instructionCoverageStatus = { state: 'failed', reason: 'invocation-failed' };
    }
  }

  return composeCopilotReviewPayload({
    model,
    deterministicFindings: findings,
    deterministicResults,
    passedRuleCount: outcome.passedRuleIds.length,
    evaluatedRuleCount: outcome.evaluated,
    coverage,
    skillEvaluations,
    skillBundleReviews,
    bundleRetrievalIssues,
    crossSkillOrchestration,
    skillReviewMode: deepModelProvisioned ? 'deep' : 'standard',
    instructionCoverageStatus,
    instructionCoverageElements,
  });
}
