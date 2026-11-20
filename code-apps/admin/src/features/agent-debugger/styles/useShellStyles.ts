import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

import {
  APP_BACKGROUND,
  CONTENT_MAX_WIDTH,
  FONT_MONO,
  GUTTER,
  HEADER_BACKGROUND,
  MEDIA,
} from '../theme/design-tokens';

/**
 * App shell chrome: canvas, gutters, sticky header, command bar, pickers,
 * filter tags, metric rail and the tab strip.
 *
 * Mirrors the `.w-shell` / `.w-app` / `.w-hdr` / `.w-cmd` / `.w-tabs` /
 * `.w-panel` / `.w-metrics` / `.w-combo` / `.w-tag` blocks of the approved
 * prototype (design/assets/workspace.css).
 */
export const useShellStyles = makeStyles({
  /** `.w-shell` — full-bleed radial canvas. */
  shell: {
    minHeight: '100vh',
    backgroundImage: APP_BACKGROUND,
  },

  /**
   * `.w-app` — Power Apps hosts render inside a full-bleed iframe, so the app
   * supplies its own gutters and caps the content measure.
   */
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: CONTENT_MAX_WIDTH,
    ...shorthands.margin(0, 'auto'),
    backgroundColor: 'transparent',
    ...shorthands.padding(0, GUTTER.base),
    boxSizing: 'border-box',
    width: '100%',
    [MEDIA.maxLg]: { ...shorthands.padding(0, GUTTER.lg) },
    [MEDIA.maxMd]: { ...shorthands.padding(0, GUTTER.md) },
    [MEDIA.maxSm]: { ...shorthands.padding(0, GUTTER.sm) },
  },

  /** `.w-hdr` — translucent sticky header, no bottom rule. */
  header: {
    backgroundColor: HEADER_BACKGROUND,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    ...shorthands.padding('14px', 0, 0),
    position: 'sticky',
    top: 0,
    zIndex: 40,
  },

  /** `.w-hdr-top` */
  headerTop: {
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    flexWrap: 'wrap',
  },

  /** `.w-hdr-txt` — no app icon precedes the title, by design review. */
  headerText: {
    flexGrow: 1,
    minWidth: '200px',
  },
  headerTitle: {
    ...shorthands.margin(0),
    fontSize: '20px',
    lineHeight: '26px',
    fontWeight: tokens.fontWeightSemibold,
  },
  headerSubtitle: {
    ...shorthands.margin('2px', 0, 0),
    color: tokens.colorNeutralForeground3,
    fontSize: '12.5px',
    lineHeight: '17px',
    [MEDIA.maxSm]: { display: 'none' },
  },

  /** `.w-iconbtn` */
  iconButton: {
    ...shorthands.border('1px', 'solid', 'transparent'),
    backgroundColor: 'transparent',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
  },

  /** `.w-cmd` */
  commandBar: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalM,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    ...shorthands.padding(tokens.spacingVerticalL, 0, tokens.spacingVerticalM),
  },

  /** `.w-cmdrow` */
  commandRow: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalM,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    width: '100%',
    [MEDIA.maxSm]: { gap: tokens.spacingHorizontalS },
  },

  /** `.w-field` */
  field: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '3px',
    minWidth: 0,
    [MEDIA.maxSm]: { flexGrow: 1, flexBasis: '100%' },
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    minHeight: '18px',
  },

  /**
   * `.w-cmdfield` — Conversation and Session share one sizing rule so the
   * three fields line up and grow evenly.
   */
  commandField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '240px',
    minWidth: '210px',
    maxWidth: '340px',
  },

  /** `.w-grow` — the agent picker is the widest field. */
  grow: {
    flexGrow: 1.35,
    flexShrink: 1,
    flexBasis: '300px',
    minWidth: '260px',
    maxWidth: '440px',
    [MEDIA.maxSm]: { maxWidth: 'none', flexBasis: '100%' },
  },

  /** `.w-actions` */
  actions: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-end',
    height: '32px',
    marginLeft: 'auto',
    [MEDIA.maxSm]: { width: '100%', marginLeft: 0 },
  },

  /** `.w-tags` — the applied-filter tag row. */
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    width: '100%',
    marginTop: tokens.spacingVerticalS,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.padding('3px', '3px', '3px', '9px'),
    maxWidth: '100%',
  },
  tagIcon: {
    fontSize: '13px',
    lineHeight: 1,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
  },
  tagText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    lineHeight: '14px',
  },
  tagPrimary: {
    fontSize: '12.5px',
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tagSecondary: {
    fontSize: '10.5px',
    color: tokens.colorNeutralForeground3,
  },
  tagDismiss: {
    ...shorthands.border(0),
    backgroundColor: 'transparent',
    width: '22px',
    minWidth: '22px',
    maxWidth: '22px',
    height: '22px',
    ...shorthands.padding(0),
    borderRadius: tokens.borderRadiusSmall,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    fontSize: '11px',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground4,
      color: tokens.colorNeutralForeground1,
    },
  },

  /** `.w-tabs` */
  tabs: {
    display: 'flex',
    columnGap: '2px',
    backgroundColor: 'transparent',
    ...shorthands.padding(0),
    overflowX: 'auto',
    position: 'static',
    [MEDIA.maxSm]: { ...shorthands.padding(0) },
  },
  /** `.w-tab` — single tab button in the strip. */
  tab: {
    ...shorthands.border(0),
    backgroundColor: 'transparent',
    ...shorthands.padding('11px', '14px', '9px'),
    fontSize: '14px',
    fontFamily: 'inherit',
    fontWeight: tokens.fontWeightMedium,
    color: tokens.colorNeutralForeground2,
    borderBottom: '2px solid transparent',
    display: 'flex',
    alignItems: 'center',
    columnGap: '7px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    [MEDIA.maxSm]: {
      ...shorthands.padding('10px', '12px', '8px'),
      fontSize: '13px',
    },
  },
  tabSelected: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    borderBottomColor: tokens.colorBrandBackground,
  },

  /** `.w-count` — the badge carried by a tab. */
  count: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground2,
    borderRadius: tokens.borderRadiusCircular,
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    ...shorthands.padding('1px', '7px'),
    minWidth: '20px',
    textAlign: 'center',
  },
  countSelected: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  countDanger: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
  },

  /** `.w-panel` */
  panel: {
    ...shorthands.padding(tokens.spacingVerticalL, 0, '48px'),
    width: '100%',
    minWidth: 0,
  },

  /** `.w-metrics` */
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))',
    backgroundColor: tokens.colorNeutralBackground1,
    [MEDIA.maxSm]: { gridTemplateColumns: 'repeat(2, 1fr)' },
  },
  metric: {
    ...shorthands.padding('9px', tokens.spacingHorizontalL),
    minWidth: 0,
  },
  metricKey: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
  },
  metricValue: {
    fontSize: '15px',
    fontWeight: tokens.fontWeightSemibold,
    marginTop: '1px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  /** `.w-combo` — the agent / conversation / session pickers. */
  combo: { position: 'relative' },
  comboInput: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    height: '32px',
    ...shorthands.padding(0, '6px', 0, '8px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    borderBottomColor: tokens.colorNeutralStrokeAccessible,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    ':focus-within': {
      borderTopColor: tokens.colorBrandBackground, borderRightColor: tokens.colorBrandBackground, borderBottomColor: tokens.colorBrandBackground, borderLeftColor: tokens.colorBrandBackground,
      boxShadow: `0 0 0 1px ${tokens.colorBrandBackground}`,
    },
  },
  comboAvatar: {
    width: '22px',
    height: '22px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    display: 'grid',
    placeItems: 'center',
    fontSize: '12px',
    flexShrink: 0,
  },
  comboLines: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  /** `.w-combo-input .lines.one` — single-line variant with a trailing date. */
  comboLinesOne: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: '8px',
    minHeight: '22px',
  },
  comboLine1: {
    fontSize: '13.5px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  comboLine2: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  comboMono: {
    fontFamily: FONT_MONO,
    fontSize: '12.5px',
  },
  comboDate: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  comboChevron: {
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    ...shorthands.padding(0, '2px'),
    display: 'flex',
    alignItems: 'center',
  },

  /** `.w-pop` — the picker listbox. */
  popover: {
    position: 'absolute',
    zIndex: 60,
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
    maxHeight: '340px',
    overflow: 'auto',
    ...shorthands.padding('4px'),
  },
  optionGroup: {
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '.03em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    ...shorthands.padding('8px', '10px', '4px'),
  },
  option: {
    display: 'flex',
    columnGap: '9px',
    alignItems: 'center',
    width: '100%',
    ...shorthands.border(0),
    backgroundColor: 'transparent',
    textAlign: 'left',
    ...shorthands.padding('7px', '10px'),
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    fontFamily: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  optionSelected: { backgroundColor: tokens.colorBrandBackground2 },
  optionAvatar: {
    width: '26px',
    height: '26px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground4,
    display: 'grid',
    placeItems: 'center',
    fontSize: '13px',
    flexShrink: 0,
  },
  empty: {
    ...shorthands.padding('14px'),
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },

  /** `.w-inlinemsg` — hint shown under a picker. */
  inlineMessage: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    ...shorthands.margin('4px', 0, 0),
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },

  /** `.w-loadnote` — partial-load warning inside the conversation picker. */
  loadNote: {
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: '8px',
    ...shorthands.margin('4px'),
    ...shorthands.padding('9px', '10px'),
    ...shorthands.border('1px', 'solid', tokens.colorPaletteDarkOrangeBorder1),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorNeutralForeground2,
    fontSize: '12px',
    lineHeight: '17px',
  },

  /** `.w-switch` — the "error conversations only" flag. */
  switchLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '8px',
    height: '32px',
    fontSize: '13.5px',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  /** `.w-hint` — small helper text under a field. */
  hint: {
    ...shorthands.margin(0),
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },

  /** `.w-hdr-icon` — rounded brand tile used by panel headers. */
  headerIcon: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    display: 'grid',
    placeItems: 'center',
    fontSize: '17px',
    flexShrink: 0,
  },

  /** `.w-chips` — wrapping row of filter chips. */
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '6px',
    rowGap: '6px',
    marginTop: '6px',
  },

  /** `.w-chip` — single toggleable filter chip. */
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    ...shorthands.padding('4px', '10px'),
    fontSize: '12.5px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusCircular,
    cursor: 'pointer',
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
    '&[aria-checked="true"]': {
      backgroundColor: tokens.colorBrandBackground2,
      borderTopColor: tokens.colorBrandBackground,
      borderRightColor: tokens.colorBrandBackground,
      borderBottomColor: tokens.colorBrandBackground,
      borderLeftColor: tokens.colorBrandBackground,
      color: tokens.colorBrandForeground1,
      fontWeight: tokens.fontWeightMedium,
    },
  },

  /** `.w-daterow` — date + time inputs side by side in the custom range. */
  dateRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 110px',
    gap: tokens.spacingHorizontalS,
    [MEDIA.maxXs]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },

  /** `.w-fgrid` — two-column filter layout inside the filter drawer. */
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    [MEDIA.maxSm]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },

  /** `.w-fgroup` — one labelled group of filter controls. */
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    '& h3': {
      ...shorthands.margin(0),
      fontSize: '13px',
      fontWeight: tokens.fontWeightSemibold,
      color: tokens.colorNeutralForeground1,
    },
    ':last-child:nth-child(odd)': { gridColumn: '1 / -1' },
  },
});
