/**
 * PowerShield Custom Design Tokens
 *
 * Power-Shield-specific tokens only. Standard spacing, typography,
 * borderRadius, shadows, and animations come from Fluent UI v9
 * `tokens` import (`@fluentui/react-components`).
 *
 * Token categories:
 * - semanticColors: Status/state-specific colors (success, warning, error, info, primary)
 * - statusColors: Request-lifecycle badge colors (foreground + background pairs)
 * - layout: Container constraints and dimensions
 * - contentGradient: Content area radial gradient background
 * - zIndex: Stacking layers
 */

/**
 * Semantic colors for status states.
 * Used for badges, alerts, and contextual indicators.
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
  approved:     { fg: '#0a5c3c', bg: '#e8f8f2' },
  inProgress:   { fg: '#1d5fb5', bg: '#e8f0fc' },
  completed:    { fg: '#0a5c3c', bg: '#e8f8f2' },
  policyFailed: { fg: '#b91c1c', bg: '#fdeaea' },
  rejected:     { fg: '#b91c1c', bg: '#fdeaea' },
  withdrawn:    { fg: '#5f5e5c', bg: '#f0f0f3' },
  autoRejected: { fg: '#b91c1c', bg: '#fdeaea' },
} as const;

/**
 * Layout constraints.
 * Max widths, container dimensions, and content constraints.
 */
export const layout = {
  contentMaxWidth: '1200px',
  contentPadding: '32px',
  dialogWidth: '900px',
  dialogMinHeight: '600px',
  wizardMaxWidth: '1400px',
  detailMaxWidth: '900px',
  navCollapsedWidth: '60px',
} as const;

/**
 * Content area radial gradient background.
 */
export const contentGradient =
  'radial-gradient(124.48% 109.39% at 26.98% 6.02%, #FEFFFF 0%, #FAFBFE 37.08%, #F5F9FC 69.66%, #F2F8FA 100%)';

/**
 * Z-index layers.
 */
export const zIndex = {
  base: 0,
  content: 1,
  overlay: 1000,
  modal: 2000,
  toast: 3000,
  popover: 4000,
} as const;
