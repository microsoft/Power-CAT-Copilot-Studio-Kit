/** Contracts shared between the Agent Debugger shell and its analysis surface. */

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
