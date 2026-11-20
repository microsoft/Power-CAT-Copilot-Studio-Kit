/**
 * Plain-language contract for every sentence the reviewer reads.
 *
 * Two words used to leak out of the implementation and into the product.
 *
 * "Capability snapshot" was our name for the copied list of tools a runtime
 * provides. It named an internal data structure, not anything the reader had
 * heard of, and it appeared in four places — the upload dialog, each verdict
 * card, every runtime finding, and the results footer.
 *
 * The raw runtime slug leaked too: findings interpolated `catalogue.runtime`,
 * so a reader who knows the product as "Copilot Cowork" was told that "cowork
 * exposes no browser-automation tools".
 *
 * Both are easy to reintroduce, because both read naturally to whoever is
 * writing the rule. These tests fail when they come back.
 */
import { describe, expect, it } from 'vitest';

import { formatCatalogueDate, resolveStaleness } from '../contracts/PlatformCatalogue';
import { RUNTIME_LABELS, TARGET_RUNTIMES, type TargetRuntime } from '../contracts/ArtifactReview';
import { describeRuntimeCoverage, resolveCatalogue } from '../data/catalogueResolver';

/** Words that name our implementation rather than the reader's world. */
const JARGON = [/capability snapshot/i, /capability surface/i, /catalogue/i];

/** The runtime slugs, as they must never appear in a sentence. */
const SLUGS: TargetRuntime[] = ['cowork', 'scout', 'copilot-studio'];

function expectPlain(sentence: string): void {
  for (const term of JARGON) {
    expect(sentence, `"${sentence}" uses internal wording`).not.toMatch(term);
  }
  // A slug only counts as a leak when it stands alone. "Copilot Cowork"
  // legitimately contains "cowork", so match on a word boundary either side.
  for (const slug of SLUGS) {
    const bare = new RegExp(`(^|[\\s"'(])${slug}([\\s"'.,)]|$)`);
    expect(sentence, `"${sentence}" prints the runtime slug "${slug}"`).not.toMatch(bare);
  }
}

describe('formatCatalogueDate', () => {
  it('renders a date a person reads, not the stored ISO string', () => {
    const rendered = formatCatalogueDate('2026-07-28');
    expect(rendered).not.toBe('2026-07-28');
    expect(rendered).toContain('2026');
    expect(rendered).toContain('28');
  });

  it('reads the date in UTC, so it never slips a day by timezone', () => {
    // A naive `new Date('2026-07-28').toLocaleDateString()` renders the 27th
    // anywhere west of Greenwich. The stored date is a calendar date, not an
    // instant, so it must render the same everywhere.
    expect(formatCatalogueDate('2026-07-28')).toContain('28');
  });

  it('falls back to the stored value rather than printing "Invalid Date"', () => {
    expect(formatCatalogueDate('not-a-date')).toBe('not-a-date');
  });
});

describe('describeRuntimeCoverage', () => {
  it('tells the reader what the tick covers, in plain words', () => {
    for (const runtime of TARGET_RUNTIMES) {
      const hint = describeRuntimeCoverage(runtime);
      expectPlain(hint);
      expect(hint).toContain(RUNTIME_LABELS[runtime]);
    }
  });

  it('carries no version or date, because no claim has been made yet', () => {
    for (const runtime of TARGET_RUNTIMES) {
      const hint = describeRuntimeCoverage(runtime);
      expect(hint, `"${hint}" dates a claim the reader has not seen`).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(hint).not.toMatch(/\bversion\b/i);
    }
  });

  it('counts from the catalogue rather than repeating a number in prose', () => {
    const cowork = resolveCatalogue('cowork');
    const hint = describeRuntimeCoverage('cowork');
    expect(hint).toContain(String(cowork.tools.length));
    expect(hint).toContain(String(cowork.builtInSkills.length));
  });

  it('says outright that Copilot Studio tool availability is not checked', () => {
    const hint = describeRuntimeCoverage('copilot-studio');
    expect(hint).toContain('no tool list');
    expect(hint).toContain('not checked');
  });

  it('keeps the setup hint focused on the catalogue coverage', () => {
    expect(describeRuntimeCoverage('cowork')).not.toContain('browser automation');
  });
});

describe('staleness notes', () => {
  it('explains an unknown age without naming the data structure', () => {
    const result = resolveStaleness({ ...resolveCatalogue('cowork'), snapshotDate: 'unknown' });
    expect(result.isStale).toBe(true);
    expectPlain(result.note ?? '');
  });

  it('explains an old list in plain words and says what to do next', () => {
    const result = resolveStaleness(resolveCatalogue('cowork'), new Date('2030-01-01T00:00:00.000Z'));
    expectPlain(result.note ?? '');
    expect(result.note).toMatch(/documentation/i);
  });
});
