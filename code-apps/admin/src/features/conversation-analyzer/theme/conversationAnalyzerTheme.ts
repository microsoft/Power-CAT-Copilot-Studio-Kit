import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

/**
 * Conversation Analyzer theme (copy of the Agent Debugger theme) — indigo brand ramp (primary `#4858EB`) with 6px control and 12px card radius.
 * Applied through a nested `FluentProvider` in ConversationAnalyzerPage.
 */
export const conversationAnalyzerBrand: BrandVariants = {
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

export const conversationAnalyzerLightTheme: Theme = {
  ...createLightTheme(conversationAnalyzerBrand),
  borderRadiusMedium: '6px',
  borderRadiusXLarge: '12px',
};
