/**
 * GalleryFilters — Controlled filter bar for the Agent Library gallery.
 *
 * Layout: primary TabList (All / Templates / Components) on the left. On the
 * right, the Templates tab shows the "All templates" multi-select filter; the
 * other tabs show the category Dropdown.
 *
 * Design ref: specs/008-component-library/context/ui-spec-gallery-view.json
 */

import {
  makeStyles,
  tokens,
  TabList,
  Tab,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import type { TabListProps } from '@fluentui/react-components';
import TemplateFilter from './TemplateFilter';
import type { TemplateFilterValue } from './TemplateFilter';

interface GalleryFiltersProps {
  selectedTab: string;
  onTabChange: (tab: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
  /** Active template-filter selection. */
  templateFilter: TemplateFilterValue;
  /** Called when the template-filter selection changes. */
  onTemplateFilterChange: (value: TemplateFilterValue) => void;
}

const useStyles = makeStyles({
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
  },
  dropdown: {
    minWidth: '180px',
  },
});

/**
 * Controlled filter bar with type tabs and category dropdown.
 */
const GalleryFilters: React.FC<GalleryFiltersProps> = ({
  selectedTab,
  onTabChange,
  selectedCategory,
  onCategoryChange,
  categories,
  templateFilter,
  onTemplateFilterChange,
}) => {
  const styles = useStyles();

  const handleTabSelect: TabListProps['onTabSelect'] = (_, data) => {
    onTabChange(data.value as string);
  };

  return (
    <div className={styles.filterBar} role="toolbar" aria-label="Gallery filters">
      {/* Primary type filter — pill-style TabList */}
      <TabList
        appearance="subtle-circular"
        selectedValue={selectedTab}
        onTabSelect={handleTabSelect}
        aria-label="Filter by type"
        size="medium"
      >
        <Tab value="">All</Tab>
        <Tab value="templates">Templates</Tab>
        <Tab value="components">Components</Tab>
        <Tab value="mcp-apps">MCP Apps</Tab>
      </TabList>

      {/* Templates tab: "All templates" multi-select filter.
          Components and MCP Apps tabs: right-aligned category dropdown. */}
      {selectedTab === 'templates' ? (
        <TemplateFilter
          value={templateFilter}
          onChange={onTemplateFilterChange}
        />
      ) : (
        <Dropdown
          className={styles.dropdown}
          appearance="underline"
          placeholder="All categories"
          value={selectedCategory || 'All categories'}
          selectedOptions={selectedCategory ? [selectedCategory] : []}
          onOptionSelect={(_, data) => {
            onCategoryChange(data.optionValue === '__all__' ? '' : (data.optionValue ?? ''));
          }}
          aria-label="Filter by category"
        >
          <Option value="__all__">All categories</Option>
          {categories.map((cat) => (
            <Option key={cat} value={cat}>
              {cat}
            </Option>
          ))}
        </Dropdown>
      )}
    </div>
  );
};

export default GalleryFilters;
