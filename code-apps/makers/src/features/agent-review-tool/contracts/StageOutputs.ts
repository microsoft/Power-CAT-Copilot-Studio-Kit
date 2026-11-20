/**
 * StageOutputs TypeScript interfaces
 *
 * These interfaces define the data structures for each stage of the review pipeline:
 * - Stage A: Local YAML parsing and initial pattern generation
 * - Stage B: AI-powered pattern evaluation
 * - Stage C: AI-powered instruction compliance evaluation
 * - Stage D: PDF report generation (file output)
 */

/** Tool type discriminated from action.kind in YAML */
export type ToolType = 'flow' | 'mcp' | 'connector' | 'prompt' | 'unknown';

/** Explicit outcomes for new standard reviews; legacy boolean results remain readable. */
export type AssessmentStatus = 'pass' | 'fail' | 'not-applicable' | 'not-assessed';

export type EvidenceKind = 'configuration-fact' | 'authoring-guidance' | 'potential-risk';

/** Evidence from the reviewed snapshot, never from a later live read. */
export interface ReviewEvidence {
  source: 'configuration' | 'instructions' | 'ai-response';
  status: 'verified' | 'unverified' | 'unavailable';
  setting?: string;
  quote?: string;
  reason?: string;
}

/** Evidence-bound guidance produced with a workflow finding. */
export interface ContextualRemediation {
  findingTitle: string;
  whyItMatters: string;
  makerAction: string;
  suggestedText?: string;
  acceptanceCheck: string;
}

export interface TopicRuleApplicability {
  status: 'applicable' | 'not-applicable' | 'not-assessed';
  reason: string;
  /**
   * Set only when the topic's own fields were read successfully and the single thing left unknown
   * is whether the model routes to it. Such a topic still contributes its fields to a rule's
   * failure population, so it must not suppress a verdict the readable topics already support.
   * A topic whose data could not be read carries no flag and continues to withhold the verdict.
   */
  unclassifiedTrigger?: true;
}

/** Resource identity and relationships available in the reviewed snapshot. */
export interface ResourceDetail {
  name: string;
  componentId?: string;
  schemaName?: string;
  kind?: string;
  description?: string;
  targetSchemaName?: string;
  targetId?: string;
  parentComponentId?: string;
  reason?: string;
}

/** Structured tool detail extracted from kind: TaskDialog components */
export interface ToolDetail extends ResourceDetail {
  displayName?: string;
  toolType: ToolType;
}

/** Knowledge source type discriminated from source.kind in YAML */
export type KnowledgeSourceType = 'SharePoint' | 'Web' | 'Dataverse' | 'File' | 'Unknown';

/** Structured knowledge source detail */
export interface KnowledgeDetail extends ResourceDetail {
  sourceType: KnowledgeSourceType;
  url?: string;
}

/** Child agent detail extracted from kind: AgentDialog components */
export type ChildAgentDetail = ResourceDetail;

/** Individual test case detail extracted from kind: EvaluationData components */
export interface TestCaseDetail extends ResourceDetail {
  input: string;
  source: 'Generated' | 'Manual';
}

/**
 * Variable structure for Stage B topic components
 */
export interface StageBVariable {
  VariableName: string;
  VariableDescription?: string;
}

/**
 * Topic component structure expected by Stage B AI model prompt
 * Matches the Components.Topics array format in ai-Prompt-stageB-improved.md
 */
export interface StageBTopicComponent {
  TopicName: string;
  TopicId?: string;
  SchemaName?: string;
  TriggerKind?: string;
  RoutingApplicability?: TopicRuleApplicability;
  NamingApplicability?: TopicRuleApplicability;
  ParseStatus?: 'complete' | 'unavailable';
  ModelDescriptionStatus?: 'complete' | 'unavailable';
  InputVariablesStatus?: 'complete' | 'unavailable';
  OutputVariablesStatus?: 'complete' | 'unavailable';
  ModelName?: string;
  ModelDescription?: string;
  InputVariables?: StageBVariable[];
  OutputVariables?: StageBVariable[];
  triggerQueries?: string[];
}

/**
 * Upgrade readiness evidence that Stage A collects from the YAML.
 *
 * The upgrade readiness report reads it from the saved Stage A snapshot.
 */
export interface UpgradeReadinessEvidence {
  /** Each knowledge source with its YAML kind: the source kind, else the component kind, else 'Unknown'. */
  knowledgeSources: { name: string; kind: string }[];
  /** Custom topics and tools with Power Fx, in component order. The list has 50 items at most. */
  powerFx: { name: string; kind: 'topic' | 'tool'; expressionCount: number }[];
  /** The number of custom topics and tools with Power Fx, before the list limit. */
  powerFxComponentCount: number;
}

/**
 * Stage A: Local Data Extraction Output
 *
 * Generated locally by parsing bot YAML configuration.
 * This is the input for Stage B (Pattern Evaluation).
 */
export interface LocalStageAOutput {
  /** Bot unique identifier */
  botId: string;

  /** Bot name */
  botName: string;

  /** Number of topics in bot configuration */
  topicCount: number;

  /** Number of tools/actions configured */
  toolCount: number;

  /** Number of knowledge sources */
  knowledgeCount: number;

  /** Number of test cases defined */
  testCaseCount: number;

  /** Agent instructions text (if present) */
  agentInstructions?: string;

  /** Agent-level description from applicationmanifestinformation */
  agentDescription?: string;

  /** Agent-level settings (language, auth mode, AI settings) */
  agentSettings?: import('./ServiceContracts').AgentSettings;

  /** Locally-generated patterns (8 patterns always created) */
  localPatterns: LocalPattern[];

  /** All topic names for reference */
  topics: string[];

  /** All tool names for reference */
  tools: string[];

  /** All knowledge source names for reference */
  knowledgeSources: string[];

  /** Orchestration mode: generative (description-based routing) or classic (trigger phrase routing) */
  orchestrationMode: 'generative' | 'classic' | 'unknown';

  /** Policy used for this snapshot. Absence identifies a legacy saved assessment. */
  policyVersion?: string;
  source?: 'live' | 'zip';
  configurationAvailable?: boolean;

  /** Structured topic components for Stage B AI evaluation */
  topicComponents: StageBTopicComponent[];

  /** YAML parsing errors (if any) */
  parsingErrors?: string[];

  /** Structured tool details (flow, MCP, connector, AI prompt) */
  toolDetails?: ToolDetail[];

  /** Structured knowledge source details */
  knowledgeDetails?: KnowledgeDetail[];

  /** Child agent details */
  childAgents?: ChildAgentDetail[];

  connectedAgents?: ResourceDetail[];
  entities?: ResourceDetail[];
  configurationComponents?: ResourceDetail[];
  unknownComponents?: ResourceDetail[];

  /** Individual test case details */
  testCaseDetails?: TestCaseDetail[];

  /**
   * Normalized evaluation-set/case evidence, carried from the component read to the scorer.
   *
   * Transport only: `assembleStandardReviewResult` strips it before the snapshot is stringified, so
   * the persisted Stage A payload is byte-identical to what it was before this field existed. It is
   * here rather than passed alongside because the components it is derived from are read inside
   * Stage A and discarded there, and re-reading them later would be a second trip to Dataverse for
   * rows already in hand.
   *
   * Absent means *unknown*, never "this agent has no evaluations" — a host that builds its own
   * snapshot, and every snapshot persisted before this existed, carries nothing here.
   */
  evaluationEvidence?: import('../agents-experience/contracts/EvaluationEvidence').NormalizedEvaluationEvidence;

  /**
   * Upgrade readiness evidence. It is saved with the Stage A snapshot.
   *
   * It is not part of the assessment identity, and no rule reads it. Absent means that the
   * snapshot was saved before this field existed, or that a host built its own snapshot.
   */
  upgradeReadinessEvidence?: UpgradeReadinessEvidence;
}

/**
 * Local pattern generated during Stage A
 */
export interface LocalPattern {
  /** Pattern identifier */
  patternId: string;

  /** Pattern name (e.g., "Missing Model Name") */
  patternName: string;

  /** Pattern description */
  description: string;

  /** Recommendation for fixing the pattern */
  recommendation: string;

  /** Whether the pattern passed (true) or failed (false) */
  status: boolean;
  assessmentStatus?: AssessmentStatus;
  assessmentReason?: string;
  evidenceKind?: EvidenceKind;
  affectedItems?: PatternTopic[];

  /** Topics affected by this pattern */
  topics: string[];

  /** Category for this pattern */
  category: string;

  /** Severity level */
  severity: 'High' | 'Medium' | 'Low';
}

/**
 * Stage B: AI Pattern Evaluation Output
 *
 * Returned by AI model after analyzing Stage A output.
 * Contains additional AI-detected patterns.
 */
export interface PatternEvaluation {
  /** Original model narrative, retained as source material rather than authoritative totals. */
  originalSummary?: string;
  /** All patterns (local + AI-detected) */
  Patterns: Pattern[];

  /** AI-generated summary of pattern findings */
  Summary?: string;

  /** Overall pattern compliance percentage (0-100) */
  PatternCompliancePercentage?: number;
  policyVersion?: string;
  scoreAvailable?: boolean;
  assessmentNotes?: string[];
}

/**
 * Individual pattern from Stage B evaluation
 */
export interface Pattern {
  /** Unique pattern identifier */
  PatternId: string;

  /** Pattern name */
  PatternName: string;

  /** Pattern description (AI model may return as "Description" or "PatternDescription") */
  Description?: string;
  PatternDescription?: string;

  /** Recommended fix */
  Recommendation: string;

  /** Pass (true) or Fail (false) */
  Status: boolean;
  AssessmentStatus?: AssessmentStatus;
  AssessmentReason?: string;
  EvidenceKind?: EvidenceKind;

  /** Topics affected */
  Topics: PatternTopic[];

  /** Category (assigned during display transformation) */
  Category?: string;

  /** Severity (calculated during display transformation) */
  Severity?: 'High' | 'Medium' | 'Low';
}

/**
 * Topic reference in a pattern
 */
export interface PatternTopic {
  /** Topic name */
  item: string;
  /** Variable name (for variable-related patterns) */
  variable?: string;
  /** Current unclear value */
  current?: string;
  /** Suggested improvement */
  suggested?: string;
  componentId?: string;
  setting?: string;
  evidence?: ReviewEvidence;
  schemaName?: string;
  /** Per-setting outcomes prevent unresolved references from becoming counted failures. */
  assessmentStatus?: AssessmentStatus;
  assessmentReason?: string;
  remediation?: ContextualRemediation;
}

/**
 * Stage C: AI Instruction Compliance Output
 *
 * Returned by AI model after evaluating agent instructions
 * against 12 compliance criteria.
 */
export interface InstructionEvaluation {
  /** Original model narrative, retained as source material rather than authoritative totals. */
  originalSummary?: string;
  /** True if compliancePercentage >= 60 — returned directly by Stage C model */
  compliance?: boolean;

  /** Compliance percentage (0-100) */
  compliancePercentage: number;

  /** All compliance issues found */
  issues: ComplianceIssue[];

  /** AI-generated summary of compliance findings */
  summary?: string;
  assessmentStatus?: AssessmentStatus;
  assessmentReason?: string;
  criterionAssessments?: CriterionAssessment[];
  policyVersion?: string;
  scoreAvailable?: boolean;
}

export interface CriterionAssessment {
  criteriaId: string;
  status: AssessmentStatus;
  reason?: string;
}

/**
 * Individual compliance issue from Stage C
 */
export interface ComplianceIssue {
  /** Issue unique identifier */
  id: string;

  /** Criterion ID this issue relates to (e.g., "scope-definition"). Optional — PCF format omits this, uses id instead. */
  criteriaId?: string;

  /** Issue title */
  title: string;

  /** Detailed description of the issue */
  description: string;

  /** Recommendation for fixing */
  recommendation: string;

  /** Historical guidance label retained from legacy instruction reviews. */
  guidelineReference?: string;

  /** Severity level */
  severity: 'High' | 'Medium' | 'Low';

  /** Category (assigned during display transformation) */
  category?: string;
  assessmentStatus?: 'fail' | 'not-assessed';
  assessmentReason?: string;
  evidence?: ReviewEvidence;
  remediation?: ContextualRemediation;
  /** The specific situation the finding says is not covered. */
  uncoveredSituation?: string;
  coverage?: 'missing' | 'incomplete' | 'unclear';
}

/**
 * Special issue ID for missing instructions
 * When this issue is present, all 12 criteria are marked as failed
 */
export const MISSING_INSTRUCTION_INPUT_ID = 'missing-instruction-input';

/**
 * Stage D: PDF Report Generation Input
 *
 * Data structure sent to AI model for PDF generation
 */
export interface ReviewReportData {
  /** Bot name */
  botName: string;

  /** Overall score */
  overallScore: number;

  /** Pattern score */
  patternScore: number;

  /** Instruction score */
  instructionScore: number;

  /** Review date */
  reviewDate: string;

  /** All patterns */
  patterns: Pattern[];

  /** All compliance issues */
  issues: ComplianceIssue[];

  /** Pattern summary */
  patternSummary?: string;

  /** Compliance summary */
  complianceSummary?: string;
}

/**
 * Stage D: PDF Report Output
 *
 * Returned by AI model as file output
 */
export interface PdfReportOutput {
  /** Base64-encoded PDF content */
  base64Content: string;

  /** File name */
  fileName: string;

  /** Content type (always "application/pdf") */
  contentType: string;
}
