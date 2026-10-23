import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { DataverseClient } from "./dataverse.js";
import { AgentReviewService } from "./service.js";
import { ReviewError } from "./types.js";
import { openAgentReview, startAgentReview } from "../../tools/review-tools.js";

const environmentId = "11111111-1111-4111-8111-111111111111";
const homeId = "99999999-9999-4999-8999-999999999999";
const agentId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const resourceId = "66666666-6666-4666-8666-666666666666";
const jobId = "44444444-4444-4444-8444-444444444444";
const requestId = "77777777-7777-4777-8777-777777777777";
const agentName = "Zava Visual Merchandizer";
const jobSet = "fixture_review_jobs";
const itemSet = "fixture_review_items";
const reviewSet = "fixture_reviews";
const input = { environmentId, agentId, componentIdUnique: versionId,
  projectName: "Offline start failure test", confirmed: true };

function fixture(context: TestContext, fail: (url: URL, method: string) => boolean) {
  const suffix = randomUUID().replaceAll("-", "");
  const source = new URL(`https://source${suffix}.crm.dynamics.com`);
  const store = new URL(`https://store${suffix}.crm.dynamics.com`);
  const token = `offline-fixture-${randomUUID()}`;
  const requests: Array<{ method: string; url: string }> = [];
  const values = {
    ENTRA_CLIENT_ID: "offline-client",
    ENTRA_CLIENT_SECRET: "offline-secret-not-a-credential",
    ENTRA_TENANT_ID: "offline-tenant",
    AGENT_KIT_HOME_ENVIRONMENT_ID: homeId,
    DATAVERSE_GLOBAL_DISCOVERY_URL: "https://globaldisco.crm.dynamics.com",
  };
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    process.env[name] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  context.mock.method(globalThis, "fetch", async (value: string | URL | Request, init?: RequestInit) => {
    const url = new URL(value instanceof Request ? value.url : String(value));
    const method = init?.method ?? "GET";
    if (url.hostname === "login.microsoftonline.com") {
      return Response.json({ access_token: "offline-access-not-a-credential" });
    }
    if (url.hostname === "globaldisco.crm.dynamics.com") {
      return Response.json({ value: [
        { EnvironmentId: environmentId, FriendlyName: "Copilot Studio Kit - Dev", ApiUrl: source.href },
        { EnvironmentId: homeId, FriendlyName: "Separate review store", ApiUrl: store.href },
      ] });
    }
    assert.ok([source.origin, store.origin].includes(url.origin), "The fixture must never make a real request.");
    requests.push({ method, url: url.href });
    if (fail(url, method)) {
      return Response.json({ error: { code: "0x80060888", message: "Sensitive response text must not be logged." } },
        { status: 404, headers: { "x-ms-service-request-id": requestId } });
    }
    const relative = url.pathname.replace("/api/data/v9.2/", "");
    if (url.origin === source.origin && relative === "bots") {
      return Response.json({ value: [{
        botid: agentId, componentidunique: versionId, name: agentName,
        configuration: JSON.stringify({ agentSettings: { instructions: "Help with the offline fixture." } }),
      }] });
    }
    if (url.origin === source.origin && relative === "botcomponents") {
      return Response.json({ value: [{
        botcomponentid: resourceId, componentidunique: resourceId, name: "fixture.txt",
        schemaname: "fixture.resource", componenttype: 14, statecode: 0, filedata_name: "fixture.txt",
      }] });
    }
    if (url.origin === source.origin && relative === `botcomponents(${resourceId})/filedata/$value`) {
      return new Response("Offline resource content.");
    }
    if (url.origin === source.origin && relative.startsWith("EntityDefinitions(")) {
      const logicalName = /LogicalName='([^']+)'/.exec(relative)?.[1];
      const entitySets: Record<string, string> = {
        cat_agentreviewjob: jobSet, cat_agentreviewjobitem: itemSet,
      };
      const set = entitySets[logicalName ?? ""];
      assert.ok(set);
      return Response.json({ EntitySetName: set });
    }
    if (url.origin === store.origin && relative === "EntityDefinitions(LogicalName='cat_agentreviews')") {
      return Response.json({ EntitySetName: reviewSet });
    }
    if (url.origin === source.origin && relative === jobSet && method === "POST") {
      return new Response(null, { status: 204,
        headers: { "OData-EntityId": `${source.origin}/api/data/v9.2/${jobSet}(${jobId})` } });
    }
    if (url.origin === source.origin && method === "PATCH"
      && [jobSet + `(${jobId})`, jobSet + `(${jobId})/cat_inputfile`].includes(relative)) {
      return new Response(null, { status: 204 });
    }
    if (relative.startsWith("accounts")) {
      return Response.json({});
    }
    throw new Error(`Unexpected offline fixture operation: ${method} ${url.href}`);
  });
  return { source, store, token, requests };
}

test("a Dataverse 404 retains its safe canonical operation but not query values or response text", async context => {
  const state = fixture(context, url => url.pathname.endsWith("/accounts"));
  const client = new DataverseClient(state.source, state.token);
  await assert.rejects(client.get("accounts?$filter=name eq 'private-filter-value'"), error => {
    assert.ok(error instanceof ReviewError);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.retryable, false);
    assert.ok("diagnostics" in error, "The generic 404 must retain its operation.");
    assert.deepEqual(error.diagnostics, { dataverse: {
      method: "GET", url: `${state.source.origin}/api/data/v9.2/accounts`, status: 404, requestId,
    } });
    assert.doesNotMatch(JSON.stringify(error), /private-filter-value|Sensitive response text|offline-access|offline-secret/);
    return true;
  });
});

const failures = [
  { name: "target agent lookup", stage: "read_source", path: "bots", method: "GET", origin: "source", created: false },
  { name: "target component list", stage: "read_source", path: "botcomponents", method: "GET", origin: "source", created: false },
  { name: "target resource file", stage: "read_source",
    path: `botcomponents(${resourceId})/filedata/$value`, method: "GET", origin: "source", created: false },
  { name: "review-job backend table metadata", stage: "resolve_review_tables",
    path: "EntityDefinitions(LogicalName='cat_agentreviewjob')", method: "GET", origin: "source", created: false },
  { name: "review-job creation", stage: "create_job", path: jobSet, method: "POST", origin: "source", created: false },
  { name: "input-file upload after job creation", stage: "upload_input",
    path: `${jobSet}(${jobId})/cat_inputfile`, method: "PATCH", origin: "source", created: true },
  { name: "queue update after job creation", stage: "queue_job",
    path: `${jobSet}(${jobId})`, method: "PATCH", origin: "source", created: true },
] as const;

for (const failure of failures) {
  test(`a 404 at ${failure.name} reports its stage and acknowledged job state`, async context => {
    const state = fixture(context, (url, method) =>
      url.pathname.endsWith(`/api/data/v9.2/${failure.path}`) && method === failure.method);
    await assert.rejects(new AgentReviewService(state.token).start(environmentId, agentId, versionId,
      { projectName: input.projectName }), error => {
      assert.ok(error instanceof ReviewError);
      assert.ok("diagnostics" in error, "Start must preserve the failed stage and partial-job state.");
      assert.deepEqual(error.diagnostics, {
        dataverse: { method: failure.method,
          url: `${state[failure.origin].origin}/api/data/v9.2/${failure.path}`, status: 404, requestId },
        start: { stage: failure.stage,
          jobCreation: failure.created ? "created" : failure.stage === "create_job" ? "unconfirmed" : "not_attempted",
          ...(failure.created ? { jobId } : {}) },
      });
      return true;
    });
    const writes = state.requests.filter(request => request.method !== "GET");
    assert.equal(writes.filter(request => request.method === "POST").length,
      failure.created || failure.stage === "create_job" ? 1 : 0);
    assert.equal(writes.filter(request => request.method === "PATCH").length,
      failure.stage === "queue_job" ? 2 : failure.created ? 1 : 0);
  });
}

test("manual start preserves an acknowledged job ID when the corpus upload fails", async context => {
  const state = fixture(context, url => url.pathname.endsWith("/cat_inputfile"));
  const result = await startAgentReview(state.token, input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.state, "failed");
  assert.equal(result.structuredContent?.jobId, jobId);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /created.*job|job.*created/i);
  assert.equal(state.requests.filter(request => request.method === "POST").length, 1);
});

test("a transport error after job creation preserves the acknowledged job ID", async context => {
  const state = fixture(context, url => {
    if (url.pathname.endsWith("/cat_inputfile")) throw new TypeError("The offline upload request failed.");
    return false;
  });
  const result = await startAgentReview(state.token, input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.state, "failed");
  assert.equal(result.structuredContent?.jobId, jobId);
  assert.equal(state.requests.filter(request => request.method === "POST").length, 1);
});

test("repeated exact named requests preserve an upload-failed job without another write", async context => {
  const state = fixture(context, url => url.pathname.endsWith("/cat_inputfile"));
  const args = { agentName, startReview: true, requestId: randomUUID() };
  const first = await openAgentReview(state.token, args);
  const repeated = await openAgentReview(state.token, args);
  for (const result of [first, repeated]) {
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent?.state, "failed");
    assert.equal(result.structuredContent?.jobId, jobId);
    assert.equal(result.structuredContent?.environmentId, environmentId);
  }
  assert.equal(state.requests.filter(request => request.method === "POST").length, 1);
  assert.equal(state.requests.filter(request => request.method === "PATCH").length, 1);
});

test("an exact named request reports missing job metadata without a write or silent route change", async context => {
  const state = fixture(context, url => url.pathname.includes("EntityDefinitions("));
  const result = await openAgentReview(state.token, { agentName, startReview: true, requestId: randomUUID() });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.state, "selecting");
  assert.equal(result.structuredContent?.jobId, undefined);
  assert.equal(state.requests.filter(request => request.method !== "GET").length, 0);
  assert.equal((result.structuredContent?.error as { code?: string })?.code, "NOT_FOUND");
  const metadata = state.requests.filter(request => request.url.includes("EntityDefinitions("));
  assert.deepEqual(metadata.map(request => new URL(request.url).pathname).sort(), [
    "/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviewjob')",
    "/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviewjobitem')",
  ]);
  assert(metadata.every(request => new URL(request.url).origin === state.source.origin));
});
