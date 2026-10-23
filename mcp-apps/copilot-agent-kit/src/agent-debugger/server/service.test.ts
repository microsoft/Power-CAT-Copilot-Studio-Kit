import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessedTranscript } from "../contracts/transcript.js";
import { exactAgentFilter } from "../../tools/target-selection.js";
import {
  buildChildTranscriptPath,
  buildConversationListPath,
  buildConversationTranscriptPath,
  compactTranscript,
  mapAgentRows,
} from "./service.js";

test("exact agent filters reject missing or invalid identities and safely escape a supplied name", () => {
  assert.equal(exactAgentFilter({ agentName: " O'Bryan " }), "statecode eq 0 and name eq 'O''Bryan'");
  assert.throws(() => exactAgentFilter({}), /exact agent name/i);
  assert.throws(() => exactAgentFilter({ agentId: "not-a-guid", agentName: "Named agent" }), /valid identifier/i);
});

test("maps active classic and generative agents without filtering either experience", () => {
  const agents = mapAgentRows([
    {
      botid: "11111111-1111-1111-1111-111111111111",
      name: "Classic support",
      componentidunique: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      configuration: JSON.stringify({ recognizer: { $kind: "LuisRecognizer" } }),
    },
    {
      botid: "22222222-2222-2222-2222-222222222222",
      name: "Generative support",
      componentidunique: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      configuration: JSON.stringify({ agentSettings: { instructions: {} } }),
    },
    {
      botid: "33333333-3333-3333-3333-333333333333",
      name: "Classic agent without a component version",
      configuration: JSON.stringify({ recognizer: { $kind: "LuisRecognizer" } }),
    },
  ], "");

  assert.deepEqual(agents.map((agent) => agent.experience), [
    "classic",
    "generative",
    "classic",
  ]);
  assert.equal(agents[2].componentIdUnique, undefined);
});

test("binds connected-agent transcript queries to the resolved child bot", () => {
  const path = buildChildTranscriptPath(
    "parent_child",
    "11111111-1111-1111-1111-111111111111",
  );
  const parameters = new URLSearchParams(path.slice(path.indexOf("?") + 1));

  assert.equal(
    parameters.get("$filter"),
    "contains(name,'parent_child') and _bot_conversationtranscriptid_value eq 11111111-1111-1111-1111-111111111111",
  );
});

test("bounds and escapes conversation lookup paths", () => {
  const path = buildConversationListPath({
    agentId: "11111111-1111-1111-1111-111111111111",
    query: "customer's case",
    limit: 60,
  });
  const parameters = new URLSearchParams(path.slice(path.indexOf("?") + 1));

  assert.match(path, /%27%27/);
  assert.equal(parameters.get("$top"), "250");
  assert.equal(parameters.get("$orderby"), "conversationstarttime desc,createdon desc");
});

test("compacts transcript activities while retaining session identity", () => {
  const input: ProcessedTranscript = {
    generalInfo: { durationMs: 0, turnCount: 1 },
    turns: [{
      id: "turn-1",
      role: "user",
      content: "Help",
      timestamp: "2026-09-24T10:00:00.000Z",
      debugInfo: { stepExecutions: [] },
      activities: [{
        id: "activity-1",
        type: "message",
        text: "Sensitive detail",
        mergedSessionKey: "session-1",
      }],
    }],
    raw: {
      activities: [{
        id: "activity-1",
        type: "message",
        text: "Sensitive detail",
      }],
    },
  };

  const compact = compactTranscript(input);

  assert.deepEqual(compact.raw.activities, []);
  assert.deepEqual(compact.turns[0].activities, [{
    type: "session",
    mergedSessionKey: "session-1",
  }]);
});

test("conversation date bounds apply in Dataverse before list limits", () => {
  const path = buildConversationListPath({
    agentId: "11111111-1111-1111-1111-111111111111", query: "saved", limit: 50,
    startedAfter: "2026-10-01T10:00:00.000Z", startedBefore: "2026-10-07T10:00:00.000Z",
  });
  const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  assert.match(query.get("$filter") ?? "", /contains\(name,'saved'\).*conversationstarttime ge 2026-10-01T10:00:00\.000Z.*conversationstarttime le 2026-10-07T10:00:00\.000Z/);
  assert.equal(query.get("$top"), "250");
  for (const [startedAfter, startedBefore] of [["invalid", undefined], ["2026-10-07", "2026-10-01"]] as const) {
    assert.throws(() => buildConversationListPath({ agentId: "11111111-1111-1111-1111-111111111111", startedAfter, startedBefore }), /date/i);
  }
});

test("full transcript lookup binds an exact escaped name and detects the 501st record", () => {
  const path = buildConversationTranscriptPath("11111111-1111-1111-1111-111111111111", " customer'42 ");
  const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
  assert.equal(query.get("$filter"), "_bot_conversationtranscriptid_value eq 11111111-1111-1111-1111-111111111111 and name eq 'customer''42'");
  assert.equal(query.get("$top"), "501");
  assert.equal(query.get("$filter")?.includes("contains"), false);
  assert.throws(() => buildConversationTranscriptPath("11111111-1111-1111-1111-111111111111", " "), /exact conversation ID/);
});
