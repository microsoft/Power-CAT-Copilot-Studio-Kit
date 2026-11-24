/**
 * Layout constants shared by the app shell and the tab panels.
 *
 * These mirror the approved design: a centred 1728px canvas with a gutter that
 * steps down at each breakpoint, and a sticky translucent header.
 */

/** Breakpoints used across the feature (min-width unless noted). */
export const BREAKPOINTS = {
  /** Below this the command bar fields go full width. */
  sm: 640,
  /** Tablet — scrolling panes stop capping their height. */
  md: 1024,
  /** Conversation & activities switches to three columns. */
  lg: 1080,
  /** Wide desktop — three columns get their roomier track sizes. */
  xl: 1500,
} as const;

export const MEDIA = {
  maxSm: `@media (max-width: ${BREAKPOINTS.sm - 1}px)`,
  maxMd: `@media (max-width: ${BREAKPOINTS.md - 1}px)`,
  minMd: `@media (min-width: ${BREAKPOINTS.md}px)`,
  minLg: `@media (min-width: ${BREAKPOINTS.lg}px)`,
  minXl: `@media (min-width: ${BREAKPOINTS.xl}px)`,
} as const;

/** Max width of the centred app canvas. */
export const APP_MAX_WIDTH = '1728px';

/** Responsive horizontal gutter: 48px desktop down to 12px on phones. */
export const APP_GUTTER = 'clamp(12px, 3vw, 48px)';

/** Sticky header background — translucent over the gradient canvas. */
export const HEADER_SURFACE = 'rgba(250, 251, 254, 0.96)';

/** Height of the timeline tracks and bars. */
export const TIMELINE_TRACK_HEIGHT = 8;

/** A turn slower than this surfaces the "slowest step" banner. */
export const SLOWEST_BANNER_THRESHOLD_MS = 30_000;

/** Steps at or beyond this duration count as slow in Agent insights. */
export const SLOW_STEP_THRESHOLD_MS = 10_000;

/** Workflow canvas dot-grid background used by the execution flow. */
export const WORKFLOW_CANVAS = {
  backgroundColor: '#fbfbfd',
  connector: '#24233a',
  nodeWidth: 360,
  compactNodeWidth: 340,
} as const;
