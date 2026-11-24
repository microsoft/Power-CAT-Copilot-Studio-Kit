import { useEffect } from 'react';

/**
 * Guards against accidental data loss when navigating away from a dirty page.
 *
 * Intercepts browser tab-close and hard-refresh via the `beforeunload` event
 * when `isDirty` is true.
 *
 * Note: In-app route-level blocking (useBlocker) is NOT available because
 * CopilotStudioKit uses a declarative `<HashRouter>` rather than a data
 * router (`createHashRouter`). The wizard's CancelWizardDialog provides
 * explicit confirmation for intentional in-app navigation away.
 */
export function useNavigateAwayGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
