import { load as yamlLoad } from 'js-yaml';
import type {
  AgentInventoryRecord,
  AgentInventoryView,
  AgentOverviewModel,
  AgentUsageRecord,
  CapabilityAdoptionItem,
  DistributionItem,
  GovernancePostureItem,
  InventoryDashboardModel,
  InventoryChoice,
} from '../contracts/types';
import { AGENT_INVENTORY_VIEWS, AUTHENTICATION_CATEGORY_LABELS, classifyAuthentication, isCustomAgent, isYesChoice, type AuthenticationCategory } from './agentViews';

const DAY_MS = 24 * 60 * 60 * 1000;
const AGENT_TYPE_MAPPINGS = [
  { poweredBy: 'Copilot Chat', label: 'Copilot Chat' },
  { poweredBy: 'Standard', label: 'Standard' },
  { poweredBy: 'GitHub Copilot', label: 'GitHub Copilot' },
] as const;

const CAPABILITY_DEFINITIONS: Array<{
  key: keyof AgentInventoryRecord['capabilities'];
  label: string;
  view: AgentInventoryView;
}> = [
  { key: 'usesGenAI', label: 'Gen AI', view: 'capability-generative-ai' },
  { key: 'usesTools', label: 'Tools', view: 'capability-tools-actions' },
  { key: 'usesSkills', label: 'Skills', view: 'capability-skills' },
  { key: 'usesEvaluations', label: 'Evaluations', view: 'capability-evaluations' },
  { key: 'usesPrompts', label: 'AI Builder prompts', view: 'capability-ai-builder-prompts' },
  { key: 'usesMCP', label: 'MCP', view: 'capability-mcp' },
];

const DETAIL_CAPABILITY_LABELS: Array<[keyof AgentInventoryRecord['capabilities'], string]> = [
  ['usesKnowledgeSources', 'Knowledge sources'],
  ...CAPABILITY_DEFINITIONS.map(({ key, label }) => [key, label] as [keyof AgentInventoryRecord['capabilities'], string]),
  ['usesEnhancedSearch', 'Enhanced search'],
  ['usesFileInput', 'File input'],
  ['usesCustomizedResponses', 'Customized responses'],
  ['usesComputer', 'Computer use'],
];

const FEATURE_DETAIL_LABELS: Array<[keyof AgentInventoryRecord['capabilities'] | 'autonomousAgent', string]> = [
  ['usesTools', 'Uses tools'],
  ['usesKnowledgeSources', 'Uses knowledge sources'],
  ['usesSkills', 'Uses skills'],
  ['usesHttpRequests', 'Uses HTTP requests'],
  ['usesCustomKnowledgeSource', 'Uses custom knowledge source'],
  ['usesAIKnowledge', 'Uses AI knowledge'],
  ['usesGenAI', 'Uses generative AI'],
  ['usesMCP', 'Uses MCP'],
  ['usesEnhancedSearch', 'Uses enhanced search results'],
  ['usesCustomizedResponses', 'Customized responses'],
  ['autonomousAgent', 'Autonomous agent'],
  ['usesConnectorMakerAuthContext', 'Uses connector maker auth context'],
  ['usesDeepReasoning', 'Deep reasoning model'],
  ['usesComputer', 'Computer use'],
  ['webSearchEnabled', 'Web search'],
];


function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isDormant(agent: AgentInventoryRecord, lastUsage?: string): boolean {
  const last = validDate(lastUsage ?? agent.lastUsageDate);
  return !last || Date.now() - last.getTime() > 90 * DAY_MS;
}

function aggregateUsageByAgent(usage: AgentUsageRecord[]) {
  const map = new Map<string, { users: number; billed: number; lastUsage?: string }>();
  for (const row of usage) {
    const key = row.agentDetailsId || row.agentId;
    if (!key) continue;
    const current = map.get(key) ?? { users: 0, billed: 0 };
    current.users += row.users;
    current.billed += row.billedCredits;
    if (!current.lastUsage || (row.usageDate && row.usageDate > current.lastUsage)) {
      current.lastUsage = row.usageDate;
    }
    map.set(key, current);
  }
  return map;
}

function riskSignal(agent: AgentInventoryRecord, lastUsage?: string): string {
  const risks: string[] = [];
  if (!agent.owner?.trim()) risks.push('No owner');
  if (agent.status === 'Blocked') risks.push('Blocked');
  const authCategory = classifyAuthentication(agent.authenticationType);
  if (authCategory === 'none') risks.push('No authentication');
  else if (authCategory === 'unknown') risks.push('Authentication unknown');
  if (agent.capabilities.usesConnectorMakerAuthContext === 'yes') risks.push('Maker authentication');
  if (!isYesChoice(agent.capabilities.usesEvaluations)) risks.push('Evaluation missing');
  if (isDormant(agent, lastUsage)) risks.push('Dormant');
  return risks.length > 0 ? risks.slice(0, 2).join(' · ') : 'No issues';
}

function capabilityAdoption(agents: AgentInventoryRecord[]): CapabilityAdoptionItem[] {
  return CAPABILITY_DEFINITIONS.map(({ key, label, view }) => {
    const eligible = agents.filter((agent) => agent.capabilities[key] !== 'na' && agent.capabilities[key] !== 'unknown');
    const value = eligible.filter((agent) => agent.capabilities[key] === 'yes').length;
    return {
      view,
      label,
      value,
      eligible: eligible.length,
      percentage: eligible.length ? Math.round(value / eligible.length * 100) : 0,
    };
  });
}

function distribution(values: string[]): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Agents whose choice value is known (excludes `na`/`unknown`) so adoption
// rates reflect the share of enriched agents rather than the whole portfolio.
function choiceEligibleCount(
  agents: AgentInventoryRecord[],
  selector: (agent: AgentInventoryRecord) => InventoryChoice,
): number {
  return agents.filter((agent) => {
    const value = selector(agent);
    return value !== 'na' && value !== 'unknown';
  }).length;
}

// Unknown/unclassified agents are omitted from the donut UI but still counted
// by risk signal, governance posture and the protected-rate calculation.
const AUTHENTICATION_DONUT_ORDER: AuthenticationCategory[] = ['microsoft', 'manual', 'none'];

function authenticationDistribution(agents: AgentInventoryRecord[]): DistributionItem[] {
  const counts = new Map<AuthenticationCategory, number>();
  for (const agent of agents) {
    const category = classifyAuthentication(agent.authenticationType);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return AUTHENTICATION_DONUT_ORDER.map((category) => {
    const value = counts.get(category) ?? 0;
    return {
      label: AUTHENTICATION_CATEGORY_LABELS[category],
      value,
      description: `${value.toLocaleString()} agents`,
    };
  });
}

function agentTypeDistribution(agents: AgentInventoryRecord[]): {
  items: DistributionItem[];
  unclassifiedCount: number;
} {
  const items = AGENT_TYPE_MAPPINGS
    .map(({ poweredBy, label }) => ({
      label,
      value: agents.filter((agent) => agent.poweredBy === poweredBy).length,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const classifiedCount = items.reduce((total, item) => total + item.value, 0);
  return {
    items,
    unclassifiedCount: agents.length - classifiedCount,
  };
}

export function buildDashboardModel(
  agents: AgentInventoryRecord[],
  usage: AgentUsageRecord[],
): InventoryDashboardModel {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const usageByAgent = aggregateUsageByAgent(usage);
  const monthStarts = Array.from({ length: 12 }, (_, index) =>
    startOfMonth(new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)));

  const customCount = agents.filter((agent) => isCustomAgent(agent)).length;
  const agentTypes = agentTypeDistribution(agents);
  const newAgents = agents.filter((agent) => {
    const date = validDate(agent.createdDate);
    return date && date >= thirtyDaysAgo;
  });

  const topEnvironments = distribution(agents.map((agent) => agent.environmentName?.trim() || 'Unknown environment'))
    .slice(0, 5).map(({ label, value }) => ({ name: label, count: value }));

  const agentsToWatch = agents.map((agent) => {
    const related = usageByAgent.get(agent.id) ?? usageByAgent.get(agent.agentId);
    const users = related?.users ?? 0;
    const billed = related?.billed ?? 0;
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      owner: agent.owner?.trim() || '',
      environment: agent.environmentName || 'Unknown environment',
      poweredBy: agent.poweredBy?.trim() || 'Unknown',
      billedCredits: billed,
      creditsPerUser: users > 0 ? billed / users : undefined,
      lastUsage: related?.lastUsage ?? agent.lastUsageDate,
      riskSignal: riskSignal(agent, related?.lastUsage),
    };
  }).sort((a, b) => {
    const aRisk = a.riskSignal === 'No issues' ? 0 : 1;
    const bRisk = b.riskSignal === 'No issues' ? 0 : 1;
    return bRisk - aRisk || b.billedCredits - a.billedCredits;
  }).slice(0, 25);

  return {
    totalAgents: agents.length,
    environmentCount: new Set(agents.map((agent) => agent.environmentId || agent.environmentName).filter(Boolean)).size,
    enrichedCount: agents.filter((agent) => agent.hasSystemAdminAccess === 'yes').length,
    limitedDetailCount: agents.filter((agent) => agent.hasSystemAdminAccess !== 'yes' || agent.hasPpacMismatch === 'yes').length,
    customCount,
    agentTypes: agentTypes.items,
    unclassifiedAgentTypeCount: agentTypes.unclassifiedCount,
    noAuthenticationCount: agents.filter((agent) => classifyAuthentication(agent.authenticationType) === 'none').length,
    draftAgentsCount: agents.filter((agent) => agent.published === 'no').length,
    autonomousCount: agents.filter((agent) => isYesChoice(agent.autonomousAgent)).length,
    knowledgeAgentsCount: agents.filter(AGENT_INVENTORY_VIEWS['capability-knowledge-sources'].predicate).length,
    draftEligibleCount: choiceEligibleCount(agents, (agent) => agent.published),
    autonomousEligibleCount: choiceEligibleCount(agents, (agent) => agent.autonomousAgent),
    knowledgeEligibleCount: choiceEligibleCount(agents, (agent) => agent.capabilities.usesKnowledgeSources),
    newAgentsLast30Days: newAgents.length,
    publishedNewAgents: newAgents.filter((agent) => Boolean(agent.publishedDate)).length,
    growth: monthStarts.map((date) => {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return {
        date,
        inventory: agents.filter((agent) => {
          const created = validDate(agent.createdDate);
          return created && created < nextMonth;
        }).length,
      };
    }),
    authentication: authenticationDistribution(agents),
    priorities: ([
      ['Connector maker authentication context', 'Connections using maker credentials', 'connector-maker-auth'],
      ['Dormant for 90+ days', 'No recorded usage', 'dormant'],
      ['Evaluation not configured', 'Quality validation is not enabled', 'test-not-configured'],
      ['Unmanaged agents', 'Agents outside managed solutions', 'unmanaged'],
      ['Web search enabled', 'Agents with web search enabled', 'web-search-enabled'],
    ] as Array<[string, string, AgentInventoryView]>).map(([label, description, view]) => ({
      label,
      description,
      view,
      value: agents.filter(AGENT_INVENTORY_VIEWS[view].predicate).length,
    })),
    statuses: distribution(agents.map((agent) => agent.status)),
    capabilities: capabilityAdoption(agents),
    topEnvironments,
    agentsToWatch,
  };
}

function governance(agent: AgentInventoryRecord): GovernancePostureItem[] {
  const authCategory = classifyAuthentication(agent.authenticationType);
  const authHealthy = authCategory === 'microsoft' || authCategory === 'manual';
  const usesEvaluations = isYesChoice(agent.capabilities.usesEvaluations);
  const recent = validDate(agent.lastUsageDate);
  return [
    {
      label: 'End-user authentication',
      description: authHealthy
        ? `${agent.authenticationType} is configured`
        : authCategory === 'unknown'
          ? 'End-user authentication is unknown'
          : 'No end-user authentication is configured',
      state: authHealthy ? 'healthy' : 'review',
      badge: authHealthy ? 'Healthy' : authCategory === 'unknown' ? 'Unknown' : 'Review',
    },
    {
      label: 'Connector maker auth context',
      description: agent.capabilities.usesConnectorMakerAuthContext === 'yes' ? 'One or more connections use maker credentials' : 'No maker authentication context detected',
      state: agent.capabilities.usesConnectorMakerAuthContext === 'yes' ? 'review' : 'healthy',
      badge: agent.capabilities.usesConnectorMakerAuthContext === 'yes' ? 'Review' : 'Healthy',
    },
    {
      label: 'Evaluation coverage',
      description: usesEvaluations
        ? (agent.numberOfEvaluations ?? 0) > 0
          ? `${agent.numberOfEvaluations} evaluation test cases configured`
          : 'Evaluations are configured'
        : 'No evaluation test cases detected',
      state: usesEvaluations ? 'healthy' : 'review',
      badge: usesEvaluations ? 'Configured' : 'Review',
    },
    {
      label: 'Recent activity',
      description: recent ? `Last used ${recent.toLocaleDateString()}` : 'No usage recorded in the available history',
      state: recent && Date.now() - recent.getTime() <= 30 * DAY_MS ? 'healthy' : 'informative',
      badge: recent && Date.now() - recent.getTime() <= 30 * DAY_MS ? 'Active' : 'Inactive',
    },
  ];
}

type ComponentParseOptions = {
  badge: string;
  nameKeys: readonly string[];
  detectionKeys: readonly string[];
  descriptionKeys?: readonly string[];
  urlKeys?: readonly string[];
  detailKeys?: readonly string[];
  detailLabels?: Readonly<Record<string, string>>;
  kinds?: readonly string[];
  cleanConnectionName?: boolean;
};

function normalizeComponentKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseComponentValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return yamlLoad(raw);
  }
}

function findComponentString(value: unknown, keys: readonly string[], depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  for (const key of keys) {
    const normalizedKey = normalizeComponentKey(key);
    const candidate = entries.find(([entryKey]) => normalizeComponentKey(entryKey) === normalizedKey)?.[1];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const [, child] of entries) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const match = findComponentString(item, keys, depth + 1);
        if (match) return match;
      }
    } else {
      const match = findComponentString(child, keys, depth + 1);
      if (match) return match;
    }
  }
  return undefined;
}

function findComponentValue(value: unknown, key: string, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  const normalizedKey = normalizeComponentKey(key);
  const direct = entries.find(([entryKey]) => normalizeComponentKey(entryKey) === normalizedKey)?.[1];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  for (const [, child] of entries) {
    if (!child || typeof child !== 'object') continue;
    const match = findComponentValue(child, key, depth + 1);
    if (match !== undefined) return match;
  }
  return undefined;
}

function formatComponentDetail(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim().replace(/^(['"])(.*)\1$/, '$2');
    return text || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(formatComponentDetail).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(', ') : undefined;
  }
  return undefined;
}

function findComponentUrl(value: unknown, keys: readonly string[]): string | undefined {
  const raw = findComponentString(value, keys);
  const match = raw?.match(/https?:\/\/[^\s'"]+/i)?.[0];
  return match?.replace(/[),.;]+$/, '');
}

function parseNestedComponentValue(value: string): unknown | undefined {
  try {
    const parsed = parseComponentValue(value);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function collectComponentRecords(value: unknown, options: ComponentParseOptions): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectComponentRecords(item, options));
  if (!value || typeof value !== 'object') return [value];

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  const normalizedKeys = new Set(entries.map(([key]) => normalizeComponentKey(key)));
  const kindValue = entries.find(([key]) => normalizeComponentKey(key) === 'kind')?.[1];
  const directKind = typeof kindValue === 'string' ? kindValue.toLowerCase() : undefined;
  const matchesKind = options.kinds?.some((kind) => directKind?.includes(kind.toLowerCase()));
  const matchesKey = options.detectionKeys.some((key) => normalizedKeys.has(normalizeComponentKey(key)));
  if (matchesKind || matchesKey) return [record];

  const nested = Object.values(record).flatMap((child) => {
    if (child && typeof child === 'object') return collectComponentRecords(child, options);
    if (typeof child !== 'string') return [];
    const parsed = parseNestedComponentValue(child);
    return parsed === undefined ? [] : collectComponentRecords(parsed, options);
  });
  return nested.length > 0 ? nested : [record];
}

function parseComponentPayload(raw: string | undefined, options: ComponentParseOptions) {
  if (!raw?.trim()) return { state: 'empty' as const, items: [] };
  const source = raw.trim();
  let parsed: unknown;
  try {
    parsed = parseComponentValue(source);
  } catch {
    return {
      state: 'malformed' as const,
      items: [],
      rawJson: JSON.stringify(source, null, 2),
    };
  }
  let rawJson: string;
  try {
    rawJson = JSON.stringify(parsed, null, 2) ?? JSON.stringify(source, null, 2);
  } catch {
    rawJson = JSON.stringify(source, null, 2);
  }
  const values = collectComponentRecords(parsed, options);
  const items = values.flatMap((value, index) => {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const nested = parseComponentValue(text);
        if (nested && typeof nested === 'object') {
          return collectComponentRecords(nested, options).flatMap((record, nestedIndex) =>
            buildComponentItem(record, index + nestedIndex, options)
          );
        }
      } catch {
        // Plain names, paths, and URLs are valid component values.
      }
      return [{
        id: `${options.badge}-${index}`,
        name: text,
        badge: options.badge,
        url: text.startsWith('http://') || text.startsWith('https://') ? text : undefined,
      }];
    }
    return buildComponentItem(value, index, options);
  });
  return {
    state: items.length > 0 ? 'available' as const : 'empty' as const,
    items,
    rawJson,
  };
}

function buildComponentItem(value: unknown, index: number, options: ComponentParseOptions) {
  if (!value || typeof value !== 'object') return [];
  const genericNameKeys = ['name', 'displayName', 'title', 'label', 'modelDisplayName'];
  const rawName = findComponentString(value, [...options.nameKeys, ...genericNameKeys]);
  const name = rawName
    ? (options.cleanConnectionName ? rawName.split('.').at(-1)?.trim() || rawName : rawName)
    : `${options.badge} ${index + 1}`;
  const url = findComponentUrl(value, options.urlKeys ?? ['url', 'uri', 'link']);
  const detailEntries: Array<{ key: string; value: string }> = [];
  for (const key of options.detailKeys ?? []) {
    const detailValue = formatComponentDetail(findComponentValue(value, key));
    if (!detailValue || detailValue === name || detailEntries.some((entry) => entry.value === detailValue)) continue;
    detailEntries.push({ key, value: detailValue });
  }
  const detail = detailEntries
    .map(({ key, value: detailValue }) => {
      const label = options.detailLabels?.[key];
      return label ? `${label}: ${detailValue}` : detailValue;
    })
    .join(' · ') || undefined;
  const properties = Object.fromEntries(
    detailEntries.flatMap(({ key, value: detailValue }) => {
      const label = options.detailLabels?.[key];
      return label ? [[label, detailValue]] : [];
    }),
  );
  const badge = findComponentString(value, ['sourceType', 'actionKind', 'type', 'kind']) ?? options.badge;
  return [{
    id: `${options.badge}-${index}-${name}`,
    name,
    description: findComponentString(value, options.descriptionKeys ?? ['description', 'summary', 'subtitle', 'purpose', 'modelDescription']),
    detail,
    badge,
    url: url?.startsWith('http://') || url?.startsWith('https://') ? url : undefined,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
  }];
}

function componentSections(agent: AgentInventoryRecord) {
  const definitions = [
    ['knowledge', 'Knowledge sources', 'Grounding sources configured for this agent', 'source', agent.components.knowledgeSources, {
      badge: 'Source',
      nameKeys: ['displayName', 'fileDataName', 'fileName', 'knowledgeSourceName', 'knowledgeSource', 'sourceName'],
      detectionKeys: ['displayName', 'knowledgeType', 'knowledgeSourceConfiguration', 'fileDataName', 'fileName', 'sourceUrl', 'siteUrl'],
      urlKeys: ['sourceUrl', 'siteUrl', 'url', 'uri', 'link', 'value'],
      detailKeys: ['knowledgeType', 'filePath', 'path', 'sourceUrl', 'siteUrl'],
    }],
    ['prompts', 'Prompts', 'Prompt components used by this agent', 'prompt', agent.components.prompts, {
      badge: 'Prompt',
      nameKeys: ['promptName', 'modelDisplayName', 'actionName', 'operationName'],
      detectionKeys: ['promptName', 'toolName', 'modelId', 'aibuildermodelid'],
      detailKeys: ['toolName', 'value', 'modelId', 'operationId'],
      kinds: ['InvokeAIBuilderModelAction', 'InvokeAIBuilderModelTaskAction', 'PromptTool'],
    }],
    ['triggers', 'Agent triggers', 'Events that can start the agent automatically', 'trigger', agent.components.triggers, {
      badge: 'Trigger',
      nameKeys: ['triggers', 'triggerName', 'triggerConnectionType', 'eventName', 'topicName'],
      detectionKeys: ['triggers', 'triggerConnectionType', 'triggerName', 'eventName'],
      detailKeys: ['triggerType', 'connectionReference', 'topicName'],
    }],
    ['classic', 'Classic data sources', 'Legacy data sources referenced by topics', 'source', agent.components.classicDataSources, {
      badge: 'Classic',
      nameKeys: ['topicName', 'dataSourceName', 'sourceName', 'tableName', 'entityName', 'siteName'],
      detectionKeys: ['topicName', 'publicDataSource', 'sharePointSearchDataSource', 'customDataSource', 'azureOpenAIOnYourDataSource'],
      urlKeys: ['siteUrl', 'sourceUrl', 'url', 'publicDataSource'],
      detailKeys: ['publicDataSource', 'tableName', 'entityName', 'siteUrl', 'sourceUrl', 'connectionReference'],
      kinds: ['publicdatasource', 'sharepointsearchdatasource', 'customdatasource', 'azureopenaionyourdatasource'],
    }],
    ['http', 'HTTP request actions', 'External endpoints called directly by topics', 'action', agent.components.httpRequestActions, {
      badge: 'HTTP',
      nameKeys: ['displayName', 'topicName', 'actionName', 'operationName'],
      detectionKeys: ['topicName', 'value', 'httpRequestAction', 'httpMethod', 'method', 'url'],
      urlKeys: ['value', 'url', 'uri', 'endpoint'],
      detailKeys: ['topicName', 'method', 'httpMethod', 'value', 'url', 'uri', 'endpoint'],
      kinds: ['HttpRequestAction'],
    }],
    ['connections', 'Connections', 'Connector, agent, and flow authentication context', 'connection', agent.components.connections, {
      badge: 'Connector',
      nameKeys: ['name', 'connectorName', 'apiName', 'connectionReference', 'connection'],
      detectionKeys: ['name', 'connection', 'connectionMode', 'connectorName', 'apiName', 'connectionReference'],
      detailKeys: ['connectionMode', 'type', 'authenticationMode', 'runtimeSource', 'impersonation'],
      cleanConnectionName: true,
    }],
    ['skills', 'Skills', 'Reusable capabilities available to this agent', 'skill', agent.components.skills, {
      badge: 'Skill',
      nameKeys: ['name', 'skillName', 'modelDisplayName', 'operationName'],
      detectionKeys: ['name', 'description', 'skillName', 'inlineAgentSkill', 'invokeSkillAction'],
      detailKeys: ['operationName', 'skillId'],
      kinds: ['InlineAgentSkill', 'InvokeSkillAction'],
    }],
    ['evaluations', 'Evaluations', 'Evaluation configurations associated with this agent', 'evaluation', agent.components.evaluations, {
      badge: 'Evaluation',
      nameKeys: ['evaluationSetName', 'evaluationName', 'displayName', 'name', 'title'],
      detectionKeys: ['evaluationSetName', 'numberOfTestCases', 'evaluationName', 'evaluationId', 'testSetName', 'testCaseName', 'resultName'],
      detailKeys: ['numberOfTestCases', 'evaluationId', 'testSetName', 'testCaseName', 'status', 'score'],
      detailLabels: {
        numberOfTestCases: 'Test cases',
      },
    }],
    ['mcp', 'MCP servers and tools', 'Model Context Protocol servers and tools available to this agent', 'MCP component', agent.components.mcp, {
      badge: 'MCP',
      nameKeys: ['toolName', 'serverName', 'displayName', 'name', 'operationName'],
      detectionKeys: ['toolName', 'serverName', 'serverUrl', 'operationName', 'command'],
      urlKeys: ['serverUrl', 'url', 'uri', 'endpoint'],
      detailKeys: ['serverName', 'serverUrl', 'operationName', 'command', 'transport', 'protocol'],
    }],
    ['connectedAgents', 'Connected agents', 'Other agents available to this agent', 'agent', agent.components.connectedAgents, {
      badge: 'Agent',
      nameKeys: ['agentName', 'displayName', 'botName', 'name', 'schemaName'],
      detectionKeys: ['agentName', 'agentId', 'botName', 'botId', 'schemaName'],
      detailKeys: ['agentId', 'botId', 'schemaName', 'environmentId'],
    }],
  ] as const;
  return definitions.map(([key, title, description, itemLabel, raw, options]) => ({
    key,
    title,
    description,
    itemLabel,
    ...parseComponentPayload(raw, options),
  }));
}

function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current === 0 ? 0 : undefined;
  return (current - previous) / previous * 100;
}

function usageSummary(usage: AgentUsageRecord[], fallbackLastUsage?: string) {
  const sorted = [...usage].sort((a, b) => (b.usageDate ?? '').localeCompare(a.usageDate ?? ''));
  const now = Date.now();
  const recentStart = now - 90 * DAY_MS;
  const previousStart = now - 180 * DAY_MS;
  const inRange = (row: AgentUsageRecord, start: number, end: number) => {
    const date = validDate(row.usageDate)?.getTime();
    return date !== undefined && date >= start && date < end;
  };
  const totals = (rows: AgentUsageRecord[]) => ({
    billed: rows.reduce((sum, row) => sum + row.billedCredits, 0),
    nonBilled: rows.reduce((sum, row) => sum + row.nonBilledCredits, 0),
    users: rows.reduce((sum, row) => sum + row.users, 0),
  });
  const all = totals(usage);
  const recent = totals(usage.filter((row) => inRange(row, recentStart, now + DAY_MS)));
  const previous = totals(usage.filter((row) => inRange(row, previousStart, recentStart)));
  const trendMap = new Map<string, { date: Date; billed: number; total: number }>();
  const featureMap = new Map<string, { billedCredits: number; nonBilledCredits: number }>();
  for (const row of usage) {
    const date = validDate(row.usageDate);
    if (date) {
      const key = date.toISOString().slice(0, 10);
      const point = trendMap.get(key) ?? { date, billed: 0, total: 0 };
      point.billed += row.billedCredits;
      point.total += row.billedCredits + row.nonBilledCredits;
      trendMap.set(key, point);
    }
    const label = row.featureName?.trim() || 'Unknown feature';
    const feature = featureMap.get(label) ?? { billedCredits: 0, nonBilledCredits: 0 };
    feature.billedCredits += row.billedCredits;
    feature.nonBilledCredits += row.nonBilledCredits;
    featureMap.set(label, feature);
  }
  const byFeature = [...featureMap.entries()]
    .map(([label, totalsValue]) => ({ label, ...totalsValue }))
    .sort((a, b) => (b.billedCredits + b.nonBilledCredits) - (a.billedCredits + a.nonBilledCredits));
  const peak = [...trendMap.values()].sort((a, b) => b.total - a.total)[0];
  const currentTotal = recent.billed + recent.nonBilled;
  const previousTotal = previous.billed + previous.nonBilled;
  const allTotal = all.billed + all.nonBilled;
  const creditsPerUser = all.users > 0 ? allTotal / all.users : 0;
  const previousCreditsPerUser = previous.users > 0 ? previousTotal / previous.users : 0;
  return {
    totalActions: allTotal,
    billedCredits: all.billed,
    nonBilledCredits: all.nonBilled,
    reportedUsers: all.users,
    creditsPerUser,
    totalActionsChange: percentChange(currentTotal, previousTotal),
    billedCreditsChange: percentChange(recent.billed, previous.billed),
    nonBilledCreditsChange: percentChange(recent.nonBilled, previous.nonBilled),
    usersChange: recent.users - previous.users,
    creditsPerUserChange: percentChange(
      recent.users > 0 ? currentTotal / recent.users : 0,
      previousCreditsPerUser,
    ),
    lastUsage: sorted[0]?.usageDate ?? fallbackLastUsage,
    trend: [...trendMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
    byFeature,
    topFeature: byFeature[0]?.label,
    peakActivity: peak?.date.toLocaleDateString(undefined, { month: 'long' }),
    growth: percentChange(currentTotal, previousTotal),
    recent: sorted,
  };
}

function choiceLabel(value: InventoryChoice, affirmative: string): string {
  if (value === 'yes') return affirmative;
  if (value === 'no') return 'No';
  return 'Not available';
}

function metadataRows(agent: AgentInventoryRecord) {
  const modified = [agent.modifiedBy, validDate(agent.modifiedDate)?.toLocaleDateString()].filter(Boolean).join(' · ');
  const createdBy = [agent.createdBy, agent.createdByUpn].filter(Boolean).join(' · ');
  return [
    { label: 'Agent ID', value: agent.agentId || 'Not available' },
    { label: 'Agent schema name', value: agent.schemaName || 'Not available' },
    { label: 'Default application ID', value: agent.defaultApplicationId || 'Not available' },
    { label: 'Environment ID', value: agent.environmentId || 'Not available' },
    { label: 'Environment URL', value: agent.environmentUrl || 'Not available', url: agent.environmentUrl },
    { label: 'Location', value: agent.location || 'Not available' },
    { label: 'Agent created by', value: createdBy || 'Not available' },
    { label: 'Agent modified by', value: modified || 'Not available' },
    { label: 'Published by', value: agent.publishedBy || 'Not available' },
    { label: 'Template', value: agent.template || 'Not available' },
    {
      label: 'System administrator access',
      value: choiceLabel(agent.hasSystemAdminAccess, 'Yes - enriched environment data available'),
    },
    { label: 'Transcript available', value: choiceLabel(agent.transcriptAvailable, 'Yes') },
  ];
}

export function buildAgentOverview(
  agent: AgentInventoryRecord,
  usage: AgentUsageRecord[],
): AgentOverviewModel {
  const trend = new Map<string, { date: Date; credits: number }>();
  for (const row of usage) {
    const date = validDate(row.usageDate);
    if (!date) continue;
    const key = monthKey(date);
    const current = trend.get(key) ?? { date: startOfMonth(date), credits: 0 };
    current.credits += row.billedCredits + row.nonBilledCredits;
    trend.set(key, current);
  }
  const enabledCapabilities = DETAIL_CAPABILITY_LABELS
    .filter(([key]) => agent.capabilities[key] === 'yes').map(([, label]) => label);
  const unavailableCapabilities = DETAIL_CAPABILITY_LABELS
    .filter(([key]) => agent.capabilities[key] === 'no').map(([, label]) => label);
  const getFeatureChoice = (key: keyof AgentInventoryRecord['capabilities'] | 'autonomousAgent') =>
    key === 'autonomousAgent' ? agent[key] : agent.capabilities[key];
  const detailUsage = usageSummary(usage, agent.lastUsageDate);

  return {
    agent,
    governance: governance(agent),
    billedCredits: usage.reduce((sum, row) => sum + row.billedCredits, 0),
    nonBilledCredits: usage.reduce((sum, row) => sum + row.nonBilledCredits, 0),
    reportedUsers: usage.reduce((sum, row) => sum + row.users, 0),
    lastUsage: usage.map((row) => row.usageDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? agent.lastUsageDate,
    usageTrend: [...trend.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
    enabledCapabilities,
    unavailableCapabilities,
    features: FEATURE_DETAIL_LABELS.map(([key, label]) => {
      const value = getFeatureChoice(key);
      return { label, enabled: value === 'yes', known: value === 'yes' || value === 'no' };
    }),
    components: componentSections(agent),
    usage: detailUsage,
    metadata: metadataRows(agent),
  };
}
