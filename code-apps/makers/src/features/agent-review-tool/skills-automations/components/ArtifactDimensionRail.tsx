import { useEffect, useId, useRef } from 'react';
import {
  Button,
  makeStyles,
  shorthands,
  tokens,
  typographyStyles,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import type { RubricDimensionScore } from '../contracts/ArtifactReview';
import { ArtifactDimensionDetail } from './ArtifactDimensionDetail';

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
    flexShrink: 0,
    ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalS),
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
  },
  backButton: {
    minHeight: '44px',
    whiteSpace: 'nowrap',
  },
  body: {
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
  detailHeading: {
    ...typographyStyles.body1Strong,
    margin: 0,
  },
});

export interface ArtifactDimensionRailProps {
  dimension: RubricDimensionScore;
  onDismiss: () => void;
}

/** Reuses the summary rail for the full explanation of one rubric score. */
export function ArtifactDimensionRail({ dimension, onDismiss }: ArtifactDimensionRailProps) {
  const styles = useStyles();
  const headingId = useId();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRestoreFocusSource();

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
      </div>
      <div className={styles.body}>
        <h2 id={headingId} className={styles.detailHeading}>
          Rubric dimension
        </h2>
        <ArtifactDimensionDetail dimension={dimension} headingLevel="h3" />
      </div>
    </aside>
  );
}
