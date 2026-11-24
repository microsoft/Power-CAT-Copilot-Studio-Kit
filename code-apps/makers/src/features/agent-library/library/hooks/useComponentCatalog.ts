/**
 * useComponentCatalog — Returns the component catalog from the bundled data file.
 *
 * Data is statically imported from componentCatalog.ts (GAL-3).
 * The catalog is code-split via the lazy-loaded ComponentLibraryPage route —
 * it only loads when the user navigates to the Component Library page.
 */

import { COMPONENT_CATALOG } from '../data/componentCatalog';

/** Returns the static component catalog. No async fetch needed. */
export function useComponentCatalog() {
  return {
    data: COMPONENT_CATALOG,
    isLoading: false,
    isError: false,
    error: null,
  };
}
