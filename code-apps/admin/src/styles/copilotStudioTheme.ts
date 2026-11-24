/**
 * Copilot Studio Custom Theme
 *
 * Defines the complete design system for Agent Review Tool including:
 * - 16-step brand color ramp (gradient: #0f6cbd → #8661c5 → #8764b8)
 * - Semantic colors for success, warning, error states
 * - Spacing tokens (4px to 24px scale)
 * - Typography tokens (11px to 24px sizes, 400/600 weights)
 * - Border radius and shadow tokens
 *
 * Based on ui-specification.md Section 5 (Styling System)
 */

import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

/**
 * Copilot Studio 16-step brand color ramp
 *
 * Gradient progression from blue (#077FAB) through teal to purple tones
 * for a modern, AI-focused aesthetic matching Copilot Studio identity.
 */
export const copilotStudioBrand: BrandVariants = {
  10: '#03151F', // Darkest - deep navy
  20: '#041F2D',
  30: '#052A3C',
  40: '#06344A',
  50: '#073E59',
  60: '#074868',
  70: '#075279',
  80: '#077FAB', // Primary - Copilot Studio blue
  90: '#0D8FBF', // Hover state
  100: '#2B9FCC',
  110: '#4FAFD7',
  120: '#6FBFE2',
  130: '#8DCEEC',
  140: '#AADDF5',
  150: '#C5EBFC',
  160: '#E0F6FF', // Lightest - almost white
};

/**
 * Light theme for Agent Review Tool
 *
 * Primary theme used throughout the application.
 */
export const copilotStudioLightTheme: Theme = createLightTheme(copilotStudioBrand);

/**
 * Dark theme for Agent Review Tool
 *
 * Optional dark mode (not currently used, but available for future).
 */
export const copilotStudioDarkTheme: Theme = createDarkTheme(copilotStudioBrand);

/**
 * Custom semantic colors
 *
 * These augment Fluent UI's default semantic colors with application-specific values.
 */
export const semanticColors = {
  /** Success color for positive states (score >= 80, passed criteria) */
  success: '#107C10',

  /** Warning color for caution states (score 60-79, medium severity) */
  warning: '#D83B01',

  /** Error color for negative states (score < 60, high severity, failed criteria) */
  error: '#A80000',

  /** Info color for informational messages */
  info: '#0078D4',

  /** Primary brand color (matches brand 80) */
  primary: '#077FAB',

  /** Hover state for primary actions (matches brand 90) */
  primaryHover: '#0D8FBF',

  /** Neutral text colors */
  neutralForeground1: '#323130', // Primary text
  neutralForeground2: '#605E5C', // Secondary text
  neutralForeground3: '#8A8886', // Tertiary text (disabled, hints)

  /** Neutral background colors */
  neutralBackground1: '#FFFFFF', // White background
  neutralBackground2: '#F3F2F1', // Light gray background
  neutralBackground3: '#EDEBE9', // Lighter gray background

  /** Border colors */
  border: '#E0E0E0',
  borderLight: '#edebe9',
  borderDark: '#e1e4e6',
  borderFocus: '#0078D4',
} as const;

/**
 * Score-based color mapping
 *
 * Used for RadialGauge, StatCard accents, and score displays.
 */
export const scoreColors = {
  /** Excellent: score >= 80 */
  excellent: '#107C10', // Green

  /** Good: score 60-79 */
  good: '#D83B01', // Orange

  /** Poor: score < 60 */
  poor: '#A80000', // Red
} as const;

/**
 * Severity-based color mapping
 *
 * Used for Badge components showing severity levels.
 */
export const severityColors = {
  high: '#A80000', // Red (danger)
  medium: '#D83B01', // Orange (warning)
  low: '#0078D4', // Blue (informative)
} as const;

/**
 * Spacing scale (4px base unit)
 *
 * Consistent spacing tokens for margins, padding, and gaps.
 */
export const spacing = {
  /** 4px - Extra small gap (toolbar buttons, badge spacing) */
  xs: '4px',

  /** 8px - Small gap (card content, icon + text) */
  sm: '8px',

  /** 12px - Medium gap (button groups, within-component spacing) */
  md: '12px',

  /** 16px - Large gap (section gaps, margins, card padding) */
  lg: '16px',

  /** 20px - Extra large gap (header spacing) */
  xl: '20px',

  /** 24px - XXL gap (major sections, dialog padding, section separation) */
  xxl: '24px',

  /** 32px - XXXL gap (rare, only for very large separations) */
  xxxl: '32px',
} as const;

/**
 * Typography scale
 *
 * Font sizes, weights, and line heights for text hierarchy.
 */
export const typography = {
  /** Font sizes */
  fontSize: {
    /** 11px - Extra small (code snippets, minimal captions) */
    xs: '11px',

    /** 12px - Small (labels, captions, badges) */
    sm: '12px',

    /** 14px - Body (default text, descriptions) */
    md: '14px',

    /** 16px - Emphasis (important text) */
    lg: '16px',

    /** 18px - Section heading (Quick Stats, Overall Score) */
    xl: '18px',

    /** 24px - Title (App header, page title) */
    xxl: '24px',
  },

  /** Font weights */
  fontWeight: {
    /** 400 - Regular (body text, descriptions) */
    regular: 400,

    /** 600 - Bold (headings, values, emphasis) */
    bold: 600,
  },

  /** Line heights */
  lineHeight: {
    /** 1.2 - Compact (gauge values, dense text) */
    compact: 1.2,

    /** 1.4 - Normal (default text) */
    normal: 1.4,

    /** 1.6 - Relaxed (body text, readability) */
    relaxed: 1.6,
  },
} as const;

/**
 * Border radius tokens
 *
 * Consistent corner rounding for cards, dialogs, and other containers.
 */
export const borderRadius = {
  /** 2px - Small radius (colored bars, small badges) */
  sm: '2px',

  /** 4px - Medium radius (badges, images, buttons) */
  md: '4px',

  /** 6px - Large radius (cards) */
  lg: '6px',

  /** 8px - Extra large radius (dialogs, major containers) */
  xl: '8px',

  /** 12px - XXL radius (rare, only for very rounded corners) */
  xxl: '12px',
} as const;

/**
 * Shadow tokens
 *
 * Elevation system for cards, dialogs, and floating elements.
 */
export const shadows = {
  /** No shadow */
  none: 'none',

  /** Small shadow for subtle elevation (cards) */
  sm: '0 1px 2px rgba(0, 0, 0, 0.08)',

  /** Medium shadow for moderate elevation (dialogs) */
  md: '0 2px 4px rgba(0, 0, 0, 0.12)',

  /** Large shadow for high elevation (modals, overlays) */
  lg: '0 4px 8px rgba(0, 0, 0, 0.16)',

  /** Extra large shadow for maximum elevation (popovers) */
  xl: '0 8px 16px rgba(0, 0, 0, 0.20)',
} as const;

/**
 * Gradient shimmer colors
 *
 * Used for GradientBorderWrapper animated border.
 */
export const gradientColors = {
  primary: '#077FAB', // Primary Blue
  purple: '#B25ABF', // Purple
  orange: '#F59F57', // Orange
  pink: '#DD598F', // Pink
  magenta: '#C647B9', // Magenta
  white: '#FFFFFF', // White
} as const;

/**
 * Gradient linear definition
 *
 * Complete gradient string for shimmer animation.
 */
export const gradientShimmer = `linear-gradient(to right, ${gradientColors.white}, ${gradientColors.primary}, ${gradientColors.purple}, ${gradientColors.orange}, ${gradientColors.pink}, ${gradientColors.magenta}, ${gradientColors.primary}, ${gradientColors.white}, ${gradientColors.purple}, ${gradientColors.orange}, ${gradientColors.pink}, ${gradientColors.magenta}, ${gradientColors.white})`;

/**
 * Layout constraints
 *
 * Max widths and container dimensions.
 */
export const layout = {
  /** App container max width: 1000px */
  appMaxWidth: '1000px',

  /** Dialog normal width: 900px */
  dialogWidth: '900px',

  /** Dialog min height: 600px */
  dialogMinHeight: '600px',

  /** StatCard height: 80px */
  statCardHeight: '80px',

  /** StatCard icon size: 40px */
  statCardIconSize: '40px',

  /** RadialGauge diameter: 180px */
  gaugeSize: '180px',

  /** DataGrid row height: 60px */
  gridRowHeight: '60px',
} as const;

/**
 * Animation durations
 *
 * Consistent timing for transitions and animations.
 */
export const animations = {
  /** Fast: 150ms (hover states) */
  fast: '150ms',

  /** Normal: 300ms (most transitions) */
  normal: '300ms',

  /** Slow: 500ms (complex animations) */
  slow: '500ms',

  /** Shimmer: 8s (gradient border animation) */
  shimmer: '8s',
} as const;

/**
 * Z-index layers
 *
 * Stacking context for overlays and modals.
 */
export const zIndex = {
  /** Base layer */
  base: 0,

  /** Content layer */
  content: 1,

  /** Overlay layer (dialogs) */
  overlay: 1000,

  /** Modal layer (above overlays) */
  modal: 2000,

  /** Toast layer (above modals) */
  toast: 3000,

  /** Popover layer (above toasts) */
  popover: 4000,
} as const;

/**
 * Complete theme export
 *
 * Combines Fluent UI theme with custom tokens.
 */
export const copilotStudioTheme = {
  // Fluent UI base theme
  ...copilotStudioLightTheme,

  // Custom tokens
  semanticColors,
  scoreColors,
  severityColors,
  spacing,
  typography,
  borderRadius,
  shadows,
  gradientColors,
  gradientShimmer,
  layout,
  animations,
  zIndex,
} as const;

/**
 * TypeScript type for the complete theme
 */
export type CopilotStudioTheme = typeof copilotStudioTheme;
