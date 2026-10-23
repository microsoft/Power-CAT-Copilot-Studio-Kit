import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { JSON_SCHEMA, load } from "js-yaml";
import {
  composeReview, parseAgentsExperience, parseFinalizationSnapshot, prepareReview, readWorkflowResults,
  isStandardTopicComponent,
  type Guid, type PreparedReview, type ReviewJobItemRow,
} from "../core/index.js";
import { buildDeterministicAgentMap } from "../../agent-map/builder.js";
import { openAgentReview, startAgentReview } from "../../tools/review-tools.js";
import { DataverseClient } from "./dataverse.js";
import { AgentReviewService } from "./service.js";
import { lifecycleRules } from "../core/services/rules/lifecycleRules.js";

const targetId = "11111111-1111-4111-8111-111111111111";
const homeId = "99999999-9999-4999-8999-999999999999";
const agentId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const topicId = "66666666-6666-4666-8666-666666666666";
const topicVersion = "77777777-7777-4777-8777-777777777777";
const jobId = "44444444-4444-4444-8444-444444444444";
const reviewId = "55555555-5555-4555-8555-555555555555";
const agentName = "Offline Standard agent";
const configuration = JSON.stringify({ settings: { GenerativeActionsEnabled: true } });
const topicKinds = ["AdaptiveDialog", "TaskDialog", "AgentDialog"] as const;
type TopicKind = typeof topicKinds[number];

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  return value.map(record);
}

function sourceComponent(kind: TopicKind | "InlineAgentSkill" | "ConnectorTool", id = topicId) {
  const uniqueId = id === topicId ? topicVersion : id;
  const document = kind === "AdaptiveDialog" ? {
    kind,
    beginDialog: {
      kind: "OnRecognizedIntent", id: "main",
      intent: { triggerQueries: ["Prepare the offline report"] },
      actions: [{
        kind: "ConditionGroup", id: "condition_one",
        conditions: [{
          id: "branch_one", condition: "=Topic.RequestApproved",
          actions: [{ kind: "SendActivity", id: "send_one", activity: "Complete original topic text." }],
        }],
        elseActions: [{ kind: "SendActivity", id: "send_two", activity: "Ask for the missing approval." }],
      }],
    },
  } : kind === "TaskDialog" ? {
    kind, modelDisplayName: "Read the offline report",
    modelDescription: "Read the exact approved offline report.",
    inputs: [{ kind: "AutomaticTaskInput", propertyName: "ReportId", shouldPromptUser: true }],
    outputs: [{ propertyName: "Response" }],
    action: {
      kind: "InvokeConnectorTaskAction", connectionReference: "offline_reference",
      connectionProperties: { mode: "Invoker" }, operationId: "ReadReport",
    },
    outputMode: "All",
  } : kind === "AgentDialog" ? {
    kind,
    beginDialog: { kind: "OnToolSelected", id: "main", description: "Handle approved offline report questions." },
    settings: { instructions: "Read the complete report. Ask for approval before any write." },
    inputType: { properties: { ReportId: { type: "String", description: "The original report ID." } } },
    outputType: { properties: { Report: { type: "String" } } },
  } : kind === "InlineAgentSkill" ? {
    kind, content: "---\nname: offline-skill\ndescription: Use for a careful offline calculation.\n---\n# Calculate\nRead the complete report.",
  } : { kind, displayName: "ReadReport", description: "Read one approved report.", connectionReference: "offline_reference" };
  return {
    botcomponentid: id, botid: agentId, componentidunique: uniqueId,
    name: kind === "InlineAgentSkill" ? "offline-skill" : "Original component",
    schemaname: `offline.${kind}.${id}`, componenttype: "9",
    data: JSON.stringify(document), content: "",
  };
}

function fixture(context: TestContext, components = [sourceComponent("AdaptiveDialog")], config = configuration) {
  const token = `standard-local-${randomUUID()}`;
  const suffix = randomUUID().replaceAll("-", "");
  const target = new URL(`https://target${suffix}.crm.dynamics.com/`);
  const home = new URL(`https://home${suffix}.crm.dynamics.com/`);
  const calls: Array<{ operation: string; relative: string; body?: unknown }> = [];
  let corpus: Record<string, unknown> | undefined;
  let savedRecord: Record<string, unknown> | undefined;
  let jobCorrelation: string | undefined;
  let rows: ReviewJobItemRow[] = [];
  let status = 3;
  const environments = [
    { EnvironmentId: targetId, FriendlyName: "Copilot Studio Kit - Dev", ApiUrl: target.href },
    { EnvironmentId: homeId, FriendlyName: "Separate offline store", ApiUrl: home.href },
  ];
  for (const [key, value] of Object.entries({
    AGENT_KIT_HOME_ENVIRONMENT_ID: homeId, ENTRA_CLIENT_ID: "local-only-client",
    ENTRA_CLIENT_SECRET: "local-only-not-a-credential", ENTRA_TENANT_ID: "local-only-tenant",
    DATAVERSE_GLOBAL_DISCOVERY_URL: "https://globaldisco.crm.dynamics.com",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    context.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "login.microsoftonline.com") return Response.json({ access_token: "local-only-access" });
    if (url.hostname === "globaldisco.crm.dynamics.com") return Response.json({ value: environments });
    throw new Error(`Unexpected network request in the local Standard regression: ${url.href}`);
  });
  context.mock.method(DataverseClient.prototype, "entitySet", async (logicalName: string) => {
    const sets: Record<string, string> = {
      cat_agentreviewjob: "fixture_jobs", cat_agentreviewjobitem: "fixture_items", cat_agentreviews: "fixture_reviews",
    };
    assert.ok(sets[logicalName]);
    return sets[logicalName];
  });
  context.mock.method(DataverseClient.prototype, "list", async (relative: string) => {
    calls.push({ operation: "list", relative });
    if (relative.startsWith("bots?")) return [{
      botid: agentId, name: agentName, componentidunique: versionId, configuration: config,
    }];
    if (relative.startsWith("botcomponents?")) return components.map(component => ({
      ...component, componenttype: Number(component.componenttype),
    }));
    if (relative.startsWith("fixture_items?")) return rows;
    if (relative.startsWith("fixture_reviews?")) return [];
    throw new Error(`Unexpected local list: ${relative}`);
  });
  context.mock.method(DataverseClient.prototype, "get", async (relative: string) => {
    calls.push({ operation: "get", relative });
    if (relative.startsWith(`fixture_jobs(${jobId})`)) return {
      cat_agentreviewjobid: jobId, cat_correlationid: jobCorrelation,
      cat_jobstatus: status, cat_componentcount: records(corpus?.components).length,
      cat_botid: agentId, cat_botname: agentName,
      createdon: new Date().toISOString(), modifiedon: new Date().toISOString(),
      cat_errormessage: status === 4 ? "One local evaluator failed." : null,
    };
    if (relative.startsWith(`fixture_reviews(${reviewId})`)) {
      assert.ok(savedRecord);
      return savedRecord;
    }
    throw new Error(`Unexpected local get: ${relative}`);
  });
  context.mock.method(DataverseClient.prototype, "create", async (relative: string, body: unknown) => {
    calls.push({ operation: "create", relative, body });
    if (relative === "fixture_reviews") {
      savedRecord = record(body);
      return { id: reviewId };
    }
    assert.equal(relative, "fixture_jobs");
    jobCorrelation = String(record(body).cat_correlationid);
    return { id: jobId };
  });
  context.mock.method(DataverseClient.prototype, "upload", async (relative: string, bytes: Uint8Array) => {
    calls.push({ operation: "upload", relative });
    corpus = record(JSON.parse(new TextDecoder().decode(bytes)));
  });
  context.mock.method(DataverseClient.prototype, "update", async (relative: string, body: unknown) => {
    calls.push({ operation: "update", relative, body });
  });
  context.mock.method(DataverseClient.prototype, "download", async (relative: string) => {
    calls.push({ operation: "download", relative });
    assert.equal(relative, `fixture_jobs(${jobId})/cat_inputfile/$value`);
    return new TextEncoder().encode(JSON.stringify(corpus));
  });
  return {
    token, calls, components,
    get corpus() { assert.ok(corpus); return corpus; },
    get savedRecord() { assert.ok(savedRecord); return savedRecord; },
    setRows(value: ReviewJobItemRow[]) { rows = value; },
    failJob() { status = 4; },
  };
}

function topicOutput(component: ReturnType<typeof sourceComponent>, kind: TopicKind, overrides: Record<string, unknown> = {}) {
  const actionPath = kind === "AdaptiveDialog" ? "/beginDialog/actions/0/conditions/0/actions/0"
    : kind === "TaskDialog" ? "/action" : undefined;
  const evidence = kind === "AdaptiveDialog" ? "Complete original topic text."
    : kind === "TaskDialog" ? "ReadReport" : "Ask for approval before any write.";
  return {
    evaluationType: "StandardTopic", contractVersion: 1,
    inputHash: createHash("sha256").update(component.data).digest("hex"),
    componentId: component.botcomponentid, componentIdUnique: component.componentidunique,
    componentKind: kind, componentSchemaName: component.schemaname,
    status: "complete", summary: "The original Standard component was evaluated.",
    findings: [{
      ruleId: "TOP-01", severity: "warning", evidence, confidence: "high",
      ...(actionPath ? { actionPath } : {}),
    }],
    ...overrides,
  };
}

function scheduledOutput(
  state: ReturnType<typeof fixture>, component: ReturnType<typeof sourceComponent>,
  kind: TopicKind, overrides: Record<string, unknown> = {},
) {
  const input = records(state.corpus.components).find(item => item.componentIdUnique === component.componentidunique);
  assert.ok(input);
  return topicOutput(component, kind, { inputHash: input.inputHash, ...overrides });
}

function preparedOutput(
  prepared: PreparedReview, component: ReturnType<typeof sourceComponent>,
  kind: TopicKind, overrides: Record<string, unknown> = {},
) {
  const input = prepared.corpus.components.find(item =>
    isStandardTopicComponent(item) && item.componentIdUnique === component.componentidunique);
  assert.ok(input && isStandardTopicComponent(input));
  return topicOutput(component, kind, { inputHash: input.inputHash, ...overrides });
}

function resultRow(output: unknown, index = 0): ReviewJobItemRow {
  return {
    cat_agentreviewjobitemid: randomUUID(), cat_componentindex: index,
    cat_itemstatus: 1, cat_skillname: "Original component", cat_resultjson: JSON.stringify(output),
    createdon: new Date().toISOString(),
  };
}

async function preparedSource(components = [sourceComponent("AdaptiveDialog")], config = configuration): Promise<PreparedReview> {
  return prepareReview({
    botId: agentId as Guid, botName: agentName, componentIdUnique: versionId as Guid,
    sourceEnvironmentId: targetId as Guid, sourceEnvironmentName: "Offline target",
    startedAt: "2026-10-10T00:00:00.000Z",
  }, { configuration: config, components, resources: [] }, {
    clock: { now: () => new Date("2026-10-10T00:01:00.000Z") },
    ids: { randomUUID: () => jobId as Guid },
    hash: { sha256: async bytes => createHash("sha256").update(bytes).digest("hex") },
  });
}

function normalizeRows(prepared: PreparedReview, rows: ReviewJobItemRow[]) {
  return readWorkflowResults({
    job: {
      jobId: jobId as Guid, correlationId: prepared.correlationId, status: "succeeded",
      completedAt: "2026-10-10T00:02:00.000Z", errorMessage: null,
    },
    rows, snapshot: prepared.corpus.finalizationSnapshot, missingAiStagePolicy: "unavailable",
  }, { hash: { sha256: async bytes => createHash("sha256").update(bytes).digest("hex") } });
}

for (const kind of topicKinds) {
  test(`named Standard ${kind} uploads the complete original component instead of an empty skill corpus`, async context => {
    const component = sourceComponent(kind);
    const state = fixture(context, [component]);
    const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(result.structuredContent?.state, "running");
    const uploaded = records(state.corpus.components);
    assert.equal(uploaded.length, 1, "NAMED_STANDARD_REVIEW_TOPIC_CONTENT_LOSS: the selected component was not scheduled.");
    assert.equal(uploaded[0].kind, kind);
    assert.equal(uploaded[0].evaluationType, "StandardTopic");
    assert.equal(uploaded[0].componentId, component.botcomponentid);
    assert.equal(uploaded[0].componentIdUnique, component.componentidunique);
    assert.deepEqual(uploaded[0].document, JSON.parse(component.data));
    assert.equal(uploaded[0].sourceText, component.data);
    assert.equal(uploaded[0].skill_markdown, undefined, "Standard content must not be relabeled as a skill.");
    assert.equal(state.calls.filter(call => call.operation === "create").length, 1);
    assert.equal(state.calls.filter(call => call.operation === "upload").length, 1);
    assert.equal(state.calls.filter(call => call.operation === "update").length, 1);
  });

  test(`real preparation and saved ${kind} Map retain original component and action identities`, async () => {
    const component = sourceComponent(kind);
    const prepared = await prepareReview({
      botId: agentId as Guid, botName: agentName, componentIdUnique: versionId as Guid,
      sourceEnvironmentId: targetId as Guid, sourceEnvironmentName: "Offline target",
      startedAt: "2026-10-10T00:00:00.000Z",
    }, { configuration, components: [component], resources: [] }, {
      clock: { now: () => new Date("2026-10-10T00:01:00.000Z") },
      ids: { randomUUID: () => jobId as Guid },
      hash: { sha256: async bytes => createHash("sha256").update(bytes).digest("hex") },
    });
    assert.equal(prepared.componentCount, 1, "The real prepare boundary must retain Standard content.");
    const snapshot = prepared.corpus.finalizationSnapshot;
    const topics = records(record(snapshot.model).topics);
    assert.equal(topics.length, 1);
    assert.deepEqual(topics[0].document, JSON.parse(component.data));
    const map = buildDeterministicAgentMap({
      agentId, agentName, environmentId: targetId, environmentName: "Offline target",
      model: snapshot.model, corpusComponents: prepared.corpus.components,
    });
    const topic = map.nodes.find(node => node.componentIdUnique === topicVersion && node.category !== "agent");
    assert.ok(topic, "The saved model must be sufficient to draw the reviewed Standard graph.");
    assert.equal(topic.subtitle, kind);
    assert.ok(Object.values(topic.details).some(value => typeof value === "string" && value.includes(kind)));
    if (kind === "AdaptiveDialog") {
      const actions = records(topics[0].actions);
      assert.deepEqual(actions.map(action => action.id), ["condition_one", "send_one", "send_two"]);
      assert.equal(map.nodes.filter(node => node.parentId === topic.id).length, actions.length);
    }
    if (kind === "TaskDialog") {
      const actions = records(topics[0].actions);
      assert.equal(actions.length, 1);
      assert.equal(actions[0].path, "/action");
      assert.equal(actions[0].kind, "InvokeConnectorTaskAction");
    }
  });

  test(`${kind} evaluator results reach full saved findings and read-only reopen`, async context => {
    const component = sourceComponent(kind);
    const state = fixture(context, [component]);
    const first = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(first.structuredContent?.state, "running");
    state.setRows([resultRow(scheduledOutput(state, component, kind))]);
    const service = new AgentReviewService(state.token);
    const finalized = await service.finalize(jobId);
    assert.equal(finalized.reviewId, reviewId);
    const stored = record(JSON.parse(String(state.savedRecord.cat_reviewresultjson)));
    const payload = record(stored.agentsExperience);
    const topics = records(record(payload.model).topics);
    assert.equal(topics.length, 1, "The saved model must not drop the reviewed Standard component.");
    const findings = records(payload.findings).filter(finding => finding.id === "TOP-01");
    assert.equal(findings.length, 1, "The Standard evaluator must not be parsed by the skill result contract.");
    assert.equal(findings[0].componentIdUnique, topicVersion);
    assert.ok(findings[0].evidence);
    assert.ok(findings[0].why);
    assert.ok(findings[0].fix);
    assert.ok(records(findings[0].fixSteps).length);
    assert.ok(Array.isArray(findings[0].referenceIds) && findings[0].referenceIds.length);
    const before = state.calls.length;
    const reopened = await service.getResult(reviewId);
    assert.equal(reopened.model.agentMap?.state, "ready");
    assert.equal(reopened.model.findings.filter(finding => finding.id === "TOP-01").length, 1);
    assert.ok(state.calls.slice(before).every(call => call.operation === "get" && !/bots|botcomponents/.test(call.relative)));
    const creates = state.calls.filter(call => call.operation === "create" && call.relative === "fixture_jobs").length;
    const savedOpen = await openAgentReview(state.token, { reviewId });
    assert.notEqual(savedOpen.isError, true);
    assert.equal(state.calls.filter(call => call.operation === "create" && call.relative === "fixture_jobs").length, creates);
  });
}

test("manual and named mixed-component Standard Review retain topics and the existing skill contract", async context => {
  const components = [
    sourceComponent("AdaptiveDialog"),
    sourceComponent("TaskDialog", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    sourceComponent("AgentDialog", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    sourceComponent("InlineAgentSkill", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    sourceComponent("ConnectorTool", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
  ];
  const state = fixture(context, components);
  const result = await startAgentReview(state.token, {
    environmentId: targetId, agentId, componentIdUnique: versionId,
    projectName: "Local Standard mixed Review", confirmed: true,
  });
  assert.equal(result.structuredContent?.state, "running");
  const uploaded = records(state.corpus.components);
  assert.equal(uploaded.length, 4, "All reviewable mixed components must reach their own evaluator contract.");
  assert.deepEqual(uploaded.filter(component => component.evaluationType === "StandardTopic").map(component => component.kind),
    [...topicKinds]);
  const skill = uploaded.find(component => component.kind === "InlineAgentSkill");
  assert.ok(skill);
  assert.match(String(skill.skill_markdown), /offline-skill/);
  const topics = records(record(record(state.corpus.finalizationSnapshot).model).topics);
  assert.equal(topics.length, 3);
});

for (const malformed of [
  { name: "malformed Standard YAML", component: { ...sourceComponent("AdaptiveDialog"), data: "kind: AdaptiveDialog\nbeginDialog: [" } },
  { name: "unsupported reviewable kind", component: { ...sourceComponent("AdaptiveDialog"), data: JSON.stringify({ kind: "FutureDialog", payload: "Do not silently drop me." }) } },
  { name: "TaskDialog without an executable action", component: { ...sourceComponent("TaskDialog"), data: JSON.stringify({ kind: "TaskDialog", modelDescription: "Missing action." }) } },
]) {
  test(`${malformed.name} reports an explicit prepare error before any job write`, async context => {
    const state = fixture(context, [malformed.component]);
    const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent?.state, "selecting");
    assert.match(String(record(result.structuredContent?.error).code), /INVALID_SOURCE|UNSUPPORTED_COMPONENT/);
    assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
  });
}

test("wrong Standard evaluator component identity cannot attach findings to a different topic", async context => {
  const component = sourceComponent("AdaptiveDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "AdaptiveDialog", { componentIdUnique: versionId }))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  assert.equal(records(payload.findings).filter(finding => finding.id === "TOP-01").length, 0);
  const reviews = records(payload.topicReviews);
  assert.equal(reviews[0].status, "unavailable");
  assert.match(String(reviews[0].reason), /identity/i);
});

test("ungrounded Standard evidence and unknown action paths remain visible as validation failures", async context => {
  const component = sourceComponent("AdaptiveDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "AdaptiveDialog", {
    findings: [
      { ruleId: "TOP-01", severity: "warning", evidence: "Invented evidence.", confidence: "high" },
      { ruleId: "TOP-01", severity: "warning", evidence: "Complete original topic text.", actionPath: "/missing", confidence: "high" },
    ],
  }))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  assert.equal(records(payload.findings).filter(finding => finding.id === "TOP-01").length, 0);
  const review = records(payload.topicReviews)[0];
  assert.equal(review.status, "partial");
  assert.ok(Array.isArray(review.validationIssues) && review.validationIssues.length === 2);
});

test("missing Standard results are not presented as completed topic evaluation", async context => {
  const state = fixture(context, [sourceComponent("AgentDialog")]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  await new AgentReviewService(state.token).finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  const review = records(payload.topicReviews)[0];
  assert.equal(review.status, "unavailable");
  assert.match(String(review.reason), /missing/i);
  assert.equal(record(payload.score).status, "partial");
});

test("Standard agent metadata and component description survive the real source and saved boundaries", async context => {
  const component = { ...sourceComponent("AgentDialog"), description: "The complete component-column description." };
  const metadata = {
    ...sourceComponent("AgentDialog", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
    data: "kind: GptComponentMetadata\ninstructions: Read every approved topic before acting.\naISettings:\n  model:\n    modelNameHint: GPT5Chat\n",
  };
  const state = fixture(context, [metadata, component]);
  const opened = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(opened.structuredContent?.state, "running");
  const snapshot = record(state.corpus.finalizationSnapshot);
  assert.equal(record(record(snapshot.model).agentSettings).instructions, "Read every approved topic before acting.");
  assert.equal(records(record(snapshot.model).topics)[0].description, component.description);
  assert.equal(records(state.corpus.components)[0].agent_instructions, "Read every approved topic before acting.");
});

test("a stale Standard source hash is not accepted for the reviewed topic", async context => {
  const component = sourceComponent("TaskDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog", { inputHash: "0".repeat(64) }))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  assert.equal(records(payload.findings).filter(finding => finding.id === "TOP-01").length, 0);
  assert.equal(records(payload.topicReviews)[0].status, "unavailable");
});

test("Standard findings keep exact action attribution and complete long source evidence", async context => {
  const original = sourceComponent("TaskDialog");
  const document = record(JSON.parse(original.data));
  const evidence = "Read the complete approved report and preserve every original input and output. ".repeat(8);
  record(document.action).description = evidence;
  const component = { ...original, data: JSON.stringify(document) };
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog", {
    findings: [{ ruleId: "TOP-01", severity: "warning", evidence, confidence: "high", actionPath: "/action" }],
  }))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  const finding = records(payload.findings).find(item => item.id === "TOP-01");
  assert.ok(finding);
  assert.equal(finding.actionPath, "/action");
  assert.equal(finding.evidence, evidence, "Standard evidence must not be silently truncated to the old skill evidence limit.");
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  const viewFinding = record(reopened.model.findings.find(item => item.id === "TOP-01"));
  assert.equal(viewFinding.actionPath, "/action");
  assert.equal(viewFinding.fact, evidence);
});

test("failed Standard jobs without a valid evaluator result are not silently saved", async context => {
  const state = fixture(context, [sourceComponent("AgentDialog")]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.failJob();
  await assert.rejects(new AgentReviewService(state.token).finalize(jobId), /not ready to finalize|One local evaluator failed/);
  assert.equal(state.calls.filter(call => call.operation === "create" && call.relative === "fixture_reviews").length, 0);
});

for (const kind of topicKinds) {
  test(`licensed public ${kind} YAML survives named preparation, finalization and saved reopen`, async context => {
    const data = readFileSync(new URL(`fixtures/standard/${kind}.yml`, import.meta.url), "utf8");
    const component = { ...sourceComponent(kind), data };
    const state = fixture(context, [component]);
    const opened = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(opened.structuredContent?.state, "running");
    assert.equal(records(state.corpus.components)[0].sourceText, data);
    assert.deepEqual(records(state.corpus.components)[0].document, load(data, { schema: JSON_SCHEMA }));
    const evidence = kind === "AdaptiveDialog" ? "You're welcome."
      : kind === "TaskDialog" ? "<OperationId>" : "Be concise and clear in your responses";
    const actionPath = kind === "AdaptiveDialog" ? "/beginDialog/actions/0" : kind === "TaskDialog" ? "/action" : undefined;
    state.setRows([resultRow(scheduledOutput(state, component, kind, {
      findings: [{ ruleId: "TOP-03", severity: "warning", evidence, confidence: "high", ...(actionPath ? { actionPath } : {}) }],
    }))]);
    await new AgentReviewService(state.token).finalize(jobId);
    const reopened = await new AgentReviewService(state.token).getResult(reviewId);
    assert.equal(reopened.model.findings.find(finding => finding.id === "TOP-03")?.fact, evidence);
    assert.equal(reopened.model.skills.length, 0);
    assert.equal(reopened.model.topicReviews?.[0].status, "complete");
  });
}

for (const kind of ["AdaptiveDialog", "TaskDialog"] as const) {
  test(`${kind} retains embedded card and schema actions without treating them as dialog actions`, async context => {
    const original = sourceComponent(kind);
    const document = record(JSON.parse(original.data));
    document.inputType = { properties: { actions: { type: "String" } } };
    if (kind === "AdaptiveDialog") {
      record(document.beginDialog).actions = [{
        kind: "AdaptiveCardPrompt", id: "original_card",
        card: { type: "AdaptiveCard", actions: [{ type: "Action.Submit", title: "Keep the original card" }] },
      }];
    }
    const component = { ...original, data: JSON.stringify(document) };
    const state = fixture(context, [component]);
    const opened = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(opened.structuredContent?.state, "running");
    const scheduled = records(state.corpus.components)[0];
    assert.deepEqual(scheduled.document, document);
    assert.equal(records(scheduled.actions).length, 1);
  });
}

const duplicateAction = sourceComponent("AdaptiveDialog");
const duplicateDocument = record(JSON.parse(duplicateAction.data));
record(duplicateDocument.beginDialog).actions = [
  { kind: "SendActivity", id: "same_id", activity: "First complete action." },
  { kind: "SendActivity", id: "same_id", activity: "Second complete action." },
];
const badBranches = sourceComponent("AdaptiveDialog");
const badBranchDocument = record(JSON.parse(badBranches.data));
record(badBranchDocument.beginDialog).actions = [{ kind: "ConditionGroup", id: "bad_branch", conditions: "not-an-array" }];

for (const invalid of [
  { name: "unpaired component GUID braces", components: [{ ...sourceComponent("TaskDialog"), botcomponentid: `{${topicId}` }] },
  { name: "duplicate component unique IDs", components: [
    sourceComponent("TaskDialog"), { ...sourceComponent("AgentDialog", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), componentidunique: topicVersion },
  ] },
  { name: "duplicate component IDs", components: [
    sourceComponent("TaskDialog"), { ...sourceComponent("AgentDialog"), componentidunique: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ] },
  { name: "a Standard topic colliding with a skill identity", components: [sourceComponent("TaskDialog"), sourceComponent("InlineAgentSkill")] },
  { name: "duplicate authored action IDs", components: [{ ...duplicateAction, data: JSON.stringify(duplicateDocument) }] },
  { name: "malformed conditional branches", components: [{ ...badBranches, data: JSON.stringify(badBranchDocument) }] },
  { name: "missing reviewable source", components: [{ ...sourceComponent("TaskDialog"), data: "", content: "" }] },
]) {
  test(`${invalid.name} fails before create, upload or queue`, async context => {
    const state = fixture(context, invalid.components);
    const opened = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(opened.isError, true);
    assert.equal(record(opened.structuredContent?.error).code, "INVALID_SOURCE");
    assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
  });
}

const originalCopilotLifecycle = [
  {
    id: "LCY-01", title: "This agent runs on the GitHub Copilot harness",
    fact: "bot.configuration contains agentSettings",
    why: "The GitHub Copilot and standard harnesses expose different capabilities, and an agent cannot be moved between them.",
    fix: "Check the harness comparison before you depend on a capability the standard harness provides.",
  },
  {
    id: "LCY-02", title: "Agent composition",
    fact: "0 tools · 1 skills · 0 connected agents · 0 knowledge sources · 0 evaluation sets",
    why: "A GitHub Copilot agent is organized around instructions, knowledge, tools, skills, model, and connected agents.",
    fix: "No action required — surfaced for the review record.",
  },
];

function standardLifecycle(topics: number, actions: number, skills = 0) {
  return [
    {
      id: "LCY-01", title: "This agent runs on the Standard harness",
      fact: 'The reviewed model records harness="standard".',
      why: "The Standard and GitHub Copilot harnesses expose different capabilities. The review worker does not determine the target harness.",
      fix: "Check the harness comparison for Standard target capabilities, not the inline review worker.",
    },
    {
      id: "LCY-02", title: "Agent composition",
      fact: `${topics} Standard topics · ${actions} executable actions · 0 tools · ${skills} skills · 0 connected agents · 0 knowledge sources · 0 evaluation sets`,
      why: "A Standard agent uses its retained topics and executable actions alongside instructions, knowledge, tools, skills, and connected agents.",
      fix: "No action required — surfaced for the review record.",
    },
  ];
}

function lifecycleDetail(findings: unknown, id: string) {
  const finding = records(findings).find(item => item.id === id);
  assert.ok(finding, `The complete ${id} finding is missing.`);
  return {
    id: finding.id, title: finding.title, fact: finding.fact, why: finding.why, fix: finding.fix,
  };
}

async function lifecycleBoundaries(
  context: TestContext, components: ReturnType<typeof sourceComponent>[], config: string,
  expected: ReturnType<typeof standardLifecycle>[number],
) {
  const state = fixture(context, components, config);
  const opened = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(opened.structuredContent?.state, "running");
  const snapshot = record(state.corpus.finalizationSnapshot);
  assert.deepEqual(lifecycleDetail(record(snapshot.deterministic).findings, expected.id), expected);
  const rows = records(state.corpus.components).map((input, index) => {
    if (input.evaluationType === "StandardTopic") {
      const component = components.find(item => item.componentidunique === input.componentIdUnique);
      assert.ok(component);
      const kind = input.kind;
      assert.ok(kind === "AdaptiveDialog" || kind === "TaskDialog" || kind === "AgentDialog");
      return resultRow(scheduledOutput(state, component, kind), index);
    }
    return resultRow({
      skillName: "offline-skill", status: "complete", dimensions: [], findings: [],
      summary: "The retained original Copilot skill output.",
    }, index);
  });
  state.setRows(rows);
  const service = new AgentReviewService(state.token);
  await service.finalize(jobId);
  const payload = record(record(JSON.parse(String(state.savedRecord.cat_reviewresultjson))).agentsExperience);
  assert.deepEqual(lifecycleDetail(payload.findings, expected.id), expected);
  for (const value of [record(snapshot.deterministic).ruleResults, payload.ruleResults]) {
    const outcome = records(value).find(item => item.ruleId === expected.id);
    assert.ok(outcome);
    assert.equal(outcome.kind, "record");
    assert.equal(outcome.status, "info", "Correct lifecycle facts must not change scoring outcomes.");
  }
  const before = state.calls.length;
  const reopened = await service.getResult(reviewId);
  assert.deepEqual(lifecycleDetail(reopened.model.findings, expected.id), expected);
  assert.equal(record(reopened.model.summary).harness, record(snapshot.model).harness,
    "The saved overview must use the retained target harness, not the review worker.");
  const savedOpen = await openAgentReview(state.token, { reviewId });
  assert.deepEqual(lifecycleDetail(record(savedOpen.structuredContent?.model).findings, expected.id), expected);
  assert.equal(record(record(savedOpen.structuredContent?.model).summary).harness, record(snapshot.model).harness);
  assert.ok(state.calls.slice(before).every(call => call.operation === "get" && !/bots|botcomponents/.test(call.relative)));
  return { state, snapshot, payload, reopened };
}

for (const kind of topicKinds) {
  const actions = kind === "AdaptiveDialog" ? 3 : kind === "TaskDialog" ? 1 : 0;
  for (const expected of standardLifecycle(1, actions)) {
    test(`named Standard ${kind} ${expected.id} facts stay correct through preparation, finalization and saved reopen`, async context => {
      const component = sourceComponent(kind);
      const { snapshot } = await lifecycleBoundaries(context, [component], configuration, expected);
      const model = record(snapshot.model);
      assert.equal(model.harness, "standard");
      assert.equal(records(model.topics)[0].kind, kind);
      assert.equal(records(records(model.topics)[0].actions).length, actions);
    });
  }
}

for (const expected of standardLifecycle(3, 4, 1)) {
  test(`mixed Standard topics and skills keep complete ${expected.id} facts at every saved boundary`, async context => {
    const components = [
      sourceComponent("AdaptiveDialog"),
      sourceComponent("TaskDialog", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      sourceComponent("AgentDialog", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      sourceComponent("InlineAgentSkill", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    ];
    const { snapshot, payload } = await lifecycleBoundaries(context, components, configuration, expected);
    const model = record(snapshot.model);
    assert.deepEqual(records(model.topics).map(topic => topic.kind), [...topicKinds]);
    assert.equal(records(model.skills).length, 1);
    assert.equal(records(payload.topicReviews).length, 3);
  });
}

for (const expected of originalCopilotLifecycle) {
  test(`Copilot and older no-harness snapshots retain the original ${expected.id} result text`, async context => {
    const { snapshot } = await lifecycleBoundaries(context, [sourceComponent("InlineAgentSkill")],
      '{"agentSettings":{"instructions":"Use the original offline skill."}}', expected);
    assert.equal(record(snapshot.model).harness, undefined);
    assert.equal(record(snapshot.model).topics, undefined);
  });
}

test("explicit Copilot lifecycle facts equal the unchanged older no-harness output", () => {
  const model = parseAgentsExperience('{"agentSettings":{"instructions":"Use the original offline skill."}}',
    [sourceComponent("InlineAgentSkill")]);
  const explicit = { ...model, harness: "copilot" as const };
  for (const expected of originalCopilotLifecycle) {
    const rule = lifecycleRules.find(item => item.id === expected.id);
    assert.ok(rule);
    assert.deepEqual(lifecycleDetail([rule.check(explicit)], expected.id), expected);
    assert.deepEqual(lifecycleDetail([rule.check(model)], expected.id), expected);
  }
});

test("saved reopen returns historical lifecycle text unchanged without current-target reads or writes", async context => {
  const component = sourceComponent("TaskDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog"))]);
  const service = new AgentReviewService(state.token);
  await service.finalize(jobId);
  const stored = record(JSON.parse(String(state.savedRecord.cat_reviewresultjson)));
  const payload = record(stored.agentsExperience);
  assert.equal(record(payload.model).harness, "standard");
  for (const historical of originalCopilotLifecycle) {
    const finding = records(payload.findings).find(item => item.id === historical.id);
    assert.ok(finding);
    Object.assign(finding, historical);
  }
  state.savedRecord.cat_reviewresultjson = JSON.stringify(stored);
  const originalJson = state.savedRecord.cat_reviewresultjson;
  const before = state.calls.length;
  const reopened = await service.getResult(reviewId);
  for (const historical of originalCopilotLifecycle) {
    assert.deepEqual(lifecycleDetail(reopened.model.findings, historical.id), historical);
  }
  assert.equal(state.savedRecord.cat_reviewresultjson, originalJson);
  assert.ok(state.calls.slice(before).every(call => call.operation === "get" && !/bots|botcomponents/.test(call.relative)));
});

test("the component-index range includes index 999 without truncation", async () => {
  const components = Array.from({ length: 1000 }, (_, index) => ({
    ...sourceComponent("AgentDialog", `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    data: '{"kind":"AgentDialog","beginDialog":{"kind":"OnToolSelected"},"settings":{"instructions":"Keep."}}',
  }));
  const prepared = await preparedSource(components);
  assert.equal(prepared.componentCount, 1000);
  assert.equal(prepared.corpus.components[999].componentIndex, 999);
  assert.equal(prepared.corpus.finalizationSnapshot.model.topics?.length, 1000);
  await assert.rejects(preparedSource([...components, sourceComponent("TaskDialog")]), /result-index range/);
});

for (const mutation of [
  { name: "wrong component ID", output: { componentId: agentId } },
  { name: "wrong original kind", output: { componentKind: "TaskDialog" } },
  { name: "wrong original schema", output: { componentSchemaName: "another.schema" } },
  { name: "stale input hash", output: { inputHash: "0".repeat(64) } },
  { name: "unsupported evaluator contract", output: { evaluationType: "OtherEvaluator" } },
  { name: "failed result row", row: { cat_itemstatus: 2 as const } },
  { name: "wrong available row correlation", row: { cat_correlationid: versionId } },
  { name: "wrong available row component ID", row: { cat_componentid: agentId } },
]) {
  test(`newer ${mutation.name} cannot displace an older usable Standard result`, async () => {
    const component = sourceComponent("AdaptiveDialog");
    const prepared = await preparedSource([component]);
    const older = { ...resultRow(preparedOutput(prepared, component, "AdaptiveDialog")), createdon: "2026-10-10T00:02:00.000Z" };
    const newer = {
      ...resultRow(preparedOutput(prepared, component, "AdaptiveDialog", mutation.output)),
      createdon: "2026-10-10T00:03:00.000Z", ...mutation.row,
    };
    const results = await normalizeRows(prepared, [older, newer]);
    assert.equal(results.topicResults?.[0].status, "complete");
    assert.equal(results.topicResults?.[0].findings.length, 1);
    assert.ok(results.rejectedRows.some(row => row.itemId === newer.cat_agentreviewjobitemid));
  });
}

test("unknown Standard result indices are rejected rather than silently ignored", async () => {
  const component = sourceComponent("TaskDialog");
  const prepared = await preparedSource([component]);
  const wrong = resultRow(preparedOutput(prepared, component, "TaskDialog"), 7);
  const results = await normalizeRows(prepared, [wrong]);
  assert.equal(results.topicResults?.[0].status, "unavailable");
  assert.ok(results.rejectedRows.some(row => row.itemId === wrong.cat_agentreviewjobitemid));
});

test("Standard partial results retain all valid findings and explicit invalid-finding diagnostics", async context => {
  const component = sourceComponent("TaskDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  const valid = { ruleId: "TOP-02", severity: "error", evidence: "ReadReport", confidence: "high", actionPath: "/action" };
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog", {
    status: "partial", findings: [
      valid, { ...valid, ruleId: "TOP-99" }, { ...valid, severity: "fatal" },
    ],
  }))]);
  state.failJob();
  await new AgentReviewService(state.token).finalize(jobId);
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(reopened.model.findings.filter(finding => finding.family === "Topics").length, 1);
  assert.equal(reopened.model.topicReviews?.[0].status, "partial");
  assert.equal(reopened.model.topicReviews?.[0].validationIssues.length, 2);
  assert.equal(reopened.model.summary.scoreStatus, "partial");
});

test("existing Copilot metadata remains inventoried and never creates a Standard topic", () => {
  const metadata = { ...sourceComponent("TaskDialog"), data: "kind: GptComponentMetadata\ninstructions: Public Standard metadata." };
  const parsed = parseAgentsExperience('{"agentSettings":{"instructions":"Keep the existing Copilot instructions."}}', [metadata]);
  assert.equal(parsed.agentSettings.instructions, "Keep the existing Copilot instructions.");
  assert.equal(parsed.topics, undefined);
  assert.equal(parsed.unknownKinds[0]?.kind, "GptComponentMetadata");
});

test("read-only Standard Map inventories unsupported components without applying the job-write guard", async context => {
  const component = { ...sourceComponent("AdaptiveDialog"), data: "kind: FutureDialog\ncontent: Retain this unsupported component." };
  const state = fixture(context, [component]);
  const graph = await new AgentReviewService(state.token).getAgentMap(targetId, agentId, versionId);
  assert.ok(graph.nodes.some(node => node.category === "unknown" && node.componentIdUnique === topicVersion));
  assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
});

test("a real named Standard request pending in upload and same-job resume never create another job", async context => {
  const state = fixture(context, [sourceComponent("TaskDialog")]);
  let release!: () => void;
  let entered!: () => void;
  const uploadEntered = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const originalUpload = DataverseClient.prototype.upload;
  context.mock.method(DataverseClient.prototype, "upload", async function (
    this: DataverseClient, ...args: Parameters<DataverseClient["upload"]>
  ) {
    entered();
    await wait;
    return originalUpload.apply(this, args);
  });
  const requestId = randomUUID();
  const first = openAgentReview(state.token, { agentName, startReview: true, requestId });
  await uploadEntered;
  const pending = openAgentReview(state.token, { agentName, startReview: true, requestId });
  assert.equal(state.calls.filter(call => call.operation === "create" && call.relative === "fixture_jobs").length, 1);
  release();
  assert.equal((await first).structuredContent?.state, "running");
  assert.equal((await pending).structuredContent?.jobId, jobId);
  assert.equal((await openAgentReview(state.token, { agentName, startReview: true, requestId })).structuredContent?.jobId, jobId);
  assert.equal(record((await openAgentReview(state.token, { jobId })).structuredContent?.status).jobId, jobId);
  assert.equal(state.calls.filter(call => call.operation === "create" && call.relative === "fixture_jobs").length, 1);
});

test("the Standard input hash binds original description, component content, agent instructions and capabilities", async () => {
  const component = sourceComponent("TaskDialog");
  const original = await preparedSource([component]);
  const hashes = [original.corpus.finalizationSnapshot.topics?.[0].inputHash];
  for (const changed of [
    { components: [{ ...component, description: "A different original description." }] },
    { components: [{ ...component, content: "A different original component content." }] },
    { components: [
      component, { ...sourceComponent("AgentDialog", versionId), data: "kind: GptComponentMetadata\ninstructions: Different original instructions." },
    ] },
    { components: [component, sourceComponent("ConnectorTool", versionId)] },
  ]) {
    const prepared = await preparedSource(changed.components);
    hashes.push(prepared.corpus.finalizationSnapshot.topics?.[0].inputHash);
  }
  assert.equal(new Set(hashes).size, hashes.length, "All evaluator context must be bound, not sourceText alone.");
});

test("complete separate component content can ground a component-level Standard finding", async context => {
  const component = { ...sourceComponent("TaskDialog"), content: "Keep the original separate task content." };
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog", {
    findings: [{ ruleId: "TOP-04", severity: "warning", evidence: component.content, confidence: "high" }],
  }))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(reopened.model.findings.find(finding => finding.id === "TOP-04")?.fact, component.content);
});

test("unbalanced result GUIDs do not match a balanced original Standard identity", async () => {
  const component = sourceComponent("TaskDialog");
  const prepared = await preparedSource([component]);
  const wrong = resultRow(preparedOutput(prepared, component, "TaskDialog", { componentId: `{${topicId}` }));
  const results = await normalizeRows(prepared, [wrong]);
  assert.equal(results.topicResults?.[0].status, "unavailable");
  assert.equal(results.rejectedRows.length, 1);
});

for (const change of [
  { name: "missing topic index", edit: (snapshot: Record<string, unknown>) => { delete snapshot.topics; } },
  { name: "duplicate topic index", edit: (snapshot: Record<string, unknown>) => { snapshot.topics = [records(snapshot.topics)[0], records(snapshot.topics)[0]]; } },
  { name: "out-of-range topic index", edit: (snapshot: Record<string, unknown>) => { records(snapshot.topics)[0].componentIndex = 1000; } },
  { name: "malformed topic source hash", edit: (snapshot: Record<string, unknown>) => { records(snapshot.topics)[0].inputHash = "not-a-hash"; } },
  { name: "changed retained topic source", edit: (snapshot: Record<string, unknown>) => { records(record(snapshot.model).topics)[0].sourceText = "kind: TaskDialog\naction:\n  kind: Changed"; } },
  { name: "changed retained action inventory", edit: (snapshot: Record<string, unknown>) => { records(record(snapshot.model).topics)[0].actions = []; } },
  { name: "changed retained instructions", edit: (snapshot: Record<string, unknown>) => { record(record(snapshot.model).agentSettings).instructions = "Changed evaluator context."; } },
]) {
  test(`${change.name} fails finalization before any saved-record write`, async context => {
    const component = sourceComponent("TaskDialog");
    const state = fixture(context, [component]);
    await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog"))]);
    change.edit(record(state.corpus.finalizationSnapshot));
    await assert.rejects(new AgentReviewService(state.token).finalize(jobId), /snapshot|corpus/i);
    assert.equal(state.calls.filter(call =>
      ["create", "update"].includes(call.operation) && call.relative.startsWith("fixture_reviews")).length, 0);
  });
}

test("older Copilot snapshots without componentIndex retain numeric-index evaluation and saved reopen", async context => {
  const component = sourceComponent("InlineAgentSkill");
  const state = fixture(context, [component], '{"agentSettings":{"instructions":"Use the original offline skill."}}');
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  const snapshot = record(state.corpus.finalizationSnapshot);
  delete record(records(snapshot.bundles)[0].corpusComponent).componentIndex;
  assert.deepEqual(parseFinalizationSnapshot(snapshot), snapshot);
  state.setRows([resultRow({
    skillName: "offline-skill", status: "complete", dimensions: [], findings: [],
    summary: "The original Copilot skill result.",
  })]);
  await new AgentReviewService(state.token).finalize(jobId);
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(reopened.model.skills.length, 1);
  assert.equal(reopened.model.skills[0].evaluationState, "evaluated");
});

test("mixed Standard topics and Copilot skills finalize with independent evaluator results", async context => {
  const component = sourceComponent("TaskDialog");
  const skill = sourceComponent("InlineAgentSkill", "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  const state = fixture(context, [component, skill]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([
    resultRow({ skillName: "offline-skill", status: "complete", dimensions: [], findings: [], summary: "The original skill evaluation." }),
    resultRow(scheduledOutput(state, component, "TaskDialog"), 1),
    { ...resultRow({ skillName: "Wrong later skill-shaped result", dimensions: [], findings: [] }, 1), createdon: "2099-01-01T00:00:00.000Z" },
  ]);
  await new AgentReviewService(state.token).finalize(jobId);
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(reopened.model.skills.length, 1);
  assert.equal(reopened.model.skills[0].evaluationState, "evaluated");
  assert.equal(reopened.model.topicReviews?.[0].status, "complete");
  assert.equal(reopened.model.findings.filter(finding => finding.family === "Topics").length, 1);
});

test("a complete Standard result beyond the persistence budget fails explicitly without a saved-record write", async context => {
  const component = sourceComponent("TaskDialog");
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog", { summary: "x".repeat(950_000) }))]);
  await assert.rejects(new AgentReviewService(state.token).finalize(jobId), /persistence limit/i);
  assert.equal(state.calls.filter(call => call.operation === "create" && call.relative === "fixture_reviews").length, 0);
});

test("the saved Standard findings keep duplicate rules and complete explanation, correction, steps and references", async () => {
  const component = sourceComponent("TaskDialog");
  const prepared = await preparedSource([component]);
  const findings = ["TOP-01", "TOP-02", "TOP-03", "TOP-04", "TOP-01"].map((ruleId, index) => ({
    ruleId, severity: "warning", evidence: "ReadReport", confidence: "high", actionPath: "/action",
    rationale: `Keep complete explanation ${index}. `.repeat(30),
  }));
  const workflow = await normalizeRows(prepared, [resultRow(preparedOutput(prepared, component, "TaskDialog", { findings }))]);
  const completed = await composeReview({ snapshot: prepared.corpus.finalizationSnapshot, workflow });
  const saved = completed.persisted.payload.topicReviews?.[0];
  assert.equal(saved?.findings.length, 5);
  assert.equal(completed.persisted.payload.findings.filter(finding => finding.family === "Topics").length, 5);
  for (const [index, finding] of (saved?.findings ?? []).entries()) {
    assert.ok(finding.why.includes(findings[index].rationale));
    assert.ok(finding.fix && finding.recommendation && finding.fixSteps.length && finding.referenceIds.length);
    assert.equal(finding.actionPath, "/action");
  }
});

test("Standard source redaction preserves the complete safe source and the finalization input hash", async context => {
  const original = sourceComponent("TaskDialog");
  const document = record(JSON.parse(original.data));
  record(document.action).description = "password='offline-fixture-value' Keep this complete safe action description.";
  const component = { ...original, data: JSON.stringify(document), name: "password='offline-fixture-name' Original task" };
  const state = fixture(context, [component]);
  await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.ok(!JSON.stringify(state.corpus).includes("offline-fixture-value"));
  state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog"))]);
  await new AgentReviewService(state.token).finalize(jobId);
  const reopened = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(reopened.model.topicReviews?.[0].status, "complete");
  assert.ok(JSON.stringify(reopened.model.agentMap).includes("Keep this complete safe action description."));
});

for (const format of ["json", "yaml"] as const) {
  test(`Standard ${format} source keeps safe text and parses after quoted-secret redaction`, async context => {
    const original = sourceComponent("TaskDialog");
    const description = 'password="offline-quoted-value" Keep every safe quoted-source character.';
    const document = record(JSON.parse(original.data));
    record(document.action).description = description;
    const data = format === "json" ? JSON.stringify(document) : [
      "kind: TaskDialog", "action:", "  kind: InvokeConnectorTaskAction",
      "  operationId: ReadReport", `  description: '${description}'`,
    ].join("\n");
    const component = { ...original, data };
    const state = fixture(context, [component]);
    const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    assert.equal(result.structuredContent?.state, "running");
    assert.ok(!JSON.stringify(state.corpus).includes("offline-quoted-value"));
    const input = records(state.corpus.components)[0];
    assert.deepEqual(load(String(input.sourceText), { schema: JSON_SCHEMA }), input.document);
    state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog"))]);
    await new AgentReviewService(state.token).finalize(jobId);
    const reopened = await new AgentReviewService(state.token).getResult(reviewId);
    assert.equal(reopened.model.topicReviews?.[0].status, "complete");
    assert.ok(JSON.stringify(reopened.model.agentMap).includes("Keep every safe quoted-source character."));
  });
}

test("conflicting Standard metadata reports an explicit error before any job write", async context => {
  const components = [
    sourceComponent("TaskDialog"),
    { ...sourceComponent("AgentDialog", agentId), data: "kind: GptComponentMetadata\ninstructions: First original instructions." },
    { ...sourceComponent("AgentDialog", versionId), data: "kind: GptComponentMetadata\ninstructions: Conflicting original instructions." },
  ];
  const state = fixture(context, components);
  const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(record(result.structuredContent?.error).code, "INVALID_SOURCE");
  assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
});

test("a Standard agent without any supported reviewable component never creates an empty job", async context => {
  const state = fixture(context, []);
  const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(record(result.structuredContent?.error).code, "UNSUPPORTED_COMPONENT");
  assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
});

test("oversized Standard input is not truncated or written, but read-only Map inventory is preserved", async context => {
  const original = sourceComponent("AgentDialog");
  const document = record(JSON.parse(original.data));
  const instructions = "Keep every original source character. ".repeat(10_000);
  record(document.settings).instructions = instructions;
  const component = { ...original, data: JSON.stringify(document) };
  const state = fixture(context, [component]);
  const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(record(result.structuredContent?.error).code, "SOURCE_TOO_LARGE");
  assert.equal(state.calls.filter(call => ["create", "upload", "update"].includes(call.operation)).length, 0);
  const graph = await new AgentReviewService(state.token).getAgentMap(targetId, agentId, versionId);
  assert.equal(graph.nodes.find(node => node.category === "topic")?.details["Original source"], component.data);
});

for (const malformed of [
  { name: "undeclared evaluator output field", output: { discardedDetail: "Do not silently drop this unsupported output." } },
  { name: "unbalanced available row correlation", row: { cat_correlationid: `{${jobId}` } },
  { name: "unbalanced available row component ID", row: { cat_componentid: `{${topicId}` } },
]) {
  test(`${malformed.name} has an explicit rejected-row diagnostic`, async () => {
    const component = sourceComponent("TaskDialog");
    const prepared = await preparedSource([component]);
    const row = { ...resultRow(preparedOutput(prepared, component, "TaskDialog", malformed.output)), ...malformed.row };
    const results = await normalizeRows(prepared, [row]);
    assert.equal(results.topicResults?.[0].status, "unavailable");
    assert.ok(results.rejectedRows.some(result => result.itemId === row.cat_agentreviewjobitemid));
  });
}

test("an undeclared finding field stays visible as a partial Standard evaluation issue", async () => {
  const component = sourceComponent("TaskDialog");
  const prepared = await preparedSource([component]);
  const row = resultRow(preparedOutput(prepared, component, "TaskDialog", {
    findings: [{
      ruleId: "TOP-03", severity: "warning", evidence: "ReadReport", confidence: "high",
      hiddenExtraDetail: "This is not an accepted evaluator field.",
    }],
  }));
  const results = await normalizeRows(prepared, [row]);
  assert.equal(results.topicResults?.[0].status, "partial");
  assert.equal(results.topicResults?.[0].validationIssues[0].code, "malformed-finding");
});

for (const invalid of [
  { name: "foreign retained bot identity", edit: (corpus: Record<string, unknown>) => { record(record(corpus.finalizationSnapshot).identity).botId = versionId; } },
  { name: "foreign corpus request correlation", edit: (corpus: Record<string, unknown>) => { record(corpus.review).correlationId = versionId; } },
  { name: "missing Standard corpus correlation", edit: (corpus: Record<string, unknown>) => { delete record(corpus.review).correlationId; } },
  { name: "missing Standard corpus bot identity", edit: (corpus: Record<string, unknown>) => { delete record(corpus.review).botId; } },
]) {
  test(`${invalid.name} fails finalization before any saved-record write`, async context => {
    const component = sourceComponent("TaskDialog");
    const state = fixture(context, [component]);
    await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
    state.setRows([resultRow(scheduledOutput(state, component, "TaskDialog"))]);
    invalid.edit(state.corpus);
    await assert.rejects(new AgentReviewService(state.token).finalize(jobId), /snapshot|corpus/i);
    assert.equal(state.calls.filter(call =>
      ["create", "update"].includes(call.operation) && call.relative.startsWith("fixture_reviews")).length, 0);
  });
}
