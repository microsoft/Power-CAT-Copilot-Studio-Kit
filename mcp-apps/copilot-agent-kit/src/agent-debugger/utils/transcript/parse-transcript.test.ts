import assert from "node:assert/strict";
import test from "node:test";
import type { Activity } from "../../contracts/transcript.js";
import type { ConnectedAgentInfo } from "../../contracts/connected-agent.js";
import {
  parseTranscript,
  parseTranscriptWithConnectedAgents,
  populateConnectedAgentFromChildTranscript,
} from "./parse-transcript.js";

function message(
  id: string,
  role: 0 | 1,
  text: string,
  timestamp: string,
): Activity {
  return {
    id,
    type: "message",
    from: { role },
    text,
    timestamp,
  };
}

test("parses classic user and agent messages", () => {
  const transcript = parseTranscript({
    activities: [
      message("user-1", 1, "Check my order", "2026-09-24T10:00:00.000Z"),
      message("bot-1", 0, "Your order is ready.", "2026-09-24T10:00:01.000Z"),
    ],
  });

  assert.deepEqual(
    transcript.turns.map((turn) => [turn.id, turn.role, turn.content]),
    [
      ["user-1", "user", "Check my order"],
      ["bot-1", "assistant", "Your order is ready."],
    ],
  );
});

test("maps generative tool traces onto the shared step model", () => {
  const transcript = parseTranscript({
    activities: [
      message("user-1", 1, "Find the policy", "2026-09-24T10:00:00.000Z"),
      {
        type: "trace",
        name: "ToolCallTrace:Started",
        timestamp: "2026-09-24T10:00:00.100Z",
        value: {
          toolCallId: "tool-1",
          toolName: "KnowledgeSearch",
          toolDisplayName: "Policy search",
          toolKind: "search",
        },
      },
      {
        type: "trace",
        name: "ToolCallTrace:Completed",
        timestamp: "2026-09-24T10:00:00.500Z",
        value: {
          toolCallId: "tool-1",
          durationMs: 400,
          result: JSON.stringify({ answer: "Found" }),
        },
      },
      message("bot-1", 0, "Here is the policy.", "2026-09-24T10:00:01.000Z"),
      {
        type: "event",
        name: "turn.complete",
        timestamp: "2026-09-24T10:00:01.100Z",
      },
    ],
  });

  const step = transcript.turns[0].debugInfo?.stepExecutions?.[0];
  assert.equal(step?.stepId, "tool-1");
  assert.equal(step?.displayName, "Policy search");
  assert.equal(step?.subtitle, "Knowledge");
  assert.equal(step?.state, "completed");
});

test("detects connected agents and populates child transcript details lazily", () => {
  const parent = parseTranscriptWithConnectedAgents({
    activities: [{
      type: "trace",
      name: "ConnectedAgentInitializeTraceData",
      value: {
        botSchemaName: "cat_childAgent",
        sessionId: "child-session",
        parentBotSchemaName: "cat_parentAgent",
        dialogSchemaName: "cat_parentAgent.action.InvokeChild",
        conversationId: "parent-child-session",
        planStepId: "step-1",
      },
    }],
  }, "parent");

  assert.equal(parent.connectedAgents.length, 1);
  assert.equal(parent.connectedAgents[0].sessionId, "child-session");

  const connectedAgent: ConnectedAgentInfo = parent.connectedAgents[0];
  const populated = populateConnectedAgentFromChildTranscript(connectedAgent, [
    message("child-user-1", 1, "Parent instruction", "2026-09-24T10:00:00.000Z"),
    message("child-bot-1", 0, "Child response", "2026-09-24T10:00:01.000Z"),
  ]);

  assert.equal(populated.isFetched, true);
  assert.equal(populated.childTranscript?.length, 2);
});
