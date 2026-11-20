import type {
  AgentComponentItem,
  AgentComponentSection,
  AgentComponentSectionKey,
} from '../contracts/types';
import type {
  AgentMapData,
  AgentMapNodeCategory,
} from '../components/shared/AgentMap';

function assertNever(value: never): never {
  throw new Error(`Unhandled agent component section: ${String(value)}`);
}

function nodeCategory(key: AgentComponentSectionKey): AgentMapNodeCategory {
  switch (key) {
    case 'knowledge':
      return 'knowledge';
    case 'classic':
      return 'classic-data-source';
    case 'prompts':
      return 'prompt';
    case 'http':
      return 'http-action';
    case 'connections':
      return 'connection';
    case 'skills':
      return 'skill';
    case 'triggers':
      return 'trigger';
    case 'evaluations':
      return 'evaluation';
    case 'mcp':
      return 'tool';
    case 'connectedAgents':
      return 'connected-agent';
    default:
      return assertNever(key);
  }
}

function relationshipLabel(key: AgentComponentSectionKey): string {
  switch (key) {
    case 'knowledge':
    case 'classic':
      return 'Grounds answers';
    case 'prompts':
      return 'Uses prompt';
    case 'triggers':
      return 'Starts';
    case 'http':
      return 'Invokes';
    case 'connections':
      return 'Uses connection';
    case 'skills':
      return 'Uses skill';
    case 'evaluations':
      return 'Uses evaluation';
    case 'mcp':
      return 'Uses MCP';
    case 'connectedAgents':
      return 'Connects to';
    default:
      return assertNever(key);
  }
}

function itemMetadata(section: AgentComponentSection, item: AgentComponentItem) {
  return {
    'Component type': section.title,
    ...(!item.properties && item.detail && item.detail !== item.description ? { Detail: item.detail } : {}),
    ...item.properties,
    ...(item.url ? { URL: item.url } : {}),
  };
}

/** Convert collected agent components into the serializable graph contract used by Agent Map. */
export function createAgentComponentMap(
  agentName: string,
  sections: AgentComponentSection[],
): AgentMapData {
  const populatedSections = sections.filter(section => section.items.length > 0);
  const agentId = 'component-map-agent';
  const components = populatedSections.flatMap(section =>
    section.items.map((item, index) => ({
      section,
      item,
      nodeId: `component-${section.key}-${item.id}-${index}`,
    })),
  );

  return {
    version: 1,
    title: `${agentName} components`,
    description: 'Explore the components collected from this agent configuration.',
    sourceLabel: 'Detailed Dataverse configuration',
    nodes: [
      {
        id: agentId,
        label: agentName,
        category: 'agent',
        subtitle: 'Copilot Studio agent',
        description: 'The selected agent and its collected components.',
        metadata: {
          'Component groups': populatedSections.length,
          Components: components.length,
        },
      },
      ...components.map(({ section, item, nodeId }) => ({
        id: nodeId,
        label: item.name,
        category: nodeCategory(section.key),
        subtitle: section.title,
        description: item.description ?? item.detail,
        metadata: itemMetadata(section, item),
      })),
    ],
    edges: components.map(({ section, nodeId }, index) => {
      const isTrigger = section.key === 'triggers';
      return {
        id: `component-edge-${section.key}-${index}`,
        source: isTrigger ? nodeId : agentId,
        target: isTrigger ? agentId : nodeId,
        label: relationshipLabel(section.key),
        directed: true,
        style: isTrigger ? 'dotted' as const : 'solid' as const,
      };
    }),
  };
}
