import type { ContextualRemediation } from './StageOutputs';

/** Fixed result-row indexes used by the Standard Review workflow branch. */
export const STANDARD_REVIEW_UNIT_INDEX = {
  CONFIGURATION: 9500,
  ROUTING: 9501,
  INSTRUCTIONS_SCOPE_UX: 9502,
  INSTRUCTIONS_SAFETY: 9503,
  INSTRUCTIONS_QUALITY: 9504,
} as const;

export type StandardReviewUnitIndex =
  (typeof STANDARD_REVIEW_UNIT_INDEX)[keyof typeof STANDARD_REVIEW_UNIT_INDEX];

export const STANDARD_REVIEW_UNIT_INDEXES: readonly StandardReviewUnitIndex[] =
  Object.values(STANDARD_REVIEW_UNIT_INDEX);

export type StandardReviewRuleCategory =
  | 'configuration'
  | 'routing'
  | 'instructions';

export type StandardReviewEvaluator =
  | 'stage-b-patterns'
  | 'stage-c-instructions';

export interface StandardReviewRuleApplicability {
  status: 'applicable' | 'not-applicable' | 'not-assessed';
  reason: string;
  eligibleComponentIds: string[];
}

/** Static rule definition sent to the workflow evaluator. */
export interface StandardReviewRule {
  ruleId: string;
  name: string;
  category: StandardReviewRuleCategory;
  applicability: StandardReviewRuleApplicability;
  evaluationQuestion: string;
  failWhen: string[];
  rejectWhen: string[];
  source: {
    evaluator: StandardReviewEvaluator;
    ruleName: string;
    order: number;
  };
  requiredEvidence: {
    mustReferenceEligibleComponent: true;
    mustQuoteExactly: true;
    allowEmptyQuoteForAbsence: boolean;
    allowedFieldPaths: string[];
  };
}

/** A compact, source-bound component supplied to one workflow review unit. */
export interface StandardReviewCorpusComponent {
  componentId: string;
  componentType:
    | 'agent-instructions'
    | 'topic'
    | 'tool'
    | 'connected-agent'
    | 'knowledge';
  name: string;
  schemaName?: string;
  facts: Record<string, unknown>;
  fields: Record<string, unknown>;
}

export interface StandardReviewUnitCorpus {
  schemaVersion: 2;
  jobKind: 'StandardReview';
  reviewPolicyVersion: string;
  review: {
    correlationId: string;
    botId: string;
    botName: string;
    sourceEnvironment: string;
    sourceType: string;
    componentCount: number;
  };
  reviewUnit: {
    unitId: string;
    componentIndex: StandardReviewUnitIndex;
  };
  agent: {
    purpose: string;
    orchestrationMode: string;
    instructionsComponentId: string;
    inventory: {
      topicCount: number;
      toolCount: number;
      connectedAgentCount: number;
      knowledgeCount: number;
      entityCount: number;
      configurationComponentCount: number;
    };
    reviewLimits: string[];
    components: StandardReviewCorpusComponent[];
  };
  standardReview: {
    contract: {
      evaluator: StandardReviewEvaluator;
      sourcePrompt:
        | 'ai-Prompt-stageB-improved.md'
        | 'ai-Prompt-evaluate-AgentInstruction.md';
      expectedRuleIds: string[];
      completion: {
        completeStatus: 'complete';
        partialStatus: 'partial';
        requireEveryApplicableRule: true;
        requireNotAssessedForUnavailableRules: true;
      };
      remediation: {
        requireExactTarget: true;
        requireAgentContext: true;
        requireMakerAction: true;
        requireAcceptanceCheck: true;
      };
    };
    rules: StandardReviewRule[];
  };
}

export interface StandardReviewUnit {
  unitId: string;
  componentIndex: StandardReviewUnitIndex;
  corpus: StandardReviewUnitCorpus;
}

/** Whole payload uploaded to the workflow parent job. */
export interface StandardReviewWorkflowCorpus {
  schemaVersion: 2;
  jobKind: 'StandardReview';
  generatedBy: 'CopilotStudioKitMakers/agent-review-tool';
  generatedOn: string;
  reviewPolicyVersion: string;
  review: StandardReviewUnitCorpus['review'];
  standardReview: {
    reviewUnits: StandardReviewUnit[];
  };
  components: Array<{
    componentIndex: StandardReviewUnitIndex;
    kind: 'StandardReviewUnit';
    skillComponentId: string;
    skillComponentUniqueId: string;
    skillSchemaName: string;
    skillName: string;
    source: string;
    bundleHash: 'not-used';
  }>;
}

export interface StandardReviewCandidateEvidence {
  componentId: string;
  fieldPath: string;
  quote: string;
}

export interface StandardReviewCandidate {
  ruleId: string;
  affectedComponentIds: string[];
  evidence: StandardReviewCandidateEvidence[];
  findingTitle?: string;
  whyItMatters?: string;
  makerAction?: string;
  suggestedText?: string;
  acceptanceCheck?: string;
}

export interface StandardReviewNotAssessed {
  ruleId: string;
  reason: string;
}

/** Compact structured output written by one workflow review unit. */
export interface StandardReviewUnitResult {
  status: 'complete' | 'partial';
  findings: StandardReviewCandidate[];
  notAssessed: StandardReviewNotAssessed[];
}

export interface StandardReviewWorkflowUnitOutcome {
  componentIndex: StandardReviewUnitIndex;
  unitId: string;
  /**
   * 'missing' records a unit the workflow never returned a result for. Reporting it as 'succeeded'
   * made a flow that never ran look like a clean pass, which is the opposite of what the findings
   * say: every rule in the unit is surfaced as "Could not run" at the same time.
   */
  status: 'succeeded' | 'missing';
  findingCount: number;
  notAssessedCount: number;
}

export interface StandardReviewWorkflowProvenance {
  jobId: string;
  correlationId: string;
  reviewPolicyVersion: string;
  retrievedAt: string;
  rejectedCandidateCount: number;
  units: StandardReviewWorkflowUnitOutcome[];
  validationDiagnostics?: StandardReviewValidationDiagnostics;
}

export interface ValidatedStandardReviewEvidence
  extends StandardReviewCandidateEvidence {
  component: StandardReviewCorpusComponent;
  evidenceMode: 'exact-quote' | 'complete-field-review';
}

export interface ValidatedStandardReviewCandidate
  extends StandardReviewCandidate {
  unitId: string;
  componentIndex: StandardReviewUnitIndex;
  rule: StandardReviewRule;
  evidence: ValidatedStandardReviewEvidence[];
  remediation: ContextualRemediation;
}

export interface RejectedStandardReviewCandidate {
  unitId: string;
  ruleId?: string;
  reason: string;
  outcomeImpact: 'discarded' | 'incomplete';
}

export interface StandardReviewCandidateNormalization {
  unitId: string;
  ruleId: string;
  field: 'findingTitle';
  originalLength: number;
  normalizedLength: number;
  reason: string;
}

export interface StandardReviewValidationDiagnostics {
  rejectedCandidates: RejectedStandardReviewCandidate[];
  normalizations: StandardReviewCandidateNormalization[];
}
