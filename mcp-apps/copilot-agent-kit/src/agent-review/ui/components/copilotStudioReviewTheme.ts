import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

/**
 * Copilot Studio review brand ramp — anchored on the Studio indigo #4858EB
 * (stop 80), sampled from the live "New evaluation" button (proposal §7).
 * Hover ≈ #5A68EF (90), light tint ≈ #E5E8FD (160). The mid stops are
 * interpolated through the proposal's sampled ramp so the whole scale reads as
 * one indigo family. Maps 1:1 onto Fluent UI v9 BrandVariants stops 10–160.
 *
 * Scoped to the Agent Review Tool feature. It is applied at the feature root
 * (`AgentReviewTool.tsx`), so every tab, dashboard, grid and dialog beneath it
 * inherits indigo, while the rest of the app keeps the teal root theme
 * (`styles/copilotStudioTheme.ts`). That teal ramp is intentionally untouched.
 */
export const copilotStudioReviewBrand: BrandVariants = {
  10: '#101334',
  20: '#141943',
  30: '#171E52',
  40: '#232C74',
  50: '#2F3A96',
  60: '#3440AB',
  70: '#3845C0',
  80: '#4858EB',
  90: '#5A68EF',
  100: '#6572F1',
  110: '#6F7BF2',
  120: '#8590F5',
  130: '#9BA4F7',
  140: '#AFB7F9',
  150: '#C3C9FB',
  160: '#E5E8FD',
};

/**
 * Studio rounding scale (proposal §7), applied to the scoped review theme only.
 * Copilot Studio rounds cards/dialogs generously while keeping
 * inputs/buttons subtle: bump the shared card token (XLarge → 12px) and the
 * medium token that inputs/menus/buttons read (→ 6px). Fluent defaults already
 * cover crisp data rows (Small = 2px) and pill chips/progress (Circular), so
 * those are left as-is.
 */
const applyStudioRadius = (theme: Theme): Theme => ({
  ...theme,
  borderRadiusMedium: '6px',
  borderRadiusXLarge: '12px',
});

export const copilotStudioReviewLightTheme: Theme = applyStudioRadius(createLightTheme(copilotStudioReviewBrand));
