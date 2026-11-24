import type { BotComponent, ParsedBotData, MissingFields, MissingFieldEvidence } from '../contracts/ServiceContracts';
import type {
  ChildAgentDetail, KnowledgeDetail, LocalStageAOutput, ResourceDetail, StageBTopicComponent,
  TestCaseDetail, ToolDetail, ToolType, UpgradeReadinessEvidence,
} from '../contracts/StageOutputs';
import { yamlParsingService } from '../services/YamlParsingService';
import { classifyComponent } from './componentClassification';
import { extractStandardTopic } from './topicExtraction';
import { aggregateTopicScope, recordValue, textValue } from './topicApplicability';
import { countPowerFxExpressions, UPGRADE_READINESS_POWER_FX_LIMIT } from './powerFxUsage';
import { isSystemTopic } from './systemTopic';

const localFieldRules = [
  'Missing Model Name', 'Missing Model Description', 'Missing Input Variable Name',
  'Missing Input Variable Description', 'Missing Output Variable Name', 'Missing Output Variable Description',
];

function toolType(parsed: Record<string, unknown> | undefined): ToolType {
  switch (parsed?.kind) {
    case 'FlowTool': return 'flow';
    case 'McpTool': return 'mcp';
    case 'ConnectorTool': return 'connector';
    case 'PromptTool':
    case 'AIBuilderPromptTool': return 'prompt';
  }
  switch (recordValue(parsed?.action)?.kind) {
    case 'InvokeFlowTaskAction': return 'flow';
    case 'InvokeExternalAgentTaskAction': return 'mcp';
    case 'InvokeConnectorTaskAction': return 'connector';
    case 'InvokeAIBuilderModelTaskAction': return 'prompt';
    default: return 'unknown';
  }
}

function knowledgeDetail(name: string, parsed: Record<string, unknown> | undefined): KnowledgeDetail {
  if (parsed?.kind === 'FileAttachmentComponentMetadata') return { name, sourceType: 'File' };
  const source = recordValue(parsed?.source);
  switch (source?.kind) {
    case 'SharePointSearchSource': return { name, sourceType: 'SharePoint', url: textValue(source.site) };
    case 'WebSearchSource':
    case 'WebSource': return { name, sourceType: 'Web', url: textValue(source.url) };
    case 'DataverseSource': return { name, sourceType: 'Dataverse' };
    case 'FileSource':
    case 'DocumentSource': return { name, sourceType: 'File' };
    default: return { name, sourceType: 'Unknown' };
  }
}

function parseComponentContent(component: BotComponent): Record<string, unknown> | undefined {
  const content = component.content?.trim() ? component.content : undefined;
  const data = component.data?.trim() ? component.data : undefined;
  const primary = component.componenttype === '0' ? content ?? data : data ?? content;
  let parsed = primary ? recordValue(yamlParsingService.parseYAML(primary)) : undefined;
  // Tools and child agents use data. Topics retain their existing content-column precedence.
  if (component.componenttype === '9' && content && data && content !== data && parsed
    && (parsed.kind === 'AdaptiveDialog' || parsed.kind === undefined)) {
    const contentTopic = recordValue(yamlParsingService.parseYAML(content));
    if (parsed.kind === 'AdaptiveDialog' || contentTopic?.kind === 'AdaptiveDialog') {
      parsed = contentTopic?.kind === 'AdaptiveDialog' ? contentTopic : undefined;
    }
  }
  return parsed && Object.keys(parsed).length ? parsed : undefined;
}

function configuredContent(component: BotComponent): string {
  return JSON.stringify([
    component.componenttype, component.name, component.schemaname, component.content, component.data,
    component.description, component.parentbotcomponentid, component.filedata_name,
  ]);
}

/** Record a custom topic or a tool that has Power Fx expressions. */
function recordPowerFxUsage(
  usage: UpgradeReadinessEvidence['powerFx'],
  name: string,
  kind: 'topic' | 'tool',
  parsed: Record<string, unknown>,
): void {
  const expressionCount = countPowerFxExpressions(parsed);
  if (expressionCount > 0) usage.push({ name, kind, expressionCount });
}

/** Parse and classify each component once; retain unavailable content as an assessment limit. */
export function parseStandardComponents(
  components: BotComponent[], botId: string, botName: string,
  orchestrationMode: LocalStageAOutput['orchestrationMode'], source: 'live' | 'zip',
): ParsedBotData & { topicComponents: StageBTopicComponent[] } {
  const topicComponents: StageBTopicComponent[] = [];
  const topics: string[] = [];
  const toolDetails: ToolDetail[] = [];
  const knowledgeDetails: KnowledgeDetail[] = [];
  const childAgents: ChildAgentDetail[] = [];
  const connectedAgents: ResourceDetail[] = [];
  const entities: ResourceDetail[] = [];
  const configurationComponents: ResourceDetail[] = [];
  const unknownComponents: ResourceDetail[] = [];
  const classifiedComponentIds = new Set<string>();
  const knowledgeEvidence: UpgradeReadinessEvidence['knowledgeSources'] = [];
  const powerFxUsage: UpgradeReadinessEvidence['powerFx'] = [];
  const testCaseDetails: TestCaseDetail[] = [];
  const testCases: string[] = [];
  const parsingErrors: string[] = [];
  if (!components.length) parsingErrors.push('No component configuration was supplied for assessment.');
  const missingFields: MissingFields = {
    missingModelNames: [], missingModelDescriptions: [],
    missingInputVariableNames: [], missingInputVariableDescriptions: [],
    missingOutputVariableNames: [], missingOutputVariableDescriptions: [],
  };
  const missingFieldEvidence: MissingFieldEvidence = {};
  let agentInstructions: string | undefined;
  let readableComponentCount = 0;
  const grouped = new Map<string | number, BotComponent[]>();
  components.forEach((component, index) => {
    const identity = component.componentidunique || component.botcomponentid || component.schemaname || index;
    const group = grouped.get(identity) ?? [];
    group.push(component);
    grouped.set(identity, group);
  });

  for (const group of grouped.values()) {
    const component = group[0];
    const name = component.name || 'Unnamed';
    if (group.some(other => configuredContent(other) !== configuredContent(component))) {
      const reason = 'Conflicting configurations share a component identity; no authoritative version was selected.';
      unknownComponents.push({ name, componentId: component.botcomponentid, schemaName: component.schemaname, reason });
      parsingErrors.push(reason);
      continue;
    }
    const parsed = parseComponentContent(component);
    const classification = classifyComponent(component, parsed);
    if (parsed && classification.category !== 'unknown') readableComponentCount++;
    if (classification.category !== 'unknown' && component.botcomponentid) {
      classifiedComponentIds.add(component.botcomponentid);
    }
    if (!parsed) parsingErrors.push(`Configuration for "${name}" is absent or unreadable.`);
    const detail: ResourceDetail = {
      name, componentId: component.botcomponentid, schemaName: component.schemaname,
      kind: classification.sourceKind, targetSchemaName: classification.targetSchemaName,
      targetId: classification.targetId,
      parentComponentId: component.parentbotcomponentid,
      description: textValue(parsed?.modelDescription)?.trim()
        ? textValue(parsed?.modelDescription) : textValue(component.description),
      reason: classification.reason,
    };
    switch (classification.category) {
      case 'metadata': {
        if (parsed && !agentInstructions && (component.componenttype === '15' || parsed.kind === 'GptComponentMetadata')) {
          const instructions = yamlParsingService.extractAgentInstructions(parsed);
          if (typeof instructions === 'string' && instructions.trim()) agentInstructions = instructions;
        }
        break;
      }
      case 'topic':
        topics.push(name);
        if (parsed) {
          const topic = extractStandardTopic(component, parsed, orchestrationMode, missingFields, missingFieldEvidence);
          topicComponents.push(topic);
          // The report lists custom topics only, so the parser does not record system topics.
          if (!isSystemTopic(topic)) recordPowerFxUsage(powerFxUsage, name, 'topic', parsed);
        } else topicComponents.push({
          TopicName: name, TopicId: component.botcomponentid, SchemaName: component.schemaname,
          ParseStatus: 'unavailable',
        });
        break;
      case 'tool':
        toolDetails.push({ ...detail, displayName: textValue(parsed?.modelDisplayName), toolType: toolType(parsed) });
        if (parsed) recordPowerFxUsage(powerFxUsage, name, 'tool', parsed);
        break;
      case 'child-agent':
        childAgents.push({
          ...detail,
          description: textValue(recordValue(parsed?.beginDialog)?.description)?.trim()
            ? textValue(recordValue(parsed?.beginDialog)?.description) : detail.description,
        });
        break;
      case 'connected-agent':
        connectedAgents.push(detail);
        break;
      case 'entity':
        entities.push(detail);
        break;
      case 'configuration':
        configurationComponents.push(detail);
        break;
      case 'knowledge':
        knowledgeDetails.push({ ...detail, ...knowledgeDetail(name, parsed) });
        knowledgeEvidence.push({
          name,
          kind: textValue(recordValue(parsed?.source)?.kind)?.trim() || textValue(parsed?.kind)?.trim() || 'Unknown',
        });
        break;
      case 'test': {
        testCases.push(name);
        if (parsed?.kind === 'EvaluationData') {
          const row = Array.isArray(parsed.rows) ? recordValue(parsed.rows[0]) : undefined;
          testCaseDetails.push({
            ...detail,
            name, input: textValue(row?.input) ?? name,
            source: row?.source === 'Generated' ? 'Generated' : 'Manual',
          });
        }
        break;
      }
      case 'unknown':
        unknownComponents.push(detail);
        break;
    }
  }

  // A localisation variant or sub-row of a component we already classified is not an
  // independent unclassified component: its parent is inventoried and counted, so
  // reporting the child again would both overstate the unknown population and block
  // every rule that refuses to run against an incompletely read configuration.
  const independentUnknownComponents = unknownComponents.filter(resource =>
    !(resource.parentComponentId && classifiedComponentIds.has(resource.parentComponentId)));

  return {
    botId, botName, topics, topicComponents, missingFields, missingFieldEvidence, orchestrationMode, source,
    configurationAvailable: readableComponentCount > 0,
    tools: toolDetails.map(t => t.name), knowledgeSources: knowledgeDetails.map(k => k.name), testCases,
    topicCount: topics.length, toolCount: toolDetails.length,
    knowledgeCount: knowledgeDetails.length, testCaseCount: testCases.length,
    agentInstructions, toolDetails, knowledgeDetails, childAgents, connectedAgents, entities,
    configurationComponents, unknownComponents: independentUnknownComponents, testCaseDetails, parsingErrors,
    upgradeReadinessEvidence: {
      knowledgeSources: knowledgeEvidence,
      powerFx: powerFxUsage.slice(0, UPGRADE_READINESS_POWER_FX_LIMIT),
      powerFxComponentCount: powerFxUsage.length,
    },
    ruleScopes: Object.fromEntries(localFieldRules.map(name => [
      name, aggregateTopicScope(topicComponents, name,
        independentUnknownComponents.length || (readableComponentCount ? 0 : 1)),
    ])),
  };
}
