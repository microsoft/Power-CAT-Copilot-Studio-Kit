/**
 * Returns focus to the element that opened a drawer when it closes.
 *
 * `InlineDrawer` defaults to `unmountOnClose`, so closing removes the subtree
 * holding the focused Close button. Focus then falls to `<body>` and the next
 * Tab restarts at the top of the document — past the whole findings grid.
 * A `Dialog` does this restoration for free; an inline drawer does not.
 *
 * Usage: attach `openerRef` to the toggle button, pass the same `open` flag.
 */

import { useEffect, useRef } from 'react';

export function useReturnFocusOnClose(open: boolean) {
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) {
      // The drawer has just closed. Restore focus only if it was left nowhere
      // useful — if the maker has already clicked elsewhere, stealing focus
      // back would be worse than leaving it.
      const active = document.activeElement;
      if (!active || active === document.body) {
        openerRef.current?.focus();
      }
    }
    wasOpen.current = open;
  }, [open]);

  return openerRef;
}
