export type DebuggerTab = "performance" | "flow" | "conversation" | "insights" | "usage";

/** What full screen opens after an inline request: a tab and, for the timeline, a turn. */
export interface FullscreenIntent {
  tab: DebuggerTab;
  turnNumber?: number;
  messageId?: string;
}

const DEBUGGER_TABS: readonly DebuggerTab[] = ["performance", "flow", "conversation", "insights", "usage"];
const KEY_PREFIX = "agent-debugger:fullscreen-intent:";

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the intent for the conversation, so full screen can open it even when
 * the host mounts a new view for the display mode change.
 */
export function saveFullscreenIntent(conversationId: string | undefined, intent: FullscreenIntent): void {
  if (!conversationId) return;
  try {
    storage()?.setItem(`${KEY_PREFIX}${conversationId}`, JSON.stringify(intent));
  } catch {
    // Storage can be full or blocked; the intent then applies only in this view.
  }
}

export function readFullscreenIntent(conversationId: string | undefined): FullscreenIntent | undefined {
  if (!conversationId) return undefined;
  let raw: string | null | undefined;
  try {
    raw = storage()?.getItem(`${KEY_PREFIX}${conversationId}`);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || !DEBUGGER_TABS.includes(value.tab as DebuggerTab)) return undefined;
    const intent: FullscreenIntent = { tab: value.tab as DebuggerTab };
    if (typeof value.turnNumber === "number" && Number.isInteger(value.turnNumber) && value.turnNumber > 0) {
      intent.turnNumber = value.turnNumber;
    }
    if (typeof value.messageId === "string" && value.messageId) intent.messageId = value.messageId;
    return intent;
  } catch {
    return undefined;
  }
}

export function clearFullscreenIntent(conversationId: string | undefined): void {
  if (!conversationId) return;
  try {
    storage()?.removeItem(`${KEY_PREFIX}${conversationId}`);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
