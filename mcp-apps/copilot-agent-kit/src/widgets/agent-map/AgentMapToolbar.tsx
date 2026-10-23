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
} from "@fluentui/react-components";
import {
  ArrowResetRegular,
  FilterRegular,
} from "@fluentui/react-icons";
import type {
  AgentMapFilters,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from "./agentMapViewModel";
import type { AgentMapView } from "./agentMapPresentationPolicy";

const CATEGORY_GROUPS: Array<{
  label: string;
  categories: AgentMapNodeCategory[];
}> = [
  { label: "Agent", categories: ["agent"] },
  { label: "Tools", categories: ["tool"] },
  { label: "Skills", categories: ["skill"] },
  { label: "Topics and actions", categories: ["topic", "action"] },
  { label: "Knowledge", categories: ["knowledge"] },
  { label: "Connected agents", categories: ["connected-agent"] },
  { label: "Triggers", categories: ["trigger"] },
  { label: "Evaluation sets", categories: ["evaluation-set"] },
  { label: "Test cases", categories: ["test-case"] },
  { label: "Unknown", categories: ["unknown"] },
];

const PROVENANCE_GROUPS: Array<{
  label: string;
  provenances: AgentMapProvenance[];
}> = [
  { label: "Structural", provenances: ["structural"] },
  { label: "Possible exact text references", provenances: ["textual-exact"] },
  { label: "Possible strong text references", provenances: ["textual-strong"] },
];

/**
 * Toolbar styles.
 *
 * No size overrides. Controls use Fluent's default medium sizing and its own
 * touch-target rules.
 */
const useStyles = makeStyles({
  toolbar: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalM),
    flexWrap: "wrap",
  },
  search: {
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "280px",
  },
  control: {},
  menuContent: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    width: "300px",
    maxWidth: `calc(100vw - ${tokens.spacingHorizontalXXL})`,
    ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    boxShadow: tokens.shadow16,
  },
  menuGroup: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  groupTitle: {
    margin: 0,
  },
});

export interface AgentMapToolbarProps {
  filters: AgentMapFilters;
  view: AgentMapView;
  onFiltersChange: (filters: AgentMapFilters) => void;
  onViewChange: (view: AgentMapView) => void;
  onReset: () => void;
}

/** Render local search, immediate filters, view switch, and reset controls. */
export function AgentMapToolbar({
  filters,
  view,
  onFiltersChange,
  onViewChange,
  onReset,
}: AgentMapToolbarProps) {
  const styles = useStyles();
  const setCategories = (categories: AgentMapNodeCategory[], checked: boolean) => {
    const next = new Set(filters.categories);
    categories.forEach((category) => (checked ? next.add(category) : next.delete(category)));
    onFiltersChange({ ...filters, categories: next });
  };
  const setProvenances = (provenances: AgentMapProvenance[], checked: boolean) => {
    const next = new Set(filters.provenances);
    provenances.forEach((provenance) =>
      (checked ? next.add(provenance) : next.delete(provenance)));
    onFiltersChange({ ...filters, provenances: next });
  };
  const updateQuery = (_event: SearchBoxChangeEvent, data: { value: string }) => {
    onFiltersChange({ ...filters, query: data.value });
  };

  return (
    <div className={styles.toolbar} aria-label="Agent map controls">
      <SearchBox
        className={styles.search}
        value={filters.query}
        onChange={updateQuery}
        onKeyDown={(event) => {
          if (event.key === "Escape" && filters.query) {
            event.stopPropagation();
            onFiltersChange({ ...filters, query: "" });
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
              {CATEGORY_GROUPS.map((group) => (
                <Switch
                  key={group.label}
                  label={group.label}
                  checked={group.categories.every((category) => filters.categories.has(category))}
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
              {PROVENANCE_GROUPS.map((group) => (
                <Switch
                  key={group.label}
                  label={group.label}
                  checked={group.provenances.every((provenance) =>
                    filters.provenances.has(provenance))}
                  onChange={(_, data) => setProvenances(group.provenances, data.checked)}
                />
              ))}
              <Switch
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
        aria-label="Agent map view"
      >
        <Tab value="map" id="agent-map-view-tab-map">Map</Tab>
        <Tab value="list" id="agent-map-view-tab-list">List</Tab>
      </TabList>
      <Button
        appearance="subtle"
        className={styles.control}
        icon={<ArrowResetRegular />}
        onClick={onReset}
      >
        Reset
      </Button>
    </div>
  );
}
