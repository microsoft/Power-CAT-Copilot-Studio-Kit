/**
 * Constants for Agent Review Tool
 *
 * Contains all hardcoded values including AI model IDs, compliance criteria,
 * thresholds, severity rules, and configuration constants.
 */

/**
 * AI Model IDs for Agent Review Tool stages
 *
 * These are hardcoded GUIDs from the Dataverse msdyn_aimodels table.
 * Stage A is local (no AI model needed).
 */
export const AI_MODEL_IDS = {
  /** Stage D: PDF Report Generation (generates PDF report from review data) */
  STAGE_D_PDF_GENERATION: '23c0ffb9-139c-4f07-afe8-4d3c7c847f95',

  /**
   * Spec 013 P2-N: Standard Skill Bundle Evaluator (JSON output mode).
   */
  SKILL_BUNDLE_EVAL: '7678a053-36c9-40b4-878c-a31660ca6eb8',

  /** Spec 013 P2-R: Resource Chunk Evaluator (JSON output mode). */
  SKILL_RESOURCE_EVAL: '7cc5df76-c547-4a02-bd2a-da674c519a1b',

  /** Spec 013 P2-F: Skill File Synthesis (JSON output mode). */
  SKILL_FILE_SYNTHESIS: '1e420543-9c14-4901-adb6-53c4dcdeebb1',

  /** Spec 013 P2-B: Deep Skill Bundle Synthesis (JSON output mode). */
  SKILL_DEEP_BUNDLE_SYNTHESIS: 'ec77cb08-4f23-4902-b2ae-604f0d4515eb',

  /**
   * Spec 013 P2-O: Cross-Skill Orchestration Evaluator (JSON output mode).
   * Agent-level: runs once per review with the whole skill set in context.
   */
  SKILL_CROSS_SKILL_ORCHESTRATION: '997dd600-d877-47ca-898d-1d52fa5a0647',

  /** Spec 013 P1: Copilot Instruction Coverage classifier (JSON output mode). */
  INSTRUCTION_COVERAGE: '00000000-0000-0000-0000-000000000000',
} as const;

/** Zero GUID sentinel — an AI_MODEL_ID equal to this means the prompt is not provisioned. */
export const UNPROVISIONED_AI_MODEL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Compliance criterion definition
 */
export interface ComplianceCriterion {
  /** Unique criterion ID (used for matching with AI issues) */
  id: string;

  /** Display name */
  name: string;

  /** Category (Scope, UX, Safety, Quality) */
  category: 'Scope' | 'UX' | 'Safety' | 'Quality';

  /** Inherent severity (importance when passed) */
  inherentSeverity: 'High' | 'Medium' | 'Low';

  /** Description of the criterion */
  description: string;
}

/**
 * All 15 compliance criteria
 *
 * These are evaluated by Stage C (Instruction Compliance).
 * Criteria 1-12 match the original PCF implementation; criteria 13-15
 * were added based on MS Learn generative-mode-guidance and mcs-agent-analyser research.
 */
export const COMPLIANCE_CRITERIA: readonly ComplianceCriterion[] = [
  {
    id: 'scope-definition',
    name: 'Scope Definition',
    category: 'Scope',
    inherentSeverity: 'High',
    description: 'Clearly defines what topics the agent should respond to',
  },
  {
    id: 'out-of-scope-handling',
    name: 'Out-of-Scope Handling',
    category: 'Scope',
    inherentSeverity: 'Medium',
    description: 'Specifies how to handle requests outside defined scope',
  },
  {
    id: 'persona-and-tone',
    name: 'Persona & Tone',
    category: 'UX',
    inherentSeverity: 'Low',
    description: "Defines specific tone for non-default scenarios (professional/polite is already the default)",
  },
  {
    id: 'privacy-and-sensitive-data',
    name: 'Privacy & Sensitive Data',
    category: 'Safety',
    inherentSeverity: 'High',
    description: 'Provides guidelines for handling personal/sensitive information',
  },
  {
    id: 'fallback-when-uncertain',
    name: 'Fallback When Uncertain',
    category: 'Quality',
    inherentSeverity: 'High',
    description: 'Specifies what to do when agent lacks information',
  },
  {
    id: 'citations-and-sources',
    name: 'Citations & Sources',
    category: 'Quality',
    inherentSeverity: 'Medium',
    description: 'Requires citing sources and providing references',
  },
  {
    id: 'formatting-guidelines',
    name: 'Formatting Guidelines',
    category: 'UX',
    inherentSeverity: 'Low',
    description: 'Specifies how responses should be formatted (bullets, tables, numbered steps) for structured or multi-part output',
  },
  {
    id: 'clarifying-questions',
    name: 'Clarifying Questions',
    category: 'UX',
    inherentSeverity: 'Medium',
    description: 'Handles ambiguous queries with clarification requests',
  },
  {
    id: 'prompt-injection-resilience',
    name: 'Prompt Injection Protection',
    category: 'Safety',
    inherentSeverity: 'High',
    description: 'Safeguards against manipulation attempts',
  },
  {
    id: 'link-safety',
    name: 'Link Safety',
    category: 'Safety',
    inherentSeverity: 'Medium',
    description: 'Ensures only safe/verified links are shared',
  },
  {
    id: 'advice-disclaimers',
    name: 'Advice Disclaimers',
    category: 'Safety',
    inherentSeverity: 'High',
    description: 'Provides disclaimers for sensitive advice domains',
  },
  {
    id: 'accuracy-quality',
    name: 'Accuracy & Quality',
    category: 'Quality',
    inherentSeverity: 'High',
    description: 'Explicitly grounds the agent in knowledge sources and prohibits fabrication or guessing',
  },
  {
    id: 'tool-routing-hints',
    name: 'Tool Routing Hints',
    category: 'Quality',
    inherentSeverity: 'Medium',
    description: 'Provides hints for when to use specific tools or knowledge sources when ambiguous',
  },
  {
    id: 'escalation-guidance',
    name: 'Escalation Guidance',
    category: 'UX',
    inherentSeverity: 'High',
    description: 'Defines what the agent should do when it cannot help — handoff to human, suggest alternative, or graceful exit',
  },
  {
    id: 'deterministic-language',
    name: 'Deterministic Language',
    category: 'Quality',
    inherentSeverity: 'Medium',
    description: 'Uses absolute directives (always, never, only, must) instead of vague modifiers (might, usually, try, sometimes)',
  },
] as const;

/**
 * Known AI variations for criterion IDs
 *
 * Stage C AI may return slightly different IDs. This mapping handles fuzzy matching.
 */
export const CRITERIA_ID_VARIATIONS: Record<string, string> = {
  'formatting-accessibility': 'formatting-guidelines',
  'formatting-': 'formatting-guidelines',
  'citations-format': 'citations-and-sources',
  'citations-': 'citations-and-sources',
  'privacy-': 'privacy-and-sensitive-data',
  'accuracy-': 'accuracy-quality',
  'link-': 'link-safety',
  'advice-': 'advice-disclaimers',
  'tool-routing-': 'tool-routing-hints',
  'tool-': 'tool-routing-hints',
  'escalation-': 'escalation-guidance',
  'deterministic-': 'deterministic-language',
  'vague-': 'deterministic-language',
  'language-': 'deterministic-language',
};

/**
 * Special issue ID indicating missing agent instructions
 *
 * When this issue is present, all 15 criteria are marked as failed.
 */
export const MISSING_INSTRUCTION_INPUT_ID = 'missing-instruction-input';

/**
 * Score thresholds for color coding and labels
 */
export const THRESHOLDS = {
  /** Score >= 80: Excellent (Green) */
  EXCELLENT: 80,

  /** Score >= 60: Good (Amber) */
  GOOD: 60,

  /** Score >= 40: Fair (continues Red) */
  FAIR: 40,

  /** Score < 40: Needs Improvement (Red) */
} as const;

/**
 * Severity calculation rules for patterns
 *
 * Based on topic count and pattern name keywords.
 */
export const SEVERITY_RULES = {
  /** Topic count >= 5 OR critical naming issues → High severity */
  HIGH_TOPIC_THRESHOLD: 5,

  /** Topic count >= 2 → Medium severity */
  MEDIUM_TOPIC_THRESHOLD: 2,

  /** Topic count = 1 → Low severity */
  LOW_TOPIC_THRESHOLD: 1,

  /** Keywords that always trigger High severity */
  HIGH_SEVERITY_KEYWORDS: ['model name', 'model description'],

  /** Keywords that trigger Medium severity (unless overridden) */
  MEDIUM_SEVERITY_KEYWORDS: ['variable'],
} as const;

/**
 * Pattern categories for classification
 */
export const PATTERN_CATEGORIES = [
  'Model Naming',
  'Model Description',
  'Input Variables',
  'Output Variables',
  'Architecture',
  'Orchestration',
  'Evaluation',
  'Unknown',
] as const;

/**
 * Compliance categories
 */
export const COMPLIANCE_CATEGORIES = ['Scope', 'UX', 'Safety', 'Quality'] as const;

/**
 * Score color values
 */
export const SCORE_COLORS = {
  /** Green: score >= 80 */
  SUCCESS: '#107c10',

  /** Amber: score >= 60 */
  WARNING: '#ffaa44',

  /** Red: score < 60 */
  ERROR: '#d13438',
} as const;

/**
 * Review execution configuration
 */
export const REVIEW_CONFIG = {
  /** Maximum review execution time (2 minutes) */
  MAX_DURATION_MS: 120000,

  /** Target review time for typical agent (<20 topics) */
  TARGET_DURATION_MS: 60000,

  /** Stage A target time */
  STAGE_A_TARGET_MS: 5000,

  /** Retry configuration for AI invocations */
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1000,
  RETRY_MAX_DELAY_MS: 30000,

  /** Progress percentage milestones */
  PROGRESS: {
    START: 0,
    STAGE_A_COMPLETE: 10,
    STAGE_B_COMPLETE: 30,
    STAGE_C_COMPLETE: 60,
    STAGE_D_START: 85,
    STAGE_D_COMPLETE: 95,
    COMPLETE: 100,
  },
} as const;

/**
 * Grid pagination options
 */
export const GRID_PAGINATION_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Default pagination size
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * MS Learn documentation links per pattern name.
 * Shown in the PatternDetailsDialog as a "Learn more" link.
 */
export const PATTERN_LEARN_DOCS: Record<string, { label: string; url: string }> = {
  'Unclear Model Name': {
    label: 'Generative orchestration — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions#:~:text=Use%20a%20descriptive%20and%20unique%20name,Avoid%20using%20generic%20or%20ambiguous%20names%20that%20could%20be%20confusing.',
  },
  'Unclear Model Description': {
    label: 'Generative orchestration — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions#:~:text=The%20most%20important%20factor%20is%20the%20description%20of%20the%20topics%2C%20tools%2C%20agents%2C%20and%20knowledge%20sources',
  },
  'Unclear Input Variable Name': {
    label: 'Work with variables — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-variables',
  },
  'Unclear Input Variable Description': {
    label: 'Work with variables — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-variables',
  },
  'Unclear Output Variable Name': {
    label: 'Work with variables — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-variables',
  },
  'Unclear Output Variable Description': {
    label: 'Work with variables — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-variables',
  },
  'Overlapping Topic Descriptions': {
    label: 'Generative orchestration — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions#:~:text=If%20multiple%20topics%20have%20similar%20descriptions%2C%20your%20agent%20might%20invoke%20them%20all%20to%20answer%20a%20question',
  },
  'Tool Routing Gap': {
    label: 'Add tools to custom agents — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent#:~:text=Write%20clear%2C%20specific%20descriptions%20including%20what%20the%20tool%20does%20and%20when%20it%20should%20be%20used',
  },
  'Excessive Tools Usage': {
    label: 'Add tools to custom agents — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-tools-custom-agent#:~:text=we%20recommend%20limiting%20the%20number%20of%20tools%20in%20your%20agent%20to%20no%20more%20than%2025%2D30',
  },
  'Inadequate Test Cases': {
    label: 'Test your agent — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-test-bot#:~:text=Test%20your%20agent%20when%20you%20make%20changes%20to%20your%20topics%2C%20to%20make%20sure%20everything%20works%20as%20expected',
  },
};

/**
 * MS Learn documentation links per compliance criterion ID.
 * Shown in the ComplianceDetailsDialog as a "Learn more" link.
 */
export const COMPLIANCE_LEARN_DOCS: Record<string, { label: string; url: string }> = {
  'scope-definition': {
    label: 'High-quality instructions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant%20to%20Contoso%20corporation%20and%20ordering%20coffee.',
  },
  'out-of-scope-handling': {
    label: 'High-quality instructions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Otherwise%2C%20tell%20the%20user%20you%20can%27t%20help%20with%20their%20inquiry.',
  },
  'persona-and-tone': {
    label: 'Tone instructions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=If%20you%20want%20your%20agent%20to%20be%20professional%20and%20speak%20politely%2C%20you%20don%27t%20need%20to%20give%20instructions%20for%20this%20tone',
  },
  'privacy-and-sensitive-data': {
    label: 'Data protection — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/evaluation-triage-remediation#:~:text=Don%27t%20display%2C%20store%2C%20or%20repeat%20personal%20data',
  },
  'fallback-when-uncertain': {
    label: 'High-quality instructions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Change%20the%20default%20fallback%20message',
  },
  'citations-and-sources': {
    label: 'Citations guidance — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/evaluation-triage-remediation#:~:text=When%20referencing%20source%20material%2C%20cite%20the%20document%20name%20and%20section',
  },
  'formatting-guidelines': {
    label: 'Response format — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=give%20the%20agent%20instructions%20on%20how%20it%20should%20format%20or%20structure%20responses',
  },
  'clarifying-questions': {
    label: 'Use follow-up questions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Use%20follow-up%20questions%20to%20clarify%20intent%2C%20gather%20missing%20inputs%2C%20and%20surface%20relevant%20actions',
  },
  'prompt-injection-resilience': {
    label: 'Jailbreak protection — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Triggers%20might%20be%20vulnerable%20to%20jailbreak%20attacks',
  },
  'link-safety': {
    label: 'Security best practices — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/system-service-card-copilot-studio#:~:text=Cybersecurity%20Measures',
  },
  'advice-disclaimers': {
    label: 'Sensitive domain boundaries — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/system-service-card-copilot-studio#:~:text=Define%20clear%20boundaries%20for%20agent%20actions%2C%20especially%20in%20sensitive%20domains',
  },
  'accuracy-quality': {
    label: 'Knowledge grounding — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/evaluation-triage-remediation#:~:text=Only%20answer%20based%20on%20information%20found%20in%20your%20knowledge%20sources',
  },
  'tool-routing-hints': {
    label: 'Tool routing hints — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Instead%2C%20focus%20on%20adding%20instructions%20only%20for%20cases%20where%20you%20want%20to%20give%20the%20agent%20hints%20when%20the%20right%20tool%20or%20knowledge%20source%20might%20be%20ambiguous',
  },
  'escalation-guidance': {
    label: 'Fallback topic — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-system-fallback-topic#:~:text=the%20custom%20or%20Copilot%20agent%20escalates%20to%20a%20live%20representative%20through%20a%20system%20topic%20called%20Escalate',
  },
  'deterministic-language': {
    label: 'Avoid ambiguous instructions — MS Learn',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Avoid%20vague%20phrases',
  },
};

/**
 * Search debounce delay (ms)
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * React Query stale times
 */
export const STALE_TIMES = {
  /** Bot list stale time: 5 minutes */
  BOTS: 5 * 60 * 1000,

  /** Reviews stale time: 1 minute */
  REVIEWS: 1 * 60 * 1000,

  /** Tour status stale time: 10 minutes */
  TOUR_STATUS: 10 * 60 * 1000,
} as const;

/**
 * File upload content types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  PDF: 'application/pdf',
  SARIF: 'application/sarif+json',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/**
 * Dataverse table names
 */
export const TABLE_NAMES = {
  BOT: 'bot',
  BOT_COMPONENT: 'botcomponent',
  AGENT_REVIEWS: 'cat_agentreviews',
  AGENT_REVIEW_FRE: 'cat_agentreviewfre',
} as const;

/**
 * Component type constants (for YAML parsing)
 */
export const COMPONENT_TYPES = {
  TOPIC: 'BotTopic',
  TOOL: 'ActionTool',
  KNOWLEDGE: 'Knowledge',
  TEST_CASE: 'TestCase',
  INSTRUCTIONS: 'AgentInstructions',
} as const;
