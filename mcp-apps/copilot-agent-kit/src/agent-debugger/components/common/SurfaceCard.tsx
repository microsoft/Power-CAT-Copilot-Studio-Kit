import type { ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
    minWidth: 0,
  },
  flat: {
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `12px ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    lineHeight: '20px',
    fontWeight: tokens.fontWeightSemibold,
    flex: 1,
    minWidth: '120px',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  body: {
    padding: tokens.spacingHorizontalL,
    minWidth: 0,
  },
});

export interface SurfaceCardProps {
  /** Card heading. Omit for a card with no header row. */
  title?: ReactNode;
  /** Icon rendered before the heading. */
  icon?: ReactNode;
  /** Right-aligned header actions. */
  actions?: ReactNode;
  /** Wraps the children in the standard 16px padded body. */
  padded?: boolean;
  /** Flat variant used inside grouped layouts (no shadow, small radius). */
  flat?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * The standard content surface: white card, hairline border, 8px radius and a
 * bordered header row. Matches `.w-card` in the approved design.
 */
export function SurfaceCard({
  title,
  icon,
  actions,
  padded,
  flat,
  className,
  children,
}: SurfaceCardProps) {
  const styles = useStyles();
  return (
    <section className={mergeClasses('w-card', styles.card, flat && styles.flat, className)}>
      {title !== undefined && (
        <header className={styles.header}>
          <h2 className={styles.title}>
            {icon}
            {title}
          </h2>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      )}
      {padded ? <div className={styles.body}>{children}</div> : children}
    </section>
  );
}
