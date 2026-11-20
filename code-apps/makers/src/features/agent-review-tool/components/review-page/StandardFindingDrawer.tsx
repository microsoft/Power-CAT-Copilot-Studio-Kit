import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import {
  Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, InlineDrawer, OverlayDrawer,
  Subtitle2, makeStyles, mergeClasses, tokens, typographyStyles, useRestoreFocusSource,
} from '@fluentui/react-components';
import { ChevronLeft20Regular, ChevronRight20Regular, Dismiss24Regular } from '@fluentui/react-icons';
import type { ComplianceDisplayRow, PatternDisplayRow } from '../../contracts/ReviewResult';
import { PatternFindingDetails } from '../dialogs/PatternDetailsDialog';
import { ComplianceFindingDetails } from '../dialogs/ComplianceDetailsDialog';

const useStyles = makeStyles({
  drawer: {
    width: '560px',
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 0,
  },
  inlineDrawer: {
    alignSelf: 'stretch',
    height: 'auto',
    maxHeight: 'none',
    overflow: 'visible',
  },
  body: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL, minWidth: 0,
  },
  inlineBody: {
    flex: '0 0 auto',
    overflowY: 'visible',
  },
  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS, borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM, marginTop: 'auto',
  },
  navCount: { ...typographyStyles.caption1, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  visuallyHidden: {
    position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
    overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
  },
});

interface FindingNavProps {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  itemNoun: string;
  currentLabel: string;
}

function FindingNav({ index, total, onPrev, onNext, itemNoun, currentLabel }: FindingNavProps) {
  const styles = useStyles();
  const atStart = index === 0;
  const atEnd = index === total - 1;
  return (
    <div className={styles.nav}>
      <Button
        appearance="subtle" icon={<ChevronLeft20Regular />}
        // Keep focus on the stepper when it reaches a boundary.
        disabledFocusable={atStart} onClick={onPrev}
        aria-label={atStart ? `Previous ${itemNoun}, already at the first` : `Previous ${itemNoun}`}
      >
        Prev
      </Button>
      <span className={styles.navCount}>{index + 1} / {total}</span>
      <span role="status" aria-live="polite" className={styles.visuallyHidden}>
        {`${itemNoun} ${index + 1} of ${total}: ${currentLabel}`}
      </span>
      <Button
        appearance="subtle" iconPosition="after" icon={<ChevronRight20Regular />}
        disabledFocusable={atEnd} onClick={onNext}
        aria-label={atEnd ? `Next ${itemNoun}, already at the last` : `Next ${itemNoun}`}
      >
        Next
      </Button>
    </div>
  );
}

export interface StandardFindingDrawerProps {
  open: boolean;
  pattern: PatternDisplayRow | null;
  patternIndex: number | null;
  patternTotal: number;
  criterion: ComplianceDisplayRow | null;
  criterionIndex: number | null;
  criterionTotal: number;
  agentInstructions?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  className?: string;
  /** Use an overlay when the review grid and details cannot fit side by side. */
  overlay?: boolean;
}

/** Standard finding content with the existing inline layout and focus-preserving Prev/Next stepper. */
export function StandardFindingDrawer({
  open, pattern, patternIndex, patternTotal, criterion, criterionIndex, criterionTotal,
  agentInstructions, onPrev, onNext, onClose, className, overlay = false,
}: StandardFindingDrawerProps) {
  const styles = useStyles();
  const restoreFocus = useRestoreFocusSource();
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = pattern?.patternName ?? criterion?.criteriaName ?? 'Finding details';
  const index = pattern ? patternIndex : criterionIndex;
  const selected = pattern ?? criterion;
  const Drawer = overlay ? OverlayDrawer : InlineDrawer;
  useLayoutEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  return (
    <Drawer
      open={open} position="end" separator
      className={mergeClasses(styles.drawer, !overlay && styles.inlineDrawer, className)}
      role={overlay ? 'dialog' : 'region'} aria-label={`Finding details: ${title}`} {...restoreFocus}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!overlay && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      {...(overlay ? {
        onOpenChange: (_: unknown, data: { open: boolean }) => {
          if (!data.open) onClose();
        },
      } : {})}
    >
      {selected && index !== null && (
        <>
          <DrawerHeader>
            <DrawerHeaderTitle
              action={<Button ref={closeRef} appearance="subtle" aria-label="Close finding details" icon={<Dismiss24Regular />} onClick={onClose} />}
            >
              <Subtitle2>{title}</Subtitle2>
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody className={mergeClasses(styles.body, !overlay && styles.inlineBody)}>
            {pattern
              ? <PatternFindingDetails pattern={pattern} presentation="actionable" />
              : criterion && (
                <ComplianceFindingDetails
                  criterion={criterion}
                  agentInstructions={agentInstructions}
                  presentation="actionable"
                />
              )}
            <FindingNav
              index={index} total={pattern ? patternTotal : criterionTotal}
              onPrev={onPrev} onNext={onNext} itemNoun={pattern ? 'pattern' : 'criterion'}
              currentLabel={`${title}, ${selected.statusLabel}`}
            />
          </DrawerBody>
        </>
      )}
    </Drawer>
  );
}
