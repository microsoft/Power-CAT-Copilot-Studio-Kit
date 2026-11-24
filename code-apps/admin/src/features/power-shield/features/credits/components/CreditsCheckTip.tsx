import { useEffect, useRef, useState } from 'react';
import {
  TeachingPopover,
  TeachingPopoverBody,
  TeachingPopoverFooter,
  TeachingPopoverHeader,
  TeachingPopoverSurface,
  makeStyles,
} from '@fluentui/react-components';

const TIP_SEEN_KEY = 'admin-credits-check-tour-v1-seen';
const AUTO_OPEN_DELAY_MS = 300;

const useStyles = makeStyles({
  surface: { width: '340px' },
});

function hasSeenTip(): boolean {
  try {
    return localStorage.getItem(TIP_SEEN_KEY) === 'true';
  } catch {
    return true;
  }
}

function markTipSeen(): void {
  try {
    localStorage.setItem(TIP_SEEN_KEY, 'true');
  } catch {
    /* storage unavailable; the tip simply shows again next visit */
  }
}

export interface CreditsCheckTipProps {
  /** Element the tip points at. */
  target: HTMLElement | null;
  /** True once the check has finished, so the tip never points at a spinner. */
  ready: boolean;
}

/** One-time tip that explains the Copilot Credits check card. Renders nothing after it's dismissed. */
export function CreditsCheckTip({ target, ready }: CreditsCheckTipProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!ready || !target || hasSeenTip()) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      markTipSeen();
      setOpen(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, target]);

  const close = () => {
    setOpen(false);
    const focusTarget = returnFocusRef.current;
    window.requestAnimationFrame(() => focusTarget?.focus());
  };

  if (!open || !target) return null;

  return (
    <TeachingPopover
      open
      withArrow
      positioning={{ target, position: 'below', align: 'start' }}
      onOpenChange={(_, data) => {
        if (!data.open) close();
      }}
    >
      <TeachingPopoverSurface className={styles.surface} aria-label="About the Copilot Credits check">
        <TeachingPopoverHeader>Credits are checked for you</TeachingPopoverHeader>
        <TeachingPopoverBody>
          When you open a request, we check your tenant and environment credits. If you can't approve, the Approve
          button is turned off and this card tells you why.
        </TeachingPopoverBody>
        <TeachingPopoverFooter primary={{ children: 'Got it', onClick: close }} />
      </TeachingPopoverSurface>
    </TeachingPopover>
  );
}
