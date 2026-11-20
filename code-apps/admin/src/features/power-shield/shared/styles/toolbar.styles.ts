import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Shared toolbar and action bar styles.
 * Replaces duplicated toolbar/header row styles across components.
 */
export const useToolbarStyles = makeStyles({
  /** Standard toolbar — flex row with items centered and gap */
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  /** Toolbar with wrap support for responsive layouts */
  toolbarWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  /** Toolbar with space-between (left/right sections) */
  toolbarSpread: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  /** Button group — compact flex row for grouped actions */
  buttonGroup: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    flexShrink: 0,
  },
  /** Sticky command bar with bottom border */
  commandBar: {
    position: 'sticky' as const,
    top: '0',
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
  },
  /** Right-aligned action group inside commandBar */
  commandBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginLeft: 'auto',
  },
});
