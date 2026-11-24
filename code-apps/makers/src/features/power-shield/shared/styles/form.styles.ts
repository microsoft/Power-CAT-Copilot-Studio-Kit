import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Shared form layout styles.
 * Replaces duplicated form grid and field group styles across dialogs and detail views.
 */
export const useFormStyles = makeStyles({
  /** Two-column form grid */
  formGrid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingVerticalM,
  },
  /** Single-column form stack */
  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  /** Form action row — right-aligned buttons */
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
  },
  /** Dialog footer with right-aligned actions */
  dialogFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalL,
  },
});
