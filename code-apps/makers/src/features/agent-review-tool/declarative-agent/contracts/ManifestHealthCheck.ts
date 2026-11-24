/**
 * ManifestHealthCheck TypeScript interfaces
 *
 * Represents the output of Stage A local manifest validation.
 * All checks are purely synchronous — no AI needed.
 * Results are always available immediately after ZIP parsing.
 */

/**
 * Single field length check result
 */
export interface FieldCheck {
  /** Actual value (character count or length) */
  value: number;

  /** Schema limit for this field */
  limit: number;

  /** Whether the field passes the limit check */
  pass: boolean;

  /** Optional human-readable message for display */
  message?: string;
}

/**
 * Count check result (for arrays with min/max constraints)
 */
export interface CountCheck {
  /** Actual count */
  value: number;

  /** Minimum required count (optional) */
  min?: number;

  /** Maximum allowed count */
  max: number;

  /** Whether the count passes both min and max checks */
  pass: boolean;

  /** Optional human-readable message for display */
  message?: string;
}

/**
 * Boolean check result (pass/fail with message)
 */
export interface BoolCheck {
  /** Whether the check passes */
  pass: boolean;

  /** Human-readable message for display */
  message: string;
}

/**
 * Complete manifest health check result from Stage A.
 *
 * All checks run synchronously using local limits from constants.ts.
 * Used by ManifestHealthPanel component (always rendered, no skeleton needed).
 */
export interface ManifestHealthCheck {
  /** Detected DA manifest version from the required version property. */
  schemaVersion: string;

  /** Whether a supported version is present: v1.8, or v1.9 for custom skills. */
  versionSupported?: BoolCheck;

  /** Declarative-agent name length: at most 100 characters. */
  nameLength: FieldCheck;

  /** Declarative-agent description length: at most 1,000 characters. */
  descriptionLength: FieldCheck;

  /** Instructions presence check: must not be empty */
  instructionsPresent: FieldCheck;

  /** Instructions length: at most 8,000 characters. */
  instructionsLength?: FieldCheck;

  /** Conversation starters count: optional, maximum 12 in v1.8. */
  conversationStartersCount: CountCheck;

  /** Actions count: optional, maximum 10 in v1.8. */
  actionsCount: CountCheck;

  /** Whether color.png was successfully extracted from ZIP */
  colorIconPresent: boolean;

  /** Whether declarativeAgent_*.json was resolved via manifest reference */
  daFileResolved: boolean;

  // ── New Stage A checks (MS Store validation guidelines) ──

  /** Legacy field retained for saved-review compatibility. */
  nameConsistency: BoolCheck;

  /**
   * No prompt injection phrases in instructions or conversation_starters.
   * Forbidden: 'ignore', 'delete', 'reset', 'new instructions', 'Answer in Bold', etc.
   * Source: review-copilot-validation-guidelines — "Description" [Must fix]
   */
  noPromptInjection: BoolCheck;

  /**
   * No URLs or emojis in instructions or conversation_starters fields.
   * Source: review-copilot-validation-guidelines — "Description" [Must fix]
   */
  noUrlsOrEmojis: BoolCheck;

  /**
   * Legacy field retained for saved-review compatibility.
   * DA-OPENAPI-CONSEQUENTIAL now checks packaged OpenAPI write operations and
   * fails an operation that sets x-openai-isConsequential to false.
   * Source: review-copilot-validation-guidelines — "User disclosure and confirmation" [Must fix]
   */
  isConsequentialFlags: BoolCheck;

  /**
   * All action API URLs must use HTTPS with TLS 1.2+.
   * Source: review-copilot-validation-guidelines — "Security requirements for server calls" [Must fix]
   */
  httpsOnActionUrls: BoolCheck;

  /** Legacy field retained for saved-review compatibility. */
  mcpStaticDiscovery: BoolCheck;
}
