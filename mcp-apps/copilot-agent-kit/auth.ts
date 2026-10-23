import { AsyncLocalStorage } from "node:async_hooks";
import { ReviewError } from "./src/agent-review/server/types.js";

const callerTokenRejection = new AsyncLocalStorage<() => void>();

export function withCallerTokenRejection<T>(onRejected: () => void, operation: () => Promise<T>): Promise<T> {
  return callerTokenRejection.run(onRejected, operation);
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  error_codes?: number[];
}

export function resolveAuthenticationConfig(
  environment: Record<string, string | undefined>,
): { clientId: string; clientSecret: string; tenantId: string } {
  const clientId = environment.ENTRA_CLIENT_ID ?? environment.AGENT_REVIEW_MCP_CLIENT_ID;
  const clientSecret = environment.ENTRA_CLIENT_SECRET ?? environment.SECRET_AGENT_REVIEW_MCP_CLIENT_SECRET;
  const tenantId = environment.ENTRA_TENANT_ID ?? environment.AAD_APP_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error("Agent Review authentication is not configured.");
  }
  return { clientId, clientSecret, tenantId };
}

export function readBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

export function callerTokenIsOutsideTimeRange(token: string | undefined, nowSeconds = Date.now() / 1000): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return false;
  // Decoded times can reject a token, but cannot authenticate it. Entra still validates OBO assertions.
  const expired = "exp" in claims && typeof claims.exp === "number"
    && Number.isFinite(claims.exp) && claims.exp <= nowSeconds;
  const notYetValid = "nbf" in claims && typeof claims.nbf === "number"
    && Number.isFinite(claims.nbf) && claims.nbf > nowSeconds;
  return expired || notYetValid;
}

export async function exchangeTokenForResource(
  incomingToken: string,
  resource: URL,
): Promise<string> {
  if (resource.protocol !== "https:" || resource.username || resource.password) {
    throw new Error("The requested resource is not trusted.");
  }
  const { clientId, clientSecret, tenantId } = resolveAuthenticationConfig(process.env);
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        requested_token_use: "on_behalf_of",
        assertion: incomingToken,
        scope: `${resource.origin}/.default`,
      }),
    },
  );
  const result = await response.json() as TokenResponse;
  if (!response.ok || !result.access_token) {
    console.error("Agent Review OBO exchange failed.", {
      resource: resource.origin,
      status: response.status,
      error: result.error ?? "token_exchange_failed",
      errorCode: result.error_codes?.[0],
      description: result.error_description,
    });
    if (result.error === "invalid_grant" && result.error_codes?.includes(500133)) {
      callerTokenRejection.getStore()?.();
      throw new ReviewError(
        "AUTH_REQUIRED",
        "The sign-in token is outside its valid time range (AADSTS500133). Reconnect the Agent Review MCP connection and sign in again.",
      );
    }
    throw new Error(result.error_description ?? "Sign-in is required.");
  }
  return result.access_token;
}
