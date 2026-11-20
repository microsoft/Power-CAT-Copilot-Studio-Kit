/**
 * StatCard Component
 *
 * Displays key metrics in a horizontal card layout with optional colored accent bar.
 * Based on ui-specification.md Section 3.1
 *
 * Measurements:
 * - Card: 100% width × 80px height
 * - Icon section: 80px width with gradient background
 * - Icon size: 40px
 * - Left accent bar: 4px width, 8px top/bottom inset
 * - Content padding: 16px
 * - Gap: 4px between label and value
 */

import React from 'react';
import { Card, Text, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { FluentIcon } from '@fluentui/react-icons';

/**
 * StatCard props
 */
export interface StatCardProps {
  /** Display label (e.g., "Total Bots", "Reviewed") */
  label: string;

  /** Display value (e.g., "45", "32 (71%)", "--" for loading) */
  value: string | number;

  /** Visual variant for value color */
  variant?: 'default' | 'success' | 'warning' | 'error';

  /** Optional icon component */
  icon?: FluentIcon;

  /** Optional colored accent bar (uses Fluent UI data viz palette) */
  barColor?: 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8' | 'slot9' | 'slot10';

  /** Optional tooltip content */
  tooltip?: string;
}

/**
 * Fluent UI data visualization palette
 * Maps to Fluent UI charting colors for consistency
 */
const BAR_COLORS: Record<string, string> = {
  slot1: '#637CEF', // Blue
  slot2: '#E3008C', // Pink
  slot3: '#2AA0A4', // Teal
  slot4: '#9373C0', // Purple
  slot5: '#13A10E', // Green
  slot6: '#3A96DD', // Light blue
  slot7: '#CA5010', // Orange
  slot8: '#57811B', // Olive
  slot9: '#B146C2', // Magenta
  slot10: '#AE8C00', // Yellow
};

const useStyles = makeStyles({
  card: {
    position: 'relative',
    width: '100%',
    height: '80px',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: '8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.10), 0 0 2px rgba(0, 0, 0, 0.06)',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  accentBar: {
    position: 'absolute',
    left: '8px',
    top: '12px',
    bottom: '12px',
    width: '4px',
    borderRadius: '4px',
    zIndex: 1,
  },
  iconSection: {
    width: '80px',
    minWidth: '80px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 100%)`,
    borderTopLeftRadius: '8px',
    borderBottomLeftRadius: '8px',
  },
  icon: {
    fontSize: '40px',
    color: tokens.colorBrandForeground1,
  },
  contentSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: '24px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '12px',
    gap: '2px',
  },
  value: {
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '1.2',
  },
  valueDefault: {
    color: tokens.colorNeutralForeground1,
  },
  valueSuccess: {
    color: tokens.colorPaletteGreenForeground1,
  },
  valueWarning: {
    color: tokens.colorPaletteYellowForeground1,
  },
  valueError: {
    color: tokens.colorPaletteRedForeground1,
  },
  label: {
    fontSize: '13px',
    lineHeight: '16px',
    color: tokens.colorNeutralForeground2,
  },
});

/**
 * StatCard component
 *
 * @example
 * ```tsx
 * <StatCard
 *   label="Total Bots"
 *   value="45"
 *   barColor="slot1"
 *   tooltip="Active agents in environment"
 * />
 * ```
 */
export function StatCard({
  label,
  value,
  variant = 'default',
  icon: Icon,
  barColor,
  tooltip,
}: StatCardProps) {
  const styles = useStyles();

  const valueColorClass =
    variant === 'success'
      ? styles.valueSuccess
      : variant === 'warning'
        ? styles.valueWarning
        : variant === 'error'
          ? styles.valueError
          : styles.valueDefault;

  const cardContent = (
    <Card className={styles.card} appearance="outline" size="small">
      {/* Colored accent bar (optional) */}
      {barColor && (
        <div
          className={styles.accentBar}
          style={{ backgroundColor: BAR_COLORS[barColor] }}
        />
      )}

      {/* Icon section (optional) */}
      {Icon && (
        <div className={styles.iconSection}>
          <Icon className={styles.icon} />
        </div>
      )}

      {/* Content section */}
      <div className={styles.contentSection}>
        {/* Value */}
        <Text className={mergeClasses(styles.value, valueColorClass)}>{value}</Text>

        {/* Label */}
        <Text className={styles.label}>{label}</Text>
      </div>
    </Card>
  );

  // Wrap with tooltip if provided
  if (tooltip) {
    return (
      <Tooltip content={tooltip} relationship="description" positioning="above">
        {cardContent}
      </Tooltip>
    );
  }

  return cardContent;
}
