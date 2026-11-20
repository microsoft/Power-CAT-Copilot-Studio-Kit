/**
 * Parses the raw `content` JSON blob from a conversation transcript
 * into structured data for AI Builder and record creation.
 *
 * The content follows the Bot Framework activity format:
 * { "activities": [{ type, from: { role }, text, timestamp }, ...] }
 *
 * - `from.role === 0` → Bot message
 * - `from.role !== 0` → User message
 * - Only `type === "message"` activities are included
 */

export interface ParsedTranscript {
  /** Semicolon-delimited "Bot says: X;User says: Y" text for AI Builder */
  formattedMessages: string;
  /** Count of message-type activities */
  messageCount: number;
  /** Duration in seconds (last activity timestamp - first activity timestamp) */
  durationSeconds: number;
}

interface Activity {
  type?: string;
  from?: { role?: number; id?: string };
  text?: string;
  timestamp?: number | string;
}

/**
 * Parse raw transcript content JSON into formatted messages, count, and duration.
 * Returns a safe fallback if content is invalid or empty.
 */
export function parseTranscriptContent(content: string | undefined | null): ParsedTranscript {
  const fallback: ParsedTranscript = { formattedMessages: '', messageCount: 0, durationSeconds: 0 };
  if (!content) return fallback;

  let activities: Activity[];
  try {
    const parsed = JSON.parse(content) as { activities?: Activity[] };
    activities = parsed?.activities ?? [];
  } catch {
    return fallback;
  }

  if (activities.length === 0) return fallback;

  // Filter to message-type activities only for text formatting
  const messages = activities.filter((a) => a.type === 'message');

  // Format as "Bot says: X;User says: Y"
  const formatted = messages
    .map((a) => {
      const text = a.text ?? '';
      return a.from?.role === 0 ? `Bot says: ${text}` : `User says: ${text}`;
    })
    .join(';');

  // Duration: last activity timestamp - first activity timestamp (ALL activities, not just messages)
  const timestamps = activities
    .map((a) => (typeof a.timestamp === 'number' ? a.timestamp : Number(a.timestamp)))
    .filter((t) => !isNaN(t) && t > 0);

  let durationSeconds = 0;
  if (timestamps.length >= 2) {
    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps);
    // Timestamps may be milliseconds or seconds - normalize
    const diff = last - first;
    durationSeconds = diff > 1_000_000_000 ? Math.round(diff / 1000) : Math.round(diff);
  }

  return {
    formattedMessages: formatted,
    messageCount: messages.length,
    durationSeconds,
  };
}
