import assert from "node:assert/strict";
import test from "node:test";
import * as presentation from "./presentation";

const { resolveReviewBrowserFullscreen } = presentation;

test("scopes stored presentation to one review-browser invocation", () => {
  assert.equal(
    presentation.reviewBrowserPresentationKey("selection-1"),
    "agent-review:presentation:selection-1",
  );
  assert.equal(
    presentation.reviewBrowserPresentationKey("selection-2"),
    "agent-review:presentation:selection-2",
  );
  assert.equal(presentation.reviewBrowserPresentationKey(undefined), undefined);
});

test("exposes a host synchronization decision for remounted fullscreen widgets", () => {
  const candidate = (presentation as Record<string, unknown>).shouldSynchronizeFullscreenHost;

  assert.equal(typeof candidate, "function");
});

test("exposes a display-mode transition that does not reload review data", () => {
  const candidate = (presentation as Record<string, unknown>).requestReviewBrowserDisplayMode;

  assert.equal(typeof candidate, "function");
});

test("exposes responsive review-grid column selection", () => {
  const candidate = (presentation as Record<string, unknown>).reviewBrowserColumnIds;

  assert.equal(typeof candidate, "function");
});

test("keeps the grid content-sized inside the full-height outer surface", () => {
  const candidate = (presentation as Record<string, unknown>).reviewBrowserLayout;

  assert.equal(typeof candidate, "function");
  if (typeof candidate !== "function") return;

  assert.deepEqual(candidate(), {
    outerSurface: {
      flexGrow: 1,
      minHeight: 0,
      padding: 0,
      backgroundColor: "transparent",
      border: "none",
      borderRadius: 0,
      boxShadow: "none",
    },
    grid: { flexGrow: 0, flexShrink: 0 },
  });
});

test("shows compact columns inline and all columns fullscreen", () => {
  assert.deepEqual(
    presentation.reviewBrowserColumnIds(false),
    ["name", "score", "issues", "details"],
  );
  assert.deepEqual(
    presentation.reviewBrowserColumnIds(true),
    ["name", "poweredBy", "score", "issues", "lastReviewed", "details"],
  );
});

test("changes display mode without calling a server tool", async () => {
  const displayRequests: string[] = [];
  const storedValues: string[] = [];
  const app = {
    requestDisplayMode: async ({ mode }: { mode: "inline" | "fullscreen" }) => {
      displayRequests.push(mode);
      return { mode };
    },
    callServerTool: () => {
      throw new Error("Presentation changes must not reload reviews.");
    },
  };
  const storage = {
    getItem: () => null,
    setItem: (_key: string, value: string) => storedValues.push(value),
  };

  const mode = await presentation.requestReviewBrowserDisplayMode(
    app,
    "fullscreen",
    storage,
    "selection-1",
  );

  assert.equal(mode, "fullscreen");
  assert.deepEqual(displayRequests, ["fullscreen"]);
  assert.deepEqual(storedValues, ["fullscreen"]);
});

test("requests host fullscreen when persisted presentation remounts into an inline host", () => {
  assert.equal(presentation.shouldSynchronizeFullscreenHost({
    presentation: "fullscreen",
    state: "fullReview",
    hostDisplayMode: "inline",
  }), true);
});

test("uses client presentation state when the remounted tool result is stale", () => {
  assert.equal(resolveReviewBrowserFullscreen({
    presentation: "inline",
    storedPresentation: "fullscreen",
    state: "reviewInventory",
    hostDisplayMode: "inline",
    current: false,
  }), true);
});

test("preserves fullscreen when a remounted host reports inline", () => {
  assert.equal(resolveReviewBrowserFullscreen({
    presentation: "fullscreen",
    state: "reviewInventory",
    hostDisplayMode: "inline",
    current: false,
  }), true);
});

test("restores a persisted full review when a remounted host reports inline", () => {
  assert.equal(resolveReviewBrowserFullscreen({
    state: "fullReview",
    hostDisplayMode: "inline",
    current: false,
  }), true);
});

test("follows the host display mode after the host showed full screen", () => {
  const follow = presentation.REVIEW_BROWSER_FOLLOW_HOST;
  const stored = presentation.storedReviewBrowserPresentation;
  assert.equal(stored(follow, "fullscreen"), "fullscreen");
  assert.equal(stored(follow, "inline"), "inline");
  assert.equal(stored(follow, "pip"), "inline");
  assert.equal(stored("fullscreen", "inline"), "fullscreen");
  assert.equal(stored("inline", "fullscreen"), "inline");
  assert.equal(stored(null, "inline"), undefined);
  assert.equal(stored("unknown", "inline"), undefined);
  // The followed value never synchronizes the host to full screen again,
  // also for a full review or a tool result that asked for full screen.
  for (const hostDisplayMode of ["inline", "fullscreen", "pip"] as const) {
    const storedPresentation = stored(follow, hostDisplayMode);
    assert.equal(presentation.shouldSynchronizeFullscreenHost({
      presentation: "fullscreen",
      storedPresentation,
      state: "fullReview",
      hostDisplayMode,
    }), false);
    assert.equal(resolveReviewBrowserFullscreen({
      presentation: "fullscreen",
      storedPresentation,
      state: "fullReview",
      hostDisplayMode,
      current: true,
    }), hostDisplayMode === "fullscreen");
  }
});

test("fits a whole number of fixed-height inline rows in the content height", () => {
  assert.equal(presentation.REVIEW_BROWSER_INLINE_ROW_HEIGHT, 48);
  // {width: 760, maxHeight: 500} less the 48 px #root frame leaves 452 px of content.
  const chrome = presentation.estimateReviewBrowserInlineChrome({ caption: false, error: false });
  assert.equal(chrome, 232);
  const rows = presentation.reviewBrowserInlinePageSize(452, chrome);
  assert.equal(rows, 4);
  assert.ok(48 + chrome + rows * 48 <= 500);
  assert.equal(
    presentation.estimateReviewBrowserInlineChrome({ caption: true, error: true }),
    232 + 28 + 64,
  );
  assert.equal(presentation.reviewBrowserInlinePageSize(552, 300, 50), 5);
  assert.equal(presentation.reviewBrowserInlinePageSize(552, 300, 0), 5);
});

test("always offers at least one inline row", () => {
  assert.equal(presentation.reviewBrowserInlinePageSize(100, 232), 1);
  assert.equal(presentation.reviewBrowserInlinePageSize(0, 232), 1);
});

test("keeps the inline page start on the rows", () => {
  assert.equal(presentation.reviewBrowserInlineFirstRow(0, 4, 45), 0);
  assert.equal(presentation.reviewBrowserInlineFirstRow(40, 4, 45), 40);
  assert.equal(presentation.reviewBrowserInlineFirstRow(44, 4, 45), 44);
  assert.equal(presentation.reviewBrowserInlineFirstRow(48, 4, 45), 44);
  assert.equal(presentation.reviewBrowserInlineFirstRow(44, 6, 45), 42);
  assert.equal(presentation.reviewBrowserInlineFirstRow(12, 4, 0), 0);
  assert.equal(presentation.reviewBrowserInlineFirstRow(-3, 4, 45), 0);
});

test("describes the visible inline rows", () => {
  assert.equal(presentation.reviewBrowserRangeCaption(0, 4, 45), "Showing 1–4 of 45 reviews");
  assert.equal(presentation.reviewBrowserRangeCaption(44, 1, 45), "Showing 45 of 45 reviews");
  assert.equal(presentation.reviewBrowserRangeCaption(0, 1, 1), "Showing 1 of 1 review");
  assert.equal(presentation.reviewBrowserRangeCaption(0, 0, 0), "Showing 0 of 0 reviews");
  assert.match(
    presentation.reviewBrowserRangeCaption(4, 4, 45),
    /^Showing \d+(–\d+)? of \d+ reviews$/,
  );
});
