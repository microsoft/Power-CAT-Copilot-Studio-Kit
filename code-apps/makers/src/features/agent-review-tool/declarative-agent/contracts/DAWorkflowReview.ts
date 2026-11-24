import type { EvaluationStatus } from './DAEvaluationResult';
import type { DAEvidenceRecord } from './DAPackageReview';

export type DASemanticCriterion =
  | 'instructions'
  | 'knowledge'
  | 'capabilities'
  | 'actions'
  | 'conversationStarters'
  | 'gracefulErrorHandling';

export interface DAWorkflowRule {
  ruleId: string;
  criterion: DASemanticCriterion;
  evidenceIds: string[];
}

export interface DAWorkflowRequest {
  contractVersion: string;
  correlationId: string;
  agent: {
    id: string;
    name: string;
    version: string;
  };
  rules: DAWorkflowRule[];
  evidence: DAEvidenceRecord[];
}

export interface DAWorkflowEvidenceReference {
  evidenceId: string;
  exactExcerpt: string;
}

export interface DAWorkflowOutcome {
  ruleId: string;
  status: Exclude<EvaluationStatus, 'N/A'>;
  evidence: DAWorkflowEvidenceReference[];
  explanation: string;
  recommendation: string;
}

export interface DAWorkflowResponse {
  contractVersion: string;
  correlationId: string;
  state: 'completed' | 'failed';
  outcomes: DAWorkflowOutcome[];
  error?: string;
}

export interface DARejectedWorkflowOutcome {
  ruleId?: string;
  reason: string;
}

export interface DAVerifiedWorkflowResponse {
  outcomes: DAWorkflowOutcome[];
  rejected: DARejectedWorkflowOutcome[];
}

export interface DAWorkflowProvenance {
  contractVersion: string;
  correlationId: string;
  jobId?: string;
  completedAt: string;
  rejectedOutcomeCount: number;
}

