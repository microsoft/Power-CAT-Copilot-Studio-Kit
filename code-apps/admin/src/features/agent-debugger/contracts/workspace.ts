/** Contracts shared between the Agent Debugger shell and its analysis surface. */

/** Identifiers of the five analysis tabs, in display order. */
export const ANALYSIS_TABS = [
  'performance',
  'flow',
  'conversation',
  'insights',
  'usage',
] as const;

export type AnalysisTabKey = (typeof ANALYSIS_TABS)[number];

/** One saved session within a conversation, as the session picker lists it. */
export interface SessionSummary {
  /** 1-based session number shown in the picker. */
  n: number;
  /** Formatted start timestamp. */
  startText: string;
  /** Raw UTC session start timestamp. */
  startTimeUtc?: string;
  /** Raw UTC session end timestamp. */
  endTimeUtc?: string;
  /** Measured session duration in milliseconds. */
  durationMs: number;
  /** Session type, e.g. "Engaged". */
  type: string;
  /** Session outcome, e.g. "Resolved". */
  outcome: string;
  /** Number of user turns saved in this session. */
  turnCount: number;
  /** Formatted turn count, e.g. "4 turns". */
  turnText: string;
  /** Formatted idle gap since the previous session, when there was one. */
  idleText?: string;
}

/** Derived counts the workspace reports back so the shell can badge its tabs. */
export interface AnalysisMeta {
  /** True once a transcript has been analysed and rendered. */
  isReady: boolean;
  /** Number of timed step executions across the transcript. */
  stepCount: number;
  /** Number of distinct recommendations. */
  recommendationCount: number;
  /** True when at least one recommendation is high severity. */
  hasHighSeverity: boolean;
  /** True when the transcript contains step executions to draw a flow from. */
  hasFlow: boolean;
  /** True when raw transcript JSON is available to view. */
  canViewJson: boolean;
  /** Deep link to the agent in Copilot Studio, when resolvable. */
  agentUrl?: string;
  /** Sessions found in the analysed conversation, for the Session picker. */
  sessions?: SessionSummary[];
  /** Formatted span covering every session, e.g. `Jan 4, 09:00 → 09:42`. */
  sessionSpanText?: string;
  /** Locales seen in the analysed conversation, for the Locale filter. */
  locales?: string[];
  /** Distinct step types seen, for the step-type filter chips. */
  stepTypes?: string[];
}
