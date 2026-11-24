import type { KeyboardEvent } from 'react';

/**
 * Keyboard handler for interactive Fluent Cards used as drillthrough targets.
 * Fluent makes interactive Cards focusable but does not activate them on
 * Enter/Space, so this mirrors native button behaviour.
 */
export function activateOnEnterOrSpace(handler: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}
