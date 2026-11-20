/**
 * AgentTypeBadge — Gray pill badge with Agents icon + agent type label.
 * Matches Figma node 1956:31087.
 */
import React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import iconAgents from '../assets/icon-agents.svg';

interface AgentTypeBadgeProps {
  label?: string;
}

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    height: '24px',
    minWidth: '24px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: '9999px',
    backgroundColor: tokens.colorNeutralBackground5,
    flexShrink: 0,
    overflow: 'hidden',
  },
  icon: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  text: {
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '16px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    paddingLeft: '2px',
    paddingBottom: '1px',
  },
});

export const AgentTypeBadge: React.FC<AgentTypeBadgeProps> = React.memo(({ label = 'Declarative Agent' }) => {
  const styles = useStyles();
  return (
    <div className={styles.badge}>
      <img src={iconAgents} alt="" className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>{label}</span>
    </div>
  );
});

AgentTypeBadge.displayName = 'AgentTypeBadge';
