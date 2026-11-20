import type { BotComponent } from '../contracts/ServiceContracts';

/** Distinct resource categories used by the standard agent review. */
export type ComponentCategory =
  | 'topic'
  | 'tool'
  | 'child-agent'
  | 'connected-agent'
  | 'entity'
  | 'knowledge'
  | 'test'
  | 'configuration'
  | 'metadata'
  | 'unknown';

/** Classification evidence; resource identity remains on the original component. */
export interface ComponentClassification {
  category: ComponentCategory;
  /** Original top-level YAML kind, without case or spelling normalization. */
  sourceKind?: string;
  /** Explicit connected-agent target schema, never inferred from the resource name. */
  targetSchemaName?: string;
  /** Explicit connected-agent target bot ID, kept separate from a schema name. */
  targetId?: string;
  reason?: string;
}

const kindCategories = new Map<string, ComponentCategory>([
  ['AdaptiveDialog', 'topic'],
  ['AgentDialog', 'child-agent'],
  ['ConnectorTool', 'tool'],
  ['McpTool', 'tool'],
  ['FlowTool', 'tool'],
  ['PromptTool', 'tool'],
  ['AIBuilderPromptTool', 'tool'],
  ['ClosedListEntity', 'entity'],
  ['RegexEntity', 'entity'],
  ['ExternalEntity', 'entity'],
  ['KnowledgeSourceConfiguration', 'knowledge'],
  ['FileAttachmentComponentMetadata', 'knowledge'],
  ['EvaluationSet', 'test'],
  ['EvaluationData', 'test'],
  ['MultiTurnEvaluationCase', 'test'],
  ['SingleTurnEvaluationCase', 'test'],
  ['TestSetDefinition', 'test'],
  ['TestCaseDefinition', 'test'],
  ['Variable', 'configuration'],
  ['GptComponentMetadata', 'metadata'],
  ['DefaultFeedbackCollection', 'metadata'],
  ['NoFeedbackCollection', 'metadata'],
  ['ExternalTriggerConfiguration', 'metadata'],
  ['WorkflowExternalTrigger', 'metadata'],
  ['IvrBotSettings', 'metadata'],
  ['ContentModerationSettings', 'metadata'],
]);

const ordinaryToolActions = new Set([
  'InvokeFlowTaskAction',
  'InvokeConnectorTaskAction',
  'InvokeAIBuilderModelTaskAction',
  'InvokeExternalAgentTaskAction',
]);

// Topic (V2), type 9, also stores tools and agents: it cannot identify a category alone.
const componentTypeCategories = new Map<string, ComponentCategory>([
  ['0', 'topic'],
  ['2', 'metadata'],
  ['3', 'entity'],
  ['5', 'metadata'],
  ['6', 'metadata'],
  ['7', 'metadata'],
  ['8', 'metadata'],
  ['10', 'metadata'],
  ['11', 'entity'],
  ['12', 'metadata'],
  ['14', 'knowledge'],
  ['15', 'metadata'],
  ['16', 'knowledge'],
  ['17', 'metadata'],
  ['18', 'metadata'],
  ['19', 'test'],
]);

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function connectedAgent(sourceKind: string, target: unknown): ComponentClassification {
  const result: ComponentClassification = { category: 'connected-agent', sourceKind };
  const schemaName = text(field(target, 'botSchemaName'));
  const botId = text(field(target, 'botId'));
  if (schemaName) result.targetSchemaName = schemaName;
  if (botId) result.targetId = botId;
  if (!schemaName && !botId) {
    result.reason = 'The connected-agent target schema or ID was not supplied or is unreadable.';
  }
  return result;
}

/**
 * Classify an already parsed component without I/O, YAML parsing or mutation.
 * Callers retain the source component's identity and pass null for unreadable YAML.
 * Explicit top-level kinds take precedence over component codes; unknown kinds
 * and unavailable type-9/action metadata remain unknown rather than knowledge.
 */
export function classifyComponent(
  component: Pick<BotComponent, 'componenttype'>,
  parsed: unknown,
): ComponentClassification {
  const sourceKind = text(field(parsed, 'kind'));
  if (sourceKind === 'TaskDialog') {
    const action = field(parsed, 'action');
    const actionKind = text(field(action, 'kind'));
    if (actionKind === 'InvokeConnectedAgentTaskAction') {
      return connectedAgent(sourceKind, action);
    }
    if (actionKind && ordinaryToolActions.has(actionKind)) {
      return { category: 'tool', sourceKind };
    }
    return {
      category: 'unknown',
      sourceKind,
      reason: `TaskDialog action kind '${actionKind ?? 'none'}' is unrecognized or unavailable.`,
    };
  }
  if (sourceKind === 'ConnectedAgentTool') return connectedAgent(sourceKind, parsed);
  if (sourceKind) {
    const category = kindCategories.get(sourceKind);
    return category ? { category, sourceKind } : {
      category: 'unknown',
      sourceKind,
      reason: `Unrecognized component kind '${sourceKind}'; inventoried but not assessed.`,
    };
  }

  const rawType = component.componenttype;
  const componentType = typeof rawType === 'string' || typeof rawType === 'number'
    ? String(rawType) : undefined;
  const category = componentTypeCategories.get(componentType ?? '');
  return category ? {
    category,
    reason: `Classified from component type '${componentType}'; the top-level kind is missing or unreadable.`,
  } : {
    category: 'unknown',
    reason: `Component type '${componentType ?? 'none'}' is ambiguous or unsupported without a readable kind.`,
  };
}
