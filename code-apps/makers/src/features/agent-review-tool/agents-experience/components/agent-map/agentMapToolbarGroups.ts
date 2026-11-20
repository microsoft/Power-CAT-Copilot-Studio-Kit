import type { AgentMapNodeCategory } from '../../contracts/AgentMap';

const CATEGORY_GROUPS: Array<{
  label: string;
  categories: AgentMapNodeCategory[];
}> = [
  { label: 'Agent', categories: ['agent'] },
  { label: 'Topics', categories: ['topic'] },
  { label: 'Tools', categories: ['tool'] },
  { label: 'Skills', categories: ['skill'] },
  { label: 'Knowledge', categories: ['knowledge'] },
  { label: 'Connected agents', categories: ['connected-agent'] },
  { label: 'Child agents', categories: ['child-agent'] },
  { label: 'Entities', categories: ['entity'] },
  { label: 'Configuration', categories: ['configuration'] },
  { label: 'Triggers', categories: ['trigger'] },
  { label: 'Evaluation sets', categories: ['evaluation-set'] },
  { label: 'Test cases', categories: ['test-case'] },
  { label: 'Unknown', categories: ['unknown'] },
];

/** Return only filter groups represented in the current graph. */
export function getVisibleAgentMapCategoryGroups(
  availableCategories?: ReadonlySet<AgentMapNodeCategory>,
) {
  return availableCategories
    ? CATEGORY_GROUPS.filter(group =>
        group.categories.some(category => availableCategories.has(category)))
    : CATEGORY_GROUPS;
}
