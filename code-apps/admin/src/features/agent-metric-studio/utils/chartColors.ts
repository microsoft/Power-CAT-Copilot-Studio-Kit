import { tokens } from '@fluentui/react-components';

/**
 * Centralized chart color utility that derives colors from Fluent UI tokens
 * and tenant branding. All chart components should use these functions
 * instead of hardcoded hex values.
 *
 * NOTE: Fluent tokens resolve to CSS custom-property references (e.g.
 * "var(--colorBrandBackground)"). Chart.js renders on a <canvas> which
 * cannot interpret CSS variables. We must resolve tokens to actual color
 * strings via getComputedStyle before passing them to Chart.js datasets.
 */

/**
 * Official Fluent 2 Data Visualization palette (10 colors).
 * Source: fluent2.microsoft.design data-viz specs.
 * These hex constants are acceptable per BIC guidelines — they are the
 * canonical data-viz palette, not arbitrary component colors.
 */
const FLUENT_DATAVIZ_PALETTE = [
  '#637CEF', // Cornflower Blue (Brand)
  '#E3008C', // Magenta / Hot Pink
  '#2AA0A4', // Teal
  '#9373C0', // Medium Purple
  '#13A10E', // Green
  '#3A96DD', // Light Blue
  '#CA5010', // Orange
  '#57811B', // Olive Green
  '#B146C2', // Violet
  '#AE8C00', // Gold
];

// Fallback primary from the palette
const FALLBACK_PRIMARY = FLUENT_DATAVIZ_PALETTE[0];
const FALLBACK_ACCENT = FLUENT_DATAVIZ_PALETTE[6];

/** Resolve a Fluent token (CSS var reference) to its computed color value */
function resolveToken(token: string): string | null {
  if (!token.startsWith('var(')) return token;
  const varName = token.slice(4, -1); // strip "var(" and ")"
  const root = document.documentElement;
  const resolved = getComputedStyle(root).getPropertyValue(varName).trim();
  return resolved || null;
}

/** Convert hex color to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  // Guard against non-hex input (e.g. unresolved CSS var)
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Get the primary brand color as a resolved hex string */
export function getPrimaryColor(tenantColor?: string): string {
  if (tenantColor) return tenantColor;
  return resolveToken(tokens.colorBrandBackground) || FALLBACK_PRIMARY;
}

/** Get the accent color as a resolved hex string */
export function getAccentColor(tenantAccent?: string): string {
  if (tenantAccent) return tenantAccent;
  return resolveToken(tokens.colorPaletteMarigoldBackground3) || FALLBACK_ACCENT;
}

/**
 * Categorical palette for charts (Donut, Bar, etc.).
 * Returns the official 10-color Fluent data-viz palette.
 * If a tenant primary color is provided, it replaces the first slot.
 */
export function getCategoricalPalette(tenantPrimary?: string): string[] {
  const palette = [...FLUENT_DATAVIZ_PALETTE];
  if (tenantPrimary) {
    palette[0] = tenantPrimary;
  }
  return palette;
}

/** Access the raw Fluent data-viz palette (for non-tenant contexts) */
export function getFluentDataVizPalette(): readonly string[] {
  return FLUENT_DATAVIZ_PALETTE;
}
