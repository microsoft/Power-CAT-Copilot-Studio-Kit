import assert from "node:assert/strict";
import { test } from "node:test";
import yaml from "js-yaml";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EvaluationDraftRegistry, findGeneratedSet, generatedSetPrefix, type NativeComponentListing, type NativeComponentRecord, type NativeEvaluationContext } from "./native.js";
import { EvaluationService } from "./service.js";
import { createAgentEvaluationSet, getAgentEvaluationSave, openEvaluationBuilder, updateAgentEvaluationCase } from "./tools.js";
import { ReviewError } from "../agent-review/server/types.js";
import type { EvaluationCase, EvaluationDraft, EvaluationSaveReceipt, EvaluationTarget, NativeEvaluationInput } from "./contracts.js";

const target: EvaluationTarget = {
  environment: { id: "11111111-1111-4111-8111-111111111111", name: "Selected environment", url: "https://fixture.crm.dynamics.com" },
  agent: { id: "22222222-2222-4222-8222-222222222222", name: "Selected agent", schemaName: "mspva_selected" },
};
const candidate: EvaluationCase = {
  id: "case-a", question: 'Recorded "question"', outcome: "unknown", path: [], pathKey: "unknown",
  turns: [{ question: 'Recorded "question"', observedResponse: "Never auto-approved.", expectedResponse: "", userTurnId: "user-a", assistantTurnIds: ["bot-a"] }],
  provenance: { conversationId: "conversation-a", transcriptId: "record-a", userTurnIds: ["user-a"], activityIds: ["user-a", "bot-a"] },
};

function fixture(testType: "conversation" | "single-response" = "conversation") {
  let now = 0;
  const registry = new EvaluationDraftRegistry(() => now);
  const registered = registry.register("caller-a", target, testType, [candidate]);
  let writes = 0;
  let rows: NativeComponentRecord[] = [];
  const context: NativeEvaluationContext = {
    schemaPrefix: "mspva", allowMultiPair: true,
    read: async () => structuredClone(rows),
    create: async records => { writes += 1; rows = structuredClone([...records]); },
  };
  const input: NativeEvaluationInput = {
    draftId: registered.draft.id, saveGrant: registered.saveGrant,
    requestId: "33333333-3333-4333-8333-333333333333", name: "Reviewed test set",
    method: "GeneralQualityGrader", selectedCases: [{ caseId: "case-a", expectedResponses: [""] }], confirmed: true,
  };
  return { registry, registered, context, input, writes: () => writes, rows: () => rows, setRows: (value: NativeComponentRecord[]) => { rows = value; }, advance: (value: number) => { now += value; } };
}
test("native Conversation save uses immutable IDs, correct YAML, caller target and complete exact read-back", async () => {
  const f = fixture();
  const receipt = await f.registry.save("caller-a", f.input, async () => f.context);
  assert.equal(receipt.state, "saved");
  assert.equal(receipt.verified, true);
  assert.equal(f.writes(), 1);
  assert.equal(f.rows().length, 2);
  const root = f.rows().find(row => row.botcomponentid === receipt.setId)!;
  assert.deepEqual(yaml.load(root.data), { kind: "EvaluationSet", graders: [{ kind: "GeneralQualityGrader" }] });
  const child = f.rows().find(row => row.botcomponentid !== receipt.setId)!;
  assert.equal(child._parentbotid_value, target.agent.id);
  assert.equal(child._parentbotcomponentid_value, receipt.setId);
  const data = yaml.load(child.data) as { kind: string; activities: Array<{ activity: { value: { from: { role: string } }; text: string[] } }> };
  assert.equal(data.kind, "MultiTurnEvaluationCase");
  assert.equal(data.activities.length, 2);
  assert.deepEqual(data.activities[0].activity.text, ['Recorded "question"']);
  assert.deepEqual(data.activities[1].activity.text, [""]);
  assert.doesNotMatch(child.data, /Never auto-approved/);
  assert.match(receipt.studioUrl, /\/agents\/22222222-2222-4222-8222-222222222222\/evaluate$/);
});
test("concurrent and repeated confirmations send one changeset", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => f.registry.save("caller-a", f.input, async () => f.context)));
  assert.equal(f.writes(), 1);
  assert.equal(new Set(results.map(result => result.setId)).size, 1);
});
test("changed confirmation cannot reuse the immutable request UUID", async () => {
  const f = fixture();
  await f.registry.save("caller-a", f.input, async () => f.context);
  await assert.rejects(() => f.registry.save("caller-a", { ...f.input, name: "Changed name" }, async () => f.context), /changed/i);
  assert.equal(f.writes(), 1);
});
test("other callers, wrong grants and expired drafts cannot write", async () => {
  const f = fixture();
  await assert.rejects(() => f.registry.save("caller-b", f.input, async () => f.context), /caller|unavailable|grant/i);
  await assert.rejects(() => f.registry.save("caller-a", { ...f.input, saveGrant: "wrong-grant" }, async () => f.context), /grant/i);
  f.advance(30 * 60 * 1000 + 1);
  await assert.rejects(() => f.registry.save("caller-a", f.input, async () => f.context), /expired/i);
  assert.equal(f.writes(), 0);
});
test("a stored draft is immutable even if returned objects are edited", () => {
  const f = fixture();
  f.registered.draft.target.agent.id = "99999999-9999-4999-8999-999999999999";
  f.registered.draft.cases[0].turns[0].question = "Injected question";
  const recovered = f.registry.read("caller-a", f.input.draftId).draft;
  assert.equal(recovered.target.agent.id, target.agent.id);
  assert.equal(recovered.cases[0].turns[0].question, 'Recorded "question"');
});
test("a timeout preserves IDs and exposes read-only recovery without a second write", async () => {
  const f = fixture();
  const originalCreate = f.context.create;
  f.context.create = async records => { await originalCreate(records); throw new Error("Fixture timeout after commit"); };
  const uncertain = await f.registry.save("caller-a", f.input, async () => f.context);
  assert.equal(uncertain.state, "unconfirmed");
  assert.equal(uncertain.verified, false);
  await assert.rejects(() => f.registry.save("caller-a", { ...f.input, requestId: "44444444-4444-4444-8444-444444444444" }, async () => f.context), /recover|existing/i);
  const recovered = await f.registry.recover("caller-a", f.input, async () => f.context);
  assert.equal(recovered.state, "saved");
  assert.equal(recovered.setId, uncertain.setId);
  const repeated = await f.registry.save("caller-a", f.input, async () => f.context);
  assert.equal(repeated.state, "saved");
  assert.equal(repeated.verified, true);
  assert.equal(f.writes(), 1);
});
test("partial or changed saved rows cannot report success or justify another write", async () => {
  const f = fixture();
  const originalCreate = f.context.create;
  f.context.create = async records => { await originalCreate(records); f.setRows(f.rows().slice(0, 1)); };
  const receipt = await f.registry.save("caller-a", f.input, async () => f.context);
  assert.equal(receipt.state, "unconfirmed");
  assert.match(receipt.message, /complete|match|component/i);
  const again = await f.registry.recover("caller-a", f.input, async () => f.context);
  assert.equal(again.state, "unconfirmed");
  assert.equal(f.writes(), 1);
});
test("native save never presents a Conversation component as single-response", async () => {
  const f = fixture("single-response");
  await assert.rejects(() => f.registry.save("caller-a", f.input, async () => f.context), /CSV|single.response/i);
  assert.equal(f.writes(), 0);
});
test("unsupported multi-pair target fails before the first write", async () => {
  const f = fixture();
  const multi = f.registry.register("caller-a", target, "conversation", [{ ...candidate, turns: [candidate.turns[0], { ...candidate.turns[0], userTurnId: "user-b" }] }]);
  const input = { ...f.input, ...{ draftId: multi.draft.id, saveGrant: multi.saveGrant }, selectedCases: [{ caseId: "case-a", expectedResponses: ["", ""] }] };
  f.context.allowMultiPair = false;
  await assert.rejects(() => f.registry.save("caller-a", input, async () => f.context), /harness|multi.pair|support/i);
  assert.equal(f.writes(), 0);
});
test("native save does not collapse a recorded non-alternating message sequence", async () => {
  const f = fixture();
  const item = { ...candidate, recordedMessages: [
    { role: "user" as const, text: candidate.question, turnId: "user-a" },
    { role: "assistant" as const, text: "First part", turnId: "answer-a" },
    { role: "assistant" as const, text: "Second part", turnId: "answer-b" },
  ], recordedMessageCount: 3 };
  const registered = f.registry.register("caller-a", target, "conversation", [item]);
  const input = { ...f.input, draftId: registered.draft.id, saveGrant: registered.saveGrant };
  await assert.rejects(() => f.registry.save("caller-a", input, async () => f.context), /message sequence/i);
  assert.equal(f.writes(), 0);
});

test("native save writes a reviewed question edit and keeps the immutable stored draft unchanged", async () => {
  const f = fixture();
  const input = { ...f.input, requestId: "44444444-4444-4444-8444-444444444444",
    selectedCases: [{ caseId: "case-a", expectedResponses: ["Reviewed answer"], questions: ["Edited question?"] }] };
  const receipt = await f.registry.save("caller-a", input, async () => f.context);
  assert.equal(receipt.verified, true);
  const child = f.rows().find(row => row.botcomponentid !== receipt.setId)!;
  const activities = (yaml.load(child.data) as { activities: Array<{ activity: { text: string[] } }> }).activities;
  assert.deepEqual(activities.map(entry => entry.activity.text[0]), ["Edited question?", "Reviewed answer"]);
  assert.equal(f.registry.read("caller-a", f.registered.draft.id).draft.cases[0].turns[0].question, 'Recorded "question"');
});

test("a verified saved set accepts exact inline edits and deletions, and keeps at least one case", async () => {
  const two: EvaluationCase = { ...candidate, id: "case-b", turns: [{ ...candidate.turns[0], userTurnId: "user-b" }] };
  let now = 0;
  const registry = new EvaluationDraftRegistry(() => now);
  const registered = registry.register("caller-a", target, "conversation", [candidate, two]);
  let rows: NativeComponentRecord[] = [];
  const context: NativeEvaluationContext = {
    schemaPrefix: "mspva", allowMultiPair: true,
    read: async ids => structuredClone(rows.filter(row => ids.includes(row.botcomponentid))),
    create: async records => { rows = structuredClone([...records]); },
    update: async (id, data) => { rows = rows.map(row => row.botcomponentid === id ? { ...row, data } : row); },
    remove: async id => { rows = rows.filter(row => row.botcomponentid !== id); },
  };
  const identity = { draftId: registered.draft.id, saveGrant: registered.saveGrant, requestId: "55555555-5555-4555-8555-555555555555" };
  const saved = await registry.save("caller-a", { ...identity, name: "Generated", method: "GeneralQualityGrader", confirmed: true,
    selectedCases: [{ caseId: "case-a", expectedResponses: ["Recorded"] }, { caseId: "case-b", expectedResponses: ["Recorded"] }] }, async () => context);
  assert.equal(saved.verified, true);
  const edited = await registry.updateCase("caller-a", { ...identity, caseId: "case-a", question: "Edited?", expectedResponse: "Reviewed" }, async () => context);
  assert.equal(edited.verified, true);
  const child = rows.find(row => row.botcomponentid === saved.caseIds[0])!;
  const texts = (yaml.load(child.data) as { activities: Array<{ activity: { text: string[] } }> }).activities.map(entry => entry.activity.text[0]);
  assert.deepEqual(texts, ["Edited?", "Reviewed"]);
  await assert.rejects(registry.updateCase("caller-a", { ...identity, caseId: "case-a", question: " ", expectedResponse: "x" }, async () => context), /needs a question/);
  await assert.rejects(registry.updateCase("caller-a", { ...identity, saveGrant: "x".repeat(43), caseId: "case-a", question: "q", expectedResponse: "x" }, async () => context), /grant/);
  await assert.rejects(registry.updateCase("caller-b", { ...identity, caseId: "case-a", question: "q", expectedResponse: "x" }, async () => context), /unavailable/);
  const deleted = await registry.updateCase("caller-a", { ...identity, caseId: "case-b", question: "", expectedResponse: "", remove: true }, async () => context);
  assert.equal(deleted.caseIds.length, 1);
  assert.equal(rows.length, 2);
  await assert.rejects(registry.updateCase("caller-a", { ...identity, caseId: "case-a", question: "", expectedResponse: "", remove: true }, async () => context), /at least one case/);
  void now;
});

const firstRequestId = "66666666-6666-4666-8666-666666666666";
const remountRequestId = "77777777-7777-4777-8777-777777777777";
const otherGrant = "x".repeat(43);
const failsWith = (code: string) => (error: unknown) => error instanceof ReviewError && error.code === code;
const caseTexts = (row: NativeComponentRecord | undefined) =>
  (yaml.load(row?.data ?? "") as { activities: Array<{ activity: { text: string[] } }> }).activities.map(entry => entry.activity.text[0]);

/** A two-case draft with a fake target that keeps every written row and counts each call. */
function savedSetFixture(generated: boolean) {
  const second: EvaluationCase = { ...candidate, id: "case-b", turns: [{ ...candidate.turns[0], userTurnId: "user-b" }] };
  const registry = new EvaluationDraftRegistry(() => 0);
  const registered = generated
    ? registry.register("caller-a", target, "conversation", [candidate, second], { generated: true })
    : registry.register("caller-a", target, "conversation", [candidate, second]);
  const calls = { factory: 0, create: 0, update: 0, remove: 0 };
  let rows: NativeComponentRecord[] = [];
  const context: NativeEvaluationContext = {
    schemaPrefix: "mspva", allowMultiPair: true,
    read: async ids => structuredClone(rows.filter(row => ids.includes(row.botcomponentid))),
    create: async records => { calls.create += 1; rows = [...rows, ...structuredClone([...records])]; },
    update: async (id, data) => { calls.update += 1; rows = rows.map(row => row.botcomponentid === id ? { ...row, data } : row); },
    remove: async id => { calls.remove += 1; rows = rows.filter(row => row.botcomponentid !== id); },
  };
  const identity = { draftId: registered.draft.id, saveGrant: registered.saveGrant };
  const input: NativeEvaluationInput = {
    ...identity, requestId: firstRequestId, name: "Selected agent – generated evals", method: "GeneralQualityGrader", confirmed: true,
    selectedCases: [{ caseId: "case-a", expectedResponses: ["Recorded"] }, { caseId: "case-b", expectedResponses: ["Recorded"] }],
  };
  const factory = async () => { calls.factory += 1; return context; };
  return { registry, context, factory, identity, input, calls, rows: () => rows };
}

test("a generated draft keeps one native set when a remounted app saves again with a new request ID", async () => {
  const f = savedSetFixture(true);
  const first = await f.registry.save("caller-a", f.input, f.factory);
  assert.equal(first.state, "saved");
  assert.equal(first.verified, true);
  const second = await f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, f.factory);
  assert.equal(second.state, "saved");
  assert.equal(second.requestId, firstRequestId);
  assert.equal(second.setId, first.setId);
  assert.deepEqual(second.caseIds, first.caseIds);
  assert.deepEqual(second, first);
  const renamed = await f.registry.save("caller-a", { ...f.input, requestId: "88888888-8888-4888-8888-888888888888",
    name: "Another generated name", selectedCases: [{ caseId: "case-a", expectedResponses: ["Other"] }] }, f.factory);
  assert.deepEqual(renamed, first);
  assert.equal(f.calls.create, 1);
  assert.equal(f.calls.factory, 1);
  assert.equal(f.rows().length, 3);
});

test("concurrent saves of one generated draft with different request IDs send one changeset", async () => {
  const f = savedSetFixture(true);
  const results = await Promise.all([firstRequestId, remountRequestId].map(requestId => f.registry.save("caller-a", { ...f.input, requestId }, f.factory)));
  assert.equal(f.calls.create, 1);
  assert.equal(new Set(results.map(result => result.setId)).size, 1);
  assert.deepEqual(results.map(result => [result.state, result.requestId]), [["saved", firstRequestId], ["saved", firstRequestId]]);
  assert.equal(f.rows().length, 3);
});

test("a remounted app edits and deletes cases of the first generated set with an unknown request ID and the draft grant", async () => {
  const f = savedSetFixture(true);
  const first = await f.registry.save("caller-a", f.input, f.factory);
  await f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, f.factory);
  const remounted = { ...f.identity, requestId: remountRequestId };
  const edited = await f.registry.updateCase("caller-a", { ...remounted, caseId: "case-a", question: "Edited?", expectedResponse: "Reviewed" }, f.factory);
  assert.equal(f.calls.update, 1);
  assert.equal(edited.verified, true);
  assert.equal(edited.setId, first.setId);
  assert.equal(edited.requestId, firstRequestId);
  assert.deepEqual(caseTexts(f.rows().find(row => row.botcomponentid === first.caseIds[0])), ["Edited?", "Reviewed"]);
  const change = { caseId: "case-a", question: "Changed?", expectedResponse: "Changed" };
  await assert.rejects(f.registry.updateCase("caller-a", { ...remounted, ...change, saveGrant: otherGrant }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(f.registry.updateCase("caller-a", { ...remounted, ...change, draftId: "99999999-9999-4999-8999-999999999999" }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(f.registry.updateCase("caller-b", { ...remounted, ...change }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  assert.equal(f.calls.update, 1);
  assert.equal(f.calls.factory, 2);
  assert.deepEqual(caseTexts(f.rows().find(row => row.botcomponentid === first.caseIds[0])), ["Edited?", "Reviewed"]);
  const deleted = await f.registry.updateCase("caller-a", { ...remounted, caseId: "case-b", question: "", expectedResponse: "", remove: true }, f.factory);
  assert.deepEqual(deleted.caseIds, [first.caseIds[0]]);
  assert.equal(f.calls.remove, 1);
  assert.equal(f.calls.create, 1);
  assert.equal(f.rows().length, 2);
});

test("recovery with an unknown request ID verifies the first generated set without a write", async () => {
  const f = savedSetFixture(true);
  const first = await f.registry.save("caller-a", f.input, f.factory);
  const remounted = { ...f.identity, requestId: remountRequestId };
  const recovered = await f.registry.recover("caller-a", remounted, f.factory);
  assert.equal(recovered.state, "saved");
  assert.equal(recovered.verified, true);
  assert.equal(recovered.requestId, firstRequestId);
  assert.equal(recovered.setId, first.setId);
  assert.deepEqual(recovered.caseIds, first.caseIds);
  await assert.rejects(f.registry.recover("caller-a", { ...remounted, saveGrant: otherGrant }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(f.registry.recover("caller-b", remounted, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  assert.equal(f.calls.create, 1);
});

test("a mined draft keeps classic saves: a new request ID writes a new set, and an unknown request ID cannot edit or recover", async () => {
  const f = savedSetFixture(false);
  const first = await f.registry.save("caller-a", f.input, f.factory);
  const second = await f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, f.factory);
  assert.equal(first.state, "saved");
  assert.equal(second.state, "saved");
  assert.equal(second.requestId, remountRequestId);
  assert.notEqual(second.setId, first.setId);
  assert.equal(f.calls.create, 2);
  await assert.rejects(f.registry.save("caller-a", { ...f.input, name: "Changed name" }, f.factory), failsWith("EVALUATION_REQUEST_CHANGED"));
  const unknown = { ...f.identity, requestId: "88888888-8888-4888-8888-888888888888" };
  await assert.rejects(f.registry.updateCase("caller-a", { ...unknown, caseId: "case-a", question: "q", expectedResponse: "x" }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(f.registry.recover("caller-a", unknown, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  assert.equal(f.calls.create, 2);
  assert.equal(f.calls.update, 0);
});

test("a wrong grant or another caller cannot reuse or replace an existing generated set", async () => {
  const f = savedSetFixture(true);
  await f.registry.save("caller-a", f.input, f.factory);
  await assert.rejects(f.registry.save("caller-a", { ...f.input, requestId: remountRequestId, saveGrant: otherGrant }, f.factory), failsWith("EVALUATION_INVALID_GRANT"));
  await assert.rejects(f.registry.save("caller-a", { ...f.input, saveGrant: "wrong-grant" }, f.factory), failsWith("EVALUATION_INVALID_GRANT"));
  await assert.rejects(f.registry.save("caller-b", { ...f.input, requestId: remountRequestId }, f.factory), failsWith("EVALUATION_DRAFT_UNAVAILABLE"));
  assert.equal(f.calls.create, 1);
  assert.equal(f.calls.factory, 1);
});

test("a generated save that failed before a write runs again with its first IDs for a new or the same request ID", async () => {
  const f = savedSetFixture(true);
  const read = f.context.read;
  const reads: string[][] = [];
  let throttled = true;
  f.context.read = async ids => {
    reads.push([...ids]);
    if (throttled) { throttled = false; throw new ReviewError("DATAVERSE_ERROR", "Fixture HTTP 429 before the write.", true); }
    return read(ids);
  };
  await assert.rejects(f.registry.save("caller-a", f.input, f.factory), failsWith("DATAVERSE_ERROR"));
  assert.equal(f.calls.create, 0);
  await assert.rejects(f.registry.recover("caller-a", { ...f.identity, requestId: firstRequestId }, f.factory), failsWith("EVALUATION_WRITE_NOT_ATTEMPTED"));
  await assert.rejects(f.registry.recover("caller-a", { ...f.identity, requestId: remountRequestId }, f.factory), failsWith("EVALUATION_WRITE_NOT_ATTEMPTED"));
  const retried = await f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, f.factory);
  assert.equal(retried.state, "saved");
  assert.equal(retried.verified, true);
  assert.equal(retried.requestId, firstRequestId);
  const repeated = await f.registry.save("caller-a", f.input, f.factory);
  assert.deepEqual(repeated, retried);
  assert.equal(f.calls.create, 1);
  assert.equal(retried.setId, reads[0][0]);
  assert.deepEqual(retried.caseIds, reads[0].slice(1));
  assert.deepEqual(reads, [reads[0], reads[0], reads[0]]);
  assert.equal(f.calls.factory, 2);
  assert.equal(f.rows().length, 3);
});

test("a generated save whose target always fails before a write returns the true error on each retry and sends no write", async () => {
  const f = savedSetFixture(true);
  let attempts = 0;
  const unavailable = async (): Promise<NativeEvaluationContext> => { attempts += 1; throw new ReviewError("DATAVERSE_ERROR", "Fixture HTTP 503 from the target.", true); };
  await assert.rejects(f.registry.save("caller-a", f.input, unavailable), failsWith("DATAVERSE_ERROR"));
  await assert.rejects(f.registry.save("caller-a", f.input, unavailable), failsWith("DATAVERSE_ERROR"));
  await assert.rejects(f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, unavailable), failsWith("DATAVERSE_ERROR"));
  const concurrent = await Promise.allSettled([firstRequestId, remountRequestId].map(requestId => f.registry.save("caller-a", { ...f.input, requestId }, unavailable)));
  assert.deepEqual(concurrent.map(result => result.status === "rejected" && failsWith("DATAVERSE_ERROR")(result.reason)), [true, true]);
  assert.equal(attempts, 4);
  assert.equal(f.calls.create, 0);
  assert.equal(f.rows().length, 0);
});

test("an unconfirmed generated save is returned to a remounted app, not replaced, and recovers by its request ID", async () => {
  const f = savedSetFixture(true);
  const create = f.context.create;
  f.context.create = async records => { await create(records); throw new ReviewError("DATAVERSE_TIMEOUT", "Fixture timeout after commit."); };
  const uncertain = await f.registry.save("caller-a", f.input, f.factory);
  assert.equal(uncertain.state, "unconfirmed");
  const repeated = await f.registry.save("caller-a", { ...f.input, requestId: remountRequestId }, f.factory);
  assert.deepEqual(repeated, uncertain);
  const recovered = await f.registry.recover("caller-a", { ...f.identity, requestId: remountRequestId }, f.factory);
  assert.equal(recovered.state, "saved");
  assert.equal(recovered.verified, true);
  assert.equal(recovered.setId, uncertain.setId);
  assert.equal(f.calls.create, 1);
});

test("the generate tool path keeps one set per draft", async () => {
  const environment = { id: target.environment.id, name: "Copilot Studio Kit - Dev", region: "test", url: "https://fixture.crm.dynamics.com" };
  const agent = { id: target.agent.id, name: target.agent.name, schemaName: target.agent.schemaName, experience: "classic" as const };
  const service = new EvaluationService("caller-a", { registry: new EvaluationDraftRegistry(), sources: {
    listEnvironments: async () => [environment],
    listAgents: async () => [agent],
    resolveAgent: async () => agent,
    listConversations: async (_environmentId, _agentId, query) => [{ id: query || "saved-one", name: "Saved conversation" }],
    getConversationTranscript: async (_environmentId, _agentId, conversationId) => ({ conversationId, recordCount: 1, activityCount: 2,
      records: [{ conversationtranscriptid: "record-one", content: { activities: [
        { id: "user-one", type: "message", text: "Which stores need the fall refresh?", from: { role: 1 } },
        { id: "agent-one", type: "message", text: "Stores 104 and 112.", from: { role: 0 } },
      ] } }] }),
  } });
  let creates = 0;
  let rows: NativeComponentRecord[] = [];
  service.nativeContext = async () => ({
    schemaPrefix: "mspva", allowMultiPair: true,
    read: async ids => structuredClone(rows.filter(row => ids.includes(row.botcomponentid))),
    create: async records => { creates += 1; rows = [...rows, ...structuredClone([...records])]; },
    update: async (id, data) => { rows = rows.map(row => row.botcomponentid === id ? { ...row, data } : row); },
  });
  const receiptOf = (result: CallToolResult) => result.structuredContent?.receipt as EvaluationSaveReceipt;
  const saveTwice = async (opened: CallToolResult, requestIds: [string, string]) => {
    const draft = opened.structuredContent?.draft as EvaluationDraft;
    const identity = { draftId: draft.id, saveGrant: String(opened._meta?.evaluationSaveGrant) };
    const selectedCases = draft.cases.map(item => ({ caseId: item.id, expectedResponses: item.turns.map(turn => turn.expectedResponse) }));
    const save = (requestId: string) => createAgentEvaluationSet("caller-a", { ...identity, requestId, name: "Fixture set", method: "GeneralQualityGrader", selectedCases, confirmed: true }, () => service);
    return { draft, identity, first: await save(requestIds[0]), second: await save(requestIds[1]) };
  };
  const generated = await saveTwice(await openEvaluationBuilder("caller-a", { agentName: agent.name, mode: "generate" }, () => service), [firstRequestId, remountRequestId]);
  assert.equal(creates, 1);
  assert.deepEqual(Object.keys(generated.first.structuredContent ?? {}), ["view", "state", "receipt"]);
  assert.deepEqual(generated.second, generated.first);
  assert.equal(receiptOf(generated.first).requestId, firstRequestId);
  const remounted = { ...generated.identity, requestId: remountRequestId };
  const edited = await updateAgentEvaluationCase("caller-a", { ...remounted, caseId: generated.draft.cases[0].id, question: "Edited?", expectedResponse: "Reviewed" }, () => service);
  assert.equal(edited.isError, undefined);
  assert.equal(receiptOf(edited).setId, receiptOf(generated.first).setId);
  const checked = await getAgentEvaluationSave("caller-a", remounted, () => service);
  assert.equal(receiptOf(checked).state, "saved");
  assert.equal(receiptOf(checked).setId, receiptOf(generated.first).setId);
});

const generatedName = (day: string) => `Selected agent – generated evals – ${day}`;
const savedRootRow = (id: string, name: string, createdon: string | null, changes: Partial<NativeComponentListing> = {}): NativeComponentListing => ({
  botcomponentid: id, name, schemaname: `mspva_selected.evaluationset.${id.slice(-4)}`, componenttype: 19, statecode: 0,
  data: yaml.dump({ kind: "EvaluationSet", graders: [{ kind: "GeneralQualityGrader" }] }),
  _parentbotid_value: target.agent.id, _parentbotcomponentid_value: null, createdon, ...changes,
});
const savedCaseRow = (id: string, parent: string, question: string, expected: string, displayOrder?: string | number, changes: Partial<NativeComponentListing> = {}): NativeComponentListing => ({
  botcomponentid: id, name: `Case ${id.slice(-4)}`, schemaname: `mspva_selected.evaluationcase.${id.slice(-4)}`, componenttype: 19, statecode: 0,
  data: yaml.dump({ kind: "MultiTurnEvaluationCase", source: "Manual", activities: [
    { activity: { value: { from: { role: "user" } }, text: [question] } },
    { activity: { value: { from: { role: "agent" } }, text: [expected] } },
  ], ...(displayOrder === undefined ? {} : { extensionData: { displayOrder } }) }),
  _parentbotid_value: target.agent.id, _parentbotcomponentid_value: parent, createdon: "2026-10-14T09:00:00Z", ...changes,
});
const shownRoot = "a0000000-0000-4000-8000-000000000002";
/** Newer rows that must not be shown: other names, a hyphen, an inactive root and a root without cases. */
const savedListing = (): NativeComponentListing[] => [
  savedRootRow("a0000000-0000-4000-8000-000000000001", generatedName("2026-10-10"), "2026-10-10T08:00:00Z"),
  savedCaseRow("c0000000-0000-4000-8000-000000000009", "a0000000-0000-4000-8000-000000000001", "Older question?", "Older answer.", "0"),
  savedRootRow(shownRoot.toUpperCase(), generatedName("2026-10-14"), "2026-10-14T08:00:00Z"),
  savedCaseRow("C0000000-0000-4000-8000-000000000001", shownRoot.toUpperCase(), "Third question?", "Third answer.", "10"),
  savedCaseRow("c0000000-0000-4000-8000-000000000002", shownRoot, "Second question?", "Second answer.", "2"),
  savedCaseRow("c0000000-0000-4000-8000-000000000003", shownRoot, "First question?", "First answer.", 0),
  savedCaseRow("c0000000-0000-4000-8000-000000000004", shownRoot, "Inactive question?", "Inactive answer.", "1", { statecode: 1 }),
  { ...savedCaseRow("c0000000-0000-4000-8000-000000000005", shownRoot, "q", "a", "1"), data: yaml.dump({ kind: "SingleTurnEvaluationCase" }) },
  savedRootRow("a0000000-0000-4000-8000-000000000003", "Selected agent - generated evals - 2026-10-15", "2026-10-15T08:00:00Z"),
  savedCaseRow("c0000000-0000-4000-8000-000000000006", "a0000000-0000-4000-8000-000000000003", "Hyphen?", "Hyphen.", "0"),
  savedRootRow("a0000000-0000-4000-8000-000000000004", "Selected agent 2 – generated evals – 2026-10-16", "2026-10-16T08:00:00Z"),
  savedCaseRow("c0000000-0000-4000-8000-000000000007", "a0000000-0000-4000-8000-000000000004", "Other agent?", "Other.", "0"),
  savedRootRow("a0000000-0000-4000-8000-000000000005", generatedName("2026-10-17"), "2026-10-17T08:00:00Z"),
  savedRootRow("a0000000-0000-4000-8000-000000000006", generatedName("2026-10-18"), "2026-10-18T08:00:00Z", { statecode: 1 }),
  savedCaseRow("c0000000-0000-4000-8000-000000000008", "a0000000-0000-4000-8000-000000000006", "Inactive set?", "Inactive.", "0"),
];

test("the newest saved generated set is found by its en-dash name prefix, with cases in saved display order", () => {
  assert.equal(generatedSetPrefix("Selected agent"), "Selected agent \u2013 generated evals");
  const found = findGeneratedSet(savedListing(), target.agent.name);
  assert.ok(found);
  assert.equal(found.root.botcomponentid, shownRoot);
  assert.equal(found.root.name, generatedName("2026-10-14"));
  assert.equal(found.createdOn, "2026-10-14T08:00:00Z");
  assert.equal(found.method, "GeneralQualityGrader");
  assert.equal("createdon" in found.root, false);
  assert.deepEqual(found.cases.map(item => item.record.botcomponentid),
    ["c0000000-0000-4000-8000-000000000003", "c0000000-0000-4000-8000-000000000002", "c0000000-0000-4000-8000-000000000001"]);
  assert.deepEqual(found.cases.map(item => item.turns.map(turn => [turn.question, turn.expectedResponse])),
    [[["First question?", "First answer."]], [["Second question?", "Second answer."]], [["Third question?", "Third answer."]]]);
  assert.ok(found.cases.every(item => item.record._parentbotcomponentid_value === shownRoot));
  assert.equal(findGeneratedSet(savedListing(), "Other agent"), undefined);
  assert.equal(findGeneratedSet(savedListing().filter(row => row.name !== generatedName("2026-10-14") && row.name !== generatedName("2026-10-10")), target.agent.name), undefined);
  const exact = savedListing().map(row => row.botcomponentid === shownRoot.toUpperCase() ? { ...row, data: yaml.dump({ kind: "EvaluationSet", graders: [{ kind: "ExactMatchGrader" }] }) } : row);
  assert.equal(findGeneratedSet(exact, target.agent.name)?.method, "ExactMatchGrader");
});

test("an adopted generated set is shown without a write, and only its caller edits and deletes its cases", async () => {
  const f = savedSetFixture(true);
  const first = await f.registry.save("caller-a", f.input, f.factory);
  const found = findGeneratedSet(f.rows().map(row => ({ ...row, createdon: "2026-10-14T08:00:00Z" })), target.agent.name);
  assert.ok(found);
  assert.equal(found.root.botcomponentid, first.setId);
  assert.deepEqual(found.cases.map(item => item.record.botcomponentid), first.caseIds);
  const registry = new EvaluationDraftRegistry(() => 0);
  const other = { ...target, agent: { ...target.agent, id: "99999999-9999-4999-8999-999999999999" } };
  assert.throws(() => registry.adopt("caller-a", other, found), failsWith("EVALUATION_TARGET_CHANGED"));
  const adopted = registry.adopt("caller-a", target, found);
  assert.equal(adopted.receipt.state, "saved");
  assert.equal(adopted.receipt.verified, true);
  assert.equal(adopted.receipt.requestId, adopted.draft.id);
  assert.equal(adopted.receipt.setId, first.setId);
  assert.deepEqual(adopted.receipt.caseIds, first.caseIds);
  assert.deepEqual(adopted.draft.cases.map(item => [item.id, item.question, item.turns[0].expectedResponse]),
    first.caseIds.map(caseId => [caseId, 'Recorded "question"', "Recorded"]));
  assert.ok(adopted.draft.cases.every(item => !("expectationSource" in item)));
  const identity = { draftId: adopted.draft.id, saveGrant: adopted.saveGrant, requestId: adopted.draft.id };
  const selectedCases = adopted.draft.cases.map(item => ({ caseId: item.id, expectedResponses: ["Recorded"] }));
  const repeated = await registry.save("caller-a", { ...identity, requestId: remountRequestId, name: found.root.name, method: "GeneralQualityGrader", selectedCases, confirmed: true }, f.factory);
  assert.deepEqual(repeated, adopted.receipt);
  const [caseA, caseB] = adopted.draft.cases.map(item => item.id);
  const change = { caseId: caseA, question: "Edited?", expectedResponse: "Reviewed" };
  await assert.rejects(registry.updateCase("caller-b", { ...identity, ...change }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(registry.updateCase("caller-a", { ...identity, ...change, saveGrant: otherGrant }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  await assert.rejects(registry.updateCase("caller-b", { ...identity, caseId: caseB, question: "", expectedResponse: "", remove: true }, f.factory), failsWith("EVALUATION_SAVE_UNAVAILABLE"));
  assert.equal(f.calls.update + f.calls.remove, 0);
  const edited = await registry.updateCase("caller-a", { ...identity, ...change }, f.factory);
  assert.equal(edited.verified, true);
  assert.equal(edited.setId, first.setId);
  assert.deepEqual(caseTexts(f.rows().find(row => row.botcomponentid === caseA)), ["Edited?", "Reviewed"]);
  const deleted = await registry.updateCase("caller-a", { ...identity, caseId: caseB, question: "", expectedResponse: "", remove: true }, f.factory);
  assert.deepEqual(deleted.caseIds, [caseA]);
  assert.deepEqual([f.calls.create, f.calls.update, f.calls.remove], [1, 1, 1]);
  assert.deepEqual(f.rows().map(row => row.botcomponentid), [first.setId, caseA]);
});

test("a generated save creates no second set while a matching generated set exists; a mined save is unchanged", async () => {
  const generated = savedSetFixture(true);
  generated.context.components = savedListing();
  await assert.rejects(generated.registry.save("caller-a", generated.input, generated.factory), failsWith("EVALUATION_GENERATED_SET_EXISTS"));
  assert.equal(generated.calls.create, 0);
  generated.context.components = savedListing().filter(row => !row.name.startsWith(generatedSetPrefix(target.agent.name)) && row._parentbotcomponentid_value === null);
  assert.equal((await generated.registry.save("caller-a", generated.input, generated.factory)).state, "saved");
  assert.equal(generated.calls.create, 1);
  const mined = savedSetFixture(false);
  mined.context.components = savedListing();
  assert.equal((await mined.registry.save("caller-a", mined.input, mined.factory)).state, "saved");
  assert.equal(mined.calls.create, 1);
});

test("Eval Builder shows the newest saved generated set without generating or saving, and generates only when none exists", async () => {
  const environment = { id: target.environment.id, name: "Copilot Studio Kit - Dev", region: "test", url: "https://fixture.crm.dynamics.com" };
  const agent = { id: target.agent.id, name: target.agent.name, schemaName: target.agent.schemaName, experience: "classic" as const };
  const reads = { conversations: 0 };
  const service = new EvaluationService("caller-a", { registry: new EvaluationDraftRegistry(), sources: {
    listEnvironments: async () => [environment],
    listAgents: async () => [agent],
    resolveAgent: async () => agent,
    listConversations: async () => { reads.conversations += 1; return []; },
    getConversationTranscript: async () => { throw new Error("Showing a saved set must not read a transcript."); },
  } });
  const calls = { create: 0, update: 0, remove: 0 };
  let rows: NativeComponentListing[] = savedListing();
  const records = () => rows.map(({ createdon, ...row }) => { void createdon; return row; });
  service.nativeContext = async () => ({
    schemaPrefix: "mspva", allowMultiPair: true, components: structuredClone(rows),
    read: async ids => structuredClone(records().filter(row => ids.includes(row.botcomponentid.toLowerCase()))),
    create: async () => { calls.create += 1; },
    update: async (id, data) => { calls.update += 1; rows = rows.map(row => row.botcomponentid.toLowerCase() === id ? { ...row, data } : row); },
    remove: async id => { calls.remove += 1; rows = rows.filter(row => row.botcomponentid.toLowerCase() !== id); },
  });
  const opened = await openEvaluationBuilder("caller-a", { agentName: agent.name }, () => service);
  assert.equal(opened.isError, undefined);
  const shown = opened.structuredContent as { state: string; draftId: string; draft: EvaluationDraft; receipt: EvaluationSaveReceipt; existingSet: unknown; studioUrl: string; candidateCount: number };
  assert.equal(shown.state, "generated");
  assert.equal(shown.draftId, shown.draft.id);
  assert.equal(shown.receipt.verified, true);
  assert.equal(shown.receipt.requestId, shown.draft.id);
  assert.equal(shown.receipt.setId, shownRoot);
  assert.equal(shown.studioUrl, shown.receipt.studioUrl);
  assert.equal(shown.candidateCount, 3);
  assert.deepEqual(shown.existingSet, { setId: shownRoot, name: generatedName("2026-10-14"), createdOn: "2026-10-14T08:00:00Z" });
  assert.deepEqual(shown.draft.cases.map(item => item.question), ["First question?", "Second question?", "Third question?"]);
  const saveGrant = String(opened._meta?.evaluationSaveGrant);
  assert.ok(saveGrant.length >= 43);
  assert.ok(!JSON.stringify(opened.content).includes(saveGrant));
  assert.ok(!JSON.stringify(opened.structuredContent).includes(saveGrant));
  assert.match(JSON.stringify(opened.content), /3 saved test cases of the existing generated set/);
  assert.deepEqual([reads.conversations, calls.create], [0, 0]);
  const identity = { draftId: shown.draft.id, saveGrant, requestId: shown.draft.id };
  const selectedCases = shown.draft.cases.map(item => ({ caseId: item.id, expectedResponses: item.turns.map(turn => turn.expectedResponse) }));
  const saved = await createAgentEvaluationSet("caller-a", { ...identity, name: generatedName("2026-10-14"), method: "GeneralQualityGrader", selectedCases, confirmed: true }, () => service);
  assert.deepEqual(saved.structuredContent?.receipt, shown.receipt);
  const edited = await updateAgentEvaluationCase("caller-a", { ...identity, caseId: shown.draft.cases[0].id, question: "Edited?", expectedResponse: "Reviewed" }, () => service);
  assert.equal(edited.isError, undefined);
  assert.deepEqual(caseTexts(rows.find(row => row.botcomponentid === "c0000000-0000-4000-8000-000000000003")), ["Edited?", "Reviewed"]);
  const deleted = await updateAgentEvaluationCase("caller-a", { ...identity, caseId: shown.draft.cases[2].id, question: "", expectedResponse: "", remove: true }, () => service);
  assert.equal(deleted.isError, undefined);
  assert.deepEqual((deleted.structuredContent?.receipt as EvaluationSaveReceipt).caseIds, shown.draft.cases.slice(0, 2).map(item => item.id));
  assert.deepEqual([calls.create, calls.update, calls.remove, reads.conversations], [0, 1, 1, 0]);
  rows = savedListing().filter(row => !row.name.startsWith(generatedSetPrefix(agent.name)));
  const generated = await openEvaluationBuilder("caller-a", { agentName: agent.name }, () => service);
  assert.equal(generated.structuredContent?.state, "generated");
  assert.equal(generated.structuredContent?.existingSet, undefined);
  assert.equal(generated.structuredContent?.receipt, undefined);
  assert.equal(reads.conversations, 1);
  const inspect = service.nativeContext;
  let inspections = 0;
  service.nativeContext = async current => {
    inspections += 1;
    if (inspections === 1) throw new ReviewError("DATAVERSE_ERROR", "Fixture HTTP 503 while listing sets.", true);
    return inspect(current);
  };
  rows = savedListing();
  service.sources.listConversations = async () => { reads.conversations += 1; return [{ id: "saved-one", name: "Saved conversation" }]; };
  service.sources.getConversationTranscript = async (_environmentId, _agentId, conversationId) => ({ conversationId, recordCount: 1, activityCount: 2,
    records: [{ conversationtranscriptid: "record-one", content: { activities: [
      { id: "user-one", type: "message", text: "Which stores need the fall refresh?", from: { role: 1 } },
      { id: "agent-one", type: "message", text: "Stores 104 and 112.", from: { role: 0 } },
    ] } }] });
  const fallback = await openEvaluationBuilder("caller-a", { agentName: agent.name }, () => service);
  assert.equal(fallback.structuredContent?.state, "generated");
  assert.equal(fallback.structuredContent?.receipt, undefined);
  const fresh = fallback.structuredContent?.draft as EvaluationDraft;
  assert.ok(fresh.cases.length > 0);
  const duplicate = await createAgentEvaluationSet("caller-a", { draftId: fresh.id, saveGrant: String(fallback._meta?.evaluationSaveGrant), requestId: fresh.id,
    name: generatedName("2026-10-19"), method: "GeneralQualityGrader", confirmed: true,
    selectedCases: fresh.cases.map(item => ({ caseId: item.id, expectedResponses: item.turns.map(turn => turn.expectedResponse) })) }, () => service);
  assert.equal(duplicate.isError, true);
  assert.equal((duplicate.structuredContent?.error as { code: string }).code, "EVALUATION_GENERATED_SET_EXISTS");
  assert.deepEqual([calls.create, reads.conversations], [0, 2]);
  service.nativeContext = async () => { throw new ReviewError("AUTH_REQUIRED", "Fixture sign-in expired."); };
  const expired = await openEvaluationBuilder("caller-a", { agentName: agent.name }, () => service);
  assert.equal(expired.isError, true);
  assert.equal((expired.structuredContent?.error as { code: string }).code, "AUTH_REQUIRED");
  assert.equal(reads.conversations, 2);
  assert.equal(calls.create, 0);
});
