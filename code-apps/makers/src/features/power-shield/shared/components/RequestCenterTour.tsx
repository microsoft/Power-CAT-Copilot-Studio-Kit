import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  TeachingPopover,
  TeachingPopoverBody,
  TeachingPopoverCarousel,
  TeachingPopoverCarouselCard,
  TeachingPopoverCarouselFooter,
  TeachingPopoverCarouselNav,
  TeachingPopoverCarouselNavButton,
  TeachingPopoverHeader,
  TeachingPopoverSurface,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

// ─────────────────────────────────────────────────────────────────────────────
// "What's new" tour for Request Center (formerly Power Shield). Opens once per
// browser on the list layout. Each step points at a tab tagged with
// data-tour-id.
// ─────────────────────────────────────────────────────────────────────────────

const TOUR_SEEN_KEY = 'makers-requestcenter-tour-v1-seen';
const AUTO_OPEN_DELAY_MS = 300;

/** data-tour-id values the header elements carry. */
export const REQUEST_CENTER_TOUR_TARGETS = {
  connectorsTab: 'rc-tab-connectors',
  creditsTab: 'rc-tab-credits',
} as const;

interface TourStep {
  id: string;
  targetId: string;
  title: string;
  body: string;
  isNew?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'connectors',
    targetId: REQUEST_CENTER_TOUR_TARGETS.connectorsTab,
    title: 'Power Shield is now Request Center',
    body: 'Your Power Shield requests are on the Connector Requests tab. Create and track them the same way as before.',
  },
  {
    id: 'credits',
    targetId: REQUEST_CENTER_TOUR_TARGETS.creditsTab,
    title: 'Copilot Credits',
    body: 'Request Copilot Credits for your environments. To start, open this tab and select New credits request.',
    isNew: true,
  },
];

const useStyles = makeStyles({
  surface: {
    width: '340px',
  },
  title: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  liveRegion: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    return true;
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    /* storage unavailable; the tour simply shows again next visit */
  }
}

function findTarget(step: TourStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
}

/** Request Center what's-new tour. Opens once; renders nothing after that. */
export function RequestCenterTour() {
  const styles = useStyles();
  const [stepId, setStepId] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const showStep = useCallback((step: TourStep): boolean => {
    const el = findTarget(step);
    if (!el) return false;
    el.scrollIntoView({ block: 'nearest' });
    setTarget(el);
    setStepId(step.id);
    return true;
  }, []);

  const startTour = useCallback(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    for (const step of TOUR_STEPS) {
      if (showStep(step)) {
        markTourSeen();
        return;
      }
    }
  }, [showStep]);

  useEffect(() => {
    if (hasSeenTour()) return;
    const timer = window.setTimeout(startTour, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [startTour]);

  const closeTour = useCallback(() => {
    const focusTarget = returnFocusRef.current ?? target;
    setStepId(null);
    setTarget(null);
    window.requestAnimationFrame(() => focusTarget?.focus());
  }, [target]);

  const handleStepChange = useCallback(
    (_: unknown, data: { value?: string }) => {
      const next = TOUR_STEPS.find((s) => s.id === data.value);
      if (next) showStep(next);
    },
    [showStep],
  );

  const currentIndex = TOUR_STEPS.findIndex((s) => s.id === stepId);
  const current = currentIndex >= 0 ? TOUR_STEPS[currentIndex] : null;

  return (
    <>
      {current && target && (
        <>
          <div aria-live="polite" aria-atomic="true" className={styles.liveRegion}>
            {`Step ${currentIndex + 1} of ${TOUR_STEPS.length}: ${current.title}`}
          </div>
          <TeachingPopover
            open
            withArrow
            positioning={{ target, position: 'below', align: 'start' }}
            onOpenChange={(_, data) => {
              if (!data.open) closeTour();
            }}
          >
            <TeachingPopoverSurface className={styles.surface} aria-label="What's new in Request Center">
              <TeachingPopoverCarousel
                value={current.id}
                onValueChange={handleStepChange}
                onFinish={closeTour}
              >
                {TOUR_STEPS.map((step) => (
                  <TeachingPopoverCarouselCard key={step.id} value={step.id}>
                    <TeachingPopoverHeader>
                      <span className={styles.title}>
                        {step.title}
                        {step.isNew && (
                          <Badge appearance="filled" color="brand" size="small">
                            New
                          </Badge>
                        )}
                      </span>
                    </TeachingPopoverHeader>
                    <TeachingPopoverBody>{step.body}</TeachingPopoverBody>
                  </TeachingPopoverCarouselCard>
                ))}

                <TeachingPopoverCarouselFooter
                  next="Next"
                  previous="Previous"
                  initialStepText="Close"
                  finalStepText="Got it!"
                >
                  <TeachingPopoverCarouselNav>
                    {() => <TeachingPopoverCarouselNavButton />}
                  </TeachingPopoverCarouselNav>
                </TeachingPopoverCarouselFooter>
              </TeachingPopoverCarousel>
            </TeachingPopoverSurface>
          </TeachingPopover>
        </>
      )}
    </>
  );
}

export default RequestCenterTour;
