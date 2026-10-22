import type { App } from "@modelcontextprotocol/ext-apps";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;

interface ChunkManifest {
  contextId: string;
  sha256: string;
  bytes: number;
  chunkCount: number;
}

export function createCompleteToolResultReader(callTool: App["callServerTool"]) {
  let currentContext = "";
  let chunks = new Map<number, Promise<string>>();
  return (result: ToolResult): Promise<ToolResult> => {
    let usedCache: Map<number, Promise<string>> | undefined;
    let failedChunk = false;
    return decodeToolResult(result, (manifest, position) => {
      const key = JSON.stringify(manifest);
      if (currentContext !== key) {
        currentContext = key;
        chunks = new Map();
      }
      const cache = chunks;
      usedCache = cache;
      let pending = cache.get(position);
      if (!pending) {
        const read = readChunk(manifest, position, callTool).catch(error => {
          if (cache.get(position) === read) cache.delete(position);
          throw error;
        });
        cache.set(position, read);
        pending = read;
      }
      return pending.catch(error => {
        failedChunk = true;
        throw error;
      });
    }).catch(error => {
      if (!failedChunk && usedCache === chunks) {
        currentContext = "";
        chunks = new Map();
      }
      throw error;
    });
  };
}

export function readCompleteToolResult(result: ToolResult, callTool: App["callServerTool"]): Promise<ToolResult> {
  return createCompleteToolResultReader(callTool)(result);
}

async function readChunk(manifest: ChunkManifest, position: number, callTool: App["callServerTool"]): Promise<string> {
  const chunk = await callTool({ name: "get_initial_widget_data", arguments: {
    contextId: manifest.contextId, index: position, sha256: manifest.sha256,
  } });
  if (chunk.isError || serializedBytes(chunk) > 65_536
    || chunk.structuredContent?.index !== position || chunk.structuredContent.sha256 !== manifest.sha256
    || typeof chunk.structuredContent.data !== "string") {
    throw new Error("A complete tool result chunk is unavailable, changed or too large.");
  }
  return chunk.structuredContent.data;
}

async function decodeToolResult(
  result: ToolResult,
  read: (manifest: ChunkManifest, position: number) => Promise<string>,
): Promise<ToolResult> {
  const delivery = result._meta?.completeToolResult;
  if (delivery === undefined) return result;
  if (serializedBytes(result) > 65_536 || !delivery || typeof delivery !== "object"
    || !("encoding" in delivery) || delivery.encoding !== "gzip-base64"
    || !("bytes" in delivery) || typeof delivery.bytes !== "number" || !Number.isInteger(delivery.bytes)
    || delivery.bytes < 1 || delivery.bytes > 8 * 1024 * 1024
    || !("sha256" in delivery) || typeof delivery.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(delivery.sha256)) {
    throw new Error("The complete tool result manifest is invalid or too large.");
  }
  let encoded: string;
  if ("data" in delivery && typeof delivery.data === "string") encoded = delivery.data;
  else {
    if (!("contextId" in delivery) || typeof delivery.contextId !== "string"
      || !("chunkCount" in delivery) || typeof delivery.chunkCount !== "number"
      || !Number.isInteger(delivery.chunkCount) || delivery.chunkCount < 1 || delivery.chunkCount > 256) {
      throw new Error("The complete tool result chunk manifest is invalid.");
    }
    const manifest: ChunkManifest = {
      contextId: delivery.contextId, sha256: delivery.sha256,
      bytes: delivery.bytes, chunkCount: delivery.chunkCount,
    };
    const chunks: string[] = [];
    for (let offset = 0; offset < delivery.chunkCount; offset += 4) {
      const batch = await Promise.all(Array.from({ length: Math.min(4, delivery.chunkCount - offset) },
        (_, index) => read(manifest, offset + index)));
      chunks.push(...batch);
    }
    encoded = chunks.join("");
  }
  const compressed = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    length += item.value.byteLength;
    if (length > delivery.bytes) {
      await reader.cancel();
      throw new Error("The complete tool result exceeds its declared byte count.");
    }
    parts.push(item.value);
  }
  if (length !== delivery.bytes) throw new Error("The complete tool result byte count does not match.");
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.byteLength; }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== delivery.sha256) throw new Error("The complete tool result hash does not match.");
  return CallToolResultSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
