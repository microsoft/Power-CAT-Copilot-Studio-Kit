import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Shared layout styles for page containers and content stacks.
 * Replaces duplicated container styles across screen components.
 */
export const useLayoutStyles = makeStyles({
  /** Standard page container — flex column, standard gap/padding, fills height */
  pageContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    minHeight: '100%',
    boxSizing: 'border-box',
    maxWidth: '1200px',
    marginLeft: 'auto',
    marginRight: 'auto',
    width: '100%',
  },
  /** Centered column for detail views with constrained width */
  detailContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingHorizontalXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    maxWidth: '900px',
    marginLeft: 'auto',
    marginRight: 'auto',
    width: '100%',
  },
  /** Wizard page background — centered, transparent to blend with shell gradient */
  wizardBackground: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: '100%',
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    boxSizing: 'border-box',
  },
  /** Generic flex column stack with medium gap */
  contentStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  /** Page header row — flex row, space-between */
  pageHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
  },
});
