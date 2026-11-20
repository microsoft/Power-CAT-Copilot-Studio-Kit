import React from 'react';
import { makeStyles, tokens, Body1, Caption1 } from '@fluentui/react-components';
import noResultsImage from '../../../../shared/assets/no-results.png?inline';

interface EmptyStateProps {
  icon?: React.ReactNode;
  /** Shows the shared "no results" illustration (same as Agent Debugger) above the title. */
  illustration?: boolean;
  title: string;
  description?: string;
  minHeight?: string;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    width: '100%',
  },
  icon: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase600,
  },
  description: {
    color: tokens.colorNeutralForeground3,
  },
  illustration: {
    width: '140px',
    opacity: 0.9,
    marginBottom: tokens.spacingVerticalS,
  },
});

export function EmptyState({ icon, illustration, title, description, minHeight }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <div className={styles.root} style={minHeight ? { minHeight } : undefined}>
      {illustration && <img src={noResultsImage} alt="" role="presentation" className={styles.illustration} />}
      {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
      <Body1>{title}</Body1>
      {description && <Caption1 className={styles.description}>{description}</Caption1>}
    </div>
  );
}
