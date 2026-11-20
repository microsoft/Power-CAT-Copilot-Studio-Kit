import type { PpEnvironment } from '../../models/environment';

/**
 * Merges a page-level selection change into the full selection.
 * The grid only knows the current page, so IDs on other pages, hidden by
 * filters, or missing from the item list are kept as they are.
 * Result: (selectedIds − pageIds) ∪ (pageSelected ∩ pageIds).
 */
export function mergePageSelection(
  selectedIds: ReadonlySet<string>,
  pageIds: ReadonlySet<string>,
  pageSelected: ReadonlySet<string>,
): Set<string> {
  const next = new Set<string>();
  for (const id of selectedIds) if (!pageIds.has(id)) next.add(id);
  for (const id of pageSelected) if (pageIds.has(id)) next.add(id);
  return next;
}

/**
 * Filters environments by display-name search (case-insensitive) and by
 * Type and Location. An empty type or location list means "no filter".
 */
export function filterEnvironments(
  items: readonly PpEnvironment[],
  search: string,
  types: readonly string[],
  locations: readonly string[],
): PpEnvironment[] {
  const term = search.trim().toLowerCase();
  return items.filter(
    (e) =>
      (!term || e.displayName.toLowerCase().includes(term)) &&
      (types.length === 0 || types.includes(e.environmentSku)) &&
      (locations.length === 0 || locations.includes(e.location)),
  );
}
