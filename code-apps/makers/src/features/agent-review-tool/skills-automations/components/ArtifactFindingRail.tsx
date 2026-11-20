import { useEffect, useId, useMemo, useRef } from 'react';
import {
  Button,
  Caption1,
  Subtitle2,
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
  typographyStyles,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import type { ArtifactFinding } from '../contracts/ArtifactReview';
import { ArtifactFindingDetail } from './ArtifactFindingDetail';

const useStyles = makeStyles({
  root: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    height: '100%',
    maxHeight: 'calc(100vh - 32px)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
    ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalS),
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
  },
  detailHeading: {
    ...typographyStyles.body1Strong,
    margin: 0,
  },
  backButton: {
    minHeight: '44px',
    whiteSpace: 'nowrap',
  },
  navigation: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
  },
  count: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  iconButton: {
    minWidth: '44px',
    width: '44px',
    height: '44px',
    ...shorthands.padding(0),
  },
  body: {
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
  findingTitle: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
});

export interface ArtifactFindingRailProps {
  finding: ArtifactFinding;
  findings: readonly ArtifactFinding[];
  onSelectFinding: (finding: ArtifactFinding) => void;
  onDismiss: () => void;
}

/**
 * Shows one finding in the fixed review rail without changing page geometry.
 */
export function ArtifactFindingRail({
  finding,
  findings,
  onSelectFinding,
  onDismiss,
}: ArtifactFindingRailProps) {
  const styles = useStyles();
  const headingId = useId();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRestoreFocusSource();
  const index = useMemo(
    () => Math.max(0, findings.findIndex((candidate) => candidate.id === finding.id)),
    [finding.id, findings],
  );

  // Focus the entry action only when the rail opens. Moving it after Previous or
  // Next would stop a keyboard user from paging through findings.
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  return (
    <aside className={styles.root} aria-labelledby={headingId} {...restoreFocus}>
      <div className={styles.header}>
        <Button
          ref={backButtonRef}
          className={styles.backButton}
          appearance="subtle"
          size="medium"
          icon={<ArrowLeftRegular />}
          aria-label="Back to review summary"
          onClick={onDismiss}
        >
          Review summary
        </Button>
        <div className={styles.navigation} role="group" aria-label="Finding navigation">
          <Caption1 className={styles.count}>
            {index + 1} of {findings.length}
          </Caption1>
          {findings.length > 1 && (
            <>
              <Tooltip content="Previous finding" relationship="label">
                <Button
                  className={styles.iconButton}
                  appearance="subtle"
                  size="medium"
                  icon={<ChevronLeftRegular />}
                  aria-label="Previous finding"
                  disabledFocusable={index === 0}
                  onClick={() => onSelectFinding(findings[index - 1])}
                />
              </Tooltip>
              <Tooltip content="Next finding" relationship="label">
                <Button
                  className={styles.iconButton}
                  appearance="subtle"
                  size="medium"
                  icon={<ChevronRightRegular />}
                  aria-label="Next finding"
                  disabledFocusable={index === findings.length - 1}
                  onClick={() => onSelectFinding(findings[index + 1])}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <h2 id={headingId} className={styles.detailHeading}>
          Finding details
        </h2>
        <Subtitle2 as="h3" className={styles.findingTitle} aria-live="polite" aria-atomic="true">
          {finding.title}
        </Subtitle2>
        <ArtifactFindingDetail key={finding.id} finding={finding} compact />
      </div>
    </aside>
  );
}
