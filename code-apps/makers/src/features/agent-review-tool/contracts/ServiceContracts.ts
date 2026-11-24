/**
 * Service Contract Interfaces
 *
 * These interfaces define the contracts for all service layer classes.
 * Services wrap generated Dataverse services with business logic.
 */

import type {
  BotMetadata,
  ReviewResult,
  ReviewGridRow,
  DashboardStats,
} from './ReviewResult';
import type {
  LocalStageAOutput,
  ToolDetail,
  KnowledgeDetail,
  ChildAgentDetail,
  TestCaseDetail,
  LocalPattern,
  TopicRuleApplicability,
  ResourceDetail,
  StageBTopicComponent,
  PatternTopic,
  UpgradeReadinessEvidence,
} from './StageOutputs';

export type { LocalPattern } from './StageOutputs';
/**
 * IReviewService
 *
 * Wraps Cat_agentreviewsService with business logic for managing review records.
 */
export interface IReviewService {
  /**
   * Get existing reviews for specified bot IDs
   * @param botIds - Array of bot IDs to fetch reviews for
   * @returns Array of review results
   */
  getExistingReviews(botIds: string[]): Promise<ReviewResult[]>;

  /**
   * Save a review result to Dataverse
   * Implements deduplication logic using cat_componentidunique
   * @param review - Review result to save
   * @returns Saved review result with reviewId
   */
  saveReviewResult(review: ReviewResult): Promise<ReviewResult>;

  /**
   * Delete a review by ID
   * @param reviewId - Review record ID to delete
   */
  deleteReview(reviewId: string): Promise<void>;

  /**
   * Get review grid rows for dashboard display
   * Joins bot and review data
   * @param bots - All active bots
   * @param reviews - All existing reviews
   * @returns Grid-ready rows
   */
  getReviewGridRows(
    bots: BotMetadata[],
    reviews: ReviewResult[]
  ): ReviewGridRow[];

  /**
   * Calculate dashboard statistics
   * @param bots - All active bots
   * @param reviews - All existing reviews
   * @returns Aggregated stats
   */
  calculateDashboardStats(
    bots: BotMetadata[],
    reviews: ReviewResult[]
  ): DashboardStats;
}

/**
 * IBotService
 *
 * Wraps BotsService and BotcomponentsService for reading bot data.
 */
export interface IBotService {
  /**
   * Get all active bots in the environment
   * Filters by statecode eq 0 (active)
   * @returns Array of bot metadata
   */
  getAllActiveBots(): Promise<BotMetadata[]>;

  /**
   * Resolve one active, published bot by its exact schema name.
   * @param schemaName - Connected-agent target schema name
   * @param orgUrl - Optional source-environment organization URL
   */
  getBotBySchemaName(
    schemaName: string,
    orgUrl?: string | null,
  ): Promise<BotSchemaMatch | null>;

  /**
   * Get the raw Copilot bot configuration.
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional source-environment organization URL
   */
  getBotConfiguration(botId: string, orgUrl?: string | null): Promise<string>;

  /**
   * Get the raw bot configuration and the bot template in one request.
   * The harness check needs both values (issue 947, rule 2).
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional source-environment organization URL
   */
  getBotHarnessSource(
    botId: string,
    orgUrl?: string | null,
  ): Promise<{ configuration: string; template?: string }>;

  /**
   * Get the agent authentication mode (bot column `authenticationmode`).
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional source-environment organization URL
   * @returns The mode, or undefined when it is missing or is not a whole number.
   */
  getBotAuthenticationMode(botId: string, orgUrl?: string | null): Promise<number | undefined>;

  /**
   * Get bot components (YAML configuration) for a bot
   * @param botId - Bot unique identifier
   * @returns Array of botcomponent records
   */
  getBotComponents(
    botId: string,
    orgUrl?: string | null,
    options?: BotComponentFetchOptions,
  ): Promise<BotComponent[]>;

  /**
   * Get full bot metadata including components
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional org URL for cross-environment fetch
   * @returns Complete bot metadata
   */
  getBotMetadata(botId: string, orgUrl?: string | null): Promise<BotMetadata>;
}

/** Minimal exact-schema bot lookup used to resolve connected agents. */
export interface BotSchemaMatch {
  botId: string;
  name: string;
  schemaName: string;
  configuration: string;
}

/** Controls whether component retrieval may degrade to an empty inventory. */
export interface BotComponentFetchOptions {
  throwOnError?: boolean;
}

/**
 * Bot component record from botcomponent table
 */
export interface BotComponent {
  /** Unique component ID */
  botcomponentid: string;

  /** Bot ID this component belongs to */
  botid: string;

  /** Component type (e.g., "BotTopic", "ActionTool", "Knowledge") */
  componenttype: string;

  /** YAML content (content column — may be null for tool components) */
  content: string;

  /** YAML data (data column — used by tool components: flow, MCP, connector, AI prompt) */
  data?: string;

  /** Component name */
  name: string;

  /**
   * Component description column.
   *
   * The designer writes tool and connected-agent descriptions here, not into the
   * YAML `data` payload. Reading only the YAML made every description look
   * missing, so `TOL-02` and `CON-03` fired on agents that were correctly
   * described.
   */
  description?: string;

  /** Component unique identifier (used for deduplication) */
  componentidunique: string;

  /** Schema name */
  schemaname: string;

  /** Modified date */
  modifiedon?: Date;

  /** Parent bot GUID (populated for child skill-bundle file components) */
  parentbotid?: string;

  /** Parent botcomponent GUID (the skill component that owns this file) */
  parentbotcomponentid?: string;

  /** File attachment field reference (botcomponent type 14) */
  filedata?: string;

  /** Original file name for the file attachment */
  filedata_name?: string;

  /** Component state: 0 = Published, 1 = Unpublished */
  componentstate?: number;

  /** Record state code: 0 = Active */
  statecode?: number;

  /** Record status code: 1 = Active */
  statuscode?: number;

  /** Row version number used for deduplication across component layers */
  versionnumber?: number;
}

/**
 * IYamlParsingService
 *
 * Handles YAML preprocessing and parsing logic.
 */
export interface IYamlParsingService {
  /**
   * Preprocess YAML content to fix common issues
   * Implements 5 transformation rules from pcf-extracted-logic.md
   * @param yamlContent - Raw YAML string
   * @returns Preprocessed YAML string
   */
  preprocessYAML(yamlContent: string): string;

  /**
   * Parse YAML content to JavaScript object
   * @param yamlContent - YAML string (preprocessed)
   * @returns Parsed object
   */
  parseYAML(yamlContent: string): unknown;

  /**
   * Extract agent instructions from parsed YAML
   * Looks for AgentInstructions component
   * @param parsedYaml - Parsed YAML object
   * @returns Agent instructions text or undefined
   */
  extractAgentInstructions(parsedYaml: unknown): string | undefined;

  /**
   * Parse bot component YAML
   * Combines preprocessing and parsing
   * @param yamlContent - Raw YAML string
   * @returns Parsed object or null if invalid
   */
  parseComponentYAML(yamlContent: string): unknown | null;
}

/**
 * IStageAService
 *
 * Implements Stage A: Local Data Extraction logic.
 */
export interface IStageAService {
  /**
   * Execute Stage A: Parse YAML and generate local patterns
   * @param botId - Bot unique identifier
   * @returns Stage A output with local patterns
   */
  executeStageA(botId: string, orgUrl?: string | null): Promise<LocalStageAOutput>;

  /**
   * Generate local patterns (8 patterns always created)
   * Implements logic from pcf-extracted-logic.md Section 6
   * @param botData - Parsed bot data
   * @returns Array of local patterns
   */
  generateLocalPatterns(botData: ParsedBotData): LocalPattern[];

  /**
   * Count components by type
   * @param components - All bot components
   * @param componentType - Type to count (e.g., "BotTopic")
   * @returns Count of matching components
   */
  countComponentsByType(
    components: BotComponent[],
    componentType: string
  ): number;
}

/**
 * Missing fields detected during Stage A local parsing.
 * Used to generate patterns 1-6 deterministically without AI.
 */
export interface MissingFields {
  /** Topic names missing modelDisplayName */
  missingModelNames: string[];
  /** Topic names missing modelDescription */
  missingModelDescriptions: string[];
  /** Topic+variable pairs missing input variable displayName */
  missingInputVariableNames: Array<{ topic: string; variable: string }>;
  /** Topic+variable pairs missing input variable description */
  missingInputVariableDescriptions: Array<{ topic: string; variable: string }>;
  /** Topic+variable pairs missing output variable displayName */
  missingOutputVariableNames: Array<{ topic: string; variable: string }>;
  /** Topic+variable pairs missing output variable description */
  missingOutputVariableDescriptions: Array<{ topic: string; variable: string }>;
}

/** Item identity captured where a missing field is observed, before name aggregation. */
export type MissingFieldEvidence = Partial<Record<keyof MissingFields, PatternTopic[]>>;

/**
 * Agent-level settings captured from the bot Dataverse record.
 * Sourced from: bot.configuration JSON (aISettings) + bot.language + bot.authenticationmode
 */
export interface AgentSettings {
  /** Unknown when the reviewed configuration does not declare a supported mode. */
  orchestrationMode?: 'generative' | 'classic' | 'unknown';
  /** Primary language of the agent (e.g., "English") */
  language?: string;
  /** Authentication mode (e.g., "No Authentication", "Entra ID") */
  authenticationMode?: string;
  /** Whether model knowledge (web search / Bing) is enabled */
  useModelKnowledge?: boolean;
  /** Whether semantic search over knowledge sources is enabled */
  isSemanticSearchEnabled?: boolean;
  /** Whether the agent is opted in to use the latest AI models */
  optInUseLatestModels?: boolean;
}

/**
 * Parsed bot data structure
 */
export interface ParsedBotData {
  botId: string;
  botName: string;
  /** Agent-level description from applicationmanifestinformation */
  agentDescription?: string;
  /** Agent-level settings from bot record + configuration JSON */
  agentSettings?: AgentSettings;
  topics: string[];
  tools: string[];
  knowledgeSources: string[];
  testCases: string[];
  agentInstructions?: string;
  topicCount: number;
  toolCount: number;
  knowledgeCount: number;
  testCaseCount: number;
  toolDetails?: ToolDetail[];
  knowledgeDetails?: KnowledgeDetail[];
  childAgents?: ChildAgentDetail[];
  testCaseDetails?: TestCaseDetail[];
  topicComponents?: StageBTopicComponent[];
  orchestrationMode?: 'generative' | 'classic' | 'unknown';
  source?: 'live' | 'zip';
  parsingErrors?: string[];
  connectedAgents?: ResourceDetail[];
  entities?: ResourceDetail[];
  configurationComponents?: ResourceDetail[];
  unknownComponents?: ResourceDetail[];
  ruleScopes?: Record<string, TopicRuleApplicability>;
  configurationAvailable?: boolean;
  upgradeReadinessEvidence?: UpgradeReadinessEvidence;
  /** Missing field data for local pattern generation (patterns 1-6) */
  missingFields: MissingFields;
  missingFieldEvidence?: MissingFieldEvidence;
}
