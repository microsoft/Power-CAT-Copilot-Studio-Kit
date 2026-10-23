import { config } from "dotenv";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import compression from "compression";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import type { OutgoingHttpHeader, OutgoingHttpHeaders } from "node:http";
import path from "node:path";
import { callerTokenIsOutsideTimeRange, readBearerToken, withCallerTokenRejection } from "./auth.js";
import { createServer } from "./server.js";

const callerAuthenticationChallenge =
  'Bearer error="invalid_token", error_description="The sign-in token is outside its valid time range. Obtain a new token."';

config({ path: "env/.env.local" });
config({ path: "env/.env.local.user" });
config({ path: ".env" });

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(compression());
  app.use(cors({
    exposedHeaders: ["mcp-session-id", "WWW-Authenticate"],
    allowedHeaders: ["content-type", "authorization", "mcp-session-id", "mcp-protocol-version"],
  }));
  const widgetDir = import.meta.filename.endsWith(".ts")
    ? path.join(import.meta.dirname, "dist", "ui")
    : path.join(import.meta.dirname, "..", "ui");
  app.use("/widgets", express.static(widgetDir));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  app.all("/mcp", async (request: Request, response: Response) => {
    const startedAt = Date.now();
    const method = request.body?.method ?? request.method;
    const target = method === "resources/read"
      ? request.body?.params?.uri
      : method === "tools/call"
        ? request.body?.params?.name
        : undefined;
    response.on("finish", () => {
      const detail = target ? ` ${target}` : "";
      const encoding = response.getHeader("content-encoding") ?? "identity";
      console.log(
        `[MCP] ${method}${detail} -> ${response.statusCode} ${encoding} ${Date.now() - startedAt}ms`,
      );
    });
    const incomingToken = readBearerToken(request.headers.authorization);
    if (callerTokenIsOutsideTimeRange(incomingToken)) {
      response.setHeader("WWW-Authenticate", callerAuthenticationChallenge);
      response.status(401).json({
        jsonrpc: "2.0",
        id: request.body?.id ?? null,
        error: {
          code: -32001,
          message: "The sign-in token is outside its valid time range. Sign in again before you continue.",
          data: { code: "AUTH_REQUIRED", retryable: false },
        },
      });
      return;
    }
    const server = createServer(incomingToken);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      let callerRejected = false;
      await withCallerTokenRejection(() => {
        if (callerRejected) return;
        callerRejected = true;
        response.setHeader("WWW-Authenticate", callerAuthenticationChallenge);
        const writeHead = response.writeHead.bind(response);
        // The SDK writes HTTP 200 for JSON tool errors. Keep its saved-ID body, but challenge the rejected caller.
        response.writeHead = (_statusCode: number,
          statusMessageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
          headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]) =>
          typeof statusMessageOrHeaders === "string"
            ? writeHead(401, "Unauthorized", headers)
            : writeHead(401, statusMessageOrHeaders);
      }, async () => {
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      });
    } catch (error) {
      console.error("Agent Review MCP transport failed.", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          id: request.body?.id ?? null,
          error: { code: -32603, message: "Agent Review request failed." },
        });
      }
    }
  });

  app.listen(port, () => {
    console.log(`Agent Review MCP App: http://localhost:${port}/mcp`);
  });
}

void startServer();
