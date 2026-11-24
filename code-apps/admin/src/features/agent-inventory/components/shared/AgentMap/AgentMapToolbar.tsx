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
  AgentMapEdgeStyle,
  AgentMapNodeCategory,
} from './AgentMap.types';
import { AGENT_MAP_CATEGORY_GROUPS } from './agentMapCategory';

export type AgentMapView = 'map' | 'list';

export interface AgentMapFilters {
  query: string;
  categories: Set<AgentMapNodeCategory>;
  edgeStyles: Set<AgentMapEdgeStyle>;
}

const RELATIONSHIP_GROUPS: Array<{ label: string; style: AgentMapEdgeStyle }> = [
  { label: 'Configured', style: 'solid' },
  { label: 'Delegated', style: 'dashed' },
  { label: 'Triggered', style: 'dotted' },
];

const useStyles = makeStyles({
  toolbar: {
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalM),
  },
  searchControls: {
    minWidth: '280px',
    flex: '1 1 480px',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    '@media (max-width: 639px)': {
      minWidth: '100%',
      flexBasis: '100%',
    },
  },
  search: {
    minWidth: '200px',
    flex: '1 1 320px',
  },
  filterButton: {
    minWidth: '96px',
    flex: '0 0 auto',
  },
  actions: {
    minWidth: 'max-content',
    flex: '0 0 auto',
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  viewTabs: {
    minWidth: 'max-content',
    flex: '0 0 auto',
  },
  actionButton: {
    minWidth: 'max-content',
    flex: '0 0 auto',
  },
  menuContent: {
    width: '280px',
    maxWidth: `calc(100vw - ${tokens.spacingHorizontalXXL})`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    ...shorthands.gap(tokens.spacingVerticalM),
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
  groupTitle: { margin: 0 },
});

interface AgentMapToolbarProps {
  filters: AgentMapFilters;
  availableCategories: ReadonlySet<AgentMapNodeCategory>;
  availableEdgeStyles: ReadonlySet<AgentMapEdgeStyle>;
  view: AgentMapView;
  expanded: boolean;
  onFiltersChange: (filters: AgentMapFilters) => void;
  onViewChange: (view: AgentMapView) => void;
  onReset: () => void;
  onToggleExpanded: () => void;
  mapTabId: string;
  listTabId: string;
  viewPanelId: string;
}

/** Render search, filters, view switching, reset, and expansion commands. */
export function AgentMapToolbar({
  filters,
  availableCategories,
  availableEdgeStyles,
  view,
  expanded,
  onFiltersChange,
  onViewChange,
  onReset,
  onToggleExpanded,
  mapTabId,
  listTabId,
  viewPanelId,
}: AgentMapToolbarProps) {
  const styles = useStyles();
  const updateQuery = (_event: SearchBoxChangeEvent, event: { value: string }) => {
    onFiltersChange({ ...filters, query: event.value });
  };
  const setCategory = (category: AgentMapNodeCategory, checked: boolean) => {
    const categories = new Set(filters.categories);
    if (checked) categories.add(category);
    else categories.delete(category);
    onFiltersChange({ ...filters, categories });
  };
  const setEdgeStyle = (style: AgentMapEdgeStyle, checked: boolean) => {
    const edgeStyles = new Set(filters.edgeStyles);
    if (checked) edgeStyles.add(style);
    else edgeStyles.delete(style);
    onFiltersChange({ ...filters, edgeStyles });
  };

  return (
    <div className={styles.toolbar} aria-label="Agent map controls">
      <div className={styles.searchControls}>
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
            <MenuButton className={styles.filterButton} icon={<FilterRegular />}>Filters</MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <div className={styles.menuContent} role="group" aria-label="Filter map">
              <section className={styles.menuGroup} aria-labelledby="inventory-map-component-filters">
                <Text as="h3" weight="semibold" className={styles.groupTitle} id="inventory-map-component-filters">
                  Components
                </Text>
                {AGENT_MAP_CATEGORY_GROUPS.filter(group => availableCategories.has(group.category)).map(group => (
                  <Switch
                    key={group.category}
                    label={group.label}
                    checked={filters.categories.has(group.category)}
                    onChange={(_, event) => setCategory(group.category, event.checked)}
                  />
                ))}
              </section>
              <section className={styles.menuGroup} aria-labelledby="inventory-map-relationship-filters">
                <Text as="h3" weight="semibold" className={styles.groupTitle} id="inventory-map-relationship-filters">
                  Relationships
                </Text>
                {RELATIONSHIP_GROUPS.filter(group => availableEdgeStyles.has(group.style)).map(group => (
                  <Switch
                    key={group.style}
                    label={group.label}
                    checked={filters.edgeStyles.has(group.style)}
                    onChange={(_, event) => setEdgeStyle(group.style, event.checked)}
                  />
                ))}
              </section>
            </div>
          </MenuPopover>
        </Menu>
      </div>
      <div className={styles.actions}>
        <TabList
          className={styles.viewTabs}
          appearance="subtle-circular"
          selectedValue={view}
          onTabSelect={(_, event) => onViewChange(event.value as AgentMapView)}
          aria-label="Agent map view"
        >
          <Tab id={mapTabId} aria-controls={viewPanelId} value="map">Map</Tab>
          <Tab id={listTabId} aria-controls={viewPanelId} value="list">List</Tab>
        </TabList>
        <Button
          className={styles.actionButton}
          appearance="subtle"
          icon={<ArrowResetRegular />}
          onClick={onReset}
        >
          Reset
        </Button>
        <Button
          className={styles.actionButton}
          appearance="subtle"
          icon={expanded ? <ArrowMinimizeRegular /> : <ArrowExpandRegular />}
          onClick={onToggleExpanded}
        >
          {expanded ? 'Exit full screen' : 'Expand'}
        </Button>
      </div>
    </div>
  );
}
