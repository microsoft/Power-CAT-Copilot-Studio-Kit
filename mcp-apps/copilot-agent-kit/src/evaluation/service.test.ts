import assert from "node:assert/strict";
import { test } from "node:test";
import { EvaluationService, type EvaluationSources } from "./service.js";
import { EvaluationDraftRegistry } from "./native.js";
import { guid } from "../agent-review/server/dataverse.js";
import { ReviewError } from "../agent-review/server/types.js";
import { exactSelection } from "../tools/target-selection.js";

const defaultId = guid("11111111-1111-4111-8111-111111111111");
const explicitId = guid("22222222-2222-4222-8222-222222222222");
const agentId = "33333333-3333-4333-8333-333333333333";
function fixture() {
  const calls: Array<{ method: string; environmentId: string; agentId?: string; conversationId?: string; dates?: unknown }> = [];
  const sources: EvaluationSources = {
    listEnvironments: async () => [
      { id: defaultId, name: "Copilot Studio Kit - Dev", region: "test", url: "https://default.fixture.crm.dynamics.com" },
      { id: explicitId, name: "Explicit environment", region: "test", url: "https://explicit.fixture.crm.dynamics.com" },
    ],
    listAgents: async environmentId => {
      calls.push({ method: "agents", environmentId });
      return [{ id: agentId, name: "Exact agent", schemaName: "mspva_exact", experience: "classic" }];
    },
    resolveAgent: async (environmentId, input) => {
      calls.push({ method: "target", environmentId });
      return exactSelection([{ id: agentId, name: "Exact agent", schemaName: "mspva_exact", experience: "classic" as const }],
        "AGENT", input.agentId, input.agentName);
    },
    listConversations: async (environmentId, selectedAgent, query, _limit, dates) => {
      calls.push({ method: "conversations", environmentId, agentId: selectedAgent, dates });
      return query === "belongs-elsewhere" ? [] : [{ id: query ?? "saved-one", name: query ?? "saved-one" }];
    },
    getConversationTranscript: async (environmentId, selectedAgent, conversationId) => {
      calls.push({ method: "transcript", environmentId, agentId: selectedAgent, conversationId });
      return { conversationId, recordCount: 1, activityCount: 2,
        records: [{ conversationtranscriptid: "record-one", content: { activities: [
          { id: "user-one", type: "message", text: "Question from selected conversation", from: { role: 1 } },
          { id: "agent-one", type: "message", text: "Observed response", from: { role: 0 } },
        ] } }] };
    },
  };
  return { sources, calls, service: new EvaluationService("caller", { sources, registry: new EvaluationDraftRegistry() }) };
}
test("evaluation exact name uses only the authenticated Dev default, not the review store", async () => {
  const f = fixture();
  const target = await f.service.resolveTarget({ agentName: " exact agent " });
  assert.equal(target.environment.id, defaultId);
  assert.deepEqual(f.calls, [{ method: "target", environmentId: defaultId }]);
});
test("evaluation preserves an explicit environment and never searches another one", async () => {
  const f = fixture();
  const target = await f.service.resolveTarget({ environmentId: explicitId, agentId });
  assert.equal(target.environment.id, explicitId);
  assert.deepEqual(f.calls, [{ method: "target", environmentId: explicitId }]);
});
test("evaluation does not guess missing, partial, unknown or duplicate names", async () => {
  for (const name of [undefined, "Exact", "Unknown"]) {
    const f = fixture();
    await assert.rejects(() => f.service.resolveTarget({ agentName: name }));
  }
  const f = fixture();
  f.sources.resolveAgent = async (_id, input) => exactSelection([
    { id: agentId, name: "Exact agent", experience: "classic" as const },
    { id: defaultId, name: "Exact agent", experience: "classic" as const },
  ], "AGENT", input.agentId, input.agentName);
  await assert.rejects(() => f.service.resolveTarget({ agentName: "Exact agent" }), /More than one/);
});
test("generate reads recent saved conversations without selection and returns a reviewable Conversation draft", async () => {
  const f = fixture();
  const now = Date.parse("2026-10-14T12:00:00Z");
  const output = await f.service.generate({ environmentId: explicitId, agentId }, now);
  assert.equal(output.draft.testType, "conversation");
  assert.equal(output.draft.cases.length, 1);
  assert.equal(output.draft.cases[0].turns[0].expectedResponse, "Observed response");
  assert.equal(output.draft.cases[0].expectationSource, "recorded-response");
  assert.equal(output.sampledConversations, 1);
  assert.ok(output.saveGrant.length >= 32);
  const listing = f.calls.find(call => call.method === "conversations");
  assert.deepEqual(listing?.dates, { startedAfter: "2026-07-16T12:00:00.000Z" });
});
test("generate skips unreadable transcripts but never hides sign-in failures", async () => {
  const f = fixture();
  f.sources.getConversationTranscript = async () => { throw new ReviewError("DATAVERSE_ERROR", "Transcript unavailable."); };
  const output = await f.service.generate({ environmentId: explicitId, agentId });
  assert.equal(output.draft.cases.length, 0);
  assert.equal(output.unreadableConversations, 1);
  f.sources.getConversationTranscript = async () => { throw new ReviewError("AUTH_REQUIRED", "Sign in."); };
  await assert.rejects(() => f.service.generate({ environmentId: explicitId, agentId }), /Sign in/);
});
