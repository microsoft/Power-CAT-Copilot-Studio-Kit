import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GENERATED_LAYOUT, generatedPreview, loaderSkeletonCount, previewCaption, viewAllLabel } from "./inlineFit";

// #root padding is 24 px on each side, so the content budget is the host budget minus 48.
const BUDGETS = { 500: 452, 600: 552, 700: 652 } as const;
const input = (contentHeight: number, total: number, overrides: Partial<Parameters<typeof generatedPreview>[0]> = {}) =>
  ({ contentHeight, total, error: false, unavailable: false, refused: false, page: 0, ...overrides });

describe("generatedPreview (Eval Builder inline model)", () => {
  it("shows the rows that fit and offers full screen", () => {
    const layout = generatedPreview(input(BUDGETS[500], 28));
    assert.deepEqual([layout.preview, layout.rows, layout.start, layout.end, layout.pages], [true, 3, 0, 3, 1]);
    assert.equal(layout.height, 444);
    assert.equal(previewCaption(layout, 28, "cases", false), "Showing 3 of 28 cases");
    assert.equal(viewAllLabel(28, "cases"), "View all 28 cases in full screen");
    assert.equal(viewAllLabel(1, "cases"), "Open full screen");
  });
  it("pages the rows with a caption when full screen is unavailable", () => {
    const layout = generatedPreview(input(BUDGETS[500], 28, { unavailable: true, page: 1 }));
    assert.deepEqual([layout.rows, layout.start, layout.end, layout.pages, layout.footerLines], [2, 2, 4, 14, 2]);
    assert.equal(previewCaption(layout, 28, "cases", true), "Showing 3–4 of 28 cases");
    assert.equal(previewCaption({ start: 0, end: 0 }, 0, "cases", true), "Showing 0 of 0 cases");
  });
  it("shows every case without a footer when all fit, and keeps the caption after a refusal", () => {
    const layout = generatedPreview(input(BUDGETS[700], 3));
    assert.deepEqual([layout.preview, layout.end, layout.footerLines], [false, 3, 0]);
    const refused = generatedPreview(input(BUDGETS[700], 3, { unavailable: true, refused: true }));
    assert.equal(refused.footerLines, 1);
    assert.equal(refused.height, layout.height + GENERATED_LAYOUT.gap + GENERATED_LAYOUT.caption);
  });
  it("keeps the modeled height within each budget", () => {
    for (const contentHeight of Object.values(BUDGETS)) {
      for (const total of [0, 1, 3, 5, 12, 28, 40]) {
        for (const flags of [0, 1, 2, 3]) {
          const layout = generatedPreview(input(contentHeight, total, { error: Boolean(flags & 1), unavailable: Boolean(flags & 2) }));
          assert.ok(layout.height <= contentHeight, `${contentHeight}/${total}/${flags} -> ${layout.height}`);
          assert.ok(layout.end - layout.start <= total);
        }
      }
    }
  });
  it("limits the loader skeleton rows to the budget", () => {
    assert.equal(loaderSkeletonCount(BUDGETS[500]), 4);
    assert.equal(loaderSkeletonCount(300), 2);
    assert.equal(loaderSkeletonCount(100), 0);
  });
});
