/**
 * useMcpAppCatalog — Returns the MCP app catalog from the bundled data file.
 *
 * Data is statically imported from mcpAppCatalog.ts. Mirrors useComponentCatalog:
 * no async fetch is needed — the catalog is code-split via the lazy-loaded page.
 */

import { MCP_APP_CATALOG } from '../data/mcpAppCatalog';

/** Returns the static MCP app catalog. No async fetch needed. */
export function useMcpAppCatalog() {
  return {
    data: MCP_APP_CATALOG,
    isLoading: false,
    isError: false,
    error: null,
  };
}
