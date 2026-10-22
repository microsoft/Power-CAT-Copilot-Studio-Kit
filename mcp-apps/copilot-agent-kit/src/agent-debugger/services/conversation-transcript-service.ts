import type { Activity } from "../contracts/transcript.js";
import type { ConversationData, Message } from "../contracts/conversation.js";
import { extractActivityText } from "../utils/transcript/extract-activity-text.js";
import { normalizeTimestampMs } from "../utils/transcript/timestamp.js";

export function toIsoTimestamp(value: unknown): string {
  const milliseconds = normalizeTimestampMs(value);
  if (milliseconds !== undefined) return new Date(milliseconds).toISOString();
  return new Date(0).toISOString();
}

function isOAuthCard(activity: Activity): boolean {
  if (activity.type !== "message" || !Array.isArray(activity.attachments)) return false;
  return activity.attachments.some((attachment) => {
    if (!attachment || typeof attachment !== "object") return false;
    return (attachment as { contentType?: string }).contentType
      === "application/vnd.microsoft.card.oauth";
  });
}

function adaptiveCard(activity: Activity): unknown {
  if (!Array.isArray(activity.attachments)) return undefined;
  const attachment = activity.attachments.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    return (candidate as { contentType?: string }).contentType
      === "application/vnd.microsoft.card.adaptive";
  }) as { content?: unknown } | undefined;
  return attachment?.content;
}

export function conversationDataFromActivities(
  conversationId: string,
  activities: Activity[],
  metadata?: Record<string, unknown>,
): ConversationData {
  const messages: Message[] = activities
    .filter((activity) => activity.type === "message" && !isOAuthCard(activity))
    .map((activity, index) => {
      const card = adaptiveCard(activity);
      const content = extractActivityText(activity).trim();
      return {
        id: `${conversationId}-message-${index}-${activity.id ?? "no-id"}`,
        role: activity.from?.role === 0 || activity.from?.role === "bot"
          ? "bot"
          : "user",
        content: content || (card ? "" : "[message with no text]"),
        timestamp: toIsoTimestamp(activity.timestampMs ?? activity.timestamp),
        adaptiveCard: card,
      };
    });

  return {
    id: conversationId,
    generalInfo: {
      numberOfSessions: new Set(
        activities.map((activity) => activity.mergedSessionKey).filter(Boolean),
      ).size || 1,
      numberOfTurns: messages.length,
      globalOutcome: messages.length > 0 ? "Resolved" : "Unresolved",
      totalDuration: 0,
      inactivityCounts: 0,
      totalTokensUsed: 0,
      model: typeof metadata?.BotName === "string" ? metadata.BotName : "unknown",
      gptAnswerState: "",
      contentModeration: "",
    },
    messages,
  };
}
