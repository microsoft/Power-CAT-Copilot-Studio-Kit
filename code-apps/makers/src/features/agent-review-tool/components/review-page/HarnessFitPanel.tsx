import {
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useMemo } from 'react';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import {
  HARNESS_FIT_CLEAR_BENEFIT_QUOTE,
  HARNESS_FIT_NO_MOVE_QUOTE,
  assessStandardHarnessFit,
} from '../../utils/harnessFit';
import { HarnessFitContent } from './HarnessFitContent';

export interface HarnessFitPanelProps {
  /** The saved Stage A snapshot of the review. Null when the review has no snapshot. */
  stageA: LocalStageAOutput | null;
  /** True while the saved review details load. */
  isLoading: boolean;
  /** Selects the Upgrade readiness tab of the Harness workspace. */
  onOpenUpgradeReadiness: () => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
    overflowWrap: 'anywhere',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  unavailable: {
    margin: tokens.spacingVerticalM,
  },
  action: {
    alignSelf: 'flex-start',
  },
});

/**
 * Shows the harness fit advice of a saved standard review.
 * Information only: the advice changes no score and is not a failure.
 */
export function HarnessFitPanel({ stageA, isLoading, onOpenUpgradeReadiness }: HarnessFitPanelProps) {
  const styles = useStyles();
  const advice = useMemo(() => (stageA ? assessStandardHarnessFit(stageA) : null), [stageA]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner label="Loading saved harness fit..." />
      </div>
    );
  }

  if (!stageA || stageA.configurationAvailable === false || !advice) {
    return (
      <MessageBar intent="info" className={styles.unavailable}>
        <MessageBarBody>
          Harness fit is unavailable because this review does not contain a readable source snapshot.
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (advice.verdict !== 'copilot-can-fit') {
    return (
      <div className={styles.root}>
        <HarnessFitContent
          headingLevel="h3"
          lead="The review found no sign that this agent needs a different harness."
          quote={HARNESS_FIT_NO_MOVE_QUOTE}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <HarnessFitContent
        headingLevel="h3"
        headingId="harness-fit-heading"
        title="The Microsoft Copilot harness can be a good fit for this agent."
        reasons={advice.reasons}
        quote={HARNESS_FIT_CLEAR_BENEFIT_QUOTE}
      >
        <Button className={styles.action} onClick={onOpenUpgradeReadiness}>
          Open upgrade readiness
        </Button>
      </HarnessFitContent>
    </div>
  );
}