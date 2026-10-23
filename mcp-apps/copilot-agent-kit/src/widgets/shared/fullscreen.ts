export function fullscreenHeight(
  containerDimensions: unknown,
  availableScreenHeight?: number,
): string {
  const candidates: number[] = [];
  if (availableScreenHeight && availableScreenHeight > 0) {
    candidates.push(availableScreenHeight);
  }
  if (containerDimensions && typeof containerDimensions === "object") {
    const dimensions = containerDimensions as Record<string, unknown>;
    const height = typeof dimensions.height === "number"
      ? dimensions.height
      : typeof dimensions.maxHeight === "number"
        ? dimensions.maxHeight
        : undefined;
    if (height && height > 0) candidates.push(height);
  }
  if (candidates.length > 0) return `${Math.max(...candidates)}px`;
  return "100vh";
}

/** The inline height budget when the host gives no container height. */
export const DEFAULT_INLINE_HEIGHT_BUDGET = 600;

/**
 * The inline document height budget: the host container height, else its
 * maximum height, else 600 px. An inline view must fit in this height without
 * a vertical scroll in the document or in an element.
 */
export function inlineHeightBudget(containerDimensions: unknown): number {
  if (containerDimensions && typeof containerDimensions === "object") {
    const dimensions = containerDimensions as Record<string, unknown>;
    for (const value of [dimensions.height, dimensions.maxHeight]) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
    }
  }
  return DEFAULT_INLINE_HEIGHT_BUDGET;
}

/** The padding of the bootstrap #root frame, which is part of the reported size. */
export function measureFrameInset(): { width: number; height: number } {
  const frame = typeof document === "undefined" ? null : document.getElementById("root");
  if (!frame) return { width: 0, height: 0 };
  const style = getComputedStyle(frame);
  const px = (value: string) => Number.parseFloat(value) || 0;
  return {
    width: px(style.paddingLeft) + px(style.paddingRight),
    height: px(style.paddingTop) + px(style.paddingBottom),
  };
}

/**
 * The inline content height: the budget minus the frame inset. It never forces
 * a minimum above the budget.
 */
export function inlineContentHeight(containerDimensions: unknown, frameInsetHeight: number): number {
  return Math.max(0, inlineHeightBudget(containerDimensions) - Math.max(0, frameInsetHeight));
}

/**
 * True unless the host lists its display modes without fullscreen. A host that
 * does not list its modes can still refuse a request; callers handle refusal.
 */
export function fullscreenOffered(
  host: { availableDisplayModes?: readonly string[] | null } | null | undefined,
): boolean {
  const modes = host?.availableDisplayModes;
  return !Array.isArray(modes) || modes.includes("fullscreen");
}