import { tokens } from '@fluentui/react-components';
import type { AgentMapNodeCategory } from './AgentMap.types';

export const AGENT_MAP_CATEGORY_GROUPS: Array<{
  category: AgentMapNodeCategory;
  label: string;
}> = [
  { category: 'agent', label: 'Agents' },
  { category: 'knowledge', label: 'Knowledge sources' },
  { category: 'prompt', label: 'Prompts' },
  { category: 'http-action', label: 'HTTP request actions' },
  { category: 'connection', label: 'Connections' },
  { category: 'classic-data-source', label: 'Classic data sources' },
  { category: 'tool', label: 'Tools' },
  { category: 'skill', label: 'Skills' },
  { category: 'connected-agent', label: 'Connected agents' },
  { category: 'trigger', label: 'Triggers' },
  { category: 'evaluation', label: 'Evaluations' },
  { category: 'unknown', label: 'Other components' },
];

const CATEGORY_LABELS: Record<AgentMapNodeCategory, string> = {
  agent: 'Agent',
  knowledge: 'Knowledge source',
  prompt: 'Prompt',
  'http-action': 'HTTP request action',
  connection: 'Connection',
  'classic-data-source': 'Classic data source',
  tool: 'Tool',
  skill: 'Skill',
  'connected-agent': 'Connected agent',
  trigger: 'Trigger',
  evaluation: 'Evaluation',
  unknown: 'Unknown',
};

export function agentMapCategoryLabel(category: AgentMapNodeCategory): string {
  return CATEGORY_LABELS[category];
}

export function agentMapCategoryColor(category: AgentMapNodeCategory): string {
  switch (category) {
    case 'agent': return tokens.colorBrandBackground;
    case 'tool':
    case 'prompt':
    case 'http-action':
    case 'connection':
      return tokens.colorPaletteTealBorderActive;
    case 'skill': return tokens.colorPalettePurpleBorderActive;
    case 'knowledge':
    case 'classic-data-source':
      return tokens.colorPaletteGreenBorderActive;
    case 'connected-agent': return tokens.colorPaletteBerryBorderActive;
    case 'trigger': return tokens.colorPaletteDarkOrangeBorderActive;
    case 'evaluation': return tokens.colorPaletteMarigoldBorderActive;
    default: return tokens.colorPaletteYellowBorderActive;
  }
}
