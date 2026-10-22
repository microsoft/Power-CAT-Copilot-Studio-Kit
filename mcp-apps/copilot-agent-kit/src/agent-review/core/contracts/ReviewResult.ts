import type { AgentsExperienceModel } from './AgentsExperienceModel.js';
import type {
  GroundedFinding,
  GroundedSkillFinding,
  RuleEvaluationResult,
} from './Findings.js';
import type { ReferenceEntry, ReferenceId } from './references.js';
import type {
  ResourceAnalysisStatus,
  RetrievalIssue,
  SkillBundleResource,
  SkillBundleReviewResult,
  SkillBundleScores,
  SkillCapabilityReference,
  SkillCapabilityReferenceIssue,
  SkillReviewMode,
} from './SkillBundle.js';
import type {
  CrossSkillOrchestrationEvaluation,
  DeepSkillBundleEvaluation,
  SkillBundleEvaluation,
  SkillResourceEvaluation,
  StandardSkillBundleEvaluation,
} from './SkillEvaluation.js';
import type {
  CoverageBasis,
  SetCoverage,
} from '../services/EvaluationCoverageService.js';
import type { PillarBreakdown } from '../services/scoring.js';
import type { BundleIntegrityResult } from '../services/skill/bundleIntegrity.js';
import type { StandardTopicReview } from './StandardReview.js';

export interface ReviewStageStatus {
  state:
    | 'complete'
    | 'partial'
    | 'unavailable'
    | 'not-applicable'
    | 'failed'
    | 'cancelled';
  reason?:
    | 'unprovisioned'
    | 'empty-instructions'
    | 'incomplete-response'
    | 'invocation-failed'
    | 'review-cancelled';
}

export interface ReviewAnalysisStatus {
  instructionCoverage: ReviewStageStatus;
}

export interface AgentsExperienceReviewPayload {
  model: AgentsExperienceModel;
  findings: Array<GroundedFinding | GroundedSkillFinding>;
  skillEvaluations: SkillBundleEvaluation[];
  skillBundleReviews?: SkillBundleReviewResult[];
  topicReviews?: StandardTopicReview[];
  bundleRetrievalIssues?: RetrievalIssue[];
  crossSkillOrchestration?: CrossSkillOrchestrationEvaluation;
  skillReviewMode?: SkillReviewMode;
  coverage: { name: string; kind: string; cases: number }[];
  coverageBasis?: CoverageBasis;
  coverageSets?: SetCoverage[];
  score: {
    grounded: number | null;
    passed: number;
    warnings: number;
    errors: number;
    evaluated: number;
    basisVersion?: 2;
    status?: 'complete' | 'partial';
    pillars?: PillarBreakdown[];
  };
  analysisStatus?: ReviewAnalysisStatus;
  ruleResults?: RuleEvaluationResult[];
}

export interface CopilotReviewDisplayPayload {
  model: AgentsExperienceModel;
  findings: Array<GroundedFinding | GroundedSkillFinding>;
  skillEvaluations: SkillBundleEvaluation[];
  skillBundleReviews?: Array<
    SkillBundleReviewResult | PersistedSkillBundleReview
  >;
  topicReviews?: StandardTopicReview[];
  coverage: { name: string; kind: string; cases: number }[];
  coverageBasis?: CoverageBasis;
  coverageSets?: SetCoverage[];
  score: {
    grounded: number | null;
    passed: number;
    warnings: number;
    errors: number;
    evaluated: number;
    basisVersion?: 2;
    status?: 'complete' | 'partial';
    pillars?: PillarBreakdown[];
  };
  skillReviewMode?: SkillReviewMode;
  crossSkillOrchestration?: CrossSkillOrchestrationEvaluation;
  analysisStatus?: ReviewAnalysisStatus;
  ruleResults?: RuleEvaluationResult[];
}

export interface PersistedResourceManifest {
  path: string;
  kind: SkillBundleResource['kind'];
  language?: SkillBundleResource['language'];
  sizeBytes: number;
  sha256: string;
  referencedBy: string[];
  analysisStatus: ResourceAnalysisStatus;
  riskLevel?: SkillResourceEvaluation['riskLevel'];
  readiness?: SkillResourceEvaluation['readiness'];
}

export interface PersistedSourceFile {
  path: string;
  sizeBytes: number;
  language?: SkillBundleResource['language'];
  kind?: SkillBundleResource['kind'];
  isSkillDefinition?: boolean;
}

export interface PersistedSkillBundleReview {
  schemaVersion: 1;
  skillComponentId: string;
  skillComponentUniqueId: string;
  skillSchemaName: string;
  skillName: string;
  bundleHash: string;
  reviewInputHash: string;
  mode: SkillReviewMode;
  status:
    | 'complete'
    | 'partial'
    | 'unavailable'
    | 'blocked'
    | 'failed'
    | 'cancelled';
  startedAt: string;
  completedAt: string;
  promptVersions: {
    standard: string;
    resource?: string;
    fileSynthesis?: string;
    bundleSynthesis?: string;
  };
  manifest: PersistedResourceManifest[];
  sourceFiles?: PersistedSourceFile[];
  skillDefinitionSource?: string;
  skillDefinitionSourceOmission?: 'too-large' | 'payload-budget';
  retrievalIssues: RetrievalIssue[];
  deterministic: {
    findings: GroundedSkillFinding[];
    integrity: BundleIntegrityResult;
  };
  capabilityReferences?: SkillCapabilityReference[];
  capabilityReferenceIssues?: SkillCapabilityReferenceIssue[];
  standard?: StandardSkillBundleEvaluation;
  deep?: DeepSkillBundleEvaluation;
  findings: GroundedSkillFinding[];
  scores: SkillBundleScores;
  coverage: {
    resourcesTotal: number;
    resourcesReviewed: number;
    resourcesPartial: number;
    resourcesFailed: number;
    resourcesSkipped: number;
    resourcesOversized: number;
    resourcesCancelled: number;
    chunksTotal: number;
    chunksReviewed: number;
  };
  citations: Array<{
    id: ReferenceId;
    title: string;
    url: string;
    source: ReferenceEntry['source'];
  }>;
}

export type PersistedCopilotReviewPayload =
  Omit<AgentsExperienceReviewPayload, 'skillBundleReviews' | 'skillReviewMode'> & {
    skillBundleReviews: PersistedSkillBundleReview[];
    skillReviewMode: SkillReviewMode;
    persistenceIssues: RetrievalIssue[];
  };

export interface PersistedCopilotReviewResult {
  payload: PersistedCopilotReviewPayload;
  json: string;
}
