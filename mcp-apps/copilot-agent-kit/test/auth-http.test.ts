import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("the real HTTP entrypoint challenges expired callers before tools and keeps anonymous resources readable", {
  timeout: 45_000,
}, async context => {
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const compiled = process.env.AUTH_HTTP_COMPILED === "1";
  const serverRoot = compiled ? path.join(process.cwd(), "dist", "server") : process.cwd();
  const serviceUrl = pathToFileURL(path.join(serverRoot, "src", "agent-review", "server", `service.${compiled ? "js" : "ts"}`)).href;
  const mainUrl = pathToFileURL(path.join(serverRoot, `main.${compiled ? "js" : "ts"}`)).href;
  const program = `
    process.on("message", message => { if (message === "stop") process.exit(0); });
    globalThis.fetch = async (url, options) => {
      if (String(url) === "https://login.microsoftonline.com/offline-http-tenant/oauth2/v2.0/token"
        && options?.body instanceof URLSearchParams
        && options.body.get("assertion") === "obo-rejected-caller-fixture") {
        console.log("AUTH_FIXTURE_OBO_REJECTION");
        return Response.json({
          error: "invalid_grant", error_codes: [500133],
          error_description: "AADSTS500133: Assertion is not within its valid time range.",
        }, { status: 400 });
      }
      console.log("AUTH_FIXTURE_REMOTE_FETCH");
      throw new Error("Remote requests are forbidden in the HTTP auth fixture.");
    };
    const { AgentReviewService } = await import(${JSON.stringify(serviceUrl)});
    AgentReviewService.prototype.start = async () => {
      console.log("AUTH_FIXTURE_MUTATION");
      throw new Error("Tool mutations are forbidden in the HTTP auth fixture.");
    };
    await import(${JSON.stringify(mainUrl)});
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type", "module", "--eval", program], {
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(port),
      ENTRA_CLIENT_ID: "offline-http-client",
      ENTRA_CLIENT_SECRET: "offline-http-secret-not-a-credential",
      ENTRA_TENANT_ID: "offline-http-tenant",
      AGENT_KIT_HOME_ENVIRONMENT_ID: "11111111-1111-4111-8111-111111111111",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  const collect = (chunk: Buffer) => { output += chunk.toString("utf8"); };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  context.after(async () => {
    if (child.exitCode !== null) return;
    await new Promise<void>(resolve => {
      child.once("exit", () => resolve());
      child.send("stop");
    });
  });
  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      if (output.includes(`Agent Review MCP App: http://localhost:${port}/mcp`)) {
        child.stdout?.off("data", ready);
        resolve();
      }
    };
    child.stdout?.on("data", ready);
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`HTTP auth fixture exited ${code}: ${output}`)));
    context.signal.addEventListener("abort", () => {
      child.send("stop");
      reject(new Error("The HTTP auth fixture timed out."));
    }, { once: true });
  });
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const expiredToken = [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 600 })).toString("base64url"),
    "offline-signature-not-a-credential",
  ].join(".");
  let id = 0;
  for (const request of [
    { name: "open_agent_review", arguments: {
      reviewId: "55555555-5555-4555-8555-555555555555", startReview: false, resumeOnly: true,
    } },
    { name: "open_agent_debugger", arguments: { agentName: "ZAVA Visual Merchandizer" } },
    { name: "open_evaluation_builder", arguments: { agentName: "ZAVA Visual Merchandizer" } },
    { name: "start_agent_review", arguments: {
      environmentId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      componentIdUnique: "33333333-3333-4333-8333-333333333333",
      projectName: "Offline auth boundary", confirmed: true,
    } },
  ]) {
    const requestId = ++id;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${expiredToken}`, Origin: "https://copilotstudio.test.microsoft.com",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: request }),
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer .*error="invalid_token"/);
    assert.match(response.headers.get("access-control-expose-headers") ?? "", /WWW-Authenticate/i);
    const body = await response.json() as { id?: number; error?: { data?: { code?: string } } };
    assert.equal(body.id, requestId);
    assert.equal(body.error?.data?.code, "AUTH_REQUIRED");
  }
  const reviewId = "55555555-5555-4555-8555-555555555555";
  const rejected = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      Authorization: "Bearer obo-rejected-caller-fixture",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: ++id, method: "tools/call",
      params: { name: "open_agent_review", arguments: { reviewId, startReview: false, resumeOnly: true } },
    }),
  });
  assert.equal(rejected.status, 401, output);
  assert.match(rejected.headers.get("www-authenticate") ?? "", /^Bearer .*error="invalid_token"/);
  const rejectedBody = await rejected.json() as {
    result?: { isError?: boolean; structuredContent?: { reviewId?: string; state?: string; error?: { code?: string } } };
  };
  assert.equal(rejectedBody.result?.isError, true);
  assert.equal(rejectedBody.result?.structuredContent?.reviewId, reviewId);
  assert.equal(rejectedBody.result?.structuredContent?.state, "error");
  assert.equal(rejectedBody.result?.structuredContent?.error?.code, "AUTH_REQUIRED");
  assert.equal(output.match(/AUTH_FIXTURE_OBO_REJECTION/g)?.length, 1);
  const anonymous = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: ++id, method: "resources/read",
      params: { uri: "ui://open_agent_debugger/v1.0.18/agent-debugger.html" },
    }),
  });
  assert.equal(anonymous.status, 200);
  const body = await anonymous.json() as { result?: { contents?: { mimeType?: string; text?: string }[] } };
  assert.equal(body.result?.contents?.[0]?.mimeType, "text/html;profile=mcp-app");
  assert.match(body.result?.contents?.[0]?.text ?? "", /<!doctype html/i);
  assert.doesNotMatch(output, /AUTH_FIXTURE_REMOTE_FETCH|AUTH_FIXTURE_MUTATION/);
});
