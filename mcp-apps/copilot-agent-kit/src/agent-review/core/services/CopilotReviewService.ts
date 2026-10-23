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
  RetrievalIssue,
} from '../contracts/SkillBundle.js';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel.js';
import { parseAgentsExperience } from './AgentsExperienceParser.js';
import { runRules } from './GroundedRuleEngine.js';
import { analyzeSkillL0 } from './skill/L0SkillAnalyzer.js';
import { computeCoverage } from './EvaluationCoverageService.js';
import { computeGroundedScore, computePillarBreakdown, severityCounts, summarizeRuleResults } from './scoring.js';
import { gateFindings } from './CitationGate.js';
import {
  INSTRUCTION_RULE_IDS,
} from './skill/InstructionCoverageValidator.js';
import {
  type SkillBundleReviewResult,
} from './SkillBundleReviewService.js';
import type { CrossSkillOrchestrationEvaluation } from '../contracts/SkillEvaluation.js';
import type { StandardTopicReview } from '../contracts/StandardReview.js';

const ELEMENT_LABELS: Record<InstructionCoverageResult['elements'][number]['key'], string> = {
  role: 'role and purpose', tone: 'tone and style', boundaries: 'decline/redirect boundaries',
  ambiguity: 'ambiguous-input handling', escalation: 'escalation triggers',
};

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
