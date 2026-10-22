import type {
  ReviewStageStatus,
} from '../contracts/ReviewResult.js';
import type {
  ResourceChunk,
  SkillBundle,
  SkillBundleResource,
  SkillBundleReviewResult,
  SkillReviewMode,
} from '../contracts/SkillBundle.js';
import {
  composeCopilotReviewPayload,
} from '../services/CopilotReviewService.js';
import type {
  CoverageResult,
} from '../services/EvaluationCoverageService.js';
import {
  summarizeRuleResults,
} from '../services/scoring.js';
import {
  deepEvaluationFromStandard,
} from '../services/skill/deepFacade.js';
import {
  buildPersistedCopilotReview,
} from '../services/skill/persistedSkillReview.js';
import {
  getWorkflowSkillResultIdentity,
} from './readWorkflowResults.js';
import type {
  AgentReviewRecordData,
  CompletedReview,
  ComposeReviewInput,
  FinalizationBundleSnapshot,
  FinalizationResourceStats,
} from './contracts.js';

function placeholderChunks(
  resource: Omit<SkillBundleResource, 'textContent' | 'chunks'>,
  stats: FinalizationResourceStats | undefined,
): ResourceChunk[] {
  return Array.from({ length: stats?.chunkCount ?? 0 }, (_, index) => ({
    chunkId: `${resource.normalizedPath}:snapshot:${index}`,
    resourcePath: resource.normalizedPath,
    index,
    startLine: 0,
    endLine: 0,
    content: '',
    contentHash: '',
    overlapBeforeLines: 0,
    overlapAfterLines: 0,
  }));
}

function reconstructBundle(
  snapshot: FinalizationBundleSnapshot,
): SkillBundle {
  const statsByResource = new Map(
    snapshot.resourceStats.map((stats) => [stats.resourceId, stats]),
  );
  return {
    ...snapshot.bundle,
    resources: snapshot.bundle.resources.map((resource) => {
      const stats = statsByResource.get(resource.id);
      return {
        ...resource,
        textContent: stats?.isEmpty
          ? ''
          : (stats?.textLength ?? 0) > 0
            ? 'x'
            : undefined,
        chunks: placeholderChunks(resource, stats),
      };
    }),
  };
}

function coverageFromSnapshot(
  input: ComposeReviewInput,
): CoverageResult {
  const rows = input.snapshot.deterministic.coverage.map((row) => ({
    ...row,
    caseNames: [],
  }));
  const uncovered = rows.filter((row) => row.cases === 0);
  return {
    rows,
    covered: rows.length - uncovered.length,
    total: rows.length,
    uncoveredNames: uncovered.map((row) => row.name),
    basis: input.snapshot.deterministic.coverageBasis,
    declaringCases: 0,
    sets: [...input.snapshot.deterministic.coverageSets],
    finding: null,
  };
}

function instructionStatus(
  input: ComposeReviewInput,
): ReviewStageStatus {
  switch (input.workflow.instructionCoverage.state) {
    case 'complete':
      return { state: 'complete' };
    case 'partial':
      return { state: 'partial', reason: 'incomplete-response' };
    case 'failed':
      return { state: 'failed', reason: 'invocation-failed' };
    default:
      return { state: 'unavailable', reason: 'unprovisioned' };
  }
}

function buildBundleReviews(
  input: ComposeReviewInput,
): {
  reviews: SkillBundleReviewResult[];
  mode: SkillReviewMode;
} {
  const resultBySchema = new Map(
    input.workflow.skillResults.flatMap((result) => {
      const identity = getWorkflowSkillResultIdentity(result);
      return identity ? [[identity, result] as const] : [];
    }),
  );
  let positionalIndex = 0;
  const reviews: SkillBundleReviewResult[] = [];

  for (const bundleSnapshot of input.snapshot.bundles) {
    const result = resultBySchema.get(
      bundleSnapshot.bundle.skillSchemaName,
    ) ?? input.workflow.skillResults[positionalIndex++];
    if (!result) continue;
    const standardEvaluation = result.evaluation;
    const hasDeepResources = (standardEvaluation.resources?.length ?? 0) > 0;
    reviews.push({
      status: standardEvaluation.status === 'complete'
        ? 'complete'
        : 'partial',
      mode: hasDeepResources ? 'deep' : 'standard',
      skillName: bundleSnapshot.bundle.skillName,
      skillSchemaName: bundleSnapshot.bundle.skillSchemaName,
      deterministicFindings: [...bundleSnapshot.deterministicFindings],
      standardEvaluation,
      deepEvaluation: hasDeepResources
        ? deepEvaluationFromStandard(standardEvaluation)
        : undefined,
      validationIssues: result.issues,
      blocked: false,
      aiEvaluationSkipped: false,
    });
  }

  return {
    reviews,
    mode: reviews.some((review) => review.mode === 'deep')
      ? 'deep'
      : 'standard',
  };
}

export async function composeReview(
  input: ComposeReviewInput,
): Promise<CompletedReview> {
  const { reviews, mode } = buildBundleReviews(input);
  const ruleSummary = summarizeRuleResults([
    ...input.snapshot.deterministic.ruleResults,
  ]);
  const payload = composeCopilotReviewPayload({
    model: input.snapshot.model,
    deterministicFindings: input.snapshot.deterministic.findings,
    deterministicResults: input.snapshot.deterministic.ruleResults,
    passedRuleCount: ruleSummary.passed,
    evaluatedRuleCount: ruleSummary.evaluated,
    coverage: coverageFromSnapshot(input),
    skillBundleReviews: reviews,
    topicReviews: input.workflow.topicResults,
    skillReviewMode: mode,
    crossSkillOrchestration:
      input.workflow.orchestration.value?.evaluation,
    instructionCoverageStatus: instructionStatus(input),
    instructionCoverageElements:
      input.workflow.instructionCoverage.value?.elements,
  });
  if (input.workflow.disposition === 'salvaged-partial') payload.score.status = 'partial';

  const persisted = buildPersistedCopilotReview({
    payload,
    bundles: input.snapshot.bundles.map(reconstructBundle),
    mode,
    startedAt: input.snapshot.startedAt,
    completedAt: input.workflow.completedAt,
  });
  const completedAt = new Date(input.workflow.completedAt);
  const startedAtMs = Date.parse(input.snapshot.startedAt);
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, completedAt.getTime() - startedAtMs)
    : 0;
  const score = persisted.payload.score;
  const storedScore = score.grounded ?? 0;
  const reviewResultJson = JSON.stringify({
    botId: input.snapshot.identity.botId,
    botName: input.snapshot.identity.botName,
    agentInstructions: '',
    agentsExperience: persisted.payload,
    overallScore: score.grounded,
    durationMs,
    timestamp: completedAt.toISOString(),
    execution: {
      jobId: input.workflow.jobId,
      correlationId: input.workflow.correlationId,
      startedAt: input.snapshot.startedAt,
      completedAt: input.workflow.completedAt,
      coreVersion: input.snapshot.coreVersion,
    },
  });

  const review = {
    botId: input.snapshot.identity.botId,
    componentIdUnique: input.snapshot.identity.componentIdUnique,
    botName: input.snapshot.identity.botName,
    overallScore: storedScore,
    patternScore: storedScore,
    instructionScore: storedScore,
    highSeverityCount: score.errors,
    mediumSeverityCount: score.warnings,
    lowSeverityCount: 0,
    totalIssueCount: score.errors + score.warnings,
    reviewedOn: completedAt,
    durationMs,
    status: 'completed' as const,
    sourceEnvironment: input.snapshot.identity.sourceEnvironmentName,
    agentsExperience: persisted.payload,
  };
  const record: AgentReviewRecordData = {
    cat_agenttype: 1,
    cat_botid: review.botId,
    cat_botname: review.botName,
    cat_componentidunique: review.componentIdUnique,
    cat_name: `${review.botName} - ${completedAt.toISOString().split('T')[0]}`,
    cat_overallscore: String(review.overallScore),
    cat_patternscore: String(review.patternScore),
    cat_instructionscore: String(review.instructionScore),
    cat_totalissues: String(review.totalIssueCount),
    cat_highseverityissues: String(review.highSeverityCount),
    cat_reviewdate: completedAt.toISOString(),
    cat_reviewstatus: 335350000,
    cat_sourceenvironment: review.sourceEnvironment,
    cat_reviewresultjson: reviewResultJson,
  };

  return { review, persisted, record };
}
