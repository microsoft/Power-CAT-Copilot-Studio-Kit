import assert from "node:assert/strict";
import test from "node:test";
import { AgentReviewService } from "../agent-review/server/service.js";
import type { ReviewAgent } from "../agent-review/server/types.js";
import { openAgentReview } from "./review-tools.js";

test("review selection keeps picker icons without repeating unused agent fields", async (context) => {
  const environment = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Copilot Studio Kit - Dev",
    region: "unitedstates",
  };
  const agents: ReviewAgent[] = Array.from({ length: 250 }, (_, index) => ({
    id: `${index.toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`,
    name: index === 0 ? "Zava Visual Merchandizer" : `Local test agent ${index}`,
    componentIdUnique: `${index.toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`,
    iconBase64: "A".repeat(16_384),
    modifiedOn: "2026-10-07T12:00:00.000Z",
    harness: "copilot",
  }));
  const original = structuredClone(agents);
  context.mock.method(AgentReviewService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentReviewService.prototype, "listAgents", async () => agents);
  context.mock.method(AgentReviewService.prototype, "resolveAgent", async () => agents[0]);

  const result = await openAgentReview("local-test-token-not-a-credential", {
    environmentName: environment.name,
    agentName: agents[0].name,
    startReview: false,
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.environmentId, environment.id);
  assert.equal(result.structuredContent?.agentId, agents[0].id);
  assert.equal(result.structuredContent?.componentIdUnique, agents[0].componentIdUnique);
  assert.equal(result.structuredContent?.agents, undefined);
  assert.deepEqual(result.structuredContent?.deferred, ["agents"]);
  const picker = await openAgentReview("local-test-token-not-a-credential", {
    environmentName: environment.name, startReview: false,
  });
  const pickerAgents = picker.structuredContent?.agents;
  assert.ok(Array.isArray(pickerAgents));
  for (const agent of pickerAgents) {
    assert.ok(agent && typeof agent === "object");
    assert.ok(!("modifiedOn" in agent), "The review picker does not use modification dates.");
    assert.ok(!("harness" in agent), "The review picker does not use harness data.");
  }
  assert.deepEqual(picker.structuredContent?.agents, agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    componentIdUnique: agent.componentIdUnique,
    iconBase64: agent.iconBase64,
  })));
  assert.deepEqual(result.structuredContent?.agent, {
    id: agents[0].id,
    name: agents[0].name,
    componentIdUnique: agents[0].componentIdUnique,
  });
  assert.deepEqual(agents, original);
});
