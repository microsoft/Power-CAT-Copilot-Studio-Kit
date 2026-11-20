/**
 * PowerShield Theme
 *
 * Fluent UI v9 theme using the Copilot Studio blue brand ramp (#077FAB).
 * Augmented with custom design tokens for semantic colors, spacing,
 * typography, shadows, layout, and animations.
 *
 * Usage:
 *   <FluentProvider theme={powerShieldTheme}>
 *
 * Custom tokens are accessed via direct import:
 *   import { semanticColors, layout } from '../theme/powerShieldTheme.tokens';
 */

import { createLightTheme } from '@fluentui/react-components';
import type { BrandVariants } from '@fluentui/react-components';
import {
  semanticColors,
  statusColors,
  layout,
  contentGradient,
  zIndex,
} from './powerShieldTheme.tokens';

/**
 * Copilot Studio 16-step brand color ramp.
 * Gradient from deep navy (#03151F) through primary blue (#077FAB) to near-white (#E0F6FF).
 */
const powerShieldBrand: BrandVariants = {
  10:  '#03151F',
  20:  '#041F2D',
  30:  '#052A3C',
  40:  '#06344A',
  50:  '#073E59',
  60:  '#074868',
  70:  '#075279',
  80:  '#077FAB',
  90:  '#0D8FBF',
  100: '#2B9FCC',
  110: '#4FAFD7',
  120: '#6FBFE2',
  130: '#8DCEEC',
  140: '#AADDF5',
  150: '#C5EBFC',
  160: '#E0F6FF',
};

/**
 * Complete PowerShield theme.
 * Combines Fluent UI v9 light theme with custom design tokens.
 */
export const powerShieldTheme = {
  ...createLightTheme(powerShieldBrand),
  fontFamilyBase: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace: "'Cascadia Code', 'Cascadia Mono', 'Consolas', monospace",
} as const;

export {
  semanticColors,
  statusColors,
  layout,
  contentGradient,
  zIndex,
};

/** TypeScript type for the complete theme */
export type PowerShieldTheme = typeof powerShieldTheme;
