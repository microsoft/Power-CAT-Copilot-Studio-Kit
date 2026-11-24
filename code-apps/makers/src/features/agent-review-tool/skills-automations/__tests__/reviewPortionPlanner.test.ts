/**
 * Splitting one upload into review portions (spec 018 §6).
 *
 * The contract these tests defend is narrow but strict: splitting must make the
 * review faster without letting a single file go unjudged. Every assertion here
 * is about one of those two halves.
 */
import { describe, expect, it } from 'vitest';

import { bundle, textResource } from '../../agents-experience/__tests__/skillTestFixtures';
import {
  STANDARD_RESOURCE_CHARS,
  STANDARD_RESOURCE_TOTAL_CHARS,
  buildStandardResourceExcerpts,
} from '../../agents-experience/services/skill/tokenBudget';
import {
  DEFAULT_TARGET_PORTIONS,
  planReviewPortions,
} from '../services/reviewPortionPlanner';

/** A file whose excerpt cost is exactly `STANDARD_RESOURCE_CHARS`. */
function fullSizeFile(index: number) {
  return textResource(`refs/file-${String(index).padStart(3, '0')}.md`, 'x'.repeat(20_000));
}

function filesTotalling(count: number) {
  return Array.from({ length: count }, (_, i) => fullSizeFile(i));
}

describe('planReviewPortions', () => {
  describe('when the archive already fits', () => {
    it('returns the bundle untouched, so a small upload costs what it costs today', () => {
      const original = bundle({ resources: filesTotalling(4) });

      const plan = planReviewPortions(original);

      expect(plan.split).toBe(false);
      expect(plan.portions).toHaveLength(1);
      expect(plan.portions[0]).toBe(original);
    });

    it('does not split a single file, however large', () => {
      const original = bundle({
        resources: [textResource('refs/huge.md', 'x'.repeat(5_000_000))],
      });

      const plan = planReviewPortions(original);

      expect(plan.split).toBe(false);
      expect(plan.portions).toHaveLength(1);
    });
  });

  describe('when the archive overruns the budget', () => {
    it('splits it', () => {
      const plan = planReviewPortions(bundle({ resources: filesTotalling(24) }));

      expect(plan.split).toBe(true);
      expect(plan.portions.length).toBeGreaterThan(1);
    });

    it('keeps every file, because a dropped file is the loss this exists to remove', () => {
      const resources = filesTotalling(60);
      const plan = planReviewPortions(bundle({ resources }));

      const placed = plan.portions.flatMap((p) => p.resources.map((r) => r.normalizedPath));

      expect(new Set(placed).size).toBe(resources.length);
      expect([...placed].sort()).toEqual(resources.map((r) => r.normalizedPath).sort());
    });

    it('places each file exactly once, so no file is judged twice', () => {
      const plan = planReviewPortions(bundle({ resources: filesTotalling(60) }));

      const placed = plan.portions.flatMap((p) => p.resources.map((r) => r.normalizedPath));

      expect(placed).toHaveLength(new Set(placed).size);
    });

    it('never leaves a portion empty', () => {
      const plan = planReviewPortions(bundle({ resources: filesTotalling(60) }));

      for (const portion of plan.portions) {
        expect(portion.resources.length).toBeGreaterThan(0);
      }
    });

    it('produces the same plan every time, so a re-review is comparable', () => {
      const resources = filesTotalling(40);

      const first = planReviewPortions(bundle({ resources }));
      const second = planReviewPortions(bundle({ resources: [...resources].reverse() }));

      expect(first.portions.map((p) => p.resources.map((r) => r.normalizedPath))).toEqual(
        second.portions.map((p) => p.resources.map((r) => r.normalizedPath)),
      );
    });
  });

  describe('the budget guarantee', () => {
    it('gives every portion an excerpt build with no omissions', () => {
      const plan = planReviewPortions(bundle({ resources: filesTotalling(120) }));

      for (const portion of plan.portions) {
        const built = buildStandardResourceExcerpts(portion, []);
        expect(built.omissions, `portion ${portion.skillName}`).toEqual([]);
        expect(built.excerpts).toHaveLength(portion.resources.length);
      }
    });

    it('exceeds the portion target rather than the budget, when the archive demands it', () => {
      // Far more content than `DEFAULT_TARGET_PORTIONS` portions can hold at the
      // budget ceiling. The count must grow; the budget must not.
      const perPortionCeiling = STANDARD_RESOURCE_TOTAL_CHARS;
      const files = Math.ceil((DEFAULT_TARGET_PORTIONS * perPortionCeiling * 3) / STANDARD_RESOURCE_CHARS);

      const plan = planReviewPortions(bundle({ resources: filesTotalling(files) }));

      expect(plan.portions.length).toBeGreaterThan(DEFAULT_TARGET_PORTIONS);
      for (const portion of plan.portions) {
        expect(buildStandardResourceExcerpts(portion, []).omissions).toEqual([]);
      }
    });

    it('keeps a binary file, which costs nothing but must still appear', () => {
      const binary = textResource('assets/logo.png', '', {
        isBinary: true,
        textContent: undefined,
        decodeStatus: 'binary',
      });
      const resources = [...filesTotalling(30), binary];

      const plan = planReviewPortions(bundle({ resources }));

      const placed = plan.portions.flatMap((p) => p.resources.map((r) => r.normalizedPath));
      expect(placed).toContain('assets/logo.png');
    });
  });

  describe('portion identity', () => {
    it('gives each portion a distinct name, schema name and markdown', () => {
      const plan = planReviewPortions(bundle({ resources: filesTotalling(40) }));

      const names = plan.portions.map((p) => p.skillName);
      const schemas = plan.portions.map((p) => p.skillSchemaName);
      const markdowns = plan.portions.map((p) => p.skillMarkdown);

      expect(new Set(names).size).toBe(plan.portions.length);
      expect(new Set(schemas).size).toBe(plan.portions.length);
      expect(new Set(markdowns).size).toBe(plan.portions.length);
    });

    it('appends the marker, so SKILL.md line numbers stay put for evidence grounding', () => {
      const original = bundle({ resources: filesTotalling(40) });

      const plan = planReviewPortions(original);

      for (const portion of plan.portions) {
        expect(portion.skillMarkdown.startsWith(original.skillMarkdown)).toBe(true);
      }
    });

    it('gives every portion the whole manifest, so no file looks missing', () => {
      const original = bundle({ resources: filesTotalling(40) });

      const plan = planReviewPortions(original);

      for (const portion of plan.portions) {
        expect(portion.manifest).toEqual(original.manifest);
        expect(portion.manifest.length).toBe(original.resources.length);
      }
    });

    it('keeps the bundle marker, because every portion is still the same bundle', () => {
      const original = bundle({ resources: filesTotalling(40) });

      const plan = planReviewPortions(original);

      for (const portion of plan.portions) {
        expect(portion.bundleMarker).toBe(original.bundleMarker);
      }
    });
  });
});
