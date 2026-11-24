import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Layout styles for AppShell (Application Layout)
 * Defines the root container layout with sidebar and content area
 */
export const useLayoutStyles = makeStyles({
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
});

/**
 * Content area styles
 * Main content container with radial gradient background
 */
export const useContentStyles = makeStyles({
  root: {
    flex: 1,
    height: '100%',
    overflow: 'auto',
    background:
      'radial-gradient(124.48% 109.39% at 26.98% 6.02%, #FEFFFF 0%, #FAFBFE 37.08%, #F5F9FC 69.66%, #F2F8FA 100%)',
  },
});

/**
 * Suspense loading fallback styles
 */
export const useSuspenseFallbackStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});

/**
 * Header placeholder styles
 * Container for Copilot Agent Kit logo (44px height)
 */
export const useHeaderPlaceholderStyles = makeStyles({
  placeholder: {
    height: '44px',
    backgroundColor: tokens.colorNeutralBackground4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `0 ${tokens.spacingHorizontalS}`,
  },
});
