import assert from "node:assert/strict";
import test from "node:test";
import {
  readActiveAgentReviewSnapshot,
  readAgentReviewSnapshot,
  writeAgentReviewSnapshot,
  type AgentReviewSnapshot,
} from "./agentReviewSession";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const snapshot = {
  selectionId: "selection-1",
  reviewId: "review-1",
  state: "fullReview",
  model: {
    summary: {
      agentName: "ZAVA Visual Merchandiser",
    },
  },
} as AgentReviewSnapshot;

test("restores review state only for the exact widget invocation", () => {
  const storage = memoryStorage();

  assert.equal(writeAgentReviewSnapshot(storage, snapshot), true);
  assert.deepEqual(
    readAgentReviewSnapshot(storage, snapshot.selectionId),
    snapshot,
  );
  assert.equal(
    readAgentReviewSnapshot(storage, "another-selection"),
    undefined,
  );
});

test("does not persist an incomplete review result", () => {
  const storage = memoryStorage();

  assert.equal(
    writeAgentReviewSnapshot(storage, {
      selectionId: snapshot.selectionId,
      reviewId: snapshot.reviewId,
      state: "fullReview",
    }),
    false,
  );
  assert.equal(
    readAgentReviewSnapshot(storage, snapshot.selectionId),
    undefined,
  );
});

test("keeps completed review snapshots isolated by invocation", () => {
  const storage = memoryStorage();
  const other = {
    ...snapshot,
    selectionId: "selection-2",
    reviewId: "review-2",
  };

  assert.equal(writeAgentReviewSnapshot(storage, snapshot), true);
  assert.equal(writeAgentReviewSnapshot(storage, other), true);
  assert.deepEqual(readAgentReviewSnapshot(storage, "selection-1"), snapshot);
  assert.deepEqual(readAgentReviewSnapshot(storage, "selection-2"), other);
});

test("restores the active fullscreen snapshot while host tool data is replaying", () => {
  const storage = memoryStorage();

  assert.equal(writeAgentReviewSnapshot(storage, snapshot), true);
  assert.deepEqual(readActiveAgentReviewSnapshot(storage), snapshot);

  assert.equal(writeAgentReviewSnapshot(storage, {
    ...snapshot,
    state: "summary",
  }), true);
  assert.equal(readActiveAgentReviewSnapshot(storage), undefined);
});

for (const activeTab of ["skills", "coverage", "checks"]) {
  test(`normalizes the legacy ${activeTab} result tab without dropping the saved model`, () => {
    const storage = memoryStorage();
    storage.setItem("agent-review:review:snapshot:selection-1", JSON.stringify({ ...snapshot, activeTab }));
    assert.deepEqual(readAgentReviewSnapshot(storage, "selection-1"), { ...snapshot, activeTab: "findings" });
  });
}

test("does not restore a node filter for a different saved Review", () => {
  const storage = memoryStorage();
  storage.setItem("agent-review:review:snapshot:selection-1", JSON.stringify({
    ...snapshot, activeTab: "findings",
    nodeFilter: { reviewId: "other-review", nodeId: "saved-node" },
  }));
  const restored = readAgentReviewSnapshot(storage, "selection-1");
  assert.equal(restored?.nodeFilter, null);
  assert.equal(restored?.reviewId, snapshot.reviewId);
});
