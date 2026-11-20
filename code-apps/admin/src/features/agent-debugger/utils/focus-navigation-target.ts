export type NavigationTargetBlock = 'start' | 'center' | 'nearest';

interface FocusNavigationTargetOptions {
  block?: NavigationTargetBlock;
  behavior?: ScrollBehavior;
  container?: HTMLElement | null;
  focusTarget?: HTMLElement | null;
  topOffset?: number;
}

function nearestScrollableAncestor(target: HTMLElement): HTMLElement | null {
  let parent = target.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function targetDelta(
  targetRect: DOMRect,
  viewportTop: number,
  viewportHeight: number,
  block: NavigationTargetBlock,
): number {
  const viewportBottom = viewportTop + viewportHeight;
  if (block === 'nearest') {
    if (targetRect.top >= viewportTop && targetRect.bottom <= viewportBottom) return 0;
    return targetRect.top < viewportTop
      ? targetRect.top - viewportTop
      : targetRect.bottom - viewportBottom;
  }
  if (block === 'center') {
    return targetRect.top + targetRect.height / 2 - (viewportTop + viewportHeight / 2);
  }
  return targetRect.top - viewportTop;
}

/**
 * Focuses a navigation target without letting the browser scroll every
 * ancestor, then scrolls only the nearest intended container.
 */
export function focusNavigationTarget(
  target: HTMLElement,
  {
    block = 'nearest',
    behavior = 'smooth',
    container,
    focusTarget = target,
    topOffset = 0,
  }: FocusNavigationTargetOptions = {},
): void {
  focusTarget?.focus({ preventScroll: true });

  const scrollContainer = container ?? nearestScrollableAncestor(target);
  const targetRect = target.getBoundingClientRect();

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const viewportTop = containerRect.top + topOffset;
    const viewportHeight = Math.max(0, scrollContainer.clientHeight - topOffset);
    const delta = targetDelta(targetRect, viewportTop, viewportHeight, block);
    if (delta) {
      scrollContainer.scrollTo({
        top: Math.max(0, scrollContainer.scrollTop + delta),
        behavior,
      });
    }
    return;
  }

  const viewportTop = topOffset;
  const viewportHeight = Math.max(0, window.innerHeight - topOffset);
  const delta = targetDelta(targetRect, viewportTop, viewportHeight, block);
  if (delta) {
    window.scrollTo({
      top: Math.max(0, window.scrollY + delta),
      behavior,
    });
  }
}
