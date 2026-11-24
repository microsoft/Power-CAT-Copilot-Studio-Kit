/**
 * TemplateBadge — configurable pill badge used to distinguish template sources
 * (e.g. "System" vs "Custom") on gallery cards and dialogs.
 *
 * Modeled on AgentTypeBadge, but both the icon and the label are
 * configurable.
 */
import React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

interface TemplateBadgeProps {
  /** Text shown in the badge (e.g. "System", "Custom"). */
  label: string;
  /**
   * Icon rendered before the label. Accepts any node — a Fluent icon element
   * (e.g. `<Apps16Regular />`) or an `<img>`. Sized to 16×16 by the badge.
   */
  icon?: React.ReactNode;
}

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '24px',
    minWidth: '24px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: '9999px',
    backgroundColor: tokens.colorNeutralBackground5,
    flexShrink: 0,
    overflow: 'hidden',
  },
  iconSlot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    fontSize: '16px',
    flexShrink: 0,
  },
  text: {
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
  },
});

export const TemplateBadge: React.FC<TemplateBadgeProps> = React.memo(
  ({ label, icon }) => {
    const styles = useStyles();
    return (
      <span className={styles.badge}>
        {icon && (
          <span className={styles.iconSlot} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.text}>{label}</span>
      </span>
    );
  },
);

TemplateBadge.displayName = 'TemplateBadge';
