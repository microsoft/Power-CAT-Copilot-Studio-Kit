/**
 * Constants for Declarative Agent Review
 *
 * Criterion weights, schema limits, AI model IDs, and configuration.
 * Follows the same pattern as the CS agent review Constants.ts.
 */

/**
 * AI Model IDs for DA review stages
 *
 * Hardcoded GUIDs from the Dataverse msdyn_aimodels table.
 * Stage A is local (no AI model needed).
 * Stage D is shared with the CS agent review (same PDF generation model).
 */
export const DA_AI_MODEL_IDS = {
  /** Stage B: DA Quality Evaluator — evaluates all 5 criteria in a single call */
  STAGE_B_DA_EVAL: 'd9417fe0-6467-4bf4-b6c1-4c16f345b6a8',

  /** Stage D: PDF Report Generation — same model as CS agent Stage D */
  STAGE_D_PDF_GENERATION: '23c0ffb9-139c-4f07-afe8-4d3c7c847f95',
} as const;

/**
 * Evaluation criterion weights (must sum to 1.0)
 *
 * Based on Microsoft 365 Copilot extensibility best practices and MS Store validation guidelines.
 * Instructions weighted highest (30%) as the most impactful quality factor.
 * Graceful error handling added (10%) per MS Store "Must Fix" requirement.
 * Capabilities weight kept at 15% but scoped to CodeInterpreter + OneDriveAndSharePoint only
 * (GraphicArt and WebSearch are default-on and ignored per MS Learn guidance).
 */
export const CRITERION_WEIGHTS = {
  instructions: 0.30,
  knowledge: 0.20,
  capabilities: 0.15,
  actions: 0.15,
  conversationStarters: 0.10,
  gracefulErrorHandling: 0.10,
} as const;

/**
 * DA manifest schema limits
 *
 * From the stable declarative-agent manifest v1.8 specification.
 */
export const SCHEMA_LIMITS = {
  /** Declarative-agent name character limit. */
  NAME_MAX_LENGTH: 100,

  /** Short description character limit */
  DESCRIPTION_MAX_LENGTH: 1000,

  /** Instructions character limit (hard schema limit) */
  INSTRUCTIONS_MAX_LENGTH: 8000,

  /** Maximum conversation starters in schema v1.8. The collection is optional. */
  STARTERS_MAX_COUNT: 12,

  /** Maximum actions in schema v1.8. The collection is optional. */
  ACTIONS_MAX_COUNT: 10,
} as const;

/**
 * Score thresholds for status determination and color coding.
 * Matches CS agent review thresholds for visual consistency.
 */
export const DA_SCORE_THRESHOLDS = {
  /** Score ≥ 80: Pass (Green) */
  PASS: 80,

  /** Score ≥ 60: Warning (Amber) */
  WARNING: 60,

  /** Score < 60: Fail (Red) */
} as const;

/**
 * Retry configuration for AI invocations
 */
export const DA_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
} as const;

/**
 * Timeout values for each stage
 */
export const DA_TIMEOUTS = {
  /** Stage B timeout: 30 seconds */
  STAGE_B_MS: 30_000,

  /** Stage D timeout: 120 seconds */
  STAGE_D_MS: 120_000,
} as const;

/**
 * Dataverse cat_agenttype option set values
 */
export const AGENT_TYPE = {
  /** Copilot Studio agent (default, existing) */
  COPILOT_STUDIO: 1,

  /** M365 Declarative Agent */
  M365_DECLARATIVE_AGENT: 2,

  /**
   * An uploaded skill or automation (Cowork, Scout, Copilot Studio).
   *
   * The generated model mirrors the option set as it stood when it was last
   * produced, so it still publishes only 1 and 2. Writes cast the record the
   * same way the DA path does, so this constant — not the generated union — is
   * the reference for the value.
   */
  SKILL_OR_AUTOMATION: 3,
} as const;

/**
 * Source type values for cat_sourcetype column
 */
export const DA_SOURCE_TYPE = {
  ZIP: 'zip',
} as const;

/**
 * React Query stale times for DA queries
 */
export const DA_STALE_TIMES = {
  /** DA reviews: 30 seconds (frequently updated) */
  REVIEWS_MS: 30_000,
} as const;

/**
 * Grid configuration
 */
export const DA_GRID_CONFIG = {
  PAGE_SIZE_OPTIONS: [10, 25, 50] as const,
  DEFAULT_PAGE_SIZE: 10,
  SEARCH_DEBOUNCE_MS: 300,
} as const;
