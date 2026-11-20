import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

import { MEDIA } from '../theme/design-tokens';

/**
 * Surfaces, buttons, badges and layout primitives shared by every tab.
 *
 * Mirrors the `.w-card`, `.w-badge`, `.w-btn`, `.w-split*`, `.w-stack` and
 * `.w-legend` blocks of the approved prototype (design/assets/workspace.css).
 */
export const useSurfaceStyles = makeStyles({
  /** `.w-card` */
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
    minWidth: 0,
  },

  /** `.w-card > header` */
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    ...shorthands.padding('12px', tokens.spacingHorizontalL),
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },

  /** `.w-card > header h2` */
  cardTitle: {
    ...shorthands.margin(0),
    fontSize: '15px',
    fontWeight: tokens.fontWeightSemibold,
    flexGrow: 1,
    minWidth: '120px',
    display: 'flex',
    alignItems: 'center',
    columnGap: '7px',
  },

  /** `.w-card > .body` */
  cardBody: {
    ...shorthands.padding(tokens.spacingHorizontalL),
  },

  /** Header slot pushed to the trailing edge. */
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    marginLeft: 'auto',
    flexShrink: 0,
  },

  /** `.w-split` — 1fr, becoming 1fr 1fr from 1024px. */
  split: {
    display: 'grid',
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: '1fr',
    [MEDIA.minMd]: {
      gridTemplateColumns: '1fr 1fr',
      alignItems: 'start',
    },
  },

  /** `.w-split-3565` — the Agent insights 35/65 split. */
  split3565: {
    display: 'grid',
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: '1fr',
    [MEDIA.minMd]: {
      gridTemplateColumns: 'minmax(320px, .85fr) minmax(420px, 1.15fr)',
      alignItems: 'start',
    },
  },

  /** `.w-stack` / `.w-tabcontent` */
  stack: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    minWidth: 0,
  },

  /** `.w-badge` */
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    borderRadius: tokens.borderRadiusCircular,
    ...shorthands.padding('2px', '9px'),
    fontSize: '11.5px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  badgeOk: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteGreenBackground2),
  },
  badgeWarn: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteYellowForeground2,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteYellowBackground2),
  },
  badgeErr: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteRedBackground2),
  },
  badgeInfo: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
  },
  badgeNeutral: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },

  /** `.w-dot` — the colour indicator carried by legends and chips. */
  dot: {
    width: '9px',
    height: '9px',
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },

  /** `.w-legend` */
  legend: {
    display: 'flex',
    columnGap: '12px',
    rowGap: '6px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '5px',
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },

  /** `.w-btn` */
  button: {
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.padding(0, '14px'),
    height: '32px',
    fontSize: '13.5px',
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '7px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: tokens.colorNeutralBackgroundDisabled,
      color: tokens.colorNeutralForegroundDisabled,
      borderTopColor: tokens.colorNeutralStrokeDisabled, borderRightColor: tokens.colorNeutralStrokeDisabled, borderBottomColor: tokens.colorNeutralStrokeDisabled, borderLeftColor: tokens.colorNeutralStrokeDisabled,
    },
  },
  buttonSmall: {
    height: '26px',
    ...shorthands.padding(0, '10px'),
    fontSize: '12px',
  },
  buttonPrimary: {
    backgroundColor: tokens.colorBrandBackground,
    borderTopColor: tokens.colorBrandBackground, borderRightColor: tokens.colorBrandBackground, borderBottomColor: tokens.colorBrandBackground, borderLeftColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':hover': { backgroundColor: tokens.colorBrandBackgroundHover },
  },
  buttonSubtle: {
    borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent',
    backgroundColor: 'transparent',
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorBrandForegroundLink,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },

  /** `.w-note` — informational callout. */
  note: {
    display: 'flex',
    columnGap: '9px',
    alignItems: 'flex-start',
    backgroundColor: tokens.colorBrandBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.padding('10px', tokens.spacingHorizontalM),
    fontSize: '12.5px',
    lineHeight: '18px',
    color: tokens.colorNeutralForeground2,
  },

  /** `.w-muted` — empty state inside a card body. */
  muted: {
    color: tokens.colorNeutralForeground3,
    fontSize: '12.5px',
    ...shorthands.padding(tokens.spacingHorizontalL),
    textAlign: 'center',
  },

  /** `.w-sub` — de-emphasised inline text. */
  sub: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },

  /** `.w-kv` — definition grid used across activity details and sessions. */
  kv: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: `3px ${tokens.spacingHorizontalM}`,
    fontSize: '12.5px',
    ...shorthands.margin(0),
  },
  kvCompact: {
    fontSize: '12px',
    gap: `2px ${tokens.spacingHorizontalM}`,
  },
  kvKey: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  kvValue: {
    ...shorthands.margin(0),
    fontWeight: tokens.fontWeightMedium,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  kvCentered: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'center',
  },
  /** `.w-metricscard` — card variant with a tighter header, used by the metric rail. */
  cardMetrics: {
    '& > header': { ...shorthands.padding('10px', tokens.spacingHorizontalL) },
    '& > header h2': { fontSize: '14px' },
  },

  /** `.w-panelcard` — card variant that fills its panel column. */
  cardPanel: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flexGrow: 1,
  },
});

export type SurfaceStyles = ReturnType<typeof useSurfaceStyles>;

export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral';

/** Maps a semantic tone onto the matching `.w-badge` modifier class. */
export function badgeToneClass(styles: SurfaceStyles, tone: BadgeTone): string {
  switch (tone) {
    case 'ok':
      return styles.badgeOk;
    case 'warn':
      return styles.badgeWarn;
    case 'err':
      return styles.badgeErr;
    case 'info':
      return styles.badgeInfo;
    default:
      return styles.badgeNeutral;
  }
}
