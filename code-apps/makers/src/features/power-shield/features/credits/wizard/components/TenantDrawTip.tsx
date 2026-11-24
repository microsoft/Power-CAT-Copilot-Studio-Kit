import { useEffect, useRef, useState } from 'react';
import {
  TeachingPopover,
  TeachingPopoverBody,
  TeachingPopoverFooter,
  TeachingPopoverHeader,
  TeachingPopoverSurface,
  makeStyles,
} from '@fluentui/react-components';

const TIP_SEEN_KEY = 'makers-credits-tenantdraw-tip-v1-seen';
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

export interface TenantDrawTipProps {
  /** The Tenant draw column header the tip points at. */
  target: HTMLElement | null;
  /** True once the table has loaded, so the tip never points at a skeleton. */
  ready: boolean;
}

/** One-time tip that introduces the Tenant draw column on Step 2 (spec 031). */
export function TenantDrawTip({ target, ready }: TenantDrawTipProps) {
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
      positioning={{ target, position: 'below', align: 'end' }}
      onOpenChange={(_, data) => {
        if (!data.open) close();
      }}
    >
      <TeachingPopoverSurface className={styles.surface} aria-label="Draw from tenant capacity">
        <TeachingPopoverHeader>Draw from tenant capacity</TeachingPopoverHeader>
        <TeachingPopoverBody>
          You can now ask for credits, tenant draw, or both. Tenant draw lets this environment use
          your organization&apos;s unassigned credits when its own run out, or if it has none. Each
          environment needs at least one.
        </TeachingPopoverBody>
        <TeachingPopoverFooter primary={{ children: 'Got it', onClick: close }} />
      </TeachingPopoverSurface>
    </TeachingPopover>
  );
}
