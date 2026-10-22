import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resourceVersion = readFileSync(resolve(projectRoot, "server.ts"), "utf8")
  .match(/const widgetResourceVersion = "([^"]+)"/)?.[1];
assert.ok(resourceVersion);

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the Agent Review MCP server.");
}

test("compresses the large MCP widget resource response", async () => {
  const port = 39_117;
  const origin = `http://localhost:${port}`;
  const tsxCli = resolve(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const server = spawn(process.execPath, [tsxCli, "main.ts"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(origin, 30_000);
    const response = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "accept-encoding": "gzip",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: `ui://open_agent_review/${resourceVersion}/agent-review.html` },
      }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/);
    assert.equal(
      response.headers.get("content-encoding"),
      "gzip",
      JSON.stringify(Object.fromEntries(response.headers)),
    );
    const body = await response.json() as {
      result?: { contents?: Array<{ mimeType?: string; text?: string }> };
    };
    assert.equal(body.result?.contents?.[0]?.mimeType, "text/html;profile=mcp-app");
    const html = body.result?.contents?.[0]?.text;
    assert.equal(typeof html, "string");
    assert.ok(Buffer.byteLength(html ?? "", "utf8") > 100_000);
    assert.ok(Buffer.byteLength(JSON.stringify(body), "utf8") <= 1_000_000);
  } finally {
    server.kill();
  }
});
