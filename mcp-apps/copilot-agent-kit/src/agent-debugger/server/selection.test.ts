import assert from "node:assert/strict";
import test from "node:test";
import { resolveDebuggerTarget } from "./selection.js";

const environments = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Sandbox" },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Copilot Studio Kit - dev",
  },
];

const agents = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Contoso Support",
    componentIdUnique: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  },
];

test("uses the PowerCATTools development environment when no environment is named", () => {
  const target = resolveDebuggerTarget({
    environments,
    agents,
    input: {
      agentName: "Contoso Support",
      conversationId: "conversation-42",
    },
  });

  assert.equal(target.environment?.name, "Copilot Studio Kit - dev");
  assert.equal(target.agent?.name, "Contoso Support");
  assert.equal(target.conversationId, "conversation-42");
  assert.equal(target.canAnalyzeDirectly, true);
});

test("an explicit environment overrides the preferred development environment", () => {
  const target = resolveDebuggerTarget({
    environments,
    agents: [],
    input: { environmentName: "Sandbox" },
  });

  assert.equal(target.environment?.name, "Sandbox");
  assert.equal(target.canAnalyzeDirectly, false);
});

test("matches direct agent names with case and outer-whitespace differences", () => {
  const target = resolveDebuggerTarget({
    environments,
    agents,
    input: {
      agentName: " contoso support ",
      conversationId: "conversation-42",
    },
  });

  assert.equal(target.agent?.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(target.canAnalyzeDirectly, true);
});

test("does not compact internal whitespace to guess a prompt target", () => {
  const target = resolveDebuggerTarget({
    environments, agents, input: { agentName: "contoso   support" },
  });
  assert.equal(target.agent, undefined);
  assert.equal(target.canAnalyzeDirectly, false);
});
