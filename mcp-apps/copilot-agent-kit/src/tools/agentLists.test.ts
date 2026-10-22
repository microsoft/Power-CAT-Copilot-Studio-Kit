import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { AgentReviewService } from "../agent-review/server/service.js";
import { AgentDebuggerService, mapAgentRows } from "../agent-debugger/server/service.js";
import { EvaluationService } from "../evaluation/service.js";

const environmentId = "11111111-1111-4111-8111-111111111111";
const rows = Array.from({ length: 270 }, (_, index) => ({
  botid: `${(index + 1).toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`,
  componentidunique: `${(index + 1).toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`,
  name: `Agent ${String(index + 1).padStart(3, "0")}`,
  schemaname: `fixture.agent_${index + 1}`,
  configuration: '{"agentSettings":{"instructions":{}}}',
  modifiedon: "2026-10-13T00:00:00Z",
  iconbase64: "I".repeat(16_384),
}));

function fixture(context: TestContext) {
  const origin = `https://list${randomUUID().replaceAll("-", "")}.crm.dynamics.com`;
  const token = `offline-agent-list-${randomUUID()}`;
  const requests: URL[] = [];
  for (const [name, value] of Object.entries({
    AGENT_KIT_HOME_ENVIRONMENT_ID: environmentId,
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
    if (url.hostname === "login.microsoftonline.com") return Response.json({ access_token: "offline-not-a-token" });
    if (url.hostname === "globaldisco.crm.dynamics.com") {
      return Response.json({ value: [{
        EnvironmentId: environmentId, FriendlyName: "Copilot Studio Kit - Dev", ApiUrl: origin,
      }] });
    }
    assert.equal(url.origin, origin, "No real network request is permitted.");
    assert.equal(init?.method ?? "GET", "GET", "Agent lists and history are read-only.");
    requests.push(url);
    if (url.pathname.includes("/EntityDefinitions(")) return Response.json({ EntitySetName: "cat_agentreviewses" });
    if (url.pathname.endsWith("/cat_agentreviewses")) return Response.json({ value: [] });
    assert.ok(url.pathname.endsWith("/bots"), `Unexpected offline path: ${url.pathname}`);
    return url.searchParams.get("page") === "2"
      ? Response.json({ value: rows.slice(150) })
      : Response.json({ value: rows.slice(0, 150), "@odata.nextLink": `${origin}/api/data/v9.2/bots?page=2` });
  });
  return { token, requests };
}

for (const kind of ["Review", "Debugger", "Eval"] as const) {
  test(`${kind} selection lists retain every paged agent and omit icon bytes`, async context => {
    const { token, requests } = fixture(context);
    const service = kind === "Review" ? new AgentReviewService(token)
      : kind === "Debugger" ? new AgentDebuggerService(token) : new EvaluationService(token);
    const agents = await service.listAgents(environmentId);
    assert.equal(agents.length, rows.length);
    assert.deepEqual(agents.map(agent => agent.id), rows.map(row => row.botid));
    assert.deepEqual(agents.map(agent => agent.name), rows.map(row => row.name));
    assert.deepEqual(agents.map(agent => agent.componentIdUnique), rows.map(row => row.componentidunique));
    assert.ok(agents.every(agent => !Object.hasOwn(agent, "iconBase64")));
    const first = requests.find(url => url.searchParams.has("$select"));
    assert.ok(first);
    assert.ok(!first.searchParams.get("$select")?.split(",").includes("iconbase64"));
    assert.equal(first.searchParams.get("$filter"), "statecode eq 0");
    assert.equal(first.searchParams.get("$orderby"), "name asc");
    assert.ok(Buffer.byteLength(JSON.stringify(agents), "utf8") < 120_000);
  });
}

test("Review and Debugger list search keeps exact records without icon data", async context => {
  const { token } = fixture(context);
  for (const service of [new AgentReviewService(token), new AgentDebuggerService(token)]) {
    const agents = await service.listAgents(environmentId, " AGENT 270 ");
    assert.deepEqual(agents.map(agent => agent.id), [rows[269].botid]);
    assert.ok(!Object.hasOwn(agents[0], "iconBase64"));
  }
});

test("Review history keeps every thumbnail through its separate inventory read", async context => {
  const { token, requests } = fixture(context);
  const inventory = await new AgentReviewService(token).listReviewInventory(environmentId);
  assert.equal(inventory.rows.length, rows.length);
  assert.deepEqual(inventory.rows.map(row => row.iconBase64), rows.map(row => row.iconbase64));
  assert.ok(requests.some(url => url.searchParams.get("$select")?.split(",").includes("iconbase64")));
});

test("Debugger full-detail mapping retains its selected agent icon and both experiences", () => {
  const agents = mapAgentRows([rows[0], { ...rows[1], configuration: '{"recognizer":{"$kind":"LuisRecognizer"}}' }], "");
  assert.deepEqual(agents.map(agent => agent.iconBase64), [rows[0].iconbase64, rows[1].iconbase64]);
  assert.deepEqual(agents.map(agent => agent.experience), ["generative", "classic"]);
});
