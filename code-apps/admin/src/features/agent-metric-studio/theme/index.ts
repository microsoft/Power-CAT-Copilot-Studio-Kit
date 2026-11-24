import { createLightTheme, createDarkTheme } from '@fluentui/react-components';
import type { BrandVariants, Theme } from '@fluentui/react-components';

// Default brand — neutral blue.
const defaultBrand: BrandVariants = {
  10: '#020305',
  20: '#111A2B',
  30: '#16304B',
  40: '#174064',
  50: '#17517E',
  60: '#156298',
  70: '#1174B3',
  80: '#2B86C0',
  90: '#4E96C7',
  100: '#6FA6CE',
  110: '#8CB6D5',
  120: '#A7C6DC',
  130: '#C0D6E4',
  140: '#D8E5EC',
  150: '#EEF3F5',
  160: '#F7FAFB',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** Mix toward black (amount in -1..0) or white (0..1). */
function mix(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amount >= 0) {
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  const k = 1 + amount;
  return rgbToHex(r * k, g * k, b * k);
}

export function buildBrandFromColor(hex?: string): BrandVariants {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return defaultBrand;
  // Anchor the user's chosen hue at slot 70 (typical "brand primary"),
  // then generate darker shades for 10-60 and lighter shades for 80-160.
  return {
    10:  mix(hex, -0.90),
    20:  mix(hex, -0.80),
    30:  mix(hex, -0.65),
    40:  mix(hex, -0.50),
    50:  mix(hex, -0.35),
    60:  mix(hex, -0.18),
    70:  hex,
    80:  mix(hex, 0.10),
    90:  mix(hex, 0.22),
    100: mix(hex, 0.32),
    110: mix(hex, 0.42),
    120: mix(hex, 0.52),
    130: mix(hex, 0.62),
    140: mix(hex, 0.75),
    150: mix(hex, 0.88),
    160: mix(hex, 0.95),
  };
}

export function createAmsTheme(primary?: string, mode: 'light' | 'dark' = 'light'): Theme {
  const brand = buildBrandFromColor(primary);
  return mode === 'dark' ? createDarkTheme(brand) : createLightTheme(brand);
}

export function createAmsLightTheme(primary?: string): Theme {
  return createLightTheme(buildBrandFromColor(primary));
}

export function createAmsDarkTheme(primary?: string): Theme {
  return createDarkTheme(buildBrandFromColor(primary));
}

export const amsTheme = createAmsTheme();
