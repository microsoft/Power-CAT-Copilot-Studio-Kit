import {
  Badge,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { CopyIdButton } from '../CopyIdButton';
import { HealthStatusBadge } from '../HealthStatusBadge';
import { COPY_ID_CLASS, type AnalysisChipData, type ConversationGridRow } from './types';

const useStyles = makeStyles({
  conversation: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: '2px',
  },
  topic: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  idRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    minWidth: 0,
  },
  id: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  truncate: {
    display: 'block',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chips: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  chip: {
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
  run: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  number: {
    width: '100%',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  summary: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'normal',
  },
});

/** Topic (first user message) with the monospace conversation ID and a copy button (GR-2). */
export function ConversationCell({ row }: { row: ConversationGridRow }) {
  const styles = useStyles();
  return (
    <div className={styles.conversation}>
      <Text className={mergeClasses(styles.topic, !row.topic && styles.muted)} title={row.topic}>
        {row.topic ?? 'No user message'}
      </Text>
      <span className={styles.idRow}>
        <span className={styles.id} title={row.conversationId}>{row.conversationId}</span>
        <CopyIdButton className={COPY_ID_CLASS} value={row.conversationId} label="Copy conversation ID" />
      </span>
    </div>
  );
}

function chipText(chip: AnalysisChipData): string {
  return `${chip.promptLabel} · ${chip.outcomeLabel}`;
}

/** "Prompt · Outcome" chips with "+n" overflow, run status, or "Not analyzed" (CV-10, CV-22). */
export function AnalysisChips({ row, maxVisible = 1 }: { row: ConversationGridRow; maxVisible?: number }) {
  const styles = useStyles();
  if (row.runStatus) {
    return (
      <span className={styles.run} role="status">
        {row.runStatus === 'analyzing' && <Spinner size="extra-tiny" aria-hidden="true" />}
        <Text size={200}>{row.runStatus === 'analyzing' ? 'Analyzing…' : 'Queued'}</Text>
      </span>
    );
  }
  const analyses = row.analyses ?? [];
  if (analyses.length === 0) {
    return (
      <HealthStatusBadge status="unknown" />
    );
  }
  const visible = analyses.slice(0, maxVisible);
  const hidden = analyses.slice(maxVisible);
  return (
    <span className={styles.chips}>
      {visible.map((chip) => (
        <Badge key={chip.key} appearance="tint" color={chip.tone} shape="rounded" className={styles.chip} title={chipText(chip)}>
          {chipText(chip)}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Tooltip relationship="description" content={hidden.map(chipText).join('\n')}>
          <Badge appearance="outline" color="informative" shape="rounded" tabIndex={0}>
            +{hidden.length}
          </Badge>
        </Tooltip>
      )}
    </span>
  );
}

/** Single-line text with an ellipsis and the full value as a tooltip. */
export function TruncatedCell({ value }: { value?: string }) {
  const styles = useStyles();
  if (!value) return null;
  return <Text className={styles.truncate} title={value}>{value}</Text>;
}

export function NumberCell({ value }: { value?: string | number }) {
  const styles = useStyles();
  return <span className={styles.number}>{value ?? ''}</span>;
}

export function SummaryCell({ text }: { text?: string }) {
  const styles = useStyles();
  if (!text) return null;
  return <span className={styles.summary} title={text}>{text}</span>;
}
