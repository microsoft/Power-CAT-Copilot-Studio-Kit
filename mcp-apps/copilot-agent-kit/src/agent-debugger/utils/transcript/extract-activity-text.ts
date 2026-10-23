/**
 * Shared helper for extracting display text from a transcript activity.
 * Used by parse-transcript, parse-chat-preview, and conversation-transcript-service
 * to ensure consistent rendering of text, speak, value payloads, and attachments.
 */

/** Content types that cannot be meaningfully rendered as chat text. */
const NON_RENDERABLE_CONTENT_TYPES = new Set([
  "application/json",
]);

/** Content types we know how to render (adaptive cards, OAuth, etc.). */
const RENDERABLE_CARD_TYPES = new Set([
  "application/vnd.microsoft.card.adaptive",
  "application/vnd.microsoft.card.oauth",
  "application/vnd.microsoft.card.signin",
  "application/vnd.microsoft.card.hero",
  "application/vnd.microsoft.card.thumbnail",
]);

/** Keys that identify an action but are not user-entered form values. */
const ACTION_KEYS = new Set([
  "action",
  "actionsubmitid",
]);

/** Keys that are internal submit/postBack metadata — not useful to display. */
const SUBMIT_METADATA_KEYS = new Set([
  ...ACTION_KEYS,
  "id",
  "shouldawaitinput",
  "shouldawaitnput",
  "shouldawaiuserinput",
  "shouldawaituserinput",
]);

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function hasDisplayValue(value: string | number | boolean): boolean {
  return typeof value !== "string" || value.trim().length > 0;
}

/** Identifies empty submit/postBack messages that are transport events, not chat turns. */
export function isNonConversationalUserResponse(
  value: unknown,
  displayText: string,
): boolean {
  if (displayText.trim() || typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const normalized = new Map(
    Object.entries(record).map(([key, entry]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ""),
      entry,
    ]),
  );
  return (
    normalized.has("action") ||
    normalized.get("id") === "submit" ||
    normalized.has("shouldawaituserinput") ||
    normalized.has("shouldawaitinput") ||
    normalized.has("shouldawaitnput") ||
    normalized.has("shouldawaiuserinput")
  );
}

/**
 * Teams echoes the message body as an inline `text/html` attachment alongside
 * `activity.text`. It is markup, not a file, so it must never render as a chip.
 */
function isInlineHtmlAttachment(att: {
  contentType?: string;
  content?: unknown;
}): boolean {
  const ct = (att?.contentType || "").toLowerCase().split(";")[0].trim();
  return ct === "text/html" && typeof att?.content === "string";
}

/** Converts inline HTML markup to plain text for chat display. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Decode &amp; last, so that "&amp;lt;" becomes "&lt;" and not "<".
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts visible text and action labels from Hero and Thumbnail cards. */
function renderTextCard(content: unknown): string {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return "";
  }

  const card = content as Record<string, unknown>;
  const textParts = [card.title, card.subtitle, card.text]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());

  const buttonLabels = Array.isArray(card.buttons)
    ? card.buttons
        .map((button) => {
          if (!button || typeof button !== "object" || Array.isArray(button)) {
            return "";
          }
          const action = button as Record<string, unknown>;
          const label = action.title ?? action.text ?? action.value;
          return typeof label === "string" ? label.trim() : "";
        })
        .filter(Boolean)
    : [];

  return [...textParts, ...buttonLabels].join("\n");
}

/**
 * Renders the user-visible values from an Adaptive Card submit payload.
 * Form field names and internal action metadata are omitted so the message
 * mirrors what the user selected or entered.
 */
function renderStructuredValue(value: Record<string, unknown>): string {
  const submittedValues = Object.entries(value)
    .filter(
      ([key, entryValue]) =>
        !SUBMIT_METADATA_KEYS.has(key.toLowerCase()) &&
        isScalar(entryValue) &&
        hasDisplayValue(entryValue)
    )
    .map(([, entryValue]) => String(entryValue).trim());

  if (submittedValues.length > 0) {
    return submittedValues.join(", ");
  }

  // Consent-card postBacks are internal control messages. Keeping them empty
  // preserves the parser's logic that attaches their traces to the initiating
  // user turn rather than showing a separate consent response.
  const hasConsentMetadata = Object.keys(value).some((key) =>
    key.toLowerCase().startsWith("shouldawai")
  );
  if (hasConsentMetadata) return "";

  const actionValue = value["actionSubmitId"] ?? value["action"];
  return isScalar(actionValue) && hasDisplayValue(actionValue)
    ? String(actionValue).trim()
    : "";
}

/**
 * Checks if an attachment is renderable in the chat UI.
 * Card types must have non-empty content to be considered renderable;
 * a contentType alone with null/undefined/empty content produces empty bubbles.
 */
export function isRenderableAttachment(att: {
  contentType?: string;
  content?: unknown;
}): boolean {
  if (!att?.contentType) return false;
  if (isInlineHtmlAttachment(att)) return false;
  if (RENDERABLE_CARD_TYPES.has(att.contentType)) {
    // Card must have actual content — reject null, undefined, and empty objects
    if (att.content == null) return false;
    if (typeof att.content === "object" && Object.keys(att.content as object).length === 0) return false;
    // OAuth / sign-in cards are often emitted as internal token-exchange cards
    // with only tokenExchangeResource (no text, no buttons). They render as
    // empty bubbles in chat — treat them as non-renderable.
    if (
      att.contentType === "application/vnd.microsoft.card.oauth" ||
      att.contentType === "application/vnd.microsoft.card.signin"
    ) {
      const content = att.content as Record<string, unknown>;
      const hasText = typeof content.text === "string" && (content.text as string).trim().length > 0;
      const hasButtons = Array.isArray(content.buttons) && (content.buttons as unknown[]).length > 0;
      if (!hasText && !hasButtons) return false;
    }
    return true;
  }
  if (NON_RENDERABLE_CONTENT_TYPES.has(att.contentType)) return false;
  // Unknown types — treat as renderable (will show as attachment placeholder)
  return true;
}

/**
 * Extracts the best display text from an activity following a consistent priority:
 * 1. activity.text
 * 2. activity.speak
 * 3. value.text or value.utterance
 * 4. renderable attachment placeholder (e.g. "[Adaptive Card Message]")
 * 5. structured scalar fields from value (submit/postBack payloads)
 */
export function extractActivityText(activity: {
  text?: string;
  speak?: string;
  value?: unknown;
  attachments?: unknown[];
  channelData?: unknown;
}): string {
  // 1. Prefer text
  if (typeof activity.text === "string" && activity.text.trim().length > 0) {
    return activity.text;
  }

  // 2. Prefer speak
  if (typeof activity.speak === "string" && activity.speak.trim().length > 0) {
    return activity.speak;
  }

  // 3. Prefer value.text or value.utterance
  const value = activity.value as Record<string, unknown> | undefined;
  if (value) {
    if (typeof value["text"] === "string" && (value["text"] as string).trim().length > 0) {
      return value["text"] as string;
    }
    if (typeof value["utterance"] === "string" && (value["utterance"] as string).trim().length > 0) {
      return value["utterance"] as string;
    }
  }

  // 4. Check for renderable attachments
  const attachments = activity.attachments?.filter(
    (attachment): attachment is { contentType?: string; content?: unknown } =>
      Boolean(attachment) && typeof attachment === "object" && !Array.isArray(attachment),
  );
  if (attachments && attachments.length > 0) {
    const inlineHtml = attachments.find((a) => isInlineHtmlAttachment(a));
    if (inlineHtml) {
      const stripped = stripHtml(inlineHtml.content as string);
      if (stripped) return stripped;
    }

    const textCard = attachments.find(
      (attachment) =>
        attachment.contentType === "application/vnd.microsoft.card.hero" ||
        attachment.contentType === "application/vnd.microsoft.card.thumbnail"
    );
    if (textCard) {
      const rendered = renderTextCard(textCard.content);
      if (rendered) return rendered;
    }

    const hasRenderable = attachments.some((a) => isRenderableAttachment(a));
    if (hasRenderable) {
      const hasAdaptiveCard = attachments.some(
        (a) => a?.contentType === "application/vnd.microsoft.card.adaptive"
      );
      if (hasAdaptiveCard) return "[Adaptive Card Message]";

      // Generic renderable attachment
      const firstRenderable = attachments.find((a) => isRenderableAttachment(a));
      if (firstRenderable?.contentType) {
        return `[Attachment: ${firstRenderable.contentType}]`;
      }
      return "[Attachment]";
    }
    // All attachments are non-renderable — fall through to value inspection
  }

  // 5. Structured value payload (submit/postBack)
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rendered = renderStructuredValue(value);
    if (rendered) return rendered;
  }

  return "";
}
