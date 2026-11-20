/**
 * Derives grid metadata (topic, greeting-only flag, start time) from raw transcript content.
 * Bot Framework activities: `from.role === 0` is the bot, any other role is the user.
 */

export interface TranscriptSummary {
  /** First user message, used as the conversation title (GR-2). */
  topic?: string;
  /** True when the transcript has no user message and the user never replied to the greeting (CV-6). */
  isGreetingOnly: boolean;
  /** Earliest activity timestamp as ISO, when present. */
  startTime?: string;
}

interface Activity {
  type?: string;
  from?: { role?: number };
  text?: unknown;
  timestamp?: number | string;
}

const MAX_TOPIC_LENGTH = 200;

function toIso(timestamp: number | string | undefined): string | undefined {
  if (timestamp == null) return undefined;
  const numeric = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (Number.isFinite(numeric) && numeric > 0) {
    // Copilot Studio stores epoch seconds; tolerate milliseconds too.
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(String(timestamp));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Summarizes transcript content. Empty transcripts count as greeting-only (no user message);
 * unparseable content is left visible because its messages are unknown.
 */
export function summarizeTranscript(content: string | undefined | null): TranscriptSummary {
  if (!content) return { isGreetingOnly: true };
  let activities: Activity[];
  try {
    const parsed = JSON.parse(content) as { activities?: Activity[] };
    activities = Array.isArray(parsed?.activities) ? parsed.activities : [];
  } catch {
    return { isGreetingOnly: false };
  }

  const messages = activities.filter((a) => a.type === 'message' && typeof a.text === 'string' && a.text.trim());
  const firstUser = messages.find((a) => a.from?.role !== 0);
  const topic = typeof firstUser?.text === 'string'
    ? firstUser.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH)
    : undefined;

  let startTime: string | undefined;
  for (const activity of activities) {
    const iso = toIso(activity.timestamp);
    if (iso && (!startTime || iso < startTime)) startTime = iso;
  }

  return { topic, isGreetingOnly: !firstUser, startTime };
}
