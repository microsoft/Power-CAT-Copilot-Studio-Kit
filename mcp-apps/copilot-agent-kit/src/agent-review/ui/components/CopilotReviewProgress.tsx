/**
 * CopilotReviewProgress — granular cancellable progress for the Copilot review (Task 11).
 *
 * Shows: determinate ProgressBar, active stage + percent, completedUnits/totalUnits,
 * resource path, partial failures, cancel button. All Fluent UI v9 native.
 *
 * Accessibility: a persistent live region announces status changes across the
 * null → progress transition.
 */
import {
  Button,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { SkillReviewProgress } from '../../core/index.js';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  stageLabel: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  resourcePath: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

/** Human-readable labels for progress stages. */
const STAGE_LABELS: Record<SkillReviewProgress['stage'], string> = {
  loading: 'Loading configuration',
  downloading: 'Downloading resources',
  'deterministic-scan': 'Running deterministic scan',
  'standard-ai': 'Running AI evaluation',
  'deep-resource-ai': 'Evaluating resources (deep)',
  'file-synthesis': 'Synthesizing file analysis',
  'bundle-synthesis': 'Synthesizing bundle analysis',
  persisting: 'Saving results',
  complete: 'Complete',
};

export interface CopilotReviewProgressProps {
  /** Current progress state. Null while no progress has been emitted. */
  progress: SkillReviewProgress | null;
  /** Agent display name. */
  agentName: string;
  /** Callback to cancel the in-flight review. */
  onCancel: () => void;
  /** Whether cancellation has been requested. */
  isCancelling?: boolean;
  /** Whether to show the cancel button. Defaults to true (run mode). Set false for view loading. */
  showCancel?: boolean;
  /** Custom label for the null-progress indeterminate state. */
  label?: string;
}

/** Granular progress display for a running GitHub Copilot harness review. */
export function CopilotReviewProgress({
  progress,
  agentName,
  onCancel,
  isCancelling = false,
  showCancel = true,
  label,
}: CopilotReviewProgressProps) {
  const styles = useStyles();

  const hasProgress = progress !== null;
  const percent = hasProgress ? Math.min(Math.max(progress.percent, 0), 100) : 0;
  const stageLabel = hasProgress ? (STAGE_LABELS[progress.stage] ?? progress.stage) : null;
  const showUnits = hasProgress && progress.totalUnits > 0;

  const statusText = isCancelling
    ? 'Cancellation requested, please wait.'
    : hasProgress
      ? `${stageLabel} — ${percent}%`
      : (label ?? `Preparing review for ${agentName}…`);

  return (
    <div className={styles.root}>
      <div
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </div>
      <div className={styles.header}>
        <Text className={styles.stageLabel}>{statusText}</Text>
        {showCancel && (
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={onCancel}
            disabled={isCancelling || (hasProgress && progress.stage === 'complete')}
            aria-label={isCancelling ? 'Cancelling review in progress' : 'Cancel review'}
            size="small"
          >
            {isCancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
      </div>

      {hasProgress ? (
        <ProgressBar value={percent / 100} aria-label={`${stageLabel}: ${percent}%`} />
      ) : (
        <ProgressBar aria-label={label ?? `Preparing review for ${agentName}`} />
      )}

      {hasProgress && (
        <div className={styles.details}>
          <Text className={styles.meta}>{progress.message}</Text>

          {showUnits && (
            <Text className={styles.meta}>
              {progress.completedUnits} / {progress.totalUnits} units
            </Text>
          )}

          {progress.resourcePath && (
            <Text className={styles.resourcePath} title={progress.resourcePath}>
              {progress.resourcePath}
            </Text>
          )}

          {progress.partialFailures > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                {progress.partialFailures} partial failure{progress.partialFailures > 1 ? 's' : ''} so far
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      )}
    </div>
  );
}
