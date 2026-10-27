import { useCallback, useEffect, useState } from "react";
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { fullscreenOffered, inlineContentHeight, inlineHeightBudget, measureFrameInset } from "../shared/fullscreen";

/** Neutral caption when the host does not offer full screen or refuses it. */
export const DISPLAY_UNAVAILABLE = "Fullscreen is not available in this host.";

/** Fixed 3-line box (generated cells and textareas): border 2 + padding 14 + 3 lines of 19 px. */
export const FIXED_BOX_HEIGHT = 73;

export type PreviewNoun = "cases";

export interface InlinePreview {
  /** True when only part of the list is shown inline. */
  preview: boolean;
  /** Rows that fit on one inline page. */
  rows: number;
  start: number;
  end: number;
  page: number;
  pages: number;
  /** Footer lines below the list, 24 px each. */
  footerLines: number;
  /** Modeled document content height in px, without the frame inset. */
  height: number;
}

export function viewAllLabel(total: number, noun: PreviewNoun): string {
  return total === 1 ? "Open full screen" : `View all ${total} ${noun} in full screen`;
}

/** "Showing 8 of 25 cases", or a page range when the view paginates. */
export function previewCaption(preview: Pick<InlinePreview, "start" | "end">, total: number, noun: PreviewNoun, paged: boolean): string {
  if (preview.end <= preview.start) return `Showing 0 of ${total} ${noun}`;
  return paged ? `Showing ${preview.start + 1}–${preview.end} of ${total} ${noun}` : `Showing ${preview.end} of ${total} ${noun}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pageWindow(total: number, rows: number, requestedPage: number, paged: boolean) {
  const pages = paged && rows > 0 ? Math.max(1, Math.ceil(total / rows)) : 1;
  const page = paged ? clamp(Math.floor(requestedPage) || 0, 0, pages - 1) : 0;
  const start = page * rows;
  return { pages, page, start, end: Math.min(total, start + rows) };
}

/** Pixel model of the inline Generated evaluations view; every height below is fixed by CSS. */
export const GENERATED_LAYOUT = {
  padding: 4, header: 46, gap: 8, tableChrome: 30, row: 100, note: 16, error: 74,
  footerLine: 24, footerGap: 4, caption: 16, loaderBase: 182, skeleton: 42,
} as const;

export function generatedPreview(input: {
  contentHeight: number; total: number; error: boolean; unavailable: boolean; refused: boolean; page: number;
}): InlinePreview {
  const L = GENERATED_LAYOUT;
  const total = Math.max(0, input.total);
  const fixed = L.padding + L.header + L.gap + L.tableChrome + L.gap + L.note + (input.error ? L.error + L.gap : 0);
  const refusedCaption = input.refused ? L.gap + L.caption : 0;
  if (fixed + total * L.row + refusedCaption <= input.contentHeight) {
    return { preview: false, rows: total, start: 0, end: total, page: 0, pages: 1, footerLines: input.refused ? 1 : 0, height: fixed + total * L.row + refusedCaption };
  }
  const footer = input.unavailable ? L.footerLine + L.footerGap + L.caption : L.footerLine;
  const rows = clamp(Math.floor((input.contentHeight - fixed - L.gap - footer) / L.row), 0, total);
  const range = pageWindow(total, rows, input.page, input.unavailable);
  return { preview: true, rows, ...range, footerLines: input.unavailable ? 2 : 1, height: fixed + (range.end - range.start) * L.row + L.gap + footer };
}

/** Skeleton rows of the inline loader: main height = 182 + 42 n, with 4 px to spare. */
export function loaderSkeletonCount(contentHeight: number): number {
  return clamp(Math.floor((contentHeight - GENERATED_LAYOUT.loaderBase - 4) / GENERATED_LAYOUT.skeleton), 0, 4);
}

/**
 * Inline fit state for one Eval Builder view: the D2 height budget from the host
 * container, minus the measured #root padding, and the full-screen request.
 * Full screen relies on the host close control; the view has no exit request.
 */
export function useInlineFit(host: McpUiHostContext | undefined, app: App | null) {
  const fullscreen = host?.displayMode === "fullscreen";
  const offered = fullscreenOffered(host);
  const [inset, setInset] = useState(() => measureFrameInset().height);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const measure = () => setInset(measureFrameInset().height);
    measure();
    globalThis.addEventListener?.("resize", measure);
    return () => globalThis.removeEventListener?.("resize", measure);
  }, []);
  useEffect(() => {
    if (fullscreen) setRefused(false);
  }, [fullscreen]);
  const requestFullscreen = useCallback(async () => {
    if (!app || !offered) { setRefused(true); return false; }
    try {
      const result = await app.requestDisplayMode({ mode: "fullscreen" });
      if (result?.mode === "fullscreen") return true;
    } catch { /* A refusal keeps the inline view. */ }
    setRefused(true);
    return false;
  }, [app, offered]);
  return {
    fullscreen, inline: !fullscreen, offered, refused, unavailable: !offered || refused,
    budget: inlineHeightBudget(host?.containerDimensions),
    contentHeight: inlineContentHeight(host?.containerDimensions, inset),
    requestFullscreen,
  };
}
