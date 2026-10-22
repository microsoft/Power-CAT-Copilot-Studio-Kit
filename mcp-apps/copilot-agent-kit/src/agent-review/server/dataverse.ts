import { exchangeTokenForResource } from "../../../auth.js";
import { ReviewError, type Guid } from "./types.js";
import { buildAtomicChangeset, EVALUATION_BATCH_BYTES, validateAtomicResponse, type AtomicCreate } from "../../evaluation/batch.js";

export interface DiscoveryEnvironment {
  id: Guid;
  name: string;
  region: string;
  apiUrl: URL;
}

interface ODataPage<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

export async function readBoundedDataverseRows<T>(
  origin: URL,
  path: string,
  limits: { maxItems: number; maxBytes: number },
  request: (path: string) => Promise<Response>,
): Promise<T[]> {
  const rows: T[] = [];
  const visited = new Set<string>();
  let next: string | undefined = path;
  let bytes = 0;
  while (next) {
    const target = new URL(next, `${origin.origin}/api/data/v9.2/`);
    if (target.origin !== origin.origin || !target.pathname.startsWith("/api/data/v9.2/")) {
      throw new ReviewError("UNTRUSTED_PAGING", "Dataverse returned an untrusted paging link.");
    }
    if (visited.has(target.href)) throw new ReviewError("INVALID_PAGING", "Dataverse returned a repeated paging link.");
    visited.add(target.href);
    const response = await request(next);
    const reader = response.body?.getReader();
    if (!reader) throw new ReviewError("DATAVERSE_INVALID_RESPONSE", "Dataverse returned an empty data response.");
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > limits.maxBytes) {
          await reader.cancel();
          throw new ReviewError("DATA_LIMIT_EXCEEDED", "The data response exceeds the safe size limit.");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let page: ODataPage<T>;
    try {
      page = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ODataPage<T>;
    } catch {
      throw new ReviewError("DATAVERSE_INVALID_RESPONSE", "Dataverse returned invalid JSON.");
    }
    if (!page || !Array.isArray(page.value)
      || (page["@odata.nextLink"] !== undefined && typeof page["@odata.nextLink"] !== "string")) {
      throw new ReviewError("DATAVERSE_INVALID_RESPONSE", "Dataverse returned an invalid data page.");
    }
    if (!page.value.length && page["@odata.nextLink"]) {
      throw new ReviewError("INVALID_PAGING", "Dataverse returned an empty page with a paging link.");
    }
    if (rows.length + page.value.length > limits.maxItems) {
      throw new ReviewError("DATA_LIMIT_EXCEEDED", "The data response exceeds the safe record limit.");
    }
    rows.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return rows;
}

const entitySetCache = new Map<string, string>();
// Confirmed entity set names. A user can have access to the records of a table but not to its
// metadata (no prvReadEntity), and then the metadata read returns HTTP 401 or 403. Only these
// tables use the confirmed name after such a refusal. Other tables and statuses keep the error.
const KNOWN_ENTITY_SETS: ReadonlyMap<string, string> = new Map([["cat_agentreviews", "cat_agentreviewses"]]);
const DISCOVERY_RETRY_DELAY_MS = 250;

type DiscoveryFetch = (url: URL, init: RequestInit) => Promise<Response>;
type Delay = (milliseconds: number) => Promise<void>;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchDiscoveryResponse(
  url: URL,
  init: RequestInit,
  fetcher: DiscoveryFetch = fetch,
  wait: Delay = delay,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, init);
      const retryableStatus = response.status === 429 || response.status >= 500;
      if (!retryableStatus || attempt === 1) return response;
    } catch (error) {
      if (attempt === 1) {
        throw new ReviewError(
          "DISCOVERY_UNAVAILABLE",
          "Environment discovery is temporarily unavailable. Try again.",
          true,
        );
      }
    }
    await wait(DISCOVERY_RETRY_DELAY_MS);
  }
  throw new ReviewError(
    "DISCOVERY_UNAVAILABLE",
    "Environment discovery is temporarily unavailable. Try again.",
    true,
  );
}

export function guid(value: string): Guid {
  const normalized = value.replace(/[{}]/g, "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new ReviewError("INVALID_ID", "A valid identifier is required.");
  }
  return normalized as Guid;
}

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

export class DataverseClient {
  constructor(
    readonly origin: URL,
    private readonly incomingToken: string,
  ) {
    if (origin.protocol !== "https:") throw new ReviewError("UNTRUSTED_ENVIRONMENT", "The environment is not trusted.");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const target = new URL(path, `${this.origin.origin}/api/data/v9.2/`);
    if (target.origin !== this.origin.origin || !target.pathname.startsWith("/api/data/v9.2/")) {
      throw new ReviewError("UNTRUSTED_ENVIRONMENT", "The environment request was rejected.");
    }
    const token = await exchangeTokenForResource(this.incomingToken, this.origin);
    const response = await fetch(target, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-ms-service-request-id");
      const retryable = response.status === 429 || response.status >= 500;
      const message = response.status === 401 || response.status === 403
        ? "You do not have access to this environment."
        : `Dataverse request failed (${response.status})${requestId ? ` [${requestId}]` : ""}.`;
      throw new ReviewError(response.status === 404 ? "NOT_FOUND" : "DATAVERSE_ERROR", message, retryable, {
        dataverse: {
          method: init.method ?? "GET",
          url: `${target.origin}${target.pathname}`,
          status: response.status,
          ...(requestId ? { requestId } : {}),
        },
      });
    }
    return response;
  }

  async list<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path;
    while (next) {
      const response = await this.request(next);
      const page = await response.json() as ODataPage<T>;
      items.push(...(page.value ?? []));
      const candidate = page["@odata.nextLink"];
      if (!candidate) break;
      const url = new URL(candidate);
      if (url.origin !== this.origin.origin || !url.pathname.startsWith("/api/data/v9.2/")) {
        throw new ReviewError("UNTRUSTED_PAGING", "Dataverse returned an untrusted paging link.");
      }

      next = `${url.pathname}${url.search}`;
    }
    return items;
  }

  async listBounded<T>(path: string, limits: { maxItems: number; maxBytes: number }): Promise<T[]> {
    return readBoundedDataverseRows<T>(this.origin, path, limits, (next) => this.request(next));
  }

  async get<T>(path: string): Promise<T> {
    return this.request(path).then((response) => response.json() as Promise<T>);
  }

  async entitySet(logicalName: string): Promise<string> {
    if (!/^[a-z][a-z0-9_]*$/i.test(logicalName)) {
      throw new ReviewError("INVALID_TABLE_NAME", "The Dataverse table name is invalid.");
    }
    const cacheKey = `${this.origin.origin}:${logicalName.toLocaleLowerCase()}`;
    const cached = entitySetCache.get(cacheKey);
    if (cached) return cached;

    let metadata: { EntitySetName?: string };
    try {
      metadata = await this.get<{ EntitySetName?: string }>(
        `EntityDefinitions(LogicalName='${escapeOData(logicalName)}')?$select=EntitySetName`,
      );
    } catch (error) {
      const status = error instanceof ReviewError ? error.diagnostics?.dataverse?.status : undefined;
      const known = status === 401 || status === 403 ? KNOWN_ENTITY_SETS.get(logicalName.toLowerCase()) : undefined;
      if (!known) throw error;
      entitySetCache.set(cacheKey, known);
      return known;
    }
    const entitySet = metadata.EntitySetName?.trim();
    if (!entitySet || !/^[a-z][a-z0-9_]*$/i.test(entitySet)) {
      throw new ReviewError("TABLE_NOT_FOUND", `The ${logicalName} table is unavailable.`);
    }
    entitySetCache.set(cacheKey, entitySet);
    return entitySet;
  }

  async create<T>(entitySet: string, body: unknown): Promise<{ id: Guid; value?: T }> {
    const response = await this.request(entitySet, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const entityId = response.headers.get("OData-EntityId") ?? response.headers.get("odata-entityid");
    const match = entityId && /\(([0-9a-f-]{36})\)/i.exec(entityId);
    const value = response.status === 204 ? undefined : await response.json() as T;
    const bodyId = value && typeof value === "object"
      ? Object.values(value as Record<string, unknown>).find((entry) => typeof entry === "string" && /^[0-9a-f-]{36}$/i.test(entry))
      : undefined;
    return { id: guid(match?.[1] ?? String(bodyId ?? "")), value };
  }

  async createAtomic(creates: readonly AtomicCreate[]): Promise<void> {
    const payload = buildAtomicChangeset(this.origin, creates);
    const response = await this.request("$batch", {
      method: "POST", headers: { "Content-Type": payload.contentType }, body: payload.body,
    });
    const reader = response.body?.getReader();
    if (!reader) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "Dataverse returned an empty batch response.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > EVALUATION_BATCH_BYTES) {
          await reader.cancel();
          throw new ReviewError("EVALUATION_BATCH_RESPONSE", "The batch response exceeds the safe size limit.");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    validateAtomicResponse(response.headers.get("Content-Type") ?? "", Buffer.concat(chunks).toString("utf8"), creates.length);
  }

  async update(path: string, body: unknown, etag = "*"): Promise<void> {
    await this.request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    await this.request(path, { method: "DELETE" });
  }

  async upload(path: string, bytes: Uint8Array, fileName: string): Promise<void> {
    await this.request(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-ms-file-name": fileName,
      },
      body: Buffer.from(bytes),
    });
  }

  async download(path: string): Promise<Uint8Array> {
    const response = await this.request(path);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export async function discoverEnvironments(incomingToken: string): Promise<DiscoveryEnvironment[]> {
  const configured = new URL(process.env.DATAVERSE_GLOBAL_DISCOVERY_URL ?? "https://globaldisco.crm.dynamics.com");
  const token = await exchangeTokenForResource(incomingToken, configured);
  const response = await fetchDiscoveryResponse(new URL(
    "/api/discovery/v2.0/Instances?$select=ApiUrl,FriendlyName,EnvironmentId,State,Region",
    configured,
  ), {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ReviewError("DISCOVERY_FAILED", "Environment discovery failed.", response.status >= 500);
  const data = await response.json() as {
    value?: Array<Record<string, unknown>>;
  };
  return (data.value ?? []).flatMap((row) => {
    const state = String(row.State ?? row.state ?? "");
    const api = String(row.ApiUrl ?? row.apiUrl ?? "");
    const enabled = !state || state === "0" || /enabled|ready/i.test(state);
    if (!api.startsWith("https://") || !enabled) return [];
    try {
      return [{
        id: guid(String(row.EnvironmentId ?? row.environmentId ?? "")),
        name: String(row.FriendlyName ?? row.friendlyName ?? "Environment"),
        region: String(row.Region ?? row.region ?? ""),
        apiUrl: new URL(api),
      }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.name.localeCompare(right.name));
}
