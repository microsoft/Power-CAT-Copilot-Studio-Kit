/** Column sizing and cell styles for the Prompt library grid. */

import { makeStyles, tokens } from '@fluentui/react-components';

export const LIBRARY_COLUMN_SIZING = {
  // Global border-box sizing already includes cell padding in these widths.
  prompt: { minWidth: 200, defaultWidth: 260, padding: 0 },
  type: { minWidth: 96, defaultWidth: 110, padding: 0 },
  insight: { minWidth: 260, defaultWidth: 380, padding: 0 },
  runs: { minWidth: 120, defaultWidth: 140, padding: 0 },
  lastRun: { minWidth: 120, defaultWidth: 150, padding: 0 },
  actions: { minWidth: 110, defaultWidth: 120, padding: 0 },
} as const;
export const LIBRARY_FLEX_COLUMNS = ['insight'] as const;

export const useLibraryCellStyles = makeStyles({
  action: { marginLeft: 'auto', whiteSpace: 'nowrap' },
  promptCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0 },
  initials: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  insight: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  noInsight: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  runs: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: tokens.spacingHorizontalS, width: '100%' },
  runsNum: { fontVariantNumeric: 'tabular-nums', minWidth: '32px', textAlign: 'right' },
  miniTrack: {
    width: '64px',
    height: '4px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground5,
    overflow: 'hidden',
  },
  miniFill: { display: 'block', height: '100%', backgroundColor: tokens.colorBrandBackground },
  headerRight: { width: '100%', textAlign: 'right' },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
});
