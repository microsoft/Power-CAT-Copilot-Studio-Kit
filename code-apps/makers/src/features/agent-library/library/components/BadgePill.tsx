/**
 * BadgePill — colored badge pill with optional icon + text.
 *
 * Variants:
 *   - knowledge: green tint (knowledge source badges)
 *   - tools:     lavender tint (tool/action badges)
 *   - connector: neutral outlined (connector pills)
 *   - type-agent / type-component: neutral muted, no border (type classification badges)
 */

import React from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BadgePillProps {
  variant: 'knowledge' | 'tools' | 'connector' | 'type-agent' | 'type-component';
  icon?: React.ReactNode;
  label: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: tokens.borderRadiusCircular,
    lineHeight: '1',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  },

  // Content badges (knowledge, tools, connector): larger padding + regular weight
  contentBadge: {
    paddingTop: '4px',
    paddingBottom: '4px',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    gap: tokens.spacingHorizontalSNudge,
  },

  // Type badges (type-agent, type-component): tighter padding + semibold
  typeBadge: {
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: '10px',
    paddingRight: '10px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    gap: tokens.spacingHorizontalSNudge,
  },

  // Variant: knowledge — green tint
  knowledge: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    ...{
      borderTop: `1px solid ${tokens.colorPaletteGreenBorderActive}`,
      borderRight: `1px solid ${tokens.colorPaletteGreenBorderActive}`,
      borderBottom: `1px solid ${tokens.colorPaletteGreenBorderActive}`,
      borderLeft: `1px solid ${tokens.colorPaletteGreenBorderActive}`,
    } as Record<string, string>,
  },

  // Variant: tools — lavender tint
  tools: {
    backgroundColor: tokens.colorPaletteLavenderBackground2,
    color: tokens.colorPaletteLavenderForeground2,
    ...{
      borderTop: `1px solid ${tokens.colorPaletteLavenderBorderActive}`,
      borderRight: `1px solid ${tokens.colorPaletteLavenderBorderActive}`,
      borderBottom: `1px solid ${tokens.colorPaletteLavenderBorderActive}`,
      borderLeft: `1px solid ${tokens.colorPaletteLavenderBorderActive}`,
    } as Record<string, string>,
  },

  // Variant: connector — neutral outlined
  connector: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    ...{
      borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
      borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
      borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    } as Record<string, string>,
  },

  // Variant: type-agent — neutral muted, no visible border
  typeAgent: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },

  // Variant: type-component — neutral muted, no visible border
  typeComponent: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },

  iconWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for the two type-classification variants. */
function isTypeBadge(variant: BadgePillProps['variant']): boolean {
  return variant === 'type-agent' || variant === 'type-component';
}

/** Maps a variant name to its makeStyles class key. */
function variantClass(
  styles: ReturnType<typeof useStyles>,
  variant: BadgePillProps['variant'],
): string {
  switch (variant) {
    case 'knowledge':
      return styles.knowledge;
    case 'tools':
      return styles.tools;
    case 'connector':
      return styles.connector;
    case 'type-agent':
      return styles.typeAgent;
    case 'type-component':
      return styles.typeComponent;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BadgePill renders a colored pill badge for knowledge sources, tools,
 * connector references, and agent/component type labels.
 */
const BadgePill = React.memo(function BadgePill({ variant, icon, label }: BadgePillProps) {
  const styles = useStyles();
  const type = isTypeBadge(variant);

  const className = mergeClasses(
    styles.base,
    type ? styles.typeBadge : styles.contentBadge,
    variantClass(styles, variant),
  );

  return (
    <span className={className}>
      {icon !== undefined && (
        <span className={styles.iconWrapper} aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </span>
  );
});

BadgePill.displayName = 'BadgePill';

export { BadgePill };
