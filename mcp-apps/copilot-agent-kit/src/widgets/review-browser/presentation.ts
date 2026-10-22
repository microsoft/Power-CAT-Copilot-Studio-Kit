interface ReviewBrowserPresentationInput {
  presentation?: "inline" | "fullscreen";
  storedPresentation?: "inline" | "fullscreen";
  state?: string;
  hostDisplayMode?: "inline" | "fullscreen" | "pip";
  current: boolean;
}

type ReviewBrowserDisplayMode = "inline" | "fullscreen";

interface DisplayModeApp {
  requestDisplayMode: (
    input: { mode: ReviewBrowserDisplayMode },
  ) => Promise<{ mode: "inline" | "fullscreen" | "pip" }>;
}

interface PresentationStorage {
  setItem: (key: string, value: string) => void;
}

export const REVIEW_BROWSER_PRESENTATION_KEY = "agent-review:presentation";

export function reviewBrowserPresentationKey(
  selectionId: string | undefined,
): string | undefined {
  return selectionId
    ? `${REVIEW_BROWSER_PRESENTATION_KEY}:${selectionId}`
    : undefined;
}

export type ReviewBrowserColumnId =
  | "name"
  | "poweredBy"
  | "score"
  | "issues"
  | "lastReviewed"
  | "details";

export function reviewBrowserColumnIds(
  fullscreen: boolean,
): ReviewBrowserColumnId[] {
  return fullscreen
    ? ["name", "poweredBy", "score", "issues", "lastReviewed", "details"]
    : ["name", "score", "issues", "details"];
}

export function reviewBrowserLayout() {
  return {
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
  } as const;
}

/** Inline review rows have one fixed height, so a page fits the inline height budget. */
export const REVIEW_BROWSER_INLINE_ROW_HEIGHT = 48;

/**
 * The inline chrome height before it is measured: the card frame and padding,
 * header, filters, grid header and pager. A caption or an error adds a line.
 */
export function estimateReviewBrowserInlineChrome(input: {
  caption: boolean;
  error: boolean;
}): number {
  return 232 + (input.caption ? 28 : 0) + (input.error ? 64 : 0);
}

/** The number of review rows that fit in the inline content height (at least one). */
export function reviewBrowserInlinePageSize(
  contentHeight: number,
  chromeHeight: number,
  rowHeight: number = REVIEW_BROWSER_INLINE_ROW_HEIGHT,
): number {
  const row = rowHeight > 0 ? rowHeight : REVIEW_BROWSER_INLINE_ROW_HEIGHT;
  return Math.max(1, Math.floor((contentHeight - chromeHeight) / row));
}

/**
 * The first row of an inline page. A start past the rows (for example after
 * the page size grows) moves to the start of the last page.
 */
export function reviewBrowserInlineFirstRow(
  start: number,
  pageSize: number,
  total: number,
): number {
  if (total <= 0) return 0;
  const size = Math.max(1, Math.floor(pageSize));
  const lastPageStart = Math.floor((total - 1) / size) * size;
  return Math.max(0, Math.min(Math.floor(start), lastPageStart));
}

/** For example "Showing 1–6 of 45 reviews"; `first` is a zero-based row index. */
export function reviewBrowserRangeCaption(
  first: number,
  count: number,
  total: number,
): string {
  const noun = total === 1 ? "review" : "reviews";
  if (count <= 0) return `Showing 0 of ${total} ${noun}`;
  const start = first + 1;
  const end = first + count;
  return start === end
    ? `Showing ${start} of ${total} ${noun}`
    : `Showing ${start}–${end} of ${total} ${noun}`;
}

export async function requestReviewBrowserDisplayMode(
  app: DisplayModeApp,
  requestedMode: ReviewBrowserDisplayMode,
  storage: PresentationStorage,
  selectionId?: string,
): Promise<"inline" | "fullscreen" | "pip"> {
  const storageKey = reviewBrowserPresentationKey(selectionId);
  if (storageKey) storage.setItem(storageKey, requestedMode);
  try {
    const response = await app.requestDisplayMode({ mode: requestedMode });
    if (storageKey && response.mode !== requestedMode) {
      storage.setItem(storageKey, response.mode);
    }
    return response.mode;
  } catch (error) {
    if (storageKey) {
      storage.setItem(
        storageKey,
        requestedMode === "fullscreen" ? "inline" : "fullscreen",
      );
    }
    throw error;
  }
}

type FullscreenHostSynchronizationInput = Omit<ReviewBrowserPresentationInput, "current">;

export function shouldSynchronizeFullscreenHost(
  input: FullscreenHostSynchronizationInput,
): boolean {
  const effectivePresentation = input.storedPresentation ?? input.presentation;
  const wantsFullscreen = effectivePresentation
    ? effectivePresentation === "fullscreen"
    : input.state === "fullReview";

  return wantsFullscreen && input.hostDisplayMode !== "fullscreen";
}

export function resolveReviewBrowserFullscreen(
  input: ReviewBrowserPresentationInput,
): boolean {
  if (input.storedPresentation) return input.storedPresentation === "fullscreen";
  if (input.presentation) return input.presentation === "fullscreen";
  if (input.state === "fullReview") return true;
  if (input.hostDisplayMode) return input.hostDisplayMode === "fullscreen";
  return input.current;
}
