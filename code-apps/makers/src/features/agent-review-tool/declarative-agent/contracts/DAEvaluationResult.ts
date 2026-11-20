/**
 * DAEvaluationResult TypeScript interfaces
 *
 * Represents the structured output from the DA Quality Evaluator AI model (Stage B).
 * The AI Builder model is configured with JSON output mode — no JSON.parse() needed.
 */

export type EvaluationStatus = 'Pass' | 'Warning' | 'Fail' | 'N/A' | 'Not assessed';
export type IssueSeverity = 'High' | 'Medium' | 'Low';
export type EvaluationMethod = 'deterministic' | 'semantic';

export interface EvaluationIssue {
  /** Severity level: High = blocks store publication or schema violation */
  severity: IssueSeverity;

  /** Human-readable description of what is wrong */
  description: string;

  /** Specific actionable recommendation to fix the issue */
  recommendation: string;

  /**
   * Stable key identifying this issue type (e.g. "instructions-no-error-handling").
   * Used client-side to resolve a pre-verified MS Learn URL with text fragment highlighting.
   * The AI model returns this; the client looks it up in ISSUE_LEARN_URLS.
   */
  issueKey?: string;

  /** Stable rule identifier used by deterministic and workflow-backed checks. */
  ruleId?: string;

  /** How this result was produced. */
  method?: EvaluationMethod;

  /** Package file that supplied the evidence. */
  sourceFile?: string;

  /** JSONPath-like location within the source file. */
  jsonPath?: string;

  /** Exact package excerpt supporting the result. */
  evidence?: string;

  /** Pre-verified Microsoft guidance URL for this rule. */
  guidanceUrl?: string;
}

export interface PassingCheck {
  /** What was evaluated and found to be good — factual, specific to this agent */
  description: string;

  /** Optional MS Learn URL for further reading on the standard that was met */
  learnUrl?: string;
}

export interface AssessmentNote {
  status: 'N/A' | 'Not assessed';
  description: string;
  sourceFile?: string;
  jsonPath?: string;
  evidence?: string;
  learnUrl?: string;
}

export interface CriterionResult {
  /** Status: Pass, Warning, or Fail — returned by AI model. Numeric score is derived client-side. */
  status: EvaluationStatus;

  /** List of issues found for this criterion (empty array if none) */
  issues: EvaluationIssue[];

  /** What was evaluated and passed — at least one entry always present */
  passingChecks: PassingCheck[];

  /** Non-scored applicability or evidence limitations. */
  assessmentNotes?: AssessmentNote[];
}

/**
 * Complete DA evaluation result from Stage B AI model.
 *
 * Fields match the JSON schema configured in AI Builder prompt output settings.
 */
export interface DAEvaluationResult {
  /** Instructions Quality criterion (weight: 30%) */
  instructionsCriterion: CriterionResult;

  /** Knowledge Sources Quality criterion (weight: 20%) */
  knowledgeCriterion: CriterionResult;

  /** Capabilities Fit criterion (weight: 15%) */
  capabilitiesCriterion: CriterionResult;

  /** Actions Quality criterion (weight: 15%) */
  actionsCriterion: CriterionResult;

  /** Conversation Starters Quality criterion (weight: 10%) */
  conversationStartersCriterion: CriterionResult;

  /**
   * Graceful Error Handling criterion (weight: 10%)
   * Source: "All agents must handle the following scenarios gracefully, that is,
   * the agent must reject the user request and provide a way forward:
   * For incorrect search parameters. For misuse or inappropriate language." [Must fix]
   */
  gracefulErrorHandlingCriterion: CriterionResult;

  /** 2-3 sentence AI-generated summary of quality and top improvement areas */
  summary: string;
}
