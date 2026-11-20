import { makeStyles, tokens } from '@fluentui/react-components';

/**
 * Layout styles for AppShell (Application Layout)
 *
 * The document is the scrolling element, not an inner container. Keeping the
 * content panel scrollable creates a second scrollbar inside the Power Apps
 * host. The nav stays visible with sticky positioning instead.
 */
export const useLayoutStyles = makeStyles({
  root: {
    display: 'flex',
    minHeight: '100vh',
    width: '100%',
    alignItems: 'flex-start',
  },
  nav: {
    position: 'sticky',
    top: 0,
    height: '100vh',
    flexShrink: 0,
    display: 'flex',
    '> *': { height: '100%' },
  },
});

/**
 * Content area styles
 * Main content container with radial gradient background
 */
export const useContentStyles = makeStyles({
  root: {
    flex: 1,
    minWidth: 0,
    minHeight: '100vh',
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
