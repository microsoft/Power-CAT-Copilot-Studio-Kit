/**
 * filterComponents — Pure client-side filter function for the component gallery.
 *
 * Applies all active filter predicates as AND-combined conditions.
 * Uses empty string "" as the "show all" sentinel — never null.
 * Compatible with Fluent UI TabList.selectedValue which rejects null.
 */

import type { CatalogItem, ComponentWithInstallState, GalleryFilterState } from '../contracts/types';

/**
 * Filters a component list by the provided gallery filter state.
 *
 * @param components - Array of components with install state (not mutated).
 * @param filters - Active filter state from ComponentLibraryPage.
 * @returns New array containing only matching components.
 */
export function filterComponents(
  components: readonly ComponentWithInstallState[],
  filters: GalleryFilterState,
): ComponentWithInstallState[] {
  const { searchQuery, selectedCategory, selectedTechnology } = filters;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return components.filter((c) => {
    // Search: case-insensitive substring match on name and description
    const matchesSearch =
      normalizedQuery === '' ||
      c.name.toLowerCase().includes(normalizedQuery) ||
      c.description.toLowerCase().includes(normalizedQuery);

    // Category: exact match on categories array; "" = show all
    const matchesCategory =
      selectedCategory === '' || c.categories.includes(selectedCategory);

    // Technology: exact match on technologyTags array; "" = show all
    const matchesTechnology =
      selectedTechnology === '' || c.technologyTags.includes(selectedTechnology);

    return matchesSearch && matchesCategory && matchesTechnology;
  });
}

/**
 * Filters catalog items by tab (type) and category.
 *
 * @param items - Array of catalog items (not mutated).
 * @param tab - Active tab: 'templates', 'components', 'mcp-apps', or '' (all).
 * @param category - Active category filter, or '' for all categories.
 * @returns New array containing only matching catalog items.
 */
export function filterCatalogItems(
  items: readonly CatalogItem[],
  tab: string,
  category: string,
): CatalogItem[] {
  let filtered = [...items];

  // Filter by tab
  if (tab === 'templates') {
    filtered = filtered.filter(item => item.type === 'template');
  } else if (tab === 'components') {
    filtered = filtered.filter(item => item.type === 'component');
  } else if (tab === 'mcp-apps') {
    filtered = filtered.filter(item => item.type === 'mcp-app');
  }
  // tab === '' means 'all' — show every type (templates, components, MCP apps).

  // Filter by category. Components match on their `categories` array. MCP apps
  // are category-filtered only on their own "MCP Apps" tab (their industry
  // taxonomy differs from component categories, so on the "All" tab — where the
  // dropdown lists component categories — MCP apps are left unfiltered).
  // Templates are never category-filtered.
  if (category !== '') {
    filtered = filtered.filter(item => {
      if (item.type === 'component') {
        return item.categories.includes(category);
      }
      if (item.type === 'mcp-app') {
        return tab === 'mcp-apps' ? (item.categories ?? []).includes(category) : true;
      }
      return true;
    });
  }

  return filtered;
}
