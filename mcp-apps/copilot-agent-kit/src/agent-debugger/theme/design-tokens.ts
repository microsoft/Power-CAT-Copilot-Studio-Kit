/**
 * Design tokens for the Agent Debugger workspace.
 *
 * The approved prototype (design/assets/workspace.css) was authored so that
 * every value maps 1:1 onto a Fluent UI v9 token. This module holds the small
 * set of values that are *not* expressible as `tokens.*` — bespoke canvas
 * colours, the app background gradient, gutters and breakpoints — so that no
 * component has to hardcode them.
 *
 * Anything that does have a Fluent token (colours, radii, shadows, spacing)
 * must be consumed via `tokens.*` from @fluentui/react-components directly.
 */

/** Ink used for workflow-canvas connectors, ports and turn links. */
export const CANVAS_INK = '#24233a';

/** Dotted workflow-canvas backdrop fill (`.w-chain`). */
export const CANVAS_SURFACE = '#fbfbfd';

/** Model-reasoning callout (`.w-reason`). */
export const REASON_BORDER = '#E3008C';
export const REASON_SURFACE = '#fff4fa';
export const REASON_LABEL = '#9c0062';

/**
 * Breakpoints, expressed as ready-to-use media query strings so makeStyles
 * blocks stay declarative and consistent across every component.
 */
export const MEDIA = {
  /** <= 479px — narrowest phones. */
  maxXs: '@media (max-width: 479px)',
  /** <= 639px — phones. */
  maxSm: '@media (max-width: 639px)',
  /** <= 1023px — tablets and below. */
  maxMd: '@media (max-width: 1023px)',
  /** <= 1365px — small laptops and below. */
  maxLg: '@media (max-width: 1365px)',
  /** >= 1024px — the two-column split. */
  minMd: '@media (min-width: 1024px)',
  /** >= 1080px — the Activities three-column grid. */
  minTri: '@media (min-width: 1080px)',
  /** >= 1500px — the roomy Activities three-column grid. */
  minXl: '@media (min-width: 1500px)',
  /** Honour reduced-motion preferences. */
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
} as const;

/** Workflow canvas node width (`--nodeW`), full width and inside Activities. */
export const NODE_WIDTH = {
  default: '360px',
  compact: '340px',
} as const;

/** Monospace stack used for schema names, IDs and JSON. */
export const FONT_MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';

/** Dotted-grid backdrop used by the workflow canvas and agent groups. */
export function dottedCanvas(stroke: string): {
  backgroundImage: string;
  backgroundSize: string;
} {
  return {
    backgroundImage: `radial-gradient(circle, ${stroke} 1px, transparent 1px)`,
    backgroundSize: '18px 18px',
  };
}

/** `color-mix` helper so tint ratios stay consistent with the prototype. */
export function mix(color: string, percent: number, into = 'white'): string {
  return `color-mix(in srgb, ${color} ${percent}%, ${into})`;
}
