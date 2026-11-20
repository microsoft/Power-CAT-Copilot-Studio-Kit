/**
 * PowerShield Custom Design Tokens
 *
 * Contains ONLY Power-Shield-specific tokens that are NOT available in Fluent UI v9.
 * For standard neutral colors, spacing, typography, shadows, and border radius,
 * use `tokens` from `@fluentui/react-components` directly.
 *
 * Token categories:
 * - semanticColors: Status/state-specific colors (success, warning, error, info)
 * - statusColors: Request-lifecycle badge colors (foreground + background pairs)
 * - layout: Container constraints and dimensions
 * - zIndex: Stacking layers
 */

/**
 * Semantic colors for status states.
 * Used for badges, alerts, and contextual indicators.
 * Only includes values NOT already covered by Fluent UI palette tokens.
 */
export const semanticColors = {
  /** Success — approved, completed, passed */
  success: '#107C10',
  successBackground: '#e8f8f2',

  /** Warning — draft, in-review, pending action */
  warning: '#b45309',
  warningBackground: '#fff8e6',

  /** Error — rejected, policy-failed, auto-rejected */
  error: '#b91c1c',
  errorBackground: '#fdeaea',

  /** Info — submitted, in-progress */
  info: '#1d5fb5',
  infoBackground: '#e8f0fc',

  /** Primary brand color (matches brand 80) */
  primary: '#077FAB',
  primaryHover: '#0D8FBF',
} as const;

/**
 * Request-lifecycle status badge colors.
 * Each status maps to a foreground + background pair for StatusBadge.
 */
export const statusColors = {
  draft:        { fg: '#b45309', bg: '#fff8e6' },
  submitted:    { fg: '#1d5fb5', bg: '#e8f0fc' },
  inReview:     { fg: '#b45309', bg: '#fff8e6' },
  approved:     { fg: '#0f8f5e', bg: '#e8f8f2' },
  inProgress:   { fg: '#1d5fb5', bg: '#e8f0fc' },
  completed:    { fg: '#0f8f5e', bg: '#e8f8f2' },
  policyFailed: { fg: '#b91c1c', bg: '#fdeaea' },
  rejected:     { fg: '#b91c1c', bg: '#fdeaea' },
  withdrawn:    { fg: '#8A8886', bg: '#f0f0f3' },
  autoRejected: { fg: '#b91c1c', bg: '#fdeaea' },
} as const;

/**
 * Layout constraints.
 * Max widths, container dimensions, and content constraints.
 */
export const layout = {
  /** Main content max width */
  contentMaxWidth: '1200px',
  /** Content horizontal padding */
  contentPadding: '32px',
  /** Dialog width */
  dialogWidth: '900px',
  /** Dialog min height */
  dialogMinHeight: '600px',
  /** Wizard max width */
  wizardMaxWidth: '1400px',
  /** Request detail max width */
  detailMaxWidth: '900px',
  /** Nav collapsed width */
  navCollapsedWidth: '60px',
} as const;

/**
 * Content area radial gradient background.
 * Matches the Insights Hub content background.
 */
export const contentGradient =
  'radial-gradient(124.48% 109.39% at 26.98% 6.02%, #FEFFFF 0%, #FAFBFE 37.08%, #F5F9FC 69.66%, #F2F8FA 100%)';

/**
 * Z-index layers.
 * Stacking context for overlays and modals.
 */
export const zIndex = {
  base: 0,
  content: 1,
  overlay: 1000,
  modal: 2000,
  toast: 3000,
  popover: 4000,
} as const;
