import {
  makeStyles,
  tokens,
  Text,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import type { ReactElement } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: '48px 24px',
    textAlign: 'center',
  },
  icon: {
    fontSize: '48px',
    color: tokens.colorNeutralForeground3,
  },
  title: {
    color: tokens.colorNeutralForeground1,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '420px',
    lineHeight: tokens.lineHeightBase300,
  },
  examples: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
    maxWidth: '420px',
  },
  prerequisite: {
    maxWidth: '420px',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: ReactElement;
  title: string;
  description: string;
  /** Example text shown in italics below the description */
  examples?: string;
  /** Warning message when prerequisite entities are missing */
  prerequisiteWarning?: string;
  actionLabel: string;
  onAction: () => void;
  /** Disable the action button (e.g. when prerequisites are missing) */
  actionDisabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  examples,
  prerequisiteWarning,
  actionLabel,
  onAction,
  actionDisabled,
}: EmptyStateProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.icon}>{icon}</div>

      <Text size={500} weight="semibold" className={styles.title}>
        {title}
      </Text>

      <Text size={300} className={styles.description}>
        {description}
      </Text>

      {examples && (
        <Text size={200} className={styles.examples}>
          {examples}
        </Text>
      )}

      {prerequisiteWarning && (
        <MessageBar intent="warning" className={styles.prerequisite}>
          <MessageBarBody>{prerequisiteWarning}</MessageBarBody>
        </MessageBar>
      )}

      <Button
        appearance="primary"
        onClick={onAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
