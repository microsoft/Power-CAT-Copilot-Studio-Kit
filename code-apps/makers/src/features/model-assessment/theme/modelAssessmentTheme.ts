import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

/**
 * Copilot Studio indigo brand ramp — primary #4858EB at stop 80.
 *
 * These 16 stops are copied verbatim from the shared Copilot Studio design
 * system (`github_guidelines/.github/skills/prototype-builder/assets/
 * copilotstudio-theme/brand.js`) and match this feature's approved prototype
 * `docs/features/prototype-mockups/design-1-agents-workspace.html`
 * (`--brand: #4858EB`, hover #3B47CF, pressed #3641BC).
 *
 * Scoped to the Model Assessment feature and applied at its page root,
 * so every grid, drawer, dialog and badge beneath it renders the indigo brand
 * the design specifies — while the rest of the Makers app keeps the teal root
 * theme (`styles/copilotStudioTheme.ts`), untouched. This mirrors the existing
 * per-feature theming convention (see agent-review-tool, power-shield).
 */
export const modelAssessmentBrand: BrandVariants = {
  10: '#1F2331',
  20: '#262C43',
  30: '#2E3760',
  40: '#344181',
  50: '#3641BC',
  60: '#3B47CF',
  70: '#3F4BDB',
  80: '#4858EB',
  90: '#5265F8',
  100: '#6D86FF',
  110: '#9AADF4',
  120: '#B4C5FF',
  130: '#D3DDFF',
  140: '#E4EBFF',
  150: '#F2F5FF',
  160: '#FBFCFE',
};

/**
 * Studio rounding scale, matched 1:1 to the approved prototype
 * `design-1-agents-workspace.html` (`assets/theme.css`): cards, dialogs and
 * run-boxes use `--r-l: 16px` (XLarge) while buttons, the search box and inputs
 * use `--r-m: 12px` (Medium). Fluent's stock 8px/4px reads visibly squarer than
 * the mockup, so both radii are lifted to the design-system values.
 */
export const modelAssessmentTheme: Theme = {
  ...createLightTheme(modelAssessmentBrand),
  fontFamilyBase: "'Segoe UI Variable', 'Segoe UI Variable Text', 'Segoe UI Variable Display', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif",
  borderRadiusMedium: '12px',
  borderRadiusXLarge: '16px',
};
