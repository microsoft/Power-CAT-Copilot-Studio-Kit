import assert from "node:assert/strict";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import test from "node:test";
import { compactInitialWidgetResult, getInitialWidgetData } from "./initialWidgetPayload.js";

test("the exact inline bound counts the entire serialized result without its JSON-RPC envelope", () => {
  for (const bytes of [65_536, 65_537]) {
    const content = { type: "text" as const, text: "Unicode \u03c0, escaped quote \", and newline\n" };
    const result: CallToolResult = {
      content: [content],
      structuredContent: { state: "selecting", environmentId: "environment",
        agents: [{ id: "agent", iconBase64: "A".repeat(2_048) }] },
      _meta: { ui: { resourceUri: "ui://open_agent_review/v1.0.15/agent-review.html" }, trace: "preserved" },
    };
    content.text += "x".repeat(bytes - Buffer.byteLength(JSON.stringify(result), "utf8"));
    assert.equal(Buffer.byteLength(JSON.stringify(result), "utf8"), bytes);
    const original = structuredClone(result);
    const compact = compactInitialWidgetResult(result, "open_agent_review");
    if (bytes === 65_536) assert.equal(compact, result);
    else {
      assert.ok(Buffer.byteLength(JSON.stringify(compact), "utf8") < 65_536);
      assert.deepEqual(compact.structuredContent?.deferred, ["agents"]);
      assert.equal(compact.structuredContent?.agents, undefined);
      assert.deepEqual(compact.content, original.content);
      assert.deepEqual(compact._meta, original._meta);
    }
    assert.deepEqual(result, original);
  }
});

test("oversized anonymous environment context is an explicit bounded authentication failure", () => {
  const result: CallToolResult = {
    content: [{ type: "text", text: "Choose an environment." }],
    structuredContent: { state: "selecting", environments: [{ id: "environment", name: "x".repeat(70_000) }] },
    _meta: { ui: { resourceUri: "ui://open_agent_review/v1.0.15/agent-review.html" } },
  };
  const original = structuredClone(result);
  const output = compactInitialWidgetResult(result, "open_agent_review");
  assert.equal(output.isError, true);
  assert.equal((output.structuredContent?.error as { code: string }).code, "AUTH_REQUIRED");
  assert.ok(Buffer.byteLength(JSON.stringify(output), "utf8") <= 65_536);
  assert.deepEqual(result, original);
});

test("the complete caller-scoped context reader never returns an oversized tool reply", async () => {
  const full: CallToolResult = {
    content: [],
    structuredContent: { state: "review", evidence: "Complete saved evidence. ".repeat(4_000) },
  };
  const initial = compactInitialWidgetResult(full, "open_agent_review", "complete-context-caller");
  const contextId = String(initial.structuredContent?.contextId);
  const reply = await getInitialWidgetData("complete-context-caller", { contextId });
  const bytes = Buffer.byteLength(JSON.stringify(reply), "utf8");
  assert.ok(bytes <= 65_536, `The complete context reply is ${bytes} bytes.`);
});
