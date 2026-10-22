import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel.js';
import type { BotComponent } from '../contracts/BotComponent.js';
import type {
  GroundedFinding,
  GroundedSkillFinding,
  RuleEvaluationResult,
} from '../contracts/Findings.js';
import type {
  ReviewCorpus,
  SkillReviewCorpusComponent,
  ReviewJobItemRow,
} from '../contracts/ReviewJob.js';
import type { StandardTopicReview } from '../contracts/StandardReview.js';
import type {
  SkillBundle,
  SkillBundleResource,
  SkillResourceRow,
} from '../contracts/SkillBundle.js';
import type {
  InstructionCoverageResult,
} from '../contracts/AiCoverage.js';
import type {
  PersistedCopilotReviewPayload,
  PersistedCopilotReviewResult,
} from '../contracts/ReviewResult.js';
import type {
  CoverageBasis,
  SetCoverage,
} from '../services/EvaluationCoverageService.js';
import type {
  OrchestrationValidationResult,
  StandardValidationResult,
} from '../services/skill/SkillEvaluationValidator.js';

export type Guid = string & { readonly __guid: unique symbol };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type MissingAiStagePolicy = 'fallback' | 'unavailable';

export interface SourceSkillResource {
  row: SkillResourceRow;
  bytes: Uint8Array;
}

export interface ReviewSourceSnapshot {
  configuration: string;
  components: readonly BotComponent[];
  resources: readonly SourceSkillResource[];
}

export interface PrepareReviewInput {
  botId: Guid;
  botName: string;
  componentIdUnique: Guid;
  sourceEnvironmentId: Guid;
  sourceEnvironmentName: string;
  startedAt: string;
}

export interface FinalizationResourceStats {
  resourceId: string;
  textLength: number;
  chunkCount: number;
  isEmpty: boolean;
}

export interface FinalizationBundleSnapshot {
  bundle: Omit<SkillBundle, 'resources'> & {
    resources: readonly Omit<
      SkillBundleResource,
      'textContent' | 'chunks'
    >[];
  };
  resourceStats: readonly FinalizationResourceStats[];
  corpusComponent: Omit<SkillReviewCorpusComponent, 'componentIndex'> & { componentIndex?: number };
  deterministicFindings: readonly GroundedSkillFinding[];
}

export interface FinalizationSnapshot {
  version: 1;
  coreVersion: '0.1.0-modern-review.0';
  sourceRevision: '4fd618cd';
  startedAt: string;
  identity: {
    botId: Guid;
    botName: string;
    componentIdUnique: Guid;
    sourceEnvironmentId: Guid;
    sourceEnvironmentName: string;
  };
  model: AgentsExperienceModel;
  deterministic: {
    findings: readonly GroundedFinding[];
    ruleResults: readonly RuleEvaluationResult[];
    coverage: readonly { name: string; kind: string; cases: number }[];
    coverageBasis: CoverageBasis;
    coverageSets: readonly SetCoverage[];
  };
  bundles: readonly FinalizationBundleSnapshot[];
  topics?: readonly {
    componentIndex: number;
    componentIdUnique: string;
    inputHash: string;
  }[];
}

export interface PreparedReview {
  correlationId: Guid;
  componentCount: number;
  corpus: ReviewCorpus & { finalizationSnapshot: FinalizationSnapshot };
}

export interface WorkflowJobSnapshot {
  jobId: Guid;
  correlationId: Guid;
  status: 'succeeded' | 'failed';
  completedAt: string;
  errorMessage: string | null;
}

export interface WorkflowStageResult<T> {
  state: 'complete' | 'partial' | 'unavailable' | 'failed';
  value?: T;
  reason?: 'missing-row' | 'malformed-row' | 'fallback-failed';
}

export interface ReadWorkflowResultsInput {
  job: WorkflowJobSnapshot;
  rows: readonly ReviewJobItemRow[];
  snapshot: FinalizationSnapshot;
  missingAiStagePolicy: MissingAiStagePolicy;
}

export interface NormalizedWorkflowResults {
  jobId: Guid;
  correlationId: Guid;
  completedAt: string;
  disposition: 'complete' | 'salvaged-partial';
  skillResults: readonly StandardValidationResult[];
  topicResults?: readonly StandardTopicReview[];
  orchestration: WorkflowStageResult<OrchestrationValidationResult>;
  instructionCoverage: WorkflowStageResult<InstructionCoverageResult>;
  discardedDuplicateItemIds: readonly Guid[];
  rejectedRows: readonly {
    itemId: Guid;
    componentIndex: number | null;
    reason: string;
  }[];
}

export interface ComposeReviewInput {
  snapshot: FinalizationSnapshot;
  workflow: NormalizedWorkflowResults;
}

export interface ReviewResultDraft {
  botId: string;
  componentIdUnique: string;
  botName: string;
  overallScore: number;
  patternScore: number;
  instructionScore: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  totalIssueCount: number;
  reviewedOn: Date;
  durationMs: number;
  status: 'completed';
  sourceEnvironment: string;
  agentsExperience: PersistedCopilotReviewPayload;
}

export interface AgentReviewRecordData {
  cat_agenttype: 1;
  cat_botid: string;
  cat_botname: string;
  cat_componentidunique: string;
  cat_name: string;
  cat_overallscore: string;
  cat_patternscore: string;
  cat_instructionscore: string;
  cat_totalissues: string;
  cat_highseverityissues: string;
  cat_reviewdate: string;
  cat_reviewstatus: 335350000;
  cat_sourceenvironment: string;
  cat_reviewresultjson: string;
}

export interface CompletedReview {
  review: ReviewResultDraft;
  persisted: PersistedCopilotReviewResult;
  record: AgentReviewRecordData;
}
