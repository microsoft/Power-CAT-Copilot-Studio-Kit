import type { ReviewViewModel } from "../../agent-review/ui/index.js";
import { normalizeReviewTab, type ReviewMapNavigation, type ReviewNodeFilter, type ReviewTabId } from "../../agent-review/ui/contracts.js";

export type AgentReviewResultState = "summary" | "fullReview";

export interface AgentReviewSnapshot {
  selectionId: string;
  reviewId: string;
  state: AgentReviewResultState;
  model: ReviewViewModel;
  activeTab?: ReviewTabId;
  mapNavigation?: ReviewMapNavigation;
  nodeFilter?: ReviewNodeFilter | null;
}

interface ReadableStorage {
  getItem: (key: string) => string | null;
}

interface WritableStorage {
  setItem: (key: string, value: string) => void;
}

type ReviewStorage = ReadableStorage & WritableStorage;

const AGENT_REVIEW_SNAPSHOT_KEY_PREFIX = "agent-review:review:snapshot:";
const ACTIVE_AGENT_REVIEW_KEY = "agent-review:review:active-fullscreen";

function snapshotKey(selectionId: string): string {
  return `${AGENT_REVIEW_SNAPSHOT_KEY_PREFIX}${selectionId}`;
}

function parseSnapshot(
  raw: string | null,
  selectionId: string,
): AgentReviewSnapshot | undefined {
  if (!raw) return undefined;
  try {
    const snapshot = JSON.parse(raw) as Partial<AgentReviewSnapshot>;
    if (
      snapshot.selectionId !== selectionId
      || !snapshot.reviewId
      || (snapshot.state !== "summary" && snapshot.state !== "fullReview")
      || !snapshot.model
    ) {
      return undefined;
    }
    if (snapshot.activeTab !== undefined) snapshot.activeTab = normalizeReviewTab(snapshot.activeTab);
    if (snapshot.nodeFilter !== undefined) {
      const filter = snapshot.nodeFilter;
      snapshot.nodeFilter = filter?.reviewId === snapshot.reviewId
        && typeof filter.nodeId === "string" && filter.nodeId.trim()
        ? filter
        : null;
    }
    return snapshot as AgentReviewSnapshot;
  } catch {
    return undefined;
  }
}

export function writeAgentReviewSnapshot(
  storage: ReviewStorage | undefined,
  snapshot: Partial<AgentReviewSnapshot>,
): boolean {
  if (
    !snapshot.selectionId
    || !snapshot.reviewId
    || !snapshot.state
    || !snapshot.model
  ) {
    return false;
  }
  try {
    storage?.setItem(snapshotKey(snapshot.selectionId), JSON.stringify(snapshot));
    if (!storage) return false;
    if (snapshot.state === "fullReview") {
      storage.setItem(ACTIVE_AGENT_REVIEW_KEY, snapshot.selectionId);
    }
    return true;
  } catch {
    return false;
  }
}

export function readAgentReviewSnapshot(
  storage: ReadableStorage | undefined,
  selectionId: string | undefined,
): AgentReviewSnapshot | undefined {
  if (!storage || !selectionId) return undefined;
  try {
    return parseSnapshot(storage.getItem(snapshotKey(selectionId)), selectionId);
  } catch {
    return undefined;
  }
}

export function readActiveAgentReviewSnapshot(
  storage: ReadableStorage | undefined,
): AgentReviewSnapshot | undefined {
  if (!storage) return undefined;
  try {
    const selectionId = storage.getItem(ACTIVE_AGENT_REVIEW_KEY);
    if (!selectionId) return undefined;
    const snapshot = readAgentReviewSnapshot(storage, selectionId);
    return snapshot?.state === "fullReview" ? snapshot : undefined;
  } catch {
    return undefined;
  }
}
