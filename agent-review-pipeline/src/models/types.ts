/**
 * Shared types for the standalone agent review pipeline.
 */

export type Severity = 'High' | 'Medium' | 'Low';

/** Bot component record parsed from a solution ZIP. */
export interface BotComponent {
  botcomponentid: string;
  botid: string;
  componenttype: string;
  content: string;
  data?: string;
  name: string;
  componentidunique: string;
  schemaname: string;
  modifiedon?: Date;
}

/** Missing deterministic fields detected during Stage A parsing. */
export interface MissingFields {
  missingModelNames: string[];
  missingModelDescriptions: string[];
  missingInputVariableNames: Array<{ topic: string; variable: string }>;
  missingInputVariableDescriptions: Array<{ topic: string; variable: string }>;
  missingOutputVariableNames: Array<{ topic: string; variable: string }>;
  missingOutputVariableDescriptions: Array<{ topic: string; variable: string }>;
}

/** Agent settings carried through Stage A output when available. */
export interface AgentSettings {
  language?: string;
  authenticationMode?: string;
  useModelKnowledge?: boolean;
  isSemanticSearchEnabled?: boolean;
  optInUseLatestModels?: boolean;
}

/** Variable structure used by Stage B topic components. */
export interface StageBVariable {
  VariableName: string;
  VariableDescription?: string;
}

/** Structured topic payload emitted by Stage A. */
export interface StageBTopicComponent {
  TopicName: string;
  ModelName?: string;
  ModelDescription?: string;
  InputVariables?: StageBVariable[];
  OutputVariables?: StageBVariable[];
  triggerQueries?: string[];
}

/** Tool types inferred from YAML action.kind. */
export type ToolType = 'flow' | 'mcp' | 'connector' | 'prompt' | 'unknown';

/** Structured tool detail extracted from tool components. */
export interface ToolDetail {
  name: string;
  displayName?: string;
  description?: string;
  toolType: ToolType;
}

/** Knowledge source types inferred from YAML source.kind. */
export type KnowledgeSourceType = 'SharePoint' | 'Web' | 'Dataverse' | 'File' | 'Unknown';

/** Structured knowledge source detail extracted from knowledge components. */
export interface KnowledgeDetail {
  name: string;
  sourceType: KnowledgeSourceType;
  url?: string;
}

/** Child agent detail extracted from AgentDialog components. */
export interface ChildAgentDetail {
  name: string;
  description?: string;
}

/** Individual test case detail extracted from EvaluationData components. */
export interface TestCaseDetail {
  name: string;
  input: string;
  source: 'Generated' | 'Manual';
}

/** Deterministic local pattern produced by Stage A. */
export interface LocalPattern {
  patternId: string;
  patternName: string;
  description: string;
  recommendation: string;
  status: boolean;
  topics: string[];
  category: string;
  severity: Severity;
}

/** Parsed bot data structure used while generating Stage A output. */
export interface ParsedBotData {
  botId: string;
  botName: string;
  agentDescription?: string;
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
  missingFields: MissingFields;
}

/** Stage A output payload. */
export interface LocalStageAOutput {
  botId: string;
  botName: string;
  topicCount: number;
  toolCount: number;
  knowledgeCount: number;
  testCaseCount: number;
  agentInstructions?: string;
  agentDescription?: string;
  agentSettings?: AgentSettings;
  localPatterns: LocalPattern[];
  topics: string[];
  tools: string[];
  knowledgeSources: string[];
  orchestrationMode: 'generative' | 'classic';
  topicComponents: StageBTopicComponent[];
  parsingErrors?: string[];
  toolDetails?: ToolDetail[];
  knowledgeDetails?: KnowledgeDetail[];
  childAgents?: ChildAgentDetail[];
  testCaseDetails?: TestCaseDetail[];
}

/** Bot entry extracted from bots/ within a Copilot Studio solution ZIP. */
export interface CSZipBot {
  schemaName: string;
  name: string;
  generativeActionsEnabled: boolean;
  iconBase64?: string;
  description?: string;
}

/** Full parsed result from a Copilot Studio solution ZIP. */
export interface CSZipParseResult {
  bots: CSZipBot[];
  componentsBySchemaName: Record<string, BotComponent[]>;
}

/** Contract implemented by the YAML parsing service. */
export interface IYamlParsingService {
  preprocessYAML(yamlContent: string): string;
  parseYAML(yamlContent: string): unknown;
  extractAgentInstructions(parsedYaml: unknown): string | undefined;
  parseComponentYAML(yamlContent: string): unknown | null;
}

/** Contract implemented by the Stage A service. */
export interface IStageAService {
  executeStageAFromData(
    botMetadata: { botId: string; name: string; description?: string },
    components: BotComponent[]
  ): Promise<LocalStageAOutput>;
  generateLocalPatterns(botData: ParsedBotData): LocalPattern[];
  countComponentsByType(components: BotComponent[], componentType: string): number;
}
