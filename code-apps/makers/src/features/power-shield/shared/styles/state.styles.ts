import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Shared empty, loading, and error state styles.
 * Replaces duplicated centered state wrappers across components.
 */
export const useStateStyles = makeStyles({
  /** Centered empty state — flex column, centered, with padding */
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalXXXL,
    paddingBottom: tokens.spacingVerticalXXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  /** Centered loading spinner wrapper */
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    paddingTop: tokens.spacingVerticalXXXL,
    paddingBottom: tokens.spacingVerticalXXXL,
  },
  /** Full-page centered loading state */
  loadingPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
    gap: tokens.spacingVerticalM,
  },
});
