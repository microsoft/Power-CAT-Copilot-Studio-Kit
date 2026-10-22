/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pure utility for parsing transcript data into displayable chat messages.
 * No React dependencies -- fully testable in isolation.
 */

import type {
  TranscriptData,
  FeedbackData,
  Attachment,
  SuggestedActions,
  Activity,
} from "../components/ui/types";
import { extractActivityText, isRenderableAttachment } from "./transcript/extract-activity-text";
import { normalizeTimestampMs } from "./transcript/timestamp";

/**
 * Raw activity record from the transcript, with fields used during parsing.
 * Transcript activities can include types beyond the strict Activity union
 * (e.g. "invoke"), so we widen `type` to `string`.
 */
type RawActivity = Omit<Activity, "from" | "type" | "value"> & {
  type: string;
  from: Activity["from"] & { aadObjectId?: string };
  name?: string;
  value?: Record<string, unknown>;
  replyToId?: string;
  valueType?: string;
  id?: string;
};

export interface DisplayMessage {
  id: string;
  type: "user" | "bot" | "system";
  text?: string;
  timestamp: string;
  attachments?: Attachment[];
  suggestedActions?: SuggestedActions;
  feedback?: FeedbackData | null;
  references?: string[];
}

export interface ParsedConversation {
  messages: DisplayMessage[];
}

/**
 * Parses a transcript into a list of displayable chat messages.
 *
 * Two passes:
 * 1. Collect feedback events and knowledge-source references.
 * 2. Build the ordered message list from `message`-type activities.
 */
export function parseConversation(data: TranscriptData): ParsedConversation {
  const activities = data.activities as unknown as RawActivity[];
  const messages: DisplayMessage[] = [];
  const feedbackMap = new Map<string, FeedbackData>();
  const referencesMap = new Map<string, string[]>();

  // First pass: collect all feedback events and references
  let lastBotMessageId: string | null = null;

  // Teams sometimes serializes the feedback payload as a JSON string
  // (e.g. "{\"feedbackText\":\"This was helpful\"}") rather than a nested
  // object. Coerce both shapes into { text } so downstream UI is consistent.
  const extractFeedbackText = (raw: unknown): string | undefined => {
    if (raw == null) return undefined;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          return extractFeedbackText(parsed);
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }
    if (typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const candidates = [obj.feedbackText, obj.text, obj.comment];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim().length > 0) return c;
      }
    }
    return undefined;
  };

  activities.forEach((activity: RawActivity) => {
    // Method 1: Get citations from ResponseGeneratorSupportData (most reliable - has parsed titles)
    // This event shares the same replyToId as the bot response message
    if (
      activity.type === "event" &&
      activity.name === "ResponseGeneratorSupportData" &&
      activity.value?.citations
    ) {
      const citations = activity.value.citations as Array<Record<string, unknown>>;
      const refs = citations
        .map((citation) => citation.Title as string)
        .filter((title: string) => title && title.trim());

      if (activity.replyToId && refs.length > 0) {
        // Deduplicate
        const uniqueRefs = [...new Set(refs)] as string[];
        referencesMap.set(activity.replyToId, uniqueRefs);
      }
    }

    // Method 2: Get citations from KnowledgeTraceData trace (backup)
    if (
      activity.type === "trace" &&
      activity.valueType === "KnowledgeTraceData" &&
      activity.value?.citedKnowledgeSources
    ) {
      const refs = (activity.value.citedKnowledgeSources as string[]).map(
        (source: string) => {
          return extractReadableName(source);
        }
      );

      if (activity.replyToId && refs.length > 0) {
        // Only set if not already set by ResponseGeneratorSupportData
        if (!referencesMap.has(activity.replyToId)) {
          const uniqueRefs = [...new Set(refs)] as string[];
          referencesMap.set(activity.replyToId, uniqueRefs);
        }
      }
    }

    // Method 3: Get from UniversalSearchToolTraceData (fallback for simpler flows)
    if (
      activity.type === "event" &&
      activity.name === "UniversalSearchToolTraceData" &&
      activity.value?.knowledgeSources
    ) {
      const refs = (activity.value.knowledgeSources as string[]).map((source: string) => {
        return extractReadableName(source);
      });

      // Store references by the replyToId
      if (activity.replyToId && refs.length > 0) {
        // Only set if not already set by other methods
        if (!referencesMap.has(activity.replyToId)) {
          const uniqueRefs = [...new Set(refs)] as string[];
          referencesMap.set(activity.replyToId, uniqueRefs);
        }
      }
    }

    // Track the last bot message ID
    if (
      activity.type === "message" &&
      (activity.from?.role === 0 || activity.from?.role === "bot")
    ) {
      lastBotMessageId = activity.id ?? null;
    }

    // Handle feedback events (legacy format: type=event, name=feedback)
    if (
      activity.type === "event" &&
      activity.name === "feedback" &&
      activity.value
    ) {
      // Try to find replyToId, or use the last bot message
      const replyToId =
        activity.replyToId || (activity.value.replyToId as string) || lastBotMessageId;
      if (replyToId) {
        // Handle both formats: rating/comment and reaction/feedback.text
        const rating = (activity.value.rating as string) || (activity.value.reaction as string);
        const comment =
          (activity.value.comment as string) ||
          extractFeedbackText(activity.value.feedback);

        feedbackMap.set(replyToId, {
          reaction: rating === "thumbsDown" ? "thumbsDown" : "thumbsUp",
          replyToId: replyToId,
          comment: comment,
          feedback: { text: comment },
        });
      }
    }

    // Handle feedback invoke actions (new format: type=invoke, name=message/submitAction, actionName=feedback)
    if (
      activity.type === "invoke" &&
      activity.name === "message/submitAction" &&
      activity.value?.actionName === "feedback" &&
      activity.value?.actionValue
    ) {
      const replyToId = activity.replyToId || lastBotMessageId;
      if (replyToId) {
        const actionValue = activity.value.actionValue as Record<string, unknown>;
        // Map reaction values: "like" -> "thumbsUp", "dislike" -> "thumbsDown"
        const reaction = actionValue.reaction as string;
        const mappedReaction =
          reaction === "like" || reaction === "thumbsUp"
            ? "thumbsUp"
            : "thumbsDown";
        const feedbackText = extractFeedbackText(actionValue.feedback);

        feedbackMap.set(replyToId, {
          reaction: mappedReaction,
          replyToId: replyToId,
          comment: feedbackText,
          feedback: { text: feedbackText },
        });
      }
    }
  });

  // Detect transcript type: if any message has role=0, it's a standard transcript
  // (role 0=bot, role 1=user). Otherwise it's a connected-agent transcript where
  // both user and bot share role=1 and we distinguish by aadObjectId.
  const isStandardTranscript = activities.some(
    (a: RawActivity) => a.type === "message" && a.from?.role === 0
  );

  // Second pass: collect displayable messages
  activities.forEach((activity: RawActivity) => {
    // Skip non-message activities (traces, events, etc.)
    if (activity.type !== "message") {
      return;
    }

    // Use shared helper to extract display text
    const displayText = extractActivityText(activity as any);
    const hasRenderableAttachments = activity.attachments?.some((a) => isRenderableAttachment(a)) ?? false;

    // Skip messages with no text and no renderable attachments (includes empty arrays)
    if (!displayText && !hasRenderableAttachments) {
      return;
    }

    // Skip messages where the only "text" is an attachment placeholder but
    // none of the actual attachments have renderable content
    if (
      !hasRenderableAttachments &&
      displayText &&
      /^\[(Adaptive Card Message|Attachment[^\]]*)\]$/i.test(displayText.trim())
    ) {
      return;
    }

    // Role can be number (0=bot, 1=user) or string ('user', 'bot')
    // Standard transcripts: role 0 = bot, role 1 = user (no aadObjectId needed)
    // Connected-agent transcripts: both have role 1, use aadObjectId to distinguish
    const role = activity.from?.role;
    const hasAadObjectId = !!activity.from?.aadObjectId;
    const isUser =
      role === "user" || (role === 1 && (isStandardTranscript || hasAadObjectId));
    const isBot =
      role === 0 ||
      role === "bot" ||
      (role === 1 && !isStandardTranscript && !hasAadObjectId);

    // For bot messages, look up references by the replyToId (the user message it's responding to)
    // Only show references for bot messages with actual text content (not consent cards)
    let references: string[] | undefined = undefined;
    if (isBot && activity.replyToId && activity.text?.trim()) {
      const isConsentCard = activity.name === "connectors/consentCard";
      if (!isConsentCard) {
        references = referencesMap.get(activity.replyToId);
      }
    }

    const message: DisplayMessage = {
      id: activity.id || `msg-${messages.length}`,
      type: isUser ? "user" : isBot ? "bot" : "system",
      text: displayText || activity.text,
      timestamp: formatTimestamp(activity.timestamp || activity.localTimestamp || ""),
      attachments: activity.attachments,
      suggestedActions: activity.suggestedActions,
      feedback: activity.id ? feedbackMap.get(activity.id) || null : null,
      references: references,
    };

    messages.push(message);
  });

  return { messages };
}

/** Extracts a readable name from a knowledge source ID. */
export function extractReadableName(source: string): string {
  // Format: "copilots_header_bf961.file.PythonHandbook.pdf_ohq" -> "PythonHandbook.pdf"
  const fileMatch = source.match(/\.file\.(.+?)_[^_]+$/);
  if (fileMatch) {
    // Add space between camelCase words but preserve the extension
    return fileMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  // Format: "copilots_header_bf961.topic.httpsdocspythonorg3_N_..." -> "docs.python.org"
  const topicMatch = source.match(/\.topic\.([^_]+)/);
  if (topicMatch) {
    // Try to extract domain from URL-like topic names
    const urlMatch = topicMatch[1].match(/https?([a-z]+)/i);
    if (urlMatch) {
      return topicMatch[1]
        .replace(/https?/i, "")
        .replace(/([a-z])([A-Z0-9])/g, "$1.$2")
        .toLowerCase();
    }
    return topicMatch[1];
  }
  return source;
}

/** Formats a timestamp (Unix or ISO) into a locale-friendly display string. */
export function formatTimestamp(timestamp: string | number): string {
  if (!timestamp) return "";

  try {
    const normalized = normalizeTimestampMs(timestamp);
    if (normalized === undefined) return String(timestamp);
    const date = new Date(normalized);

    // Return local timestamp format: "Dec 16, 2025 4:30 PM"
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(timestamp);
  }
}
