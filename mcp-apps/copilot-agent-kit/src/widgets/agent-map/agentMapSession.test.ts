import assert from "node:assert/strict";
import test from "node:test";
import * as agentMapPolicy from "./agentMapPresentationPolicy";
import {
  AGENT_MAP_CONTEXT_KEY,
  AGENT_MAP_SNAPSHOT_KEY,
  AGENT_MAP_SELECTION_FULLSCREEN_KEY,
  AGENT_MAP_PRESENTATION_KEY,
  agentMapDataTransition,
  completeAgentMapSelection,
  readAgentMapContext,
  readAgentMapPresentation,
  readAgentMapSnapshot,
  requestAgentMapDisplayMode,
  resolveAgentMapFullscreen,
  shouldRehydrateAgentMap,
  writeAgentMapContext,
  writeAgentMapSnapshot,
} from "./agentMapPresentationPolicy";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const CONTEXT = {
  environmentId: "11111111-1111-1111-1111-111111111111",
  agentId: "22222222-2222-2222-2222-222222222222",
  componentIdUnique: "33333333-3333-3333-3333-333333333333",
};
const SELECTION_ID = "selection-one";

test("restores the selected agent label when the widget remounts fullscreen", () => {
  const resolveAgentName = (
    agentMapPolicy as typeof agentMapPolicy & {
      resolveAgentMapSelectedAgentName?: (
        data: {
          agentId?: string;
          agents?: Array<{ id: string; name: string }>;
        },
        agentId: string,
      ) => string;
    }
  ).resolveAgentMapSelectedAgentName;

  assert.equal(typeof resolveAgentName, "function");
  assert.equal(resolveAgentName?.({
    agentId: CONTEXT.agentId,
    agents: [
      { id: CONTEXT.agentId, name: "ZAVA Visual Merchandiser" },
    ],
  }, CONTEXT.agentId), "ZAVA Visual Merchandiser");
});

test("persists the selected map context so a remount can rebuild it", () => {
  const storage = memoryStorage();

  writeAgentMapContext(storage, CONTEXT);

  assert.deepEqual(readAgentMapContext(storage), CONTEXT);
  assert.equal(storage.values.get(AGENT_MAP_CONTEXT_KEY), JSON.stringify(CONTEXT));
});

test("rehydrates exactly once when a remount lost the graph", () => {
  assert.equal(
    shouldRehydrateAgentMap({
      hasToolResult: true,
      hasGraph: false,
      storedContext: CONTEXT,
      alreadyRequested: false,
      allowStoredContextRehydrate: true,
    }),
    true,
  );
  assert.equal(
    shouldRehydrateAgentMap({
      hasToolResult: true,
      hasGraph: true,
      storedContext: CONTEXT,
      alreadyRequested: false,
      allowStoredContextRehydrate: true,
    }),
    false,
  );
});

test("does not rebuild stored context before the tool result reaches the iframe", () => {
  assert.equal(
    shouldRehydrateAgentMap({
      hasToolResult: false,
      hasGraph: false,
      storedContext: CONTEXT,
      alreadyRequested: false,
      allowStoredContextRehydrate: true,
    }),
    false,
  );
});

test("does not rebuild the previous agent for a new selection invocation", () => {
  assert.equal(
    shouldRehydrateAgentMap({
      hasToolResult: true,
      hasGraph: false,
      storedContext: CONTEXT,
      alreadyRequested: false,
      allowStoredContextRehydrate: false,
    }),
    false,
  );
});

test("does not call the server when the loaded map has an exact persisted snapshot", () => {
  const input = {
    hasToolResult: true,
    hasGraph: false,
    storedContext: CONTEXT,
    alreadyRequested: false,
    hasStoredSnapshot: true,
  } as Parameters<typeof shouldRehydrateAgentMap>[0] & {
    hasStoredSnapshot: boolean;
  };

  assert.equal(shouldRehydrateAgentMap(input), false);
});

test("restores only the exact Agent Map payload without persisting presentation", () => {
  const storage = memoryStorage();
  const graph = {
    agent: {
      id: CONTEXT.agentId,
      name: "Inventory agent",
      environmentId: CONTEXT.environmentId,
      environmentName: "Development",
    },
    nodes: [],
    edges: [],
    diagnostics: [],
    summary: {
      nodeCount: 0,
      componentCount: 0,
      edgeCount: 0,
      unresolvedCount: 0,
      skillReferenceCount: 0,
      linkedSkillCount: 0,
      unlinkedSkillCount: 0,
    },
  };

  assert.equal(writeAgentMapSnapshot(storage, {
    state: "map",
    selectionId: SELECTION_ID,
    environmentId: CONTEXT.environmentId,
    agentId: CONTEXT.agentId,
    componentIdUnique: CONTEXT.componentIdUnique,
    graph,
  }), true);
  assert.deepEqual(readAgentMapSnapshot(storage, CONTEXT, SELECTION_ID)?.graph, graph);
  assert.equal(
    readAgentMapSnapshot(
      storage,
      { ...CONTEXT, agentId: "different-agent" },
      SELECTION_ID,
    ),
    undefined,
  );
  assert.equal(
    readAgentMapSnapshot(storage, CONTEXT, "selection-two"),
    undefined,
  );
  const saved = storage.values.get(AGENT_MAP_SNAPSHOT_KEY) ?? "";
  assert.equal(saved.includes("presentation"), false);
});

test("uses the live host mode instead of stale fullscreen presentation", () => {
  assert.equal(
    resolveAgentMapFullscreen({
      storedPresentation: "inline",
      hostDisplayMode: "fullscreen",
      current: true,
    }),
    true,
  );
  assert.equal(
    resolveAgentMapFullscreen({
      presentation: "fullscreen",
      hostDisplayMode: "inline",
      current: false,
    }),
    false,
  );
  assert.equal(
    resolveAgentMapFullscreen({ state: "mapSelecting", current: false }),
    false,
  );
  assert.equal(
    resolveAgentMapFullscreen({ hostDisplayMode: "fullscreen", current: false }),
    true,
  );
  assert.equal(
    resolveAgentMapFullscreen({ storedPresentation: "fullscreen", current: false }),
    false,
  );
  assert.equal(resolveAgentMapFullscreen({ current: true }), true);
});

test("keeps a new selector-only map inline despite stored fullscreen state", () => {
  assert.equal(
    resolveAgentMapFullscreen({
      storedPresentation: "fullscreen",
      state: "mapSelecting",
      hostDisplayMode: "inline",
      current: true,
    }),
    false,
  );
});

test("ignores fullscreen state that was not created by the Expand action", () => {
  const legacy = memoryStorage({
    [AGENT_MAP_PRESENTATION_KEY]: "fullscreen",
  });
  assert.equal(readAgentMapPresentation(legacy), "inline");

  legacy.setItem("agent-review:agent-map:explicit-fullscreen", "true");
  assert.equal(readAgentMapPresentation(legacy), "fullscreen");
});

test("persists the requested mode before the host answers and the actual mode after", async () => {
  const storage = memoryStorage();
  const seen: string[] = [];
  const app = {
    requestDisplayMode: async ({ mode }: { mode: "inline" | "fullscreen" }) => {
      seen.push(storage.values.get(AGENT_MAP_PRESENTATION_KEY) ?? "");
      return { mode: mode === "fullscreen" ? ("inline" as const) : ("inline" as const) };
    },
  };

  const mode = await requestAgentMapDisplayMode(app, "fullscreen", storage);

  assert.deepEqual(seen, ["fullscreen"]);
  assert.equal(mode, "inline");
  assert.equal(storage.values.get(AGENT_MAP_PRESENTATION_KEY), "inline");
  assert.equal(readAgentMapPresentation(storage), "inline");
});

test("restores the opposite presentation when the host rejects the request", async () => {
  const storage = memoryStorage();
  const app = {
    requestDisplayMode: async () => {
      throw new Error("denied");
    },
  };

  await assert.rejects(() => requestAgentMapDisplayMode(app, "fullscreen", storage));
  assert.equal(storage.values.get(AGENT_MAP_PRESENTATION_KEY), "inline");
});

test("surfaces a tool error message and clears it on the next good payload", () => {
  assert.deepEqual(
    agentMapDataTransition({ state: "error", error: { message: "Environment unavailable." } }),
    { error: "Environment unavailable.", clearGraph: false, clearAgentSelection: false },
  );
  assert.deepEqual(
    agentMapDataTransition({ state: "map", graph: {} }),
    { error: "", clearGraph: false, clearAgentSelection: false },
  );
});

test("clears a stale graph and agent selection on a new mapSelecting result", () => {
  assert.deepEqual(
    agentMapDataTransition({ state: "mapSelecting" }),
    { error: "", clearGraph: true, clearAgentSelection: true },
  );
});

test("migrates stale automatic fullscreen state back to inline", () => {
  const storage = memoryStorage({
    [AGENT_MAP_PRESENTATION_KEY]: "fullscreen",
  });

  storage.setItem(AGENT_MAP_SELECTION_FULLSCREEN_KEY, "true");

  assert.equal(readAgentMapPresentation(storage), "inline");
  assert.equal(
    storage.values.get(AGENT_MAP_SELECTION_FULLSCREEN_KEY),
    "true",
  );
  assert.equal(completeAgentMapSelection(storage), true);
  assert.equal(
    storage.values.get(AGENT_MAP_SELECTION_FULLSCREEN_KEY),
    "false",
  );
  assert.equal(
    storage.values.get(AGENT_MAP_PRESENTATION_KEY),
    "inline",
  );
});

test("keeps fullscreen after a user-initiated expand builds another map", () => {
  const storage = memoryStorage();

  assert.equal(completeAgentMapSelection(storage), false);
});
