/**
 * Observed-usage evidence read from an agent's own conversation transcripts.
 *
 * This contract deliberately carries **no credit, token, or currency field**.
 * Conversation transcripts do not record billing data, so a per-agent cost
 * cannot be derived from them. The value of this evidence is the
 * *provisioning gap*: the difference between what a maker configured and what
 * the agent actually used.
 *
 * Wording rule (spec 019 FR-5): a capability that produced no transcript
 * signal is "not observed in the window". It is never "unused", "dead", or
 * "wasted" — absence of evidence in a bounded window is not evidence of
 * absence.
 */

/**
 * Shown when there is no bot id or environment to read transcripts from.
 * Per spec 019 FR-9 this never tells the maker to obtain a role, because
 * `CSK - Maker` already grants transcript read at organization depth.
 *
 * Lives in this contract module, not in the hook, so a presentational consumer
 * can use it without pulling the Dataverse SDK into its module graph.
 */
export const NO_EVIDENCE_REASON =
  'Observed use is unavailable for this review. Transcripts can only be read for a saved review that records its source environment.';

/**
 * Shown when the review was produced from an uploaded file rather than from a
 * live agent.
 *
 * A ZIP or JSON upload has no environment behind it, so there is no agent whose
 * transcripts could be read — this is a property of the review's source, not a
 * fault or a missing permission. Stated in plain terms, because
 * {@link NO_EVIDENCE_REASON} reads as internal jargon to a maker who simply
 * uploaded a file.
 */
export const UPLOAD_NO_EVIDENCE_REASON =
  'This review came from an uploaded file, so there is no live agent to read conversation transcripts from. Review an agent from its environment to see observed use.';

/** A capability class whose configured set can be compared against observation. */
export type CoverageKind = 'knowledge' | 'skill';

/**
 * Whether a configured capability produced any transcript signal in the window.
 *
 * `not-attributable` exists because the transcript's *searched-set* vocabulary
 * and its *catalogue* vocabulary are not always the same namespace. The harness
 * enumerates uploaded files individually in `Available search sources:`, but
 * records a search against them under a group name such as `Uploaded Files`.
 * When that happens, no individual file name can ever appear in the searched
 * set, so the absence of its name proves nothing. Calling such an item
 * "not observed" is a false finding (spec 019 FR-5) and — worse — the card then
 * recommends removing a capability the same transcripts show was searched.
 */
export type CoverageState = 'observed' | 'not-observed' | 'not-attributable';

/** One configured capability and its observation state. */
export interface CoverageItem {
  /** Configured display name, exactly as the transcript reports it. */
  name: string;
  /**
   * Source classification parsed from the transcript, such as `Website` or
   * `Uploaded file`. Absent when the transcript does not qualify the source.
   */
  sourceType?: string;
  state: CoverageState;
  /** Times this capability appeared in a retained tool call. */
  invocations: number;
}

/**
 * A search recorded under a name that is not in the configured catalogue.
 *
 * This is the harness naming a *group* rather than a member — the observation is
 * real, but it cannot be attributed to any individual configured item. Surfaced
 * so the evidence is never silently dropped, and so the reader can see why a
 * whole class of items is reported as not attributable.
 */
export interface AggregateObservation {
  /** The group name exactly as the searched set recorded it. */
  name: string;
  /** Times this group name appeared in a retained tool call. */
  invocations: number;
}

/** Configured-versus-observed comparison for one capability class. */
export interface ToolCoverage {
  kind: CoverageKind;
  /** Count of configured capabilities the transcript enumerated. */
  configured: number;
  /** Count of those that produced at least one observation. */
  observed: number;
  /**
   * Count of configured capabilities the evidence cannot speak to, because
   * their class is only ever searched under a group name. Never counted as a
   * provisioning gap.
   */
  notAttributable: number;
  /** Every configured capability, observed first, then alphabetical. */
  items: CoverageItem[];
  /**
   * Searches recorded under names that are not configured catalogue entries.
   * Empty when the two vocabularies agree.
   */
  aggregateObservations: AggregateObservation[];
}

/** A tool observed in the window, aggregated across conversations. */
export interface ObservedToolUsage {
  /** Stable tool identifier from the trace payload. */
  toolName: string;
  /** Human-facing label, falling back to `toolName`. */
  displayName: string;
  /** Generative `toolKind`, such as `search`, `skill`, `agent`, or `tool`. */
  toolKind: string;
  invocations: number;
}

/** The bounded query window that produced the evidence. */
export interface ObservationWindow {
  /** Inclusive ISO start of the window. */
  startIso: string;
  /** Exclusive ISO end of the window. */
  endIso: string;
  /** Window length in days, shown to the reviewer verbatim. */
  days: number;
  /** Conversations whose transcripts were read. */
  conversations: number;
  /**
   * True when the page budget stopped the read before the window was
   * exhausted. The UI must disclose this, because a truncated read can make a
   * used capability look unobserved.
   */
  truncated: boolean;
}

/**
 * Every state the evidence surface can occupy.
 *
 * `no-signal` intentionally carries **no counts**. Rendering "0 of 9 observed"
 * would read as a finding, when in fact nothing ran and nothing is known.
 */
export type EvidenceState =
  | { status: 'loading' }
  | { status: 'no-access'; reason: string }
  | { status: 'no-transcripts'; window: ObservationWindow }
  | { status: 'no-signal'; window: ObservationWindow; blockedConversations: number }
  | {
      status: 'ready';
      window: ObservationWindow;
      coverage: ToolCoverage[];
      observedTools: ObservedToolUsage[];
      /**
       * Conversations that returned only an `AgentBlocked` error trace. These
       * are excluded from the observation base, because a blocked conversation
       * never reached the tool-selection stage.
       */
      blockedConversations: number;
    };

/** A single retained tool call, after empty streaming frames are discarded. */
export interface RetainedToolCall {
  toolName: string;
  displayName: string;
  toolKind: string;
  /** Knowledge sources this call searched, when the payload reports them. */
  searchedSources: string[];
  /**
   * Configured sources enumerated by the call's `Available search sources:`
   * block. Present only on knowledge-search calls.
   */
  availableSources: CoverageItem[];
  /** Skill invoked by this call, when the payload reports one. */
  skill?: string;
}

/** Outcome of parsing one conversation transcript. */
export interface ParsedTranscriptEvidence {
  calls: RetainedToolCall[];
  /** True when the conversation produced only an `AgentBlocked` error trace. */
  blocked: boolean;
}
