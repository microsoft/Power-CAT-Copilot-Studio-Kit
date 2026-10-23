import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthenticationConfig } from "../auth.js";

test("prefers dedicated runtime Entra credentials over ATK-managed values", () => {
  assert.deepEqual(
    resolveAuthenticationConfig({
      AGENT_REVIEW_MCP_CLIENT_ID: "managed-client",
      SECRET_AGENT_REVIEW_MCP_CLIENT_SECRET: "managed-secret",
      AAD_APP_TENANT_ID: "managed-tenant",
      ENTRA_CLIENT_ID: "legacy-client",
      ENTRA_CLIENT_SECRET: "legacy-secret",
      ENTRA_TENANT_ID: "legacy-tenant",
    }),
    {
      clientId: "legacy-client",
      clientSecret: "legacy-secret",
      tenantId: "legacy-tenant",
    },
  );
});

test("uses ATK-managed values when dedicated runtime credentials are unavailable", () => {
  assert.deepEqual(
    resolveAuthenticationConfig({
      AGENT_REVIEW_MCP_CLIENT_ID: "managed-client",
      SECRET_AGENT_REVIEW_MCP_CLIENT_SECRET: "managed-secret",
      AAD_APP_TENANT_ID: "managed-tenant",
    }),
    {
      clientId: "managed-client",
      clientSecret: "managed-secret",
      tenantId: "managed-tenant",
    },
  );
});

test("rejects incomplete authentication configuration", () => {
  assert.throws(
    () => resolveAuthenticationConfig({
      AGENT_REVIEW_MCP_CLIENT_ID: "managed-client",
      AAD_APP_TENANT_ID: "managed-tenant",
    }),
    /Agent Review authentication is not configured/,
  );
});
