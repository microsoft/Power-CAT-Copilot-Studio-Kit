import type { Ref } from 'react';
import {
  Button,
  Menu,
  MenuButton,
  MenuPopover,
  MenuTrigger,
  SearchBox,
  Switch,
  Tab,
  TabList,
  Text,
  makeStyles,
  shorthands,
  tokens,
  type SearchBoxChangeEvent,
} from '@fluentui/react-components';
import {
  ArrowExpandRegular,
  ArrowMinimizeRegular,
  ArrowResetRegular,
  FilterRegular,
} from '@fluentui/react-icons';
import type {
  AgentMapFilters,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from '../../contracts/AgentMap';
import { getVisibleAgentMapCategoryGroups } from './agentMapToolbarGroups';

export type AgentMapView = 'map' | 'list';

const PROVENANCE_GROUPS: Array<{
  label: string;
  provenances: AgentMapProvenance[];
}> = [
  { label: 'Structural', provenances: ['structural'] },
  { label: 'Identified by the reviewer', provenances: ['model-inferred'] },
  { label: 'Possible exact text references', provenances: ['textual-exact'] },
  { label: 'Possible strong text references', provenances: ['textual-strong'] },
];

/**
 * Toolbar styles.
 *
 * No size overrides. Controls use Fluent's default medium sizing and its own
 * touch-target rules; earlier custom `minHeight` values overrode the size prop
 * and made a compact toolbar render tall.
 */
const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    flexWrap: 'wrap',
  },
  search: {
    minWidth: 0,
    width: '300px',
    maxWidth: '100%',
    flexShrink: 0,
  },
  control: {},
  viewTab: {},
  menuContent: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    width: '300px',
    maxWidth: `calc(100vw - ${tokens.spacingHorizontalXXL})`,
    ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    boxShadow: tokens.shadow16,
  },
  menuGroup: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  groupTitle: {
    margin: 0,
  },
  switch: {},
});

export interface AgentMapToolbarProps {
  filters: AgentMapFilters;
  view: AgentMapView;
  onFiltersChange: (filters: AgentMapFilters) => void;
  onViewChange: (view: AgentMapView) => void;
  onReset: () => void;
  /** Omitted inside the expanded dialog's own toolbar when not applicable. */
  onExpand?: () => void;
  isExpanded?: boolean;
  /** Lets the tab restore focus here after the full-screen dialog closes. */
  expandButtonRef?: Ref<HTMLButtonElement>;
  /** Categories retained in the current graph. Empty filter groups stay hidden. */
  availableCategories?: ReadonlySet<AgentMapNodeCategory>;
}

/** Render local search, immediate filters, view switch, and reset controls. */
export function AgentMapToolbar({
  filters,
  view,
  onFiltersChange,
  onViewChange,
  onReset,
  onExpand,
  isExpanded = false,
  expandButtonRef,
  availableCategories,
}: AgentMapToolbarProps) {
  const styles = useStyles();
  const categoryGroups = getVisibleAgentMapCategoryGroups(availableCategories);
  const setCategories = (categories: AgentMapNodeCategory[], checked: boolean) => {
    const next = new Set(filters.categories);
    categories.forEach(category => checked ? next.add(category) : next.delete(category));
    onFiltersChange({ ...filters, categories: next });
  };
  const setProvenances = (provenances: AgentMapProvenance[], checked: boolean) => {
    const next = new Set(filters.provenances);
    provenances.forEach(provenance => checked ? next.add(provenance) : next.delete(provenance));
    onFiltersChange({ ...filters, provenances: next });
  };
  const updateQuery = (_event: SearchBoxChangeEvent, data: { value: string }) => {
    onFiltersChange({ ...filters, query: data.value });
  };

  return (
    <div className={styles.toolbar} aria-label="Architecture controls">
      <SearchBox
        className={styles.search}
        value={filters.query}
        onChange={updateQuery}
        onKeyDown={event => {
          if (event.key === 'Escape' && filters.query) {
            event.stopPropagation();
            onFiltersChange({ ...filters, query: '' });
          }
        }}
        placeholder="Search components and relationships"
        aria-label="Search components and relationships"
      />
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <MenuButton className={styles.control} icon={<FilterRegular />}>Filters</MenuButton>
        </MenuTrigger>
        <MenuPopover>
          <div className={styles.menuContent} role="group" aria-label="Filter map">
            <section className={styles.menuGroup} aria-labelledby="agent-map-component-filters">
              <Text
                as="h3"
                weight="semibold"
                className={styles.groupTitle}
                id="agent-map-component-filters"
              >
                Components
              </Text>
              {categoryGroups.map(group => (
                <Switch
                  key={group.label}
                  className={styles.switch}
                  label={group.label}
                  checked={group.categories.every(category => filters.categories.has(category))}
                  onChange={(_, data) => setCategories(group.categories, data.checked)}
                />
              ))}
            </section>
            <section className={styles.menuGroup} aria-labelledby="agent-map-relationship-filters">
              <Text
                as="h3"
                weight="semibold"
                className={styles.groupTitle}
                id="agent-map-relationship-filters"
              >
                Relationships
              </Text>
              {PROVENANCE_GROUPS.map(group => (
                <Switch
                  key={group.label}
                  className={styles.switch}
                  label={group.label}
                  checked={group.provenances.every(provenance => filters.provenances.has(provenance))}
                  onChange={(_, data) => setProvenances(group.provenances, data.checked)}
                />
              ))}
              <Switch
                className={styles.switch}
                label="Unresolved"
                checked={filters.includeUnresolved}
                onChange={(_, data) => onFiltersChange({
                  ...filters,
                  includeUnresolved: data.checked,
                })}
              />
            </section>
          </div>
        </MenuPopover>
      </Menu>
      <TabList
        appearance="subtle-circular"
        selectedValue={view}
        onTabSelect={(_, data) => onViewChange(data.value as AgentMapView)}
        aria-label="Architecture view"
      >
        <Tab
          className={styles.viewTab}
          value="map"
          id="agent-map-view-tab-map"
        >
          Map
        </Tab>
        <Tab
          className={styles.viewTab}
          value="list"
          id="agent-map-view-tab-list"
        >
          List
        </Tab>
      </TabList>
      <Button
        appearance="subtle"
        className={styles.control}
        icon={<ArrowResetRegular />}
        onClick={onReset}
      >
        Reset
      </Button>
      {onExpand && (
        <Button
          ref={expandButtonRef}
          appearance="subtle"
          className={styles.control}
          icon={isExpanded ? <ArrowMinimizeRegular /> : <ArrowExpandRegular />}
          onClick={onExpand}
        >
          {isExpanded ? 'Exit full screen' : 'Expand'}
        </Button>
      )}
    </div>
  );
}
