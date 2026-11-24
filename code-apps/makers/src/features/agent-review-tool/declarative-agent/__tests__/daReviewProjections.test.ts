import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Guards the trap that broke the declarative review page.
 *
 * `getDAReviews` selects a flat projection for the grid and omits
 * `cat_reviewresultjson` — the column carrying the evaluation and the manifest.
 * `getDAReviewById` includes it.
 *
 * A page that reads its record out of the list query therefore renders with no
 * criteria, no issues and no manifest: every tab badge shows 0 and every panel
 * is empty, with no error to explain why. That is exactly how the page shipped
 * the first time.
 *
 * Asserted against the source text rather than by invoking the service:
 * importing it pulls in the whole `@microsoft/power-apps` data chain, which has
 * no working stub in this package. The property under test is which columns
 * each projection names, and that is visible statically.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE = readFileSync(join(HERE, '..', 'services', 'DAReviewService.ts'), 'utf8');
const HOOK = readFileSync(join(HERE, '..', 'hooks', 'useDAReview.ts'), 'utf8');

const RESULT_JSON_COLUMN = 'cat_reviewresultjson';

/** Extracts the `select: [...]` block belonging to a named exported function. */
function selectBlockOf(fnName: string): string {
  const start = SERVICE.indexOf(`export async function ${fnName}`);
  expect(start, `${fnName} should exist`).toBeGreaterThan(-1);

  const selectStart = SERVICE.indexOf('select: [', start);
  expect(selectStart, `${fnName} should declare a select list`).toBeGreaterThan(-1);

  return SERVICE.slice(selectStart, SERVICE.indexOf(']', selectStart));
}

describe('DA review service projections', () => {
  it('the list query omits the result blob — it is the grid projection', () => {
    expect(selectBlockOf('getDAReviews')).not.toContain(RESULT_JSON_COLUMN);
  });

  it('the by-id query requests the result blob, which carries evaluation and manifest', () => {
    expect(selectBlockOf('getDAReviewById')).toContain(RESULT_JSON_COLUMN);
  });
});

/**
 * The page must load through the by-id service. Resolving the record from the
 * list query compiles, type-checks and renders — it just silently shows an
 * empty review, which no other test would catch.
 */
describe('useDAReview data source', () => {
  it('loads the full record through getDAReviewById', () => {
    expect(HOOK).toContain('getDAReviewById');
  });

  it('does not resolve the record by scanning the list query', () => {
    expect(HOOK).not.toMatch(/queryFn:\s*getDAReviews\b/);
    expect(HOOK).not.toMatch(/data\?\.find\(/);
  });
});
