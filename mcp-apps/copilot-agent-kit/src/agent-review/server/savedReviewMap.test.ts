import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { AgentReviewService } from "./service.js";
import type { CopilotReviewDisplayPayload } from "../core/index.js";
import { getAgentReviewResult, openAgentReview } from "../../tools/review-tools.js";
import { buildReviewViewModel } from "../ui/model/index.js";

const homeId = "99999999-9999-4999-8999-999999999999";
const reviewId = "55555555-5555-4555-8555-555555555555";
const versionId = "33333333-3333-4333-8333-333333333333";
const reviewSet = "fixture_saved_review_results";
const saved = JSON.parse(readFileSync(
  new URL("../ui/fixtures/persisted-review.json", import.meta.url), "utf8",
)) as {
  botId: string;
  botName: string;
  reviewDate: string;
  durationMs: number;
  agentsExperience: CopilotReviewDisplayPayload;
};

function fixture(context: TestContext, options: {
  missingJobs?: boolean;
  recordBotId?: string;
  payloadBotId?: string | null;
} = {}) {
  const store = new URL(`https://saved${randomUUID().replaceAll("-", "")}.crm.dynamics.com`);
  const token = `offline-saved-review-${randomUUID()}`;
  const requests: Array<{ method: string; url: string }> = [];
  for (const [name, value] of Object.entries({
    ENTRA_CLIENT_ID: "offline-client",
    ENTRA_CLIENT_SECRET: "offline-secret-not-a-credential",
    ENTRA_TENANT_ID: "offline-tenant",
    AGENT_KIT_HOME_ENVIRONMENT_ID: homeId,
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
    if (url.hostname === "login.microsoftonline.com") {
      return Response.json({ access_token: "offline-access-not-a-credential" });
    }
    if (url.hostname === "globaldisco.crm.dynamics.com") {
      return Response.json({ value: [{
        EnvironmentId: homeId, FriendlyName: "Review store", ApiUrl: store.href,
      }] });
    }
    assert.equal(url.origin, store.origin, "A saved map must not query a live target environment.");
    assert.equal(method, "GET", "Reading a saved map must not write any record.");
    requests.push({ method, url: url.href });
    const relative = url.pathname.replace("/api/data/v9.2/", "");
    if (relative.startsWith("EntityDefinitions(")) {
      const logicalName = /LogicalName='([^']+)'/.exec(relative)?.[1];
      if (logicalName === "cat_agentreviews") return Response.json({ EntitySetName: reviewSet });
      if (options.missingJobs) return Response.json({
        error: { code: "0x80060888", message: "Required job metadata does not exist." },
      }, { status: 404 });
      assert.ok(["cat_agentreviewjob", "cat_agentreviewjobitem"].includes(logicalName ?? ""));
      return Response.json({ EntitySetName: `fixture_${logicalName}` });
    }
    if (relative === `${reviewSet}(${reviewId})`) {
      return Response.json({
        cat_botid: options.recordBotId ?? saved.botId,
        cat_botname: saved.botName,
        cat_componentidunique: versionId,
        cat_sourceenvironment: "Saved target environment",
        cat_reviewdate: saved.reviewDate,
        cat_reviewresultjson: JSON.stringify({
          ...saved,
          botId: options.payloadBotId === null ? undefined : options.payloadBotId ?? saved.botId,
        }),
      });
    }
    throw new Error(`Unexpected saved-review fixture GET: ${url.href}`);
  });
  return { token, store, requests };
}

test("reading a saved review does not require the unavailable job tables", async context => {
  const state = fixture(context, { missingJobs: true });
  const settled = await new AgentReviewService(state.token).getResult(reviewId).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  );
  assert.equal(settled.ok, true, "A saved result needs only the existing review table.");
  if (!settled.ok) throw settled.error;
  assert.equal(settled.value.reviewId, reviewId);
  assert.ok(settled.value.model.findings.length > 0);
  assert.deepEqual(state.requests.map(request => new URL(request.url).pathname), [
    "/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviews')",
    `/api/data/v9.2/${reviewSet}(${reviewId})`,
  ]);
});

test("a saved review map uses its stored model and reviewed version without reading the live agent", async context => {
  const state = fixture(context);
  const result = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(result.model.agentMap?.state, "ready");
  const map = result.model.agentMap;
  assert.ok(map?.state === "ready");
  assert.equal(map.reviewId, reviewId);
  assert.equal(map.componentIdUnique, versionId);
  assert.equal(map.reviewedOn, saved.reviewDate);
  assert.equal(map.graph.agent.id, saved.botId);
  assert.equal(map.graph.agent.environmentName, "Saved target environment");
  const tools = map.graph.nodes.filter(node => node.category === "tool");
  assert.deepEqual(tools.map(node => node.componentIdUnique),
    saved.agentsExperience.model.tools.map(tool => tool.componentIdUnique));
  assert.ok(map.graph.edges.some(edge => edge.provenance === "structural"));
  assert.ok(state.requests.every(request => !/\/bots|\/botcomponents/.test(request.url)));
  assert.equal(state.requests.length, 2);
});

test("a legacy saved payload uses its recorded agent ID without guessing a target", async context => {
  const state = fixture(context, { payloadBotId: null });
  const result = await new AgentReviewService(state.token).getResult(reviewId);
  const map = result.model.agentMap;
  assert.ok(map?.state === "ready");
  assert.equal(map.graph.agent.id, saved.botId);
});

test("conflicting saved agent identities keep findings available but do not draw a guessed map", async context => {
  const state = fixture(context, { recordBotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const result = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(result.model.agentMap?.state, "unavailable");
  const map = result.model.agentMap;
  assert.ok(map?.state === "unavailable");
  assert.match(map.reason, /agent ID.*match/i);
  assert.ok(result.model.findings.length > 0);
  assert.equal(state.requests.length, 2);
});

test("an invalid stored agent ID does not hide the saved findings", async context => {
  const state = fixture(context, { recordBotId: "not-an-agent-id" });
  const result = await new AgentReviewService(state.token).getResult(reviewId);
  assert.equal(result.model.agentMap?.state, "unavailable");
  assert.deepEqual(result.model.findings, buildReviewViewModel(saved.agentsExperience, "Current user", 42_000, saved.botName).findings);
  assert.ok(state.requests.every(request => request.method === "GET"));
});

test("both saved Review tool entry points read results without job metadata or writes", async context => {
  const state = fixture(context, { missingJobs: true });
  for (const invoke of [
    () => openAgentReview(state.token, { reviewId }),
    () => getAgentReviewResult(state.token, { reviewId, presentation: "fullReview" }),
  ]) {
    const result = await invoke();
    assert.notEqual(result.isError, true, "An existing saved result must remain readable.");
    assert.ok(result.structuredContent);
    assert.ok(state.requests.every(request => request.method === "GET"));
    assert.ok(state.requests.every(request => !/cat_agentreviewjob/.test(request.url)));
  }
});

test("saved Review entry points require caller authentication before any metadata read", async context => {
  const state = fixture(context, { missingJobs: true });
  for (const invoke of [
    () => openAgentReview(undefined, { reviewId }),
    () => getAgentReviewResult(undefined, { reviewId, presentation: "fullReview" }),
  ]) {
    const result = await invoke();
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /AUTH_REQUIRED/);
  }
  assert.deepEqual(state.requests, []);
});
