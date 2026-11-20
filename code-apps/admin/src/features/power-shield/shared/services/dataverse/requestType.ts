import type { RequestType } from '../../../models/policyRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Request-type discriminator (cat_requesttype). See data-model.md §7/§8.
// Isolates connector policy requests from credit requests (SC-002).
//   335350000 = Connector, 335350001 = Credits, null = legacy pre-upgrade row.
// ─────────────────────────────────────────────────────────────────────────────

export const REQUEST_TYPE_CONNECTOR = 335350000;
export const REQUEST_TYPE_CREDITS = 335350001;

/**
 * Lenient classifier for READ/DISPLAY paths. Maps null/undefined/empty and the
 * Connector integer to 'Connector', and only the explicit Credits integer to
 * 'Credits'. Unknown values fall back to 'Connector' so a single malformed row
 * never breaks a list load. Do NOT use this on a mutation boundary — use
 * {@link assertRequestType} there instead.
 */
export function normalizeRequestType(raw: number | string | null | undefined): RequestType {
  return Number(raw) === REQUEST_TYPE_CREDITS ? 'Credits' : 'Connector';
}

/**
 * Strict classifier for WRITE / ID-taking paths. Legacy null/undefined/empty is
 * the only value coerced to 'Connector'; the two known integers map to their
 * type; anything else throws. Fail-safe: an unrecognized discriminator is
 * rejected rather than silently treated as Connector.
 */
export function classifyRequestTypeStrict(raw: number | string | null | undefined): RequestType {
  if (raw === null || raw === undefined || raw === '') return 'Connector';
  const value = Number(raw);
  if (value === REQUEST_TYPE_CONNECTOR) return 'Connector';
  if (value === REQUEST_TYPE_CREDITS) return 'Credits';
  throw new Error(`Unrecognized cat_requesttype value: ${String(raw)}`);
}

/**
 * Rejects a header row whose request type is not the expected experience.
 * Call BEFORE reading children or mutating, on every ID-taking operation, so a
 * wrong-type record can never be read or written through the wrong experience.
 */
export function assertRequestType(
  raw: number | string | null | undefined,
  expected: RequestType,
): void {
  if (classifyRequestTypeStrict(raw) !== expected) {
    throw new Error(`This request is not available in the ${expected} experience.`);
  }
}

/**
 * ANDs the request-type discriminator onto an existing OData filter.
 *
 * The Connector predicate is null-inclusive `(eq Connector or eq null)` so
 * legacy pre-upgrade rows stay visible; the Credit predicate is strict
 * `eq Credits` (null never matches). The entire existing filter is wrapped in
 * parentheses before ANDing, so OData's `and`-binds-tighter-than-`or`
 * precedence can never let a row of the other type leak through.
 *
 * Call this exactly ONCE per query, after every ownership/status clause has
 * been assembled — never inside an admin/non-admin branch.
 */
export function andRequestType(filter: string | undefined, type: RequestType): string {
  const predicate =
    type === 'Credits'
      ? `cat_requesttype eq ${REQUEST_TYPE_CREDITS}`
      : `(cat_requesttype eq ${REQUEST_TYPE_CONNECTOR} or cat_requesttype eq null)`;
  return filter && filter.trim().length > 0 ? `(${filter}) and ${predicate}` : predicate;
}
