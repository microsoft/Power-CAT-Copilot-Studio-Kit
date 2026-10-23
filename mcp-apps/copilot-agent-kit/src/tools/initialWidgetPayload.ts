import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

const inlineResultLimit = 65_536;
const resultChunkSize = 52_000;
const completeContexts = new Map<string, {
  caller: string; expires: number; result: CallToolResult; bytes: number; encoded: string; hash: string;
}>();
const contextLifetimeMs = 30 * 60 * 1000;
const analysisFields = [
  "processedTranscript", "conversationData", "agentConfig", "componentNameBySchemaName",
  "connectedAgents", "recommendations", "sessions", "usage", "usageBySession",
];
export type WidgetOpeningTool = "open_agent_review" | "open_agent_debugger" | "open_evaluation_builder"
  | "show_agent_map" | "browse_agent_reviews";

function contextFailure(code: string, message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], structuredContent: { state: "error", error: { code, message } }, isError: true };
}
export async function getInitialWidgetData(
  token: string | undefined,
  input: { contextId: string; index?: number; sha256?: string },
): Promise<CallToolResult> {
  if (!token) return contextFailure("AUTH_REQUIRED", "Sign in to load the complete app data.");
  const entry = completeContexts.get(input.contextId);
  const caller = createHash("sha256").update(token).digest("hex");
  if (!entry || entry.caller !== caller || entry.expires < Date.now()) {
    return contextFailure("INITIAL_CONTEXT_UNAVAILABLE", "The complete initial context is unavailable or expired for this signed-in session. This read did not start or save anything.");
  }
  if (input.index !== undefined) {
    const count = Math.ceil(entry.encoded.length / resultChunkSize);
    if (input.sha256 !== entry.hash || !Number.isInteger(input.index) || input.index < 0 || input.index >= count) {
      return contextFailure("INITIAL_CONTEXT_CHANGED", "The requested complete-data chunk does not match its immutable caller-scoped context.");
    }
    return { content: [], structuredContent: { index: input.index, sha256: entry.hash,
      data: entry.encoded.slice(input.index * resultChunkSize, (input.index + 1) * resultChunkSize) } };
  }
  return boundedToolResult(structuredClone(entry.result), token, input.contextId);
}

function summary(data: Record<string, unknown>, opener?: string): Record<string, unknown> {
  const output: Record<string, unknown> = { state: data.state ?? "loading" };
  for (const field of ["view", "selectionId", "targetResolved", "environmentId", "agentId", "componentIdUnique", "conversationId", "startedAfter", "startedBefore", "reviewId", "jobId", "projectName", "startedAt", "draftId", "testType", "candidateCount"]) {
    const value = data[field];
    if ((typeof value === "string" && value.length <= 500) || typeof value === "boolean" || typeof value === "number") output[field] = value;
  }
  if (["review", "debugger", "evaluation"].includes(typeof data.view === "string" ? data.view : "")
    || ["open_agent_review", "open_agent_debugger", "open_evaluation_builder"].includes(opener ?? "")) {
    const target = data.target && typeof data.target === "object" ? data.target : undefined;
    for (const field of ["environment", "agent", "conversation"] as const) {
      const selected: unknown = data[field] ?? (target ? Object.entries(target).find(([name]) => name === field)?.[1] : undefined);
      if (!selected || typeof selected !== "object" || !("id" in selected) || !("name" in selected)
        || typeof selected.id !== "string" || typeof selected.name !== "string"
        || selected.id.length > 500 || selected.name.length > 2000) continue;
      const compact: Record<string, unknown> = { id: selected.id, name: selected.name };
      if (opener !== "open_evaluation_builder" && data.view !== "evaluation") {
        const fields = field === "environment" ? ["region", "url"]
          : field === "agent" ? ["componentIdUnique", "schemaName", "experience"] : [];
        for (const [key, value] of Object.entries(selected)) {
          if (fields.includes(key) && typeof value === "string" && value.length <= 2000) compact[key] = value;
        }
      }
      output[field] = compact;
      output[`${field}Id`] = selected.id;
    }
  }
  return output;
}

function storeContext(result: CallToolResult, token: string): string | CallToolResult {
  for (const [id, entry] of completeContexts) if (entry.expires < Date.now()) completeContexts.delete(id);
  const serialized = Buffer.from(JSON.stringify(result), "utf8");
  const encoded = gzipSync(serialized).toString("base64");
  const bytes = serialized.byteLength + Buffer.byteLength(encoded);
  const storedBytes = [...completeContexts.values()].reduce((total, entry) => total + entry.bytes, 0);
  if (completeContexts.size >= 32 || serialized.byteLength > 8 * 1024 * 1024 || storedBytes + bytes > 64 * 1024 * 1024) {
    return contextFailure("INITIAL_CONTEXT_LIMIT", "The complete app context exceeds the temporary delivery capacity. No records were truncated. Load a narrower saved-data selection.");
  }
  const contextId = randomUUID();
  completeContexts.set(contextId, {
    caller: createHash("sha256").update(token).digest("hex"), expires: Date.now() + contextLifetimeMs,
    result: structuredClone(result), bytes, encoded, hash: createHash("sha256").update(serialized).digest("hex"),
  });
  return contextId;
}

export function boundedToolResult(result: CallToolResult, token?: string, existingContextId?: string): CallToolResult {
  const serialized = Buffer.from(JSON.stringify(result), "utf8");
  if (serialized.byteLength <= inlineResultLimit) return result;
  if (!token) return contextFailure("AUTH_REQUIRED", "Sign in to load the complete app data.");
  if (serialized.byteLength > 8 * 1024 * 1024) {
    return contextFailure("INITIAL_CONTEXT_LIMIT", "The complete app context exceeds the delivery capacity. No records were truncated. Load a narrower saved-data selection.");
  }
  const encoded = gzipSync(serialized).toString("base64");
  const delivery = {
    encoding: "gzip-base64", bytes: serialized.byteLength,
    sha256: createHash("sha256").update(serialized).digest("hex"), data: encoded,
  };
  const ui = result._meta?.ui;
  const opener = ui && typeof ui === "object" && "resourceUri" in ui && typeof ui.resourceUri === "string"
    ? /^ui:\/\/(open_agent_review|open_agent_debugger|open_evaluation_builder)\//.exec(ui.resourceUri)?.[1] : undefined;
  const bounded: CallToolResult = {
    ...(result.isError ? { isError: true } : {}),
    content: [{ type: "text", text: result.isError
      ? "The complete tool error is available to the app through lossless delivery."
      : "The complete tool result is available to the app through lossless delivery." }],
    structuredContent: summary(result.structuredContent ?? {}, opener),
    _meta: { ...(result._meta?.ui ? { ui: result._meta.ui } : {}), completeToolResult: delivery },
  };
  if (Buffer.byteLength(JSON.stringify(bounded), "utf8") <= inlineResultLimit) return bounded;
  const contextId = existingContextId ?? storeContext(result, token);
  if (typeof contextId !== "string") return contextId;
  const entry = completeContexts.get(contextId);
  if (!entry) return contextFailure("INITIAL_CONTEXT_UNAVAILABLE", "The complete tool context is unavailable.");
  const { data, ...manifest } = delivery;
  bounded._meta = { ...(result._meta?.ui ? { ui: result._meta.ui } : {}), completeToolResult: {
    ...manifest, contextId, chunkCount: Math.ceil(entry.encoded.length / resultChunkSize),
  } };
  if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > inlineResultLimit) {
    if (!existingContextId) completeContexts.delete(contextId);
    return contextFailure("INITIAL_METADATA_LIMIT", "The complete tool result metadata exceeds the delivery bound. No partial app data was returned.");
  }
  return bounded;
}

function identifier(data: Record<string, unknown>, field: string): string | undefined {
  const direct = data[`${field}Id`];
  if (typeof direct === "string" && direct) return direct;
  const item = data[field];
  return typeof item === "object" && item !== null && "id" in item
    && typeof item.id === "string" && item.id ? item.id : undefined;
}

export function compactInitialWidgetResult(
  result: CallToolResult,
  tool: WidgetOpeningTool,
  token?: string,
): CallToolResult {
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= inlineResultLimit) return result;
  const data = { ...result.structuredContent };
  const deferred: string[] = Array.isArray(data.deferred) ? [...new Set(data.deferred.filter((field): field is string => typeof field === "string"))] : [];
  const environmentId = identifier(data, "environment");
  const agentId = identifier(data, "agent");
  if (environmentId && Array.isArray(data.agents)) {
    delete data.agents;
    if (!deferred.includes("agents")) deferred.push("agents");
  }
  if (tool === "open_agent_review" && typeof data.reviewId === "string" && data.model != null) {
    delete data.model;
    deferred.push("model");
  }
  if (tool === "open_agent_debugger" && environmentId && agentId) {
    if (Array.isArray(data.conversations)) {
      delete data.conversations;
      if (!deferred.includes("conversations")) deferred.push("conversations");
    }
    if (identifier(data, "conversation") && data.processedTranscript != null) {
      for (const field of analysisFields) delete data[field];
      deferred.push("analysis");
    }
  }
  const compact = deferred.length ? { ...result, structuredContent: { ...data, deferred } } : result;
  const bytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
  if (bytes <= inlineResultLimit) return compact;
  if (!token) return contextFailure("AUTH_REQUIRED", "Sign in to load the complete app data.");
  const contextId = storeContext(result, token);
  if (typeof contextId !== "string") return contextId;
  const bounded: CallToolResult = {
    ...(result.isError ? { isError: true } : {}),
    content: [{ type: "text", text: "The app will load the complete initial data through a caller-scoped read-only call." }],
    structuredContent: { ...summary(data, tool), contextId, deferred: ["context"] }, _meta: result._meta,
  };
  if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > inlineResultLimit) {
    completeContexts.delete(contextId);
    return contextFailure("INITIAL_METADATA_LIMIT", "The initial app metadata exceeds the delivery bound. No partial app data was returned.");
  }
  return bounded;
}
