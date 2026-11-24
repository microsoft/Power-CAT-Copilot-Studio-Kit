/**
 * PageHeader Component
 *
 * Page title with PREVIEW badge and descriptive subtitle.
 * Based on Figma node-id=25-29
 *
 * Layout:
 * - Title row: "Agent Review Tool" + "PREVIEW" badge (24px height)
 * - Subtitle row: Description text (20px height)
 * - Gap between rows: 8px
 *
 * Title: 24px, Segoe UI Semi Bold, #242424
 * Badge: "PREVIEW", 12px, brand foreground on brand background, 4px border-radius, 8px/4px padding
 * Subtitle: 14px, Segoe UI Regular, #605e5c
 */

import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { MeteredActionChip } from '../../../../shared/components/MeteredActionChip';
import type { CreditsMeter } from '../../../../shared/components/meteredActionCopy';

/**
 * PageHeader props
 */
export interface PageHeaderProps {
  /** Page title */
  title?: string;

  /** Badge text (e.g., "PREVIEW") */
  badgeText?: string;

  /** Subtitle/description text */
  subtitle?: string;

  /**
   * Discloses that using this tool spends metered capacity. Rendered on the
   * subtitle row, deliberately quieter than the title badge. Pass `null` to
   * suppress it — `undefined` cannot, because a default parameter fills it.
   */
  meter?: CreditsMeter | null;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    marginTop: '16px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    // Was a fixed 24px for title + badge. The meter chip shares the row now, so
    // the height is a floor rather than a cap and the row can wrap at narrow
    // widths instead of clipping.
    minHeight: '24px',
    flexWrap: 'wrap',
    position: 'relative',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '20px',
    color: '#242424',
    fontFamily: 'Segoe UI, sans-serif',
  },
  badge: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: '20px',
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    height: '24px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  subtitleRow: {
    minHeight: '20px',
  },
  subtitle: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '20px',
    color: '#605e5c',
    fontFamily: 'Segoe UI, sans-serif',
  },
});

/**
 * PageHeader component
 *
 * Displays page title with badge and descriptive subtitle.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Agent Review Tool"
 *   badgeText="PREVIEW"
 *   subtitle="Assess agent quality, identify configuration improvements, and ensure best practices in this environment"
 * />
 * ```
 */
export function PageHeader({
  title = 'Agent Review Tool',
  badgeText = 'PREVIEW',
  subtitle = 'Assess agent quality, identify configuration improvements, and ensure best practices in this environment',
  meter = 'credits',
}: PageHeaderProps) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      {/* Title Row with Badge */}
      <div className={styles.titleRow}>
        <Text className={styles.title}>{title}</Text>
        {badgeText && <span className={styles.badge}>{badgeText}</span>}
        {/*
          The meter chip rides the title row, after PREVIEW, with a neutral fill
          and no border.

          It was tried on the subtitle row first, which was tidier but too quiet
          for a price. It was then tried here with no chrome at all, which
          overcorrected: with the fill gone too it stopped looking like a badge
          and read as stray text beside the title.

          A neutral fill against PREVIEW's brand tint gives the two the same
          shape, so they read as a pair, with the hierarchy carried by colour
          weight rather than by one of them having no edges. The separator that
          the borderless version needed is gone with it, because the fill does
          that job.
        */}
        {meter && <MeteredActionChip meter={meter} />}
      </div>

      {/* Subtitle Row */}
      {subtitle && (
        <div className={styles.subtitleRow}>
          <Text className={styles.subtitle}>{subtitle}</Text>
        </div>
      )}
    </div>
  );
}
