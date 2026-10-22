import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

import {
  CANVAS_INK,
  CANVAS_SURFACE,
  MEDIA,
  REASON_BORDER,
  REASON_LABEL,
  REASON_SURFACE,
  dottedCanvas,
  mix,
} from '../theme/design-tokens';

const canvasDots = dottedCanvas(tokens.colorNeutralStroke2);

/**
 * Workflow and execution-flow styles translated from the approved prototype.
 * Keys intentionally mirror the `.w-*` design class names.
 */
export const useFlowStyles = makeStyles({
  /** `.w-diag` */
  diag: {
    ...shorthands.padding(tokens.spacingVerticalL),
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalL,
    maxWidth: '860px',
    ...shorthands.margin(0, 'auto'),
    width: '100%',
    boxSizing: 'border-box',
  },

  /** `.w-diagturn` */
  diagTurn: {
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },

  /** `.w-diagturn.on` */
  diagTurnOn: {
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    boxShadow: 'none',
  },

  /** `.w-diagturn > .th` */
  turnHeader: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    flexWrap: 'nowrap',
    ...shorthands.padding('9px', tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },

  /** `.w-diagturn > .th .q` */
  turnQuestion: {
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flexGrow: 1,
  },

  /** `.w-thactions` */
  turnHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    marginLeft: 'auto',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },

  /** `.w-thactions .w-btn` */
  turnActionButton: {
    ...shorthands.padding(0, '8px'),
  },

  /** `.w-chain` */
  chain: {
    '--nodeW': '360px',
    ...shorthands.padding('32px', tokens.spacingHorizontalM, '38px'),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: CANVAS_SURFACE,
    backgroundImage: canvasDots.backgroundImage,
    backgroundSize: canvasDots.backgroundSize,
    boxSizing: 'border-box',
  },

  /** `.w-work .w-chain` narrower embedded variant */
  chainCompact: {
    '--nodeW': '340px',
    ...shorthands.padding(0, tokens.spacingHorizontalS, tokens.spacingVerticalL),
    backgroundColor: 'transparent',
    backgroundImage: 'none',
  },

  /** `.w-conn` */
  connector: {
    width: '1px',
    height: '30px',
    backgroundColor: CANVAS_INK,
    flexShrink: 0,
    position: 'relative',
    alignSelf: 'center',
    '::after': { display: 'none' },
  },

  /** shared `.has-in` port */
  hasIn: {
    '::before': {
      content: '""',
      position: 'absolute',
      left: '50%',
      top: '-4px',
      width: '7px',
      height: '7px',
      marginLeft: '-3.5px',
      borderRadius: tokens.borderRadiusCircular,
      backgroundColor: CANVAS_INK,
      zIndex: 2,
    },
  },

  /** shared `.has-out` port */
  hasOut: {
    '::after': {
      content: '""',
      position: 'absolute',
      left: '50%',
      bottom: '-4px',
      width: '7px',
      height: '7px',
      marginLeft: '-3.5px',
      borderRadius: tokens.borderRadiusCircular,
      backgroundColor: CANVAS_INK,
      zIndex: 2,
    },
  },

  /** `.w-rnode` */
  node: {
    position: 'relative',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    borderRadius: '18px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    ...shorthands.padding('12px', tokens.spacingHorizontalL),
    minHeight: '58px',
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    textAlign: 'left',
    width: 'var(--nodeW)',
    maxWidth: '100%',
    cursor: 'pointer',
    transitionProperty: 'box-shadow, border-color',
    transitionDuration: '.1s',
    transitionTimingFunction: 'ease',
    fontFamily: 'inherit',
    color: 'inherit',
    boxSizing: 'border-box',
    overflow: 'visible',
    ':hover': {
      boxShadow: tokens.shadow8,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },

  /** `.w-rnode:not(button)` */
  nodeStatic: {
    cursor: 'default',
    ':hover': {
      boxShadow: tokens.shadow2,
      backgroundColor: tokens.colorNeutralBackground1,
    },
  },

  /** `.w-rnode[aria-current="true"]` */
  nodeCurrent: {
    borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1,
    boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1}`,
  },

  /** `.w-rnode .glyph` */
  nodeGlyph: {
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'grid',
    placeItems: 'center',
    fontSize: '14px',
    color: 'var(--nodeColor)',
    backgroundColor: mix('var(--nodeColor)', 12),
    flexShrink: 0,
  },

  /** `.w-rnode .lines` */
  nodeLines: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },

  /** `.w-rnode .n1` */
  nodeTitle: {
    fontSize: '13.5px',
    fontWeight: tokens.fontWeightSemibold,
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /** `.w-rnode .n2` */
  nodeSubtitle: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /** `.w-rnode .dur` */
  nodeDuration: {
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },

  /** `.w-reason` */
  reason: {
    position: 'relative',
    width: 'var(--nodeW)',
    maxWidth: '100%',
    ...shorthands.border('1px', 'dashed', REASON_BORDER),
    backgroundColor: REASON_SURFACE,
    ...shorthands.padding('10px', tokens.spacingHorizontalM),
    borderRadius: '18px',
    fontSize: '12px',
    lineHeight: '18px',
    color: tokens.colorNeutralForeground2,
    boxSizing: 'border-box',
  },

  /** `.w-reason b` */
  reasonLabel: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '.03em',
    color: REASON_LABEL,
    marginBottom: '2px',
    fontWeight: tokens.fontWeightBold,
  },

  /** `.md` rendered markdown block */
  markdown: {
    overflowWrap: 'anywhere',
    '& > :first-child': { marginTop: 0 },
    '& > :last-child': { marginBottom: 0 },
    '& h1, & h2, & h3': {
      ...shorthands.margin('8px', 0, '4px'),
      fontWeight: tokens.fontWeightSemibold,
      lineHeight: '1.35',
      color: tokens.colorNeutralForeground1,
    },
    '& h1': { fontSize: '1.12em' },
    '& h2': { fontSize: '1.06em' },
    '& h3': { fontSize: '1em' },
    '& ul, & ol': { ...shorthands.margin('2px', 0, '6px'), paddingLeft: '18px' },
    '& li': { ...shorthands.margin('1px', 0) },
    '& li::marker': { color: tokens.colorNeutralForeground3 },
    '& code': {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: '.92em',
      ...shorthands.padding('1px', '4px'),
      borderRadius: tokens.borderRadiusSmall,
      backgroundColor: tokens.colorNeutralBackground3,
      color: tokens.colorNeutralForeground1,
    },
    '& pre': {
      ...shorthands.margin('4px', 0, '6px'),
      ...shorthands.padding('8px', tokens.spacingHorizontalS),
      overflowX: 'auto',
      borderRadius: tokens.borderRadiusMedium,
      backgroundColor: tokens.colorNeutralBackground3,
    },
    '& pre code': { ...shorthands.padding(0), backgroundColor: 'transparent', whiteSpace: 'pre' },
    '& blockquote': {
      ...shorthands.margin('4px', 0, '6px'),
      paddingLeft: '8px',
      borderLeft: `2px solid ${tokens.colorNeutralStroke2}`,
      color: tokens.colorNeutralForeground3,
    },
    '& hr': {
      ...shorthands.margin('8px', 0),
      ...shorthands.border(0),
      borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    '& a': { color: tokens.colorBrandForegroundLink },
    '& strong': { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
    '& table': { borderCollapse: 'collapse', ...shorthands.margin('4px', 0, '6px'), fontSize: '.95em', width: '100%' },
    '& th, & td': { ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2), ...shorthands.padding('3px', '7px'), textAlign: 'left' },
    '& th': { backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold },
  },

  /** `.w-agentgrp` */
  agentGroup: {
    '--agent': '#2AA0A4',
    position: 'relative',
    ...shorthands.border('2px', 'dashed', mix('var(--agent)', 42, tokens.colorNeutralStroke2)),
    borderRadius: '20px',
    backgroundColor: mix('var(--agent)', 4, tokens.colorNeutralBackground1),
    width: 'calc(var(--nodeW) + 56px)',
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    boxSizing: 'border-box',
  },

  /** `.w-agentgrp.failed` */
  agentGroupFailed: {
    borderTopColor: tokens.colorPaletteRedBackground2, borderRightColor: tokens.colorPaletteRedBackground2, borderBottomColor: tokens.colorPaletteRedBackground2, borderLeftColor: tokens.colorPaletteRedBackground2,
  },

  /** `.w-agentgrp > .ghead` */
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    width: '100%',
    ...shorthands.padding('12px', tokens.spacingHorizontalL),
    minHeight: '58px',
    textAlign: 'left',
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border(0),
    borderBottom: `1px dashed ${mix('var(--agent)', 30, tokens.colorNeutralStroke2)}`,
    borderRadius: '18px 18px 0 0',
    fontFamily: 'inherit',
    color: 'inherit',
    boxSizing: 'border-box',
    ':hover': { backgroundColor: mix('var(--agent)', 8, 'transparent') },
  },

  /** `.w-agentgrp > .ghead:not(button)` */
  groupHeadStatic: {
    cursor: 'default',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
  },

  /** `.w-agentgrp > .ghead[aria-current="true"]` */
  groupHeadCurrent: {
    backgroundColor: mix('var(--agent)', 12, 'transparent'),
  },

  /** `.w-agentgrp > .ghead .glyph` */
  groupGlyph: {
    width: '26px',
    height: '26px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'grid',
    placeItems: 'center',
    color: 'var(--agent)',
    backgroundColor: mix('var(--agent)', 12),
    flexShrink: 0,
  },

  /** `.w-agentgrp > .ghead .lines` */
  groupLines: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },

  /** `.w-agentgrp > .ghead .n1` */
  groupTitle: {
    fontSize: '13.5px',
    fontWeight: tokens.fontWeightBold,
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /** `.w-agentgrp > .ghead .n2` */
  groupSubtitle: {
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '.02em',
    textTransform: 'uppercase',
    color: mix('var(--agent)', 78, tokens.colorNeutralForeground3),
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /** `.w-agentgrp > .ghead .dur` */
  groupDuration: {
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },

  /** `.w-agentgrp > .gbody` */
  groupBody: {
    ...shorthands.padding('28px', tokens.spacingHorizontalM),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: 0,
    backgroundImage: canvasDots.backgroundImage,
    backgroundSize: canvasDots.backgroundSize,
  },

  /** `.w-agentgrp .empty` */
  groupEmpty: {
    fontSize: '12px',
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    ...shorthands.padding('2px', 0),
  },

  /** `.w-turnlink` */
  turnLink: {
    alignSelf: 'center',
    width: '28px',
    height: '42px',
    position: 'relative',
    flexShrink: 0,
    overflow: 'visible',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground2,
    '::before': { content: 'none' },
  },

  /** `.w-turnlink .w-ic` */
  turnLinkIcon: {
    position: 'relative',
    display: 'block',
    width: '24px',
    height: '24px',
    fontSize: '24px',
    overflow: 'visible',
    backgroundColor: 'transparent',
    color: CANVAS_INK,
    transform: 'scaleY(1.45)',
  },

  /** `.w-fstats` */
  flowStats: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalXL,
    rowGap: tokens.spacingVerticalS,
    flexWrap: 'wrap',
  },

  /** `.w-fstat` */
  flowStat: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '1px',
  },

  /** `.w-fstat .l` */
  flowStatLabel: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },

  /** `.w-fstat .v` */
  flowStatValue: {
    fontSize: '16px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '20px',
    fontVariantNumeric: 'tabular-nums',
  },

  /** Failed `.w-fstat .v` */
  flowStatDanger: {
    color: tokens.colorPaletteRedForeground1,
  },

  /** `.w-flow` simple vertical variant */
  flow: {
    position: 'relative',
    paddingLeft: '30px',
    '::before': {
      content: '""',
      position: 'absolute',
      left: '13px',
      top: '12px',
      bottom: '12px',
      width: '2px',
      backgroundColor: tokens.colorNeutralStroke2,
    },
    [MEDIA.maxSm]: {
      paddingLeft: '24px',
    },
  },

  /** `.w-node` simple vertical variant */
  flowNode: {
    position: 'relative',
    marginBottom: '10px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.padding('10px', tokens.spacingHorizontalM),
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
    ':hover': { boxShadow: tokens.shadow4 },
    '::before': {
      content: '""',
      position: 'absolute',
      left: '-24px',
      top: '16px',
      width: '12px',
      height: '12px',
      borderRadius: tokens.borderRadiusCircular,
      backgroundColor: tokens.colorNeutralBackground1,
      ...shorthands.border('2.5px', 'solid', tokens.colorNeutralStroke1),
    },
  },

  /** `.w-flowturn` simple vertical variant */
  flowTurn: {
    marginBottom: tokens.spacingVerticalXL,
  },
});
