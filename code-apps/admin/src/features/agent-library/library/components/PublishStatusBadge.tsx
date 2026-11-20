/**
 * PublishStatusBadge — pill showing a custom template's publish status.
 *
 * Renders a small colored dot + label inside an outlined pill:
 *   - active   → green dot / green text
 *   - inactive → neutral dot / muted text
 *
 * Only meaningful for custom (admin-authored) templates; system templates do
 * not carry a publish status and should not render this badge.
 */
import React from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

interface PublishStatusBadgeProps {
  status: 'active' | 'inactive';
}

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    height: '24px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusCircular,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },
  dotActive: {
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  dotInactive: {
    backgroundColor: tokens.colorNeutralForeground3,
  },
  text: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
  },
  textActive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  textInactive: {
    color: tokens.colorNeutralForeground3,
  },
});

export const PublishStatusBadge: React.FC<PublishStatusBadgeProps> = React.memo(({ status }) => {
  const styles = useStyles();
  const isActive = status === 'active';
  return (
    <span className={styles.badge}>
      <span
        className={mergeClasses(styles.dot, isActive ? styles.dotActive : styles.dotInactive)}
        aria-hidden="true"
      />
      <span className={mergeClasses(styles.text, isActive ? styles.textActive : styles.textInactive)}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </span>
  );
});

PublishStatusBadge.displayName = 'PublishStatusBadge';
