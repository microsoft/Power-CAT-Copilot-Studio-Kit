import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentEvaluationSet, getAgentEvaluationSave, getEvaluationDraft, getEvaluationNativeSupport, openEvaluationBuilder } from "./tools.js";
import { compactInitialWidgetResult, getInitialWidgetData } from "../tools/initialWidgetPayload.js";
import { readCompleteToolResult } from "../widgets/shared/tool-result.js";
import { EvaluationService } from "./service.js";
import { ReviewError } from "../agent-review/server/types.js";
import { exactSelection } from "../tools/target-selection.js";

const id = "11111111-1111-4111-8111-111111111111";
const environment = { id, name: "Copilot Studio Kit - Dev", region: "test", url: "https://default.fixture.crm.dynamics.com" };
const explicitEnvironment = { ...environment, id: "22222222-2222-4222-8222-222222222222", name: "Explicit environment" };
const agent = { id: "33333333-3333-4333-8333-333333333333", name: "ZAVA Visual Merchandizer", experience: "classic" as const };
function openingFixture() {
  const calls: string[] = [];
  const current = new EvaluationService("offline-fixture", { sources: {
    listEnvironments: async () => [environment, explicitEnvironment],
    listAgents: async environmentId => { calls.push(environmentId); return [agent]; },
    resolveAgent: async (environmentId, input) => {
      calls.push(environmentId);
      return exactSelection([agent], "AGENT", input.agentId, input.agentName);
    },
    listConversations: async () => [{ id: "saved-one", name: "Saved evidence" }],
    getConversationTranscript: async (_environmentId, _agentId, conversationId) => ({ conversationId, recordCount: 1, activityCount: 2,
      records: [{ conversationtranscriptid: "record-one", content: { activities: [
        { id: "user-one", type: "message", text: "Which stores need the fall refresh?", from: { role: 1 } },
        { id: "agent-one", type: "message", text: "Stores 104 and 112.", from: { role: 0 } },
      ] } }] }),
  } });
  current.nativeContext = async () => ({ schemaPrefix: "mspva", allowMultiPair: true, components: [], read: async () => [], create: async () => { throw new Error("Opening must not create a set."); } });
  return { current, calls, factory: () => current };
}
test("named Eval startup retains the resolved target when the saved-conversation read fails", async () => {
  const fixture = openingFixture();
  fixture.current.sources.listConversations = async () => { throw new ReviewError("DATAVERSE_ERROR", "Fixture conversation read denied."); };
  const result = await openEvaluationBuilder("offline-fixture", { agentName: "zava visual merchandizer" }, fixture.factory);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.targetResolved, true);
  assert.deepEqual(result.structuredContent?.environment, environment);
  assert.deepEqual(result.structuredContent?.agent, agent);
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.match(JSON.stringify(result.structuredContent?.error), /Fixture conversation read denied/);
});
test("named Eval startup generates cases without the full agent and icon catalog or a selected conversation", async () => {
  const fixture = openingFixture();
  fixture.current.sources.listAgents = async () => {
    throw new Error("Named startup must not read the full catalog.");
  };
  const result = await openEvaluationBuilder("offline-fixture", { agentName: agent.name, mode: "select" }, fixture.factory);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.state, "generated");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(result.structuredContent?.conversationId, undefined);
  assert.equal((result.structuredContent?.draft as { cases: unknown[] }).cases.length, 1);
  assert.equal(typeof result._meta?.evaluationSaveGrant, "string");
});
test("named Eval startup uses the authorized exact default and preserves an explicit environment", async () => {
  for (const input of [
    { agentName: " zava visual merchandizer " },
    { agentName: agent.name, environmentName: explicitEnvironment.name },
  ]) {
    const fixture = openingFixture();
    const result = await openEvaluationBuilder("offline-fixture", input, fixture.factory);
    const expected = "environmentName" in input ? explicitEnvironment : environment;
    assert.equal(result.structuredContent?.state, "generated");
    assert.equal(result.structuredContent?.environmentId, expected.id);
    assert.equal(result.structuredContent?.agentId, agent.id);
    assert.ok(fixture.calls.length > 0);
    assert.ok(fixture.calls.every(call => call === expected.id), JSON.stringify(fixture.calls));
    assert.equal(result.structuredContent?.conversationId, undefined);
  }
});
test("missing or unclear Eval names show a visible reason in the generated view", async () => {
  for (const agentName of [undefined, "ZAVA", "Unavailable"]) {
    const fixture = openingFixture();
    const result = await openEvaluationBuilder("offline-fixture", { agentName }, fixture.factory);
    assert.equal(result.structuredContent?.state, "error");
    assert.equal(result.structuredContent?.targetResolved, false);
    assert.ok(result.structuredContent?.error, "A missing or unavailable name needs a visible reason.");
    assert.equal(result.structuredContent?.draft, undefined);
    assert.notEqual(result.isError, true);
  }
});
test("all evaluation boundaries reject anonymous calls before a service is constructed", async () => {
  let constructed = 0;
  const factory = () => { constructed += 1; throw new Error("An anonymous call must not construct a service."); };
  const results = await Promise.all([
    openEvaluationBuilder(undefined, { agentName: "Exact agent" }, factory),
    getEvaluationDraft(undefined, { draftId: id }, factory),
    getEvaluationNativeSupport(undefined, { draftId: id }, factory),
    createAgentEvaluationSet(undefined, { draftId: id, requestId: id, saveGrant: "x".repeat(43), name: "Anonymous fixture", method: "GeneralQualityGrader", selectedCases: [{ caseId: "dummy", expectedResponses: [""] }], confirmed: true }, factory),
    getAgentEvaluationSave(undefined, { draftId: id, requestId: id, saveGrant: "x".repeat(43) }, factory),
  ]);
  assert.equal(constructed, 0);
  for (const result of results) {
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent?.error as { code: string }).code, "AUTH_REQUIRED");
  }
});
test("complete oversized initial evaluation data is caller-bound and recovered without losing records or app-only metadata", async () => {
  const draft = { id, cases: Array.from({ length: 100 }, (_, index) => ({ id: `case-${index}`, question: "q".repeat(1000), evidence: "e".repeat(2000) })) };
  const full = { content: [], structuredContent: { view: "evaluation", state: "generated", draftId: id, draft },
    _meta: { evaluationSaveGrant: "app-only-test-grant", ui: { resourceUri: "ui://fixture/evaluation.html" } } };
  const compact = compactInitialWidgetResult(full, "open_evaluation_builder", "caller-a");
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) <= 65_536);
  assert.equal(compact.structuredContent?.draft, undefined);
  assert.ok(!JSON.stringify(compact.structuredContent).includes("app-only-test-grant"));
  const contextId = String(compact.structuredContent?.contextId);
  const recovered = await getInitialWidgetData("caller-a", { contextId });
  assert.ok(Buffer.byteLength(JSON.stringify(recovered)) <= 65_536);
  const decoded = await readCompleteToolResult(recovered, request => getInitialWidgetData("caller-a", request.arguments as { contextId: string }));
  assert.deepEqual(decoded, full);
  const denied = await getInitialWidgetData("caller-b", { contextId });
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent?.draft, undefined);
});
test("oversized environment records preserve the actual 65536-byte cap instead of only logging a warning", async () => {
  const full = { content: [], structuredContent: { state: "selecting", environments: Array.from({ length: 500 }, (_, index) => ({ id: String(index), name: "Environment".repeat(20) })) } };
  const compact = compactInitialWidgetResult(full, "open_agent_review", "caller-env");
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) <= 65_536);
  const recovered = await getInitialWidgetData("caller-env", { contextId: String(compact.structuredContent?.contextId) });
  assert.ok(Buffer.byteLength(JSON.stringify(recovered)) <= 65_536);
  const decoded = await readCompleteToolResult(recovered, request => getInitialWidgetData("caller-env", request.arguments as { contextId: string }));
  assert.deepEqual(decoded, full);
});
test("named Eval startup shows the agent's newest saved generated set instead of generating, and generates when none exists", async () => {
  const root = "44444444-4444-4444-8444-444444444444";
  const name = `${agent.name} \u2013 generated evals \u2013 2026-10-14`;
  const row = (botcomponentid: string, data: unknown, parent: string | null) => ({
    botcomponentid, name: parent ? "Generated case" : name, schemaname: `mspva_zava.evaluation.${botcomponentid.slice(0, 4)}`, componenttype: 19, statecode: 0,
    data: JSON.stringify(data), _parentbotid_value: agent.id, _parentbotcomponentid_value: parent, createdon: "2026-10-14T08:00:00Z",
  });
  const components = [
    row(root, { kind: "EvaluationSet", graders: [{ kind: "GeneralQualityGrader" }] }, null),
    row("55555555-5555-4555-8555-555555555555", { kind: "MultiTurnEvaluationCase", extensionData: { displayOrder: "0" }, activities: [
      { activity: { value: { from: { role: "user" } }, text: ["Which stores need the fall refresh?"] } },
      { activity: { value: { from: { role: "agent" } }, text: ["Stores 104 and 112."] } },
    ] }, root),
  ];
  const fixture = openingFixture();
  fixture.current.nativeContext = async () => ({ schemaPrefix: "mspva", allowMultiPair: true, components, read: async () => [], create: async () => { throw new Error("Showing a saved set must not create one."); } });
  fixture.current.generate = async () => { throw new Error("Showing a saved set must not generate one."); };
  const result = await openEvaluationBuilder("offline-fixture", { agentName: agent.name }, fixture.factory);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.state, "generated");
  const receipt = result.structuredContent?.receipt as { verified: boolean; setId: string; requestId: string };
  assert.equal(receipt.verified, true);
  assert.equal(receipt.setId, root);
  assert.equal(receipt.requestId, result.structuredContent?.draftId);
  assert.deepEqual(result.structuredContent?.existingSet, { setId: root, name, createdOn: "2026-10-14T08:00:00Z" });
  const saveGrant = result._meta?.evaluationSaveGrant;
  assert.equal(typeof saveGrant, "string");
  assert.ok(!JSON.stringify([result.content, result.structuredContent]).includes(String(saveGrant)));
  assert.deepEqual(fixture.calls, [environment.id]);
  const empty = openingFixture();
  let generated = 0;
  const generate = empty.current.generate.bind(empty.current);
  empty.current.generate = async input => { generated += 1; return generate(input); };
  const fresh = await openEvaluationBuilder("offline-fixture", { agentName: agent.name }, empty.factory);
  assert.equal(fresh.structuredContent?.state, "generated");
  assert.equal(fresh.structuredContent?.existingSet, undefined);
  assert.equal(fresh.structuredContent?.receipt, undefined);
  assert.equal(generated, 1);
});
