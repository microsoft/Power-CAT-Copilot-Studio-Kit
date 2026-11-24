import {
  Button,
  Card,
  Caption1,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CONVERSATION_BATCH_SIZE, CONVERSATION_MAX_RETRIES } from '../../contracts/constants';
import type { ConversationAnalysisRunState } from '../../hooks/useConversationAnalysis';

const useStyles = makeStyles({
  running: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, width: '100%' },
  top: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  spacer: { flexGrow: 1 },
  meta: { color: tokens.colorNeutralForeground2 },
  card: { padding: tokens.spacingVerticalL },
  steps: { display: 'flex', gap: tokens.spacingHorizontalL, flexWrap: 'wrap', color: tokens.colorNeutralForeground2 },
});

interface AnalysisRunBannerProps {
  run: ConversationAnalysisRunState;
  /** "banner" is inline above the Conversations grid (CV-21); "card" is the AR-6 progress card. */
  variant?: 'banner' | 'card';
  onCancel?: () => void;
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** Inline progress for a running batch analysis; terminal feedback uses the feature toaster. */
export function AnalysisRunBanner({ run, variant = 'banner', onCancel }: AnalysisRunBannerProps) {
  const styles = useStyles();
  const finished = run.outcomes.length;
  const failed = run.outcomes.filter((o) => o.status === 'failed').length;
  const succeeded = finished - failed;

  if (run.status === 'running') {
    const meta = `Batch ${run.batchIndex} of ${run.batchCount || 1}` +
      (run.retries > 0 ? ` · ${plural(run.retries, 'retry', 'retries')}` : '');
    const progress = (
      <div className={styles.running}>
        <div className={styles.top}>
          <Text weight="semibold">
            {run.cancelRequested ? 'Stopping after the current batch… ' : ''}
            Analyzing {finished.toLocaleString()} of {plural(run.total, 'conversation')} with “{run.promptName}”
          </Text>
          <span className={styles.spacer} />
          {onCancel && (
            <Button size="small" appearance="secondary" onClick={onCancel} disabled={run.cancelRequested}>Cancel</Button>
          )}
        </div>
        <ProgressBar
          value={run.total ? finished / run.total : 0}
          thickness="large"
          aria-label={`Analyzed ${finished} of ${run.total} conversations`}
        />
        <Caption1 className={styles.meta}>
          {meta} · {variant === 'banner'
            ? 'You can keep browsing — results appear in the Analysis column as each batch finishes.'
            : 'You can leave this page — results are saved as each batch completes.'}
        </Caption1>
        {variant === 'card' && (
          <div className={styles.steps}>
            <Caption1>{succeeded.toLocaleString()} succeeded</Caption1>
            <Caption1>{failed.toLocaleString()} failed (retried up to {CONVERSATION_MAX_RETRIES}×)</Caption1>
            <Caption1>Batches of {CONVERSATION_BATCH_SIZE} conversations</Caption1>
          </div>
        )}
      </div>
    );
    return variant === 'card'
      ? <Card className={styles.card} role="status" aria-live="polite">{progress}</Card>
      : <MessageBar intent="info" layout="multiline" role="status" aria-live="polite"><MessageBarBody>{progress}</MessageBarBody></MessageBar>;
  }

  return null;
}
