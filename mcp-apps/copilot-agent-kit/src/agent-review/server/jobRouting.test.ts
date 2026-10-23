import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  prepareReview, ReviewJobStatus, type Guid, type PreparedReview,
  type ReviewJobStatusValue, type AgentReviewRecordData,
} from "../core/index.js";
import { AgentReviewService } from "./service.js";
import { ReviewError } from "./types.js";
import { getAgentReviewStatus, openAgentReview } from "../../tools/review-tools.js";
import { AgentDebuggerService } from "../../agent-debugger/server/service.js";

const devId = "77777777-7777-e777-8777-777777777777";
const homeId = "88888888-8888-e888-8888-888888888888";
const sourceId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const reviewId = "55555555-5555-4555-8555-555555555555";
const componentId = "66666666-6666-4666-8666-666666666666";
const jobSet = "cat_agentreviewjobs";
const itemSet = "cat_agentreviewjobitems";
const reviewSet = "cat_agentreviewses";
const agentName = "Offline routing agent";

async function fixture(context: TestContext, options: {
  explicitSource?: boolean;
  missingBackend?: boolean;
  ambiguousBackend?: boolean;
  failJobMetadata?: 403 | 404;
  reviewMetadataStatus?: 401 | 403 | 404;
  failUpload?: boolean;
  failQueue?: boolean;
  existingReview?: boolean;
} = {}) {
  const suffix = randomUUID().replaceAll("-", "");
  const dev = new URL(`https://dev${suffix}.crm.dynamics.com/`);
  const home = new URL(`https://home${suffix}.crm.dynamics.com/`);
  const source = options.explicitSource ? new URL(`https://source${suffix}.crm.dynamics.com/`) : dev;
  const selectedId = options.explicitSource ? sourceId : devId;
  const sourceName = options.explicitSource ? "Explicit source environment" : "Copilot Studio Kit - Dev";
  const token = `offline-job-routing-${randomUUID()}`;
  const requests: Array<{ method: string; origin: string; relative: string; query: string }> = [];
  const configuration = JSON.stringify({ agentSettings: { instructions: "Use the complete offline routing skill." } });
  const component = {
    botcomponentid: componentId, botid: agentId, componentidunique: componentId,
    name: "offline-routing", schemaname: "fixture.offline_routing", componenttype: "9",
    content: "", data: JSON.stringify({
      kind: "InlineAgentSkill",
      content: "---\nname: offline-routing\ndescription: Check a complete offline routing example.\n---\n# Routing\nRead the complete request. Do not invent a result.",
    }),
  };
  const prepared = await prepareReview({
    botId: agentId as Guid, botName: agentName, componentIdUnique: versionId as Guid,
    sourceEnvironmentId: selectedId as Guid, sourceEnvironmentName: sourceName,
    startedAt: new Date().toISOString(),
  }, { configuration, components: [component], resources: [] }, {
    clock: { now: () => new Date() },
    ids: { randomUUID: () => jobId as Guid },
    hash: { sha256: async bytes => createHash("sha256").update(bytes).digest("hex") },
  });
  let corpus: PreparedReview["corpus"] = prepared.corpus;
  let correlation = prepared.correlationId;
  let status: ReviewJobStatusValue = ReviewJobStatus.Queued;
  let saved: AgentReviewRecordData | undefined;
  let savedEtag: string | undefined;
  for (const [name, value] of Object.entries({
    AGENT_KIT_HOME_ENVIRONMENT_ID: homeId,
    ENTRA_CLIENT_ID: "offline-client",
    ENTRA_CLIENT_SECRET: "offline-not-a-credential",
    ENTRA_TENANT_ID: "offline-tenant",
    DATAVERSE_GLOBAL_DISCOVERY_URL: "https://globaldisco.crm.dynamics.com",
  })) {
    const previous = process.env[name];
    process.env[name] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    if (url.hostname === "login.microsoftonline.com") return Response.json({ access_token: "offline-not-a-token" });
    if (url.hostname === "globaldisco.crm.dynamics.com") {
      const environments = [
        { EnvironmentId: homeId, FriendlyName: "Agent Review Tool", ApiUrl: home.href },
        ...(options.missingBackend ? [] : [
          { EnvironmentId: devId, FriendlyName: "Copilot Studio Kit - Dev", ApiUrl: dev.href },
        ]),
        ...(options.explicitSource ? [
          { EnvironmentId: sourceId, FriendlyName: sourceName, ApiUrl: source.href },
        ] : []),
        ...(options.ambiguousBackend ? [
          { EnvironmentId: randomUUID(), FriendlyName: " copilot studio kit - dev ", ApiUrl: `https://duplicate${suffix}.crm.dynamics.com/` },
        ] : []),
      ];
      return Response.json({ value: environments });
    }
    assert.ok([dev.origin, home.origin, source.origin].includes(url.origin), "No real network request is permitted.");
    assert.ok(url.pathname.startsWith("/api/data/v9.2/"), "Every Dataverse request must use the canonical API path.");
    const relative = url.pathname.slice("/api/data/v9.2/".length);
    requests.push({ method, origin: url.origin, relative, query: url.search });
    if (relative.startsWith("EntityDefinitions(")) {
      const logical = /LogicalName='([^']+)'/.exec(relative)?.[1];
      if (url.origin === home.origin) {
        if (logical === "cat_agentreviews" && options.reviewMetadataStatus) {
          return Response.json({ error: { message: "The caller cannot read the review table metadata." } }, { status: options.reviewMetadataStatus });
        }
        if (logical === "cat_agentreviews") return Response.json({ EntitySetName: reviewSet });
        return Response.json({ error: { message: "Job tables are absent in Agent Review Tool." } }, { status: 404 });
      }
      assert.equal(url.origin, dev.origin, "Job metadata belongs to Dev, not the selected source.");
      if (options.failJobMetadata && logical === "cat_agentreviewjob") {
        return Response.json({ error: { message: "The existing job table cannot be read." } }, { status: options.failJobMetadata });
      }
      const set = logical === "cat_agentreviewjob" ? jobSet : logical === "cat_agentreviewjobitem" ? itemSet : undefined;
      assert.ok(set, "Job operations must not require a saved-result table in Dev.");
      return Response.json({ EntitySetName: set });
    }
    if (url.origin === source.origin && relative === "bots") {
      return Response.json({ value: [{ botid: agentId, componentidunique: versionId, name: agentName, configuration }] });
    }
    if (url.origin === source.origin && relative === "botcomponents") {
      return Response.json({ value: [{ ...component, componenttype: 9 }] });
    }
    if (url.origin === dev.origin && relative === jobSet && method === "POST") {
      assert.equal(typeof init?.body, "string");
      const body = JSON.parse(String(init?.body)) as { cat_correlationid: Guid };
      correlation = body.cat_correlationid;
      return new Response(null, { status: 204,
        headers: { "OData-EntityId": `${dev.origin}/api/data/v9.2/${jobSet}(${jobId})` } });
    }
    if (url.origin === dev.origin && relative === `${jobSet}(${jobId})/cat_inputfile` && method === "PATCH") {
      if (options.failUpload) return Response.json({}, { status: 404 });
      assert.ok(init?.body instanceof Uint8Array);
      corpus = JSON.parse(new TextDecoder().decode(init.body)) as PreparedReview["corpus"];
      return new Response(null, { status: 204 });
    }
    if (url.origin === dev.origin && relative === `${jobSet}(${jobId})` && method === "PATCH") {
      if (options.failQueue) return Response.json({}, { status: 404 });
      return new Response(null, { status: 204 });
    }
    if (url.origin === dev.origin && relative === `${jobSet}(${jobId})` && method === "GET") {
      return Response.json({
        cat_agentreviewjobid: jobId, cat_correlationid: correlation, cat_jobstatus: status,
        cat_botid: agentId, cat_botname: agentName, cat_componentcount: corpus.components.length,
        createdon: new Date().toISOString(), modifiedon: new Date().toISOString(),
      });
    }
    if (url.origin === dev.origin && relative === itemSet && method === "GET") return Response.json({ value: [] });
    if (url.origin === dev.origin && relative === `${jobSet}(${jobId})/cat_inputfile/$value`) {
      return new Response(JSON.stringify(corpus));
    }
    if (url.origin === home.origin && relative === reviewSet && method === "GET") {
      return Response.json({ value: options.existingReview ? [{ cat_agentreviewsid: reviewId, "@odata.etag": 'W/"fixture-review"' }] : [] });
    }
    if (url.origin === home.origin
        && ((relative === reviewSet && method === "POST") || (relative === `${reviewSet}(${reviewId})` && method === "PATCH"))) {
      assert.equal(typeof init?.body, "string");
      saved = JSON.parse(String(init?.body)) as AgentReviewRecordData;
      savedEtag = new Headers(init?.headers).get("If-Match") ?? undefined;
      return new Response(null, { status: 204,
        headers: { "OData-EntityId": `${home.origin}/api/data/v9.2/${reviewSet}(${reviewId})` } });
    }
    if (url.origin === home.origin && relative === `${reviewSet}(${reviewId})` && method === "GET") {
      assert.ok(saved);
      return Response.json(saved);
    }
    throw new Error(`Unexpected offline routing operation: ${method} ${url.href}`);
  });
  return {
    token, requests, dev, home, source, selectedId, sourceName,
    get corpus() { return corpus; },
    get saved() { assert.ok(saved); return saved; },
    get savedEtag() { return savedEtag; },
    succeed() { status = ReviewJobStatus.Succeeded; },
  };
}

test("exact Review and Debugger lookups scope the bot query without requesting icons or another environment", async context => {
  const state = await fixture(context, { explicitSource: true });
  for (const service of [new AgentReviewService(state.token), new AgentDebuggerService(state.token)]) {
    const selected = await service.resolveAgent(sourceId, { agentName: ` ${agentName.toUpperCase()} `, agentId });
    assert.equal(selected.id, agentId);
  }
  assert.equal(state.requests.length, 2);
  for (const request of state.requests) {
    assert.equal(request.origin, state.source.origin);
    assert.equal(request.method, "GET");
    assert.equal(request.relative, "bots");
    const query = new URLSearchParams(request.query);
    assert.equal(query.get("$filter"), `statecode eq 0 and botid eq ${agentId} and name eq '${agentName.toUpperCase()}'`);
    assert.equal(query.get("$select")?.includes("iconbase64"), false);
    assert.equal(query.get("$filter")?.includes("contains"), false);
  }
});

test("Dev-source Review creates, uploads and queues its job in Dev even when the configured home has no job tables", async context => {
  const state = await fixture(context);
  const result = await new AgentReviewService(state.token).start(devId, agentId, versionId, { projectName: "Offline routing review" });
  assert.equal(result.jobId, jobId);
  assert.equal(process.env.AGENT_KIT_HOME_ENVIRONMENT_ID, homeId);
  assert.deepEqual(state.requests.filter(row => row.method !== "GET").map(row => [row.method, row.origin, row.relative]), [
    ["POST", state.dev.origin, jobSet],
    ["PATCH", state.dev.origin, `${jobSet}(${jobId})/cat_inputfile`],
    ["PATCH", state.dev.origin, `${jobSet}(${jobId})`],
  ]);
  assert.ok(state.requests.every(row => row.origin !== state.home.origin));
});

test("an explicit source environment remains separate from the Dev job backend and the saved-review home", async context => {
  const state = await fixture(context, { explicitSource: true });
  await new AgentReviewService(state.token).start(sourceId, agentId, versionId, { projectName: "Explicit offline source" });
  assert.equal(state.corpus.finalizationSnapshot.identity.sourceEnvironmentId, sourceId);
  assert.equal(state.corpus.finalizationSnapshot.identity.sourceEnvironmentName, state.sourceName);
  assert.ok(state.requests.filter(row => /^(bots|botcomponents)$/.test(row.relative)).every(row => row.origin === state.source.origin));
  assert.ok(state.requests.filter(row => /^(EntityDefinitions|cat_agentreviewjob)/.test(row.relative)).every(row => row.origin === state.dev.origin));
  assert.ok(state.requests.every(row => row.origin !== state.home.origin));
});

test("a repeated exact default-environment prompt starts only one Dev job without a target form", async context => {
  const state = await fixture(context);
  const request = { agentName, startReview: true, requestId: randomUUID() };
  for (let index = 0; index < 2; index += 1) {
    const result = await openAgentReview(state.token, request);
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent?.state, "running");
    assert.equal(result.structuredContent?.jobId, jobId);
    assert.equal(result.structuredContent?.environmentId, devId);
  }
  assert.equal(state.requests.filter(row => row.method === "POST").length, 1);
});

test("job status and job-ID resume read only Dev and do not create or queue another review", async context => {
  const state = await fixture(context);
  const status = await getAgentReviewStatus(state.token, { jobId });
  const resumed = await openAgentReview(state.token, { jobId });
  assert.notEqual(status.isError, true);
  assert.notEqual(resumed.isError, true);
  assert.equal(resumed.structuredContent?.state, "running");
  assert.ok(state.requests.length > 0);
  assert.ok(state.requests.every(row => row.method === "GET" && row.origin === state.dev.origin));
});

for (const failStage of ["upload_input", "queue_job"] as const) {
  test(`an acknowledged Dev job survives ${failStage} failure and read-only recovery does not start again`, async context => {
    const state = await fixture(context, { failUpload: failStage === "upload_input", failQueue: failStage === "queue_job" });
    const request = { agentName, startReview: true, requestId: randomUUID() };
    for (let index = 0; index < 2; index += 1) {
      const failed = await openAgentReview(state.token, request);
      assert.equal(failed.isError, true);
      assert.equal(failed.structuredContent?.jobId, jobId);
      assert.equal(failed.structuredContent?.state, "failed");
      assert.match(JSON.stringify(failed.structuredContent?.error), new RegExp(failStage));
    }
    const resumed = await openAgentReview(state.token, { jobId });
    assert.notEqual(resumed.isError, true);
    assert.equal(state.requests.filter(row => row.method === "POST").length, 1);
    assert.ok(state.requests.every(row => row.origin === state.dev.origin));
  });
}

for (const metadataStatus of [403, 404] as const) {
  test(`Dev job metadata HTTP ${metadataStatus} is visible and never falls back to the home or source`, async context => {
    const state = await fixture(context, { explicitSource: true, failJobMetadata: metadataStatus });
    await assert.rejects(
      new AgentReviewService(state.token).start(sourceId, agentId, versionId, { projectName: "No fallback" }),
      error => {
        assert.ok(error instanceof ReviewError);
        assert.equal(error.diagnostics?.dataverse?.status, metadataStatus);
        assert.equal(error.diagnostics?.dataverse?.url, `${state.dev.origin}/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviewjob')`);
        assert.equal(error.diagnostics?.start?.jobCreation, "not_attempted");
        return true;
      },
    );
    assert.ok(state.requests.every(row => row.method === "GET"));
    assert.ok(state.requests.every(row => row.origin !== state.home.origin));
  });
}

for (const unavailable of ["missingBackend", "ambiguousBackend"] as const) {
  test(`${unavailable} stops job creation instead of selecting another backend`, async context => {
    const state = await fixture(context, { explicitSource: true, [unavailable]: true });
    await assert.rejects(
      new AgentReviewService(state.token).start(sourceId, agentId, versionId, { projectName: "Unavailable backend" }),
      error => {
        assert.ok(error instanceof ReviewError);
        assert.match(error.message, /Copilot Studio Kit - Dev/);
        assert.equal(error.diagnostics?.start?.jobCreation, "not_attempted");
        return true;
      },
    );
    assert.ok(state.requests.every(row => row.method === "GET" && row.origin === state.source.origin));
  });
}

for (const existingReview of [false, true]) {
  test(`finalization reads the Dev job but ${existingReview ? "updates" : "creates"} the saved review in the unchanged home`, async context => {
    const state = await fixture(context, { explicitSource: true, existingReview });
    state.succeed();
    const service = new AgentReviewService(state.token);
    assert.deepEqual(await service.finalize(jobId), { reviewId });
    const result = await service.getResult(reviewId);
    assert.equal(result.reviewId, reviewId);
    assert.equal(result.model.agentMap?.state, "ready");
    assert.equal(state.saved.cat_sourceenvironment, state.sourceName);
    assert.ok(state.requests.filter(row => row.relative.startsWith(jobSet) || row.relative === itemSet).every(row => row.origin === state.dev.origin));
    assert.ok(state.requests.filter(row => row.relative.startsWith(reviewSet)).every(row => row.origin === state.home.origin));
    assert.equal(state.requests.filter(row => row.method !== "GET").length, 1);
    assert.equal(state.savedEtag, existingReview ? 'W/"fixture-review"' : undefined);
    assert.equal(process.env.AGENT_KIT_HOME_ENVIRONMENT_ID, homeId);
  });
}

for (const metadataStatus of [401, 403] as const) {
  test(`finalization saves to the known review set when the home refuses review metadata with HTTP ${metadataStatus}`, async context => {
    const state = await fixture(context, { explicitSource: true, reviewMetadataStatus: metadataStatus });
    state.succeed();
    const service = new AgentReviewService(state.token);
    assert.deepEqual(await service.finalize(jobId), { reviewId });
    assert.equal((await service.getResult(reviewId)).reviewId, reviewId);
    assert.equal(state.saved.cat_sourceenvironment, state.sourceName);
    const home = state.requests.filter(row => row.origin === state.home.origin);
    assert.deepEqual([home[0]?.method, home[0]?.relative], ["GET", "EntityDefinitions(LogicalName='cat_agentreviews')"],
      "The metadata read is still sent first.");
    assert.ok(home.slice(1).every(row => row.relative.startsWith(reviewSet)),
      "Later home requests use the known review set and do not read the metadata again.");
    assert.deepEqual(state.requests.filter(row => row.method !== "GET").map(row => [row.method, row.origin, row.relative]), [
      ["POST", state.home.origin, reviewSet],
    ]);
  });
}

test("a missing review table in the home still stops finalization without a fallback", async context => {
  const state = await fixture(context, { explicitSource: true, reviewMetadataStatus: 404 });
  state.succeed();
  await assert.rejects(new AgentReviewService(state.token).finalize(jobId), error => {
    assert.ok(error instanceof ReviewError);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.diagnostics?.dataverse?.status, 404);
    assert.equal(error.diagnostics?.dataverse?.url, `${state.home.origin}/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviews')`);
    return true;
  });
  assert.deepEqual(state.requests.filter(row => row.origin === state.home.origin).map(row => row.relative), [
    "EntityDefinitions(LogicalName='cat_agentreviews')",
  ]);
  assert.ok(state.requests.every(row => row.method === "GET"));
});
