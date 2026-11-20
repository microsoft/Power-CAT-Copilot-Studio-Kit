import { formatShortDateTime } from './format';

const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000;

/** One chat message rendered in transcript views. */
export interface TranscriptMessage {
  role: 'bot' | 'user';
  text: string;
  time?: string;
}

/**
 * Parse raw transcript content into structured messages for the chat UI.
 * Supports two formats:
 * 1. Copilot Studio JSON activities format: {"activities": [{type, from, text, ...}]}
 * 2. Plain text with "Bot:" / "User:" prefixes per line
 */
export function parseTranscriptToMessages(content: string | undefined): TranscriptMessage[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { activities?: Array<Record<string, unknown>> };
    if (parsed?.activities && Array.isArray(parsed.activities)) {
      return parseActivities(parsed.activities);
    }
  } catch { /* Not JSON, try plain text */ }
  return parsePlainText(content);
}

function normalizeTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Math.abs(value) < UNIX_MILLISECONDS_THRESHOLD ? value * 1000 : value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return normalizeTimestampMs(numeric);
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseActivities(activities: Array<Record<string, unknown>>): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const activity of activities) {
    if (activity.type !== 'message' || !activity.text) continue;
    const from = activity.from as { role?: number | string } | undefined;
    const timestamp = normalizeTimestampMs(activity.timestamp) ?? normalizeTimestampMs(activity.localTimestamp);
    const date = timestamp === undefined ? undefined : new Date(timestamp);
    // role 0 = bot, role 1 = user
    messages.push({
      role: from?.role === 1 || from?.role === 'user' ? 'user' : 'bot',
      text: String(activity.text),
      ...(date && !Number.isNaN(date.getTime()) ? { time: formatShortDateTime(date.toISOString()) } : {}),
    });
  }
  return messages;
}

function parsePlainText(content: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(bot|agent|assistant):/i.test(trimmed)) {
      messages.push({ role: 'bot', text: trimmed.replace(/^(bot|agent|assistant):\s*/i, '') });
    } else if (/^(user|customer|human):/i.test(trimmed)) {
      messages.push({ role: 'user', text: trimmed.replace(/^(user|customer|human):\s*/i, '') });
    } else if (messages.length > 0) {
      messages[messages.length - 1].text += '\n' + trimmed;
    } else {
      messages.push({ role: 'bot', text: trimmed });
    }
  }
  return messages;
}

/** Normalize text for fuzzy message matching: strip HTML, markdown and extra whitespace. */
function normalize(text: string): string {
  // Remove tags until none is left (CodeQL js/incomplete-multi-character-sanitization). One pass gives the same result.
  let stripped = text;
  let previous: string;
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^>]*>/g, '');
  } while (stripped !== previous);
  return stripped
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[*_~`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Whether a transcript message matches the highlighted (e.g. PII) message. */
export function matchesHighlight(msgText: string, highlighted: string): boolean {
  const a = normalize(msgText);
  const b = normalize(highlighted);
  if (!a || !b) return false;
  // Bidirectional: the flagged message may be a substring of the transcript or vice versa.
  if (a.includes(b) || b.includes(a)) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 20) {
    const snippet = b.substring(0, Math.min(30, minLen));
    if (a.includes(snippet)) return true;
  }
  return false;
}
