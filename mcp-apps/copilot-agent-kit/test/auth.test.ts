import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { callerTokenIsOutsideTimeRange, exchangeTokenForResource } from "../auth.js";
import { createServer } from "../server.js";
import { AgentDebuggerService } from "../src/agent-debugger/server/service.js";
import { AgentReviewService } from "../src/agent-review/server/service.js";
import { ReviewError } from "../src/agent-review/server/types.js";

const expiredAssertion = "expired-caller-assertion-fixture";
const resource = new URL("https://api.bap.microsoft.com");
const expiredResponse = {
  error: "invalid_grant",
  error_codes: [500133],
  error_description: "AADSTS500133: Assertion is not within its valid time range.",
};
const signInMessage = "The sign-in token is outside its valid time range (AADSTS500133). Reconnect the Agent Review MCP connection and sign in again.";

test("caller lifetime checks reject expired and future claims without treating decoded data as authentication", () => {
  const token = (claims: unknown) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  assert.equal(callerTokenIsOutsideTimeRange(token({ exp: 999 }), 1000), true);
  assert.equal(callerTokenIsOutsideTimeRange(token({ exp: 1000 }), 1000), true);
  assert.equal(callerTokenIsOutsideTimeRange(token({ exp: 1100, nbf: 1001 }), 1000), true);
  assert.equal(callerTokenIsOutsideTimeRange(token({ exp: 1100, nbf: 1000 }), 1000), false);
  for (const input of [undefined, "opaque-assertion", "header.bm90LWpzb24.signature",
    token(null), token([]), token({}), token({ exp: "999" })]) {
    assert.equal(callerTokenIsOutsideTimeRange(input, 1000), false);
  }
});

function fixture(context: TestContext, respond: (body: URLSearchParams) => Response) {
  const environment = {
    ENTRA_CLIENT_ID: "offline-client-id",
    ENTRA_CLIENT_SECRET: "offline-client-secret-not-a-credential",
    ENTRA_TENANT_ID: "offline-tenant-id",
  };
  const previous = Object.entries(environment).map(([key]) => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(environment)) process.env[key] = value;
  context.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const logs = context.mock.method(console, "error", () => {});
  const fetch = context.mock.method(globalThis, "fetch", async (input, options) => {
    assert.equal(String(input), "https://login.microsoftonline.com/offline-tenant-id/oauth2/v2.0/token");
    assert.equal(options?.method, "POST");
    assert(options.body instanceof URLSearchParams);
    assert.equal(options.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(options.body.get("requested_token_use"), "on_behalf_of");
    assert.equal(options.body.get("scope"), "https://api.bap.microsoft.com/.default");
    return respond(options.body);
  });
  return { fetch, logs };
}

test("an expired caller assertion reports AUTH_REQUIRED without an automatic retry", async context => {
  const state = fixture(context, () => Response.json(expiredResponse, { status: 400 }));
  await assert.rejects(exchangeTokenForResource(expiredAssertion, resource), error => {
    assert(error instanceof ReviewError);
    assert.equal(error.code, "AUTH_REQUIRED");
    assert.equal(error.message, signInMessage);
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(state.fetch.mock.callCount(), 1);
  assert.equal(state.logs.mock.callCount(), 1);
  assert.deepEqual(state.logs.mock.calls[0].arguments, ["Agent Review OBO exchange failed.", {
    resource: resource.origin, status: 400, error: "invalid_grant", errorCode: 500133,
    description: expiredResponse.error_description,
  }]);
});

test("a subsequent explicit exchange uses its fresh caller assertion, not the expired one", async context => {
  const freshAssertion = "fresh-caller-assertion-fixture";
  const assertions: (string | null)[] = [];
  const state = fixture(context, body => {
    const assertion = body.get("assertion");
    assertions.push(assertion);
    return assertion === freshAssertion
      ? Response.json({ access_token: "offline-resource-token" })
      : Response.json(expiredResponse, { status: 400 });
  });
  await assert.rejects(exchangeTokenForResource(expiredAssertion, resource));
  assert.equal(state.fetch.mock.callCount(), 1);
  assert.equal(await exchangeTokenForResource(freshAssertion, resource), "offline-resource-token");
  assert.deepEqual(assertions, [expiredAssertion, freshAssertion]);
  assert.equal(state.fetch.mock.callCount(), 2);
});

test("an unrelated OBO failure retains its existing diagnostic instead of an expiry diagnosis", async context => {
  const description = "Unrelated token-exchange fixture failure.";
  const state = fixture(context, () => Response.json({
    error: "invalid_grant", error_codes: [7000222], error_description: description,
  }, { status: 400 }));
  await assert.rejects(exchangeTokenForResource(expiredAssertion, resource), error => {
    assert(error instanceof Error);
    assert(!(error instanceof ReviewError));
    assert.equal(error.message, description);
    return true;
  });
  assert.equal(state.fetch.mock.callCount(), 1);
});

test("the expiry code alone does not replace an unrelated OAuth diagnostic", async context => {
  const description = "Unrelated OAuth error with a numeric code.";
  const state = fixture(context, () => Response.json({
    error: "invalid_client", error_codes: [500133], error_description: description,
  }, { status: 400 }));
  await assert.rejects(exchangeTokenForResource(expiredAssertion, resource), error => {
    assert(error instanceof Error);
    assert(!(error instanceof ReviewError));
    assert.equal(error.message, description);
    return true;
  });
  assert.equal(state.fetch.mock.callCount(), 1);
});

test("all three SDK openers report the verified assertion expiry without work or retry", async context => {
  const state = fixture(context, () => Response.json(expiredResponse, { status: 400 }));
  const refuse = async () => {
    await exchangeTokenForResource(expiredAssertion, resource);
    throw new Error("The expired assertion fixture unexpectedly succeeded.");
  };
  context.mock.method(AgentReviewService.prototype, "getResult", refuse);
  context.mock.method(AgentReviewService.prototype, "listEnvironments", refuse);
  context.mock.method(AgentDebuggerService.prototype, "listEnvironments", refuse);
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => {
    throw new Error("Authentication failure must not start a Review.");
  });
  const reviewId = "55555555-5555-4555-8555-555555555555";
  const server = createServer(expiredAssertion);
  const client = new Client({ name: "assertion-expiry-fixture", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(left), server.connect(right)]);
    for (const request of [
      { name: "open_agent_review", arguments: { reviewId, startReview: false, resumeOnly: true } },
      { name: "open_agent_debugger", arguments: { agentName: "ZAVA Visual Merchandizer" } },
      { name: "open_evaluation_builder", arguments: { agentName: "ZAVA Visual Merchandizer" } },
    ]) {
      const before = state.fetch.mock.callCount();
      const output = await client.callTool(request);
      assert.equal(output.isError, true);
      assert.deepEqual(output.structuredContent?.error, {
        code: "AUTH_REQUIRED", message: signInMessage, retryable: false,
      });
      assert.equal(output.structuredContent?.deferred, undefined);
      if (request.name === "open_agent_review") {
        assert.equal(output.structuredContent?.reviewId, reviewId);
        assert.equal(output.structuredContent?.state, "error");
      }
      assert.equal(state.fetch.mock.callCount(), before + 1);
    }
    assert.equal(start.mock.callCount(), 0);
  } finally {
    await client.close();
    await server.close();
  }
});
