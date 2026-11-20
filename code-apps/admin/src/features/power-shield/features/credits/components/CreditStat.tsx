import { Button, Spinner, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  stat: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  statLabel: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  spinner: { alignSelf: 'flex-start' },
  empty: { color: tokens.colorNeutralForeground3 },
});

export interface CreditStatProps {
  label: string;
  /** A number or short text to show, or the loading / failed state of the read behind it. */
  value: number | string | 'loading' | 'error' | undefined;
  tip: string;
  /** Shown instead of the number when `value` is 'error'. */
  errorText?: string;
  /** Shown when `value` is undefined. */
  emptyText?: string;
}

/** Labelled credit number or short text with an info tooltip. Shared by Approve and the credits check card. */
export function CreditStat({ label, value, tip, errorText, emptyText = 'Not specified' }: CreditStatProps) {
  const styles = useStyles();
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>
        <Text size={200}>{label}</Text>
        <Tooltip content={tip} relationship="description" withArrow>
          <Button appearance="transparent" size="small" icon={<InfoRegular />} aria-label={`About ${label}`} />
        </Tooltip>
      </span>
      {value === 'loading' ? (
        <Spinner className={styles.spinner} size="tiny" label="Loading…" labelPosition="after" />
      ) : value === 'error' ? (
        <Text size={200} className={styles.error}>
          {errorText}
        </Text>
      ) : value === undefined ? (
        <Text size={300} className={styles.empty}>
          {emptyText}
        </Text>
      ) : (
        <Text size={500} weight="semibold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
      )}
    </div>
  );
}
