/**
 * Persistence wiring for the Setup screen's React Query cache.
 *
 * The Advanced Testing Setup screen reads three Dataverse-backed datasets
 * (Connection References, Test Automation processes, Environment Variables)
 * that change infrequently. Persisting them to sessionStorage lets the
 * landing-page setup-status indicator and the Setup screen itself hydrate
 * instantly on subsequent navigations and tab reloads inside the same
 * browser session.
 *
 * The "available-connections" query is deliberately excluded because it
 * varies per current user and the freshness expectation is higher (a maker
 * just created a connection in another tab and expects to see it on
 * refresh).
 */
import {
  defaultShouldDehydrateQuery,
  type Query,
} from "@tanstack/react-query";

/** Matches `SETUP_QUERY_STALE_MS` in the Setup read hooks. */
export const SETUP_PERSIST_MAX_AGE_MS = 15 * 60 * 1000;

const ALLOWED_SETUP_SEGMENTS = new Set([
  "connection-reference",
  "test-automation-processes",
  "environment-variables",
]);

/**
 * Allow-list query filter for persistence. Composed with React Query's
 * default dehydrate predicate so failed/disabled queries are still skipped.
 */
export function shouldPersistSetupQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const key = query.queryKey;
  if (!Array.isArray(key)) return false;
  if (key[0] !== "advanced-testing") return false;
  if (key[1] !== "setup") return false;
  if (typeof key[2] !== "string") return false;
  return ALLOWED_SETUP_SEGMENTS.has(key[2]);
}

/**
 * Probes sessionStorage availability without throwing. Returns the storage
 * object when writable, or `null` when blocked (private-browsing modes,
 * iframe storage partitioning, or enterprise lock-down).
 */
export function getSafeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.sessionStorage;
    const probe = "__cskm_persist_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
