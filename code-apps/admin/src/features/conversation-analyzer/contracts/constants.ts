/**
 * Conversation Analyzer - Static configuration shared across the feature.
 */

import type { TimePeriod, HealthStatus, SentimentLabel, Outcome, PiiExposure } from './types';

export interface TimePeriodOption {
  value: TimePeriod;
  label: string;
  daysBack?: number;
}

export const TIME_PERIOD_OPTIONS: TimePeriodOption[] = [
  { value: 'last7', label: 'Last 7 days', daysBack: 7 },
  { value: 'last30', label: 'Last 30 days', daysBack: 30 },
  { value: 'last90', label: 'Last 90 days', daysBack: 90 },
  { value: 'custom', label: 'Custom range' },
];

export const DEFAULT_TIME_PERIOD: TimePeriod = 'last7';
export const MAX_CONVERSATIONS_PER_ANALYSIS = 300;
/** Selection meter turns to warning at this share of the limit. */
export const SELECTION_WARNING_RATIO = 0.8;
export const CONVERSATION_BATCH_SIZE = 20;
export const CONVERSATION_MAX_RETRIES = 3;
export const MAX_PROMPT_LENGTH = 4000;

export const PAGE_SIZE_AGENTS = 11;
export const PAGE_SIZE_CUSTOM_ANALYSIS = 10;
export const PAGE_SIZE_DASHBOARD_PROMPTS_PREVIEW = 2;
export const PAGE_SIZE_DASHBOARD_AGENTS_PREVIEW = 5;

/** localStorage keys (values are JSON). */
export const STORAGE_KEYS = {
  timeFilter: 'cak.conversationAnalyzer.timeFilter',
  conversationsEnvironment: 'cak.conversationAnalyzer.conversations.environment',
  conversationsAgentByEnvironment: 'cak.conversationAnalyzer.conversations.agentByEnvironment',
  conversationsTimePeriod: 'cak.conversationAnalyzer.conversations.timePeriod',
  conversationsCustomRange: 'cak.conversationAnalyzer.conversations.customRange',
} as const;

/** Kit brand ramp used for charts (G-5). */
export const BRAND_CHART_COLORS = {
  shade40: '#232C74',
  shade70: '#3845C0',
  primary: '#4858EB',
  tint90: '#5A68EF',
  tint120: '#8590F5',
  tint140: '#AFB7F9',
} as const;

export const SENTIMENT_CHART_COLORS = {
  positive: BRAND_CHART_COLORS.primary,
  neutral: BRAND_CHART_COLORS.tint140,
  negative: BRAND_CHART_COLORS.shade40,
} as const;

export const CREDIT_CHART_COLORS = {
  sentiment: BRAND_CHART_COLORS.shade70,
  pii: BRAND_CHART_COLORS.tint120,
  custom: BRAND_CHART_COLORS.tint90,
} as const;

/** Sort priority for agent health (lower = shown first). */
export const HEALTH_PRIORITY: Record<HealthStatus, number> = {
  critical: 0,
  attention: 1,
  unknown: 2,
  healthy: 3,
};

type BadgeAppearance = 'filled' | 'tint' | 'outline' | 'ghost';
type BadgeColor =
  | 'brand'
  | 'danger'
  | 'important'
  | 'informative'
  | 'severe'
  | 'subtle'
  | 'success'
  | 'warning';

export interface BadgeStyle {
  appearance: BadgeAppearance;
  color: BadgeColor;
  label: string;
}

export const HEALTH_BADGE: Record<HealthStatus, BadgeStyle> = {
  healthy: { appearance: 'tint', color: 'success', label: 'Healthy' },
  attention: { appearance: 'tint', color: 'warning', label: 'Needs attention' },
  critical: { appearance: 'tint', color: 'danger', label: 'Critical' },
  unknown: { appearance: 'tint', color: 'subtle', label: 'Not analyzed' },
};

export const SENTIMENT_BADGE: Record<SentimentLabel, BadgeStyle> = {
  positive: { appearance: 'tint', color: 'success', label: 'Positive' },
  neutral: { appearance: 'tint', color: 'informative', label: 'Neutral' },
  mixed: { appearance: 'tint', color: 'warning', label: 'Mixed' },
  negative: { appearance: 'tint', color: 'danger', label: 'Negative' },
  unknown: { appearance: 'tint', color: 'subtle', label: 'Unknown' },
};

export const OUTCOME_BADGE: Record<Outcome, BadgeStyle> = {
  resolved: { appearance: 'tint', color: 'success', label: 'Resolved' },
  escalated: { appearance: 'tint', color: 'warning', label: 'Escalated' },
  abandoned: { appearance: 'tint', color: 'danger', label: 'Abandoned' },
  unknown: { appearance: 'tint', color: 'subtle', label: 'Unknown' },
};

export const PII_BADGE: Record<PiiExposure, BadgeStyle> = {
  none: { appearance: 'tint', color: 'success', label: 'None' },
  low: { appearance: 'tint', color: 'informative', label: 'Low' },
  medium: { appearance: 'tint', color: 'warning', label: 'Medium' },
  high: { appearance: 'tint', color: 'danger', label: 'High' },
  unknown: { appearance: 'tint', color: 'subtle', label: 'Unknown' },
};
