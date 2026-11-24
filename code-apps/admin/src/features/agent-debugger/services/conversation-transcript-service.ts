import { ensurePowerAppsInitialized } from "../utils/power-apps-init";
import { extractSkiptokenFromNextLink } from "../utils/dataverse-pagination";

import type { IOperationResult } from "@microsoft/power-apps/data";
import { getDataverseClient, escapeODataStringLiteral } from "./dataverse-client";
import type { ConversationData, Message } from "../contracts/conversation";
import type { TranscriptFacets } from "../contracts/filters";
import { extractActivityText, isNonConversationalUserResponse } from "../utils/transcript/extract-activity-text";
import { execTimeToMs, guessStepSubtitle } from "../utils/step-classification";
import { createHarnessFlowResolver, type HarnessToolReference } from "../utils/harness-flow-steps";
import { loadHarnessToolComponents } from "./harness-flow-service";
import {
  activityTimestampMs,
  normalizeTimestampMs,
} from "../utils/transcript/timestamp";

type ListRecordsWithOrganizationParams = {
  organization: string;
  entityName: string;
  prefer?: string;
  accept?: string;
  x_ms_odata_metadata_full?: boolean;
  "MSCRM.IncludeMipSensitivityLabel"?: boolean;
  $select?: string;
  $filter?: string;
  $orderby?: string;
  $expand?: string;
  fetchXml?: string;
  $top?: number;
  $skiptoken?: string;
  partitionId?: string;
};

export type ConversationTranscriptEntity = {
  conversationtranscriptid?: string;
  name?: string;
  content?: string;
  metadata?: string;
  conversationstarttime?: string;
  schematype?: string;
  schemaversion?: string;
  statecode?: number;
  createdon?: string;
};

export type ConversationTranscriptListResponse = {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  value?: ConversationTranscriptEntity[];
};

/**
 * Paginate through a Dataverse connector query, following @odata.nextLink tokens.
 * Returns all collected records across pages, up to the specified safety limits.
 */
async function paginateConnectorQuery<TRecord>(options: {
  buildParams: (skiptoken?: string) => ListRecordsWithOrganizationParams;
  maxRecords: number;
  maxPages: number;
  /** Label for warning logs on failure. */
  label?: string;
}): Promise<{ success: boolean; records: TRecord[]; failedResult?: IOperationResult<ConversationTranscriptListResponse> }> {
  const client = getDataverseClient();
  const allRecords: TRecord[] = [];
  let skiptoken: string | undefined;
  let page = 0;

  while (true) {
    page += 1;
    const params = options.buildParams(skiptoken);

    const result = await client.executeAsync<
      ListRecordsWithOrganizationParams,
      ConversationTranscriptListResponse
    >({
      connectorOperation: {
        tableName: "commondataserviceforapps",
        operationName: "ListRecordsWithOrganization",
        parameters: params,
      },
    });

    if (!result.success) {
      return { success: false, records: allRecords, failedResult: result };
    }

    const records = (result.data?.value ?? []) as TRecord[];
    allRecords.push(...records);

    skiptoken = extractSkiptokenFromNextLink(result.data?.["@odata.nextLink"]);

    if (!skiptoken || records.length === 0) break;
    if (allRecords.length >= options.maxRecords) break;
    if (page >= options.maxPages) break;
  }

  return { success: true, records: allRecords };
}

export async function listConversationTranscripts(options: {
  organizationUrl: string;
  conversationId: string;
  agentId: string;
}): Promise<IOperationResult<ConversationTranscriptListResponse>> {
  await ensurePowerAppsInitialized();

  const safeConversationId = escapeODataStringLiteral(options.conversationId.trim());
  const safeAgentId = escapeODataStringLiteral(options.agentId.trim());

  const result = await paginateConnectorQuery<ConversationTranscriptEntity>({
    buildParams: (skiptoken) => ({
      organization: options.organizationUrl,
      entityName: "conversationtranscripts",
      accept: "application/json",
      prefer: "odata.maxpagesize=500",
      $select:
        "conversationtranscriptid,name,content,metadata,conversationstarttime,schematype,schemaversion,statecode,createdon",
      $filter: `(contains(name,'${safeConversationId}') and _bot_conversationtranscriptid_value eq ${safeAgentId})`,
      $orderby: "conversationstarttime asc,createdon asc",
      $top: 500,
      $skiptoken: skiptoken,
    }),
    maxRecords: 2000,
    maxPages: 10,
  });

  if (!result.success && result.failedResult) {
    return result.failedResult;
  }

  return {
    success: true,
    data: {
      value: result.records,
    },
  };
}

export type ConversationTranscriptListItem = {
  conversationtranscriptid: string;
  name: string;
  createdon: string;
  conversationstarttime: string;
};

/** Fetch the most recent unique transcript conversations for an agent (for dropdown display). */
export async function getRecentAgentTranscripts(options: {
  organizationUrl: string;
  agentBotId: string;
  limit?: number;
  since?: string;
  to?: string;
}): Promise<ConversationTranscriptListItem[]> {
  await ensurePowerAppsInitialized();

  const limit = options.limit ?? 50;
  const maxRecords = limit * 5;

  let filter = `_bot_conversationtranscriptid_value eq ${options.agentBotId}`;
  if (options.since) filter += ` and conversationstarttime ge ${options.since}`;
  if (options.to) filter += ` and conversationstarttime le ${options.to}`;

  const client = getDataverseClient();
  const seen = new Set<string>();
  const unique: ConversationTranscriptListItem[] = [];
  const seenTokens = new Set<string>();
  let skiptoken: string | undefined;
  let recordsRead = 0;
  while (unique.length < limit && recordsRead < maxRecords) {
    // Most agents need only 50 lightweight rows. Read the remaining allowance
    // only when split transcript records prevent filling the conversation list.
    const pageSize = recordsRead === 0 ? limit : maxRecords - recordsRead;
    const result = await client.executeAsync<
      ListRecordsWithOrganizationParams,
      { value?: ConversationTranscriptListItem[]; "@odata.nextLink"?: string }
    >({
      connectorOperation: {
        tableName: "commondataserviceforapps",
        operationName: "ListRecordsWithOrganization",
        parameters: {
          organization: options.organizationUrl,
          entityName: "conversationtranscripts",
          accept: "application/json",
          prefer: `odata.maxpagesize=${pageSize}`,
          $select: "conversationtranscriptid,name,createdon,conversationstarttime",
          $filter: filter,
          $orderby: "conversationstarttime desc,createdon desc",
          // $top suppresses Dataverse continuation links.
          $skiptoken: skiptoken,
        },
      },
    });
    if (!result.success || !Array.isArray(result.data?.value)) {
      throw new Error("Could not load recent conversations. Try again.", { cause: result.error });
    }
    const rows = result.data.value.slice(0, maxRecords - recordsRead);
    recordsRead += rows.length;
    for (const item of rows) {
      if (!item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      unique.push(item);
      if (unique.length >= limit) break;
    }
    if (unique.length >= limit || recordsRead >= maxRecords) break;
    const nextLink = result.data["@odata.nextLink"];
    if (!nextLink) break;
    skiptoken = extractSkiptokenFromNextLink(nextLink);
    if (!rows.length || !skiptoken || seenTokens.has(skiptoken)) {
      throw new Error("Invalid conversation pagination. Could not load recent conversations.");
    }
    seenTokens.add(skiptoken);
  }

  return unique;
}

/**
 * Returns true if the transcript content contains error-indicating activities:
 * - Any activity with type "error"
 * - Any activity with valueType "ErrorTraceData" (e.g. errorCode
 *   ToolIdentifierConflict, SystemError, FlowActionBadRequest, EnforcementMessageC2)
 * - SessionInfo with outcome containing "Escalated"
 * - DynamicPlanStepFinished with state >= 2 (0=Running, 1=Succeeded, 2+=Failed/Error/Cancelled)
 */
function activityHasError(activity: Record<string, unknown>): boolean {
  if (activity["type"] === "error") return true;
  if (activity["valueType"] === "ErrorTraceData") return true;

  if (activity["name"] === "ToolCallTrace:Failed") return true;
  const value = activity["value"] as Record<string, unknown> | undefined;
  if (value?.["toolCallStatus"] === "Failed") return true;

  if (activity["valueType"] === "SessionInfo") {
    const outcome = value?.["outcome"];
    if (typeof outcome === "string" && outcome.toLowerCase().includes("escalated")) {
      return true;
    }
  }

  if (
    activity["name"] === "DynamicPlanStepFinished" ||
    activity["valueType"] === "DynamicPlanStepFinished"
  ) {
    const state = value?.["state"];
    if (typeof state === "number" && state >= 2) return true;
    if (typeof state === "string" && /fail|error|exception|cancel/i.test(state)) return true;
  }

  return false;
}

/**
 * Extract the conversation's channel id from raw transcript content.
 * Prefers the first `message` activity carrying a non-empty `channelId`, but
 * falls back to any activity type (some conversations only carry `channelId`
 * on `event` / `endOfConversation` activities).
 */
export function extractTranscriptChannel(
  content: string | undefined
): string | undefined {
  if (!content) return undefined;
  let parsed: { activities?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(content) as { activities?: Array<Record<string, unknown>> };
  } catch {
    return undefined;
  }
  const activities = parsed.activities ?? [];
  let fallback: string | undefined;
  for (const activity of activities) {
    const channelId = activity["channelId"];
    if (typeof channelId === "string" && channelId.length > 0) {
      if (activity["type"] === "message") return channelId;
      if (!fallback) fallback = channelId;
    }
  }
  return fallback;
}

type FacetStep = {
  taskDialogId: string;
  type?: string;
  observation?: unknown;
};

type FacetAccumulator = {
  userTurns: Set<string>;
  channels: Set<string>;
  outcomes: Set<string>;
  sessionTypes: Set<string>;
  locales: Set<string>;
  stepTypes: Set<string>;
  harnessTools: Map<string, HarnessToolReference>;
  steps: Map<string, FacetStep>;
  startedAt: Map<string, number>;
  finishedAt: Map<string, number>;
  hasError: boolean;
  maxStepDurationMs: number;
};

function createFacetAccumulator(): FacetAccumulator {
  return {
    userTurns: new Set(),
    channels: new Set(),
    outcomes: new Set(),
    sessionTypes: new Set(),
    locales: new Set(),
    stepTypes: new Set(),
    harnessTools: new Map(),
    steps: new Map(),
    startedAt: new Map(),
    finishedAt: new Map(),
    hasError: false,
    maxStepDurationMs: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addString(target: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target.add(trimmed);
}

function facetStepKey(value: Record<string, unknown>): string | undefined {
  const taskDialogId = String(value["taskDialogId"] ?? "").trim();
  if (!taskDialogId) return undefined;
  return `${taskDialogId}:${String(value["stepId"] ?? "")}`;
}

function generativeStepType(value: Record<string, unknown>): string {
  const taskDialogId = String(value["taskDialogId"] ?? "");
  if (taskDialogId.startsWith("MCP:")) return "MCP tool";
  if (String(value["toolName"] ?? "") === "skill") return "Skill";
  switch (String(value["toolKind"] ?? "tool")) {
    case "search":
      return "Knowledge";
    case "agent":
      return "Connected agent";
    case "skill":
      return "Skill";
    default:
      return "Tool";
  }
}

function addActivityFacets(
  accumulator: FacetAccumulator,
  activity: Record<string, unknown>,
): void {
  addString(accumulator.channels, activity["channelId"]);
  addString(accumulator.locales, activity["locale"]);

  const name = typeof activity["name"] === "string" ? activity["name"] : "";
  const valueType = typeof activity["valueType"] === "string" ? activity["valueType"] : "";
  const key = name || valueType;
  const value = isRecord(activity["value"]) ? activity["value"] : {};

  addString(accumulator.locales, value["locale"]);
  if (activityHasError(activity)) accumulator.hasError = true;

  if (valueType === "SessionInfo") {
    addString(accumulator.sessionTypes, value["type"]);
    addString(accumulator.outcomes, value["outcome"]);
  }

  if (key === "ThinkingTrace") {
    accumulator.stepTypes.add("Deep reasoning");
  }

  if (
    key === "DynamicServerInitialize" ||
    key === "DynamicServerInitializeConfirmation" ||
    key === "DynamicServerToolsList"
  ) {
    accumulator.stepTypes.add("MCP server");
  }

  if (key === "ToolCallTrace:Started" || key === "ToolCallTrace:Completed" || key === "ToolCallTrace:Failed") {
    const type = generativeStepType(value);
    const toolName = value["toolName"];
    if (type === "Tool" && typeof toolName === "string" && toolName) {
      const reference = {
        taskDialogId: toolName,
        displayName: String(value["toolDisplayName"] ?? toolName),
      };
      accumulator.harnessTools.set(JSON.stringify(reference), reference);
    } else {
      accumulator.stepTypes.add(type);
    }
    const durationMs = value["durationMs"];
    if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
      accumulator.maxStepDurationMs = Math.max(accumulator.maxStepDurationMs, durationMs);
    }
  }

  if (key === "DynamicPlanStepTriggered") {
    const stepKey = facetStepKey(value);
    if (stepKey) {
      const taskDialogId = String(value["taskDialogId"]);
      accumulator.steps.set(stepKey, {
        ...accumulator.steps.get(stepKey),
        taskDialogId,
        type: typeof value["type"] === "string" ? value["type"] : undefined,
      });
      const timestamp = activityTimestampMs(activity);
      if (timestamp !== undefined) accumulator.startedAt.set(stepKey, timestamp);
    }
  }

  if (key === "DynamicPlanStepFinished" || key === "DynamicPlanStepBlocked") {
    const stepKey = facetStepKey(value);
    if (stepKey) {
      const taskDialogId = String(value["taskDialogId"]);
      accumulator.steps.set(stepKey, {
        ...accumulator.steps.get(stepKey),
        taskDialogId,
        observation: value["observation"],
      });
      const executionTime = value["executionTime"];
      if (typeof executionTime === "string") {
        accumulator.maxStepDurationMs = Math.max(
          accumulator.maxStepDurationMs,
          execTimeToMs(executionTime),
        );
      }
      const timestamp = activityTimestampMs(activity);
      if (timestamp !== undefined) accumulator.finishedAt.set(stepKey, timestamp);
    }
  }
}

function addContentFacets(
  accumulator: FacetAccumulator,
  content: string | undefined,
  sessionKey: string,
  recordId: string,
): void {
  if (!content) return;
  const parsed = safeJsonParse<{ activities?: Array<Record<string, unknown>> }>(content);
  for (const [index, activity] of (parsed?.activities ?? []).entries()) {
    addActivityFacets(accumulator, activity);
    const from = isRecord(activity["from"]) ? activity["from"] : {};
    const role = from["role"];
    if (activity["type"] !== "message" || (role !== 1 && role !== "1" && role !== "user")) continue;
    const displayText = extractActivityText({
      text: typeof activity["text"] === "string" ? activity["text"] : undefined,
      speak: typeof activity["speak"] === "string" ? activity["speak"] : undefined,
      value: activity["value"],
      attachments: Array.isArray(activity["attachments"])
        ? activity["attachments"].filter(isRecord)
        : undefined,
    });
    if (isNonConversationalUserResponse(activity["value"], displayText, activity["channelData"])) continue;
    const id = activity["id"];
    accumulator.userTurns.add(typeof id === "string" && id
      ? `${sessionKey}:${id}`
      : `${recordId}:${index}`);
  }
}

function finalizeFacets(accumulator: FacetAccumulator): TranscriptFacets {
  for (const [key, startedAt] of accumulator.startedAt) {
    const finishedAt = accumulator.finishedAt.get(key);
    if (finishedAt !== undefined && finishedAt >= startedAt) {
      accumulator.maxStepDurationMs = Math.max(
        accumulator.maxStepDurationMs,
        finishedAt - startedAt,
      );
    }
  }

  for (const step of accumulator.steps.values()) {
    const type = step.taskDialogId.startsWith("MCP:")
      ? "MCP tool"
      : guessStepSubtitle(
          step.taskDialogId,
          step.type,
          undefined,
          step.observation,
        );
    if (type) accumulator.stepTypes.add(type);
  }

  return {
    userTurnCount: accumulator.userTurns.size,
    channels: [...accumulator.channels],
    hasError: accumulator.hasError,
    maxStepDurationMs: accumulator.maxStepDurationMs,
    outcomes: [...accumulator.outcomes],
    sessionTypes: [...accumulator.sessionTypes],
    locales: [...accumulator.locales],
    stepTypes: [...accumulator.stepTypes],
  };
}

/** A recent transcript conversation annotated with parsed filter facets. */
export interface ScannedTranscript extends ConversationTranscriptListItem {
  facets: TranscriptFacets;
  /** First channel retained for existing conversation display code. */
  channel?: string;
  /** Convenience alias retained for existing error display code. */
  hasError: boolean;
}

export interface TranscriptScanResult {
  transcripts: ScannedTranscript[];
  isComplete: boolean;
  recordsScanned: number;
  recordLimit: number;
  stopReason?: "time-budget" | "record-limit" | "page-error";
}

/** Default max transcript records to scan for transcript-derived filter options. */
export const DEFAULT_SCAN_RECORD_LIMIT = 1_000;

/**
 * Progressively smaller record limits used as automatic fallbacks. If a scan at
 * a given limit fails (e.g. times out because content blobs are very large),
 * the next smaller limit is attempted so the filter degrades gracefully instead
 * of failing outright.
 */
const SCAN_RECORD_LIMIT_FALLBACKS = [DEFAULT_SCAN_RECORD_LIMIT, 250, 100, 50];

/** Wall-clock budget for a single scan attempt; exceeding it returns partial results. */
const SCAN_TIME_BUDGET_MS = 25_000;

/** Metadata overlaps paging and must not hold filter options indefinitely. */
const SCAN_TOOL_LOOKUP_TIMEOUT_MS = 5_000;

async function loadScanFlowResolver(organizationUrl: string, botId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const components = await Promise.race([
      loadHarnessToolComponents(organizationUrl, botId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          "Tool definitions timed out. Flow/Tool filters could not be resolved. Reload the page to retry.",
        )), SCAN_TOOL_LOOKUP_TIMEOUT_MS);
      }),
    ]);
    return createHarnessFlowResolver(components);
  } finally {
    clearTimeout(timer);
  }
}

type RawTranscriptScan = {
  result: TranscriptScanResult;
  harnessTools: Map<string, Map<string, HarnessToolReference>>;
};

/**
 * Perform a single content scan of an agent's recent transcripts, up to
 * `maxRecords`. Deduplicates by conversation name (merging split records) and
 * annotates each with its raw channelId and whether it contains errors.
 *
 * Error handling: individual page failures return whatever was collected so far
 * (partial result). If the very first page fails — so nothing was collected —
 * the error is thrown so the caller can retry with a smaller limit.
 */
async function scanTranscriptsOnce(
  options: {
    organizationUrl: string;
    agentBotId: string;
    since?: string;
    to?: string;
  },
  maxRecords: number,
  startToolLookup: () => void,
): Promise<RawTranscriptScan> {
  await ensurePowerAppsInitialized();
  const client = getDataverseClient();

  const batchSize = 50;
  const maxPages = Math.ceil(maxRecords / batchSize);
  const deadline = Date.now() + SCAN_TIME_BUDGET_MS;

  let filter = `_bot_conversationtranscriptid_value eq ${options.agentBotId}`;
  if (options.since) filter += ` and conversationstarttime ge ${options.since}`;
  if (options.to) filter += ` and conversationstarttime le ${options.to}`;

  // Preserve first-seen (most recent) ordering of conversations.
  const order: string[] = [];
  const byName = new Map<
    string,
    { item: ConversationTranscriptListItem; facets: FacetAccumulator }
  >();
  let skiptoken: string | undefined;
  let recordsScanned = 0;
  let isComplete = true;
  let stopReason: TranscriptScanResult["stopReason"];

  for (let page = 0; page < maxPages && recordsScanned < maxRecords; page++) {
    if (Date.now() > deadline) {
      isComplete = false;
      stopReason = "time-budget";
      break;
    }

    let result: IOperationResult<ConversationTranscriptListResponse>;
    try {
      result = await client.executeAsync<
        ListRecordsWithOrganizationParams,
        ConversationTranscriptListResponse
      >({
        connectorOperation: {
          tableName: "commondataserviceforapps",
          operationName: "ListRecordsWithOrganization",
          parameters: {
            organization: options.organizationUrl,
            entityName: "conversationtranscripts",
            accept: "application/json",
            // NOTE: do NOT add $top here. In Dataverse, $top and server-driven
            // paging are mutually exclusive — specifying $top suppresses
            // @odata.nextLink, so the loop would stop after the first page and
            // only ever scan `batchSize` records. Page size is controlled by
            // odata.maxpagesize; total is bounded by maxPages / maxRecords.
            prefer: `odata.maxpagesize=${batchSize}`,
            $select: "conversationtranscriptid,name,content,createdon,conversationstarttime",
            $filter: filter,
            $orderby: "conversationstarttime desc,createdon desc",
            $skiptoken: skiptoken,
          },
        },
      });
    } catch (err) {
      // First page threw: propagate so the caller can retry with a smaller limit.
      if (byName.size === 0) throw err;
      isComplete = false;
      stopReason = "page-error";
      break;
    }

    if (!result.success) {
      if (byName.size === 0) {
        throw new Error("Failed to scan conversation transcripts for filtering.");
      }
      isComplete = false;
      stopReason = "page-error";
      break;
    }

    const records = (result.data?.value ?? []) as ConversationTranscriptEntity[];

    for (const record of records) {
      recordsScanned++;
      if (!record.name) continue;
      let entry = byName.get(record.name);
      if (!entry) {
        entry = {
          item: {
            conversationtranscriptid: record.conversationtranscriptid!,
            name: record.name,
            createdon: record.createdon!,
            conversationstarttime: record.conversationstarttime ?? "",
          },
          facets: createFacetAccumulator(),
        };
        byName.set(record.name, entry);
        order.push(record.name);
      }
      addContentFacets(entry.facets, record.content, record.conversationstarttime ?? "", record.conversationtranscriptid ?? record.name);
      if (entry.facets.harnessTools.size) startToolLookup();
    }

    skiptoken = extractSkiptokenFromNextLink(result.data?.["@odata.nextLink"]);
    if (!skiptoken || records.length === 0) break;
  }

  if (isComplete && skiptoken) {
    isComplete = false;
    stopReason = "record-limit";
  }

  const transcripts = order.map((name) => {
    const entry = byName.get(name)!;
    const facets = finalizeFacets(entry.facets);
    return {
      ...entry.item,
      facets,
      channel: facets.channels[0],
      hasError: facets.hasError,
    };
  });

  return {
    result: { transcripts, isComplete, recordsScanned, recordLimit: maxRecords, stopReason },
    harnessTools: new Map([...byName].map(([name, entry]) => [name, entry.facets.harnessTools])),
  };
}

/**
 * Scan an agent's recent transcripts (with content) for the static channel and
 * error filters, deduplicating by conversation and annotating channel + error
 * state. Channel is not a queryable Dataverse column, so a content scan is
 * unavoidable; results are cached by the caller (React Query) so the scan runs
 * once per agent + date range, and all filtering is done in memory.
 *
 * Bounded to `maxRecords` (default {@link DEFAULT_SCAN_RECORD_LIMIT}). If the
 * scan fails at that size (e.g. very large content blobs time out), it retries
 * with progressively smaller limits before giving up.
 */
export async function scanAgentTranscripts(options: {
  organizationUrl: string;
  agentBotId: string;
  since?: string;
  to?: string;
  /** Override the record limit; when set, no fallback retries are attempted. */
  maxRecords?: number;
}): Promise<TranscriptScanResult> {
  const limits =
    options.maxRecords != null ? [options.maxRecords] : SCAN_RECORD_LIMIT_FALLBACKS;

  let lastError: unknown;
  let scanned: RawTranscriptScan | undefined;
  // Keep metadata failures outside the transcript fallback loop, and handle an
  // early rejection while pages are still loading without an unhandled promise.
  let lookup: Promise<
    { resolve: ReturnType<typeof createHarnessFlowResolver> } | { error: unknown }
  > | undefined;
  const startToolLookup = () => {
    lookup ??= loadScanFlowResolver(options.organizationUrl, options.agentBotId)
      .then(resolve => ({ resolve }), (error: unknown) => ({ error }));
  };
  for (const limit of limits) {
    try {
      scanned = await scanTranscriptsOnce(options, limit, startToolLookup);
      break;
    } catch (err) {
      lastError = err;
      // Try the next, smaller limit.
    }
  }
  if (scanned) {
    if (lookup) {
      const resolution = await lookup;
      if ("error" in resolution) throw resolution.error;
      for (const transcript of scanned.result.transcripts) {
        const types = new Set(transcript.facets.stepTypes);
        for (const reference of scanned.harnessTools.get(transcript.name)?.values() ?? []) {
          types.add(resolution.resolve(reference) ? "Flow" : "Tool");
        }
        transcript.facets.stepTypes = [...types];
      }
    }
    return scanned.result;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to scan agent transcripts for filtering.");
}

/**
 * Search an agent's transcripts by conversation name (id) server-side.
 *
 * Pushes the match to Dataverse via `contains(name, term)` combined with the
 * indexed bot filter, so it searches ALL of the agent's transcripts (no client
 * record cap) and returns only the matching rows — typically a handful — in a
 * single call. Rows are lightweight (no `content`). Scales to any transcript
 * volume with near-constant latency, unlike fetching every row and filtering in
 * the browser.
 */
export async function searchAgentTranscriptsByName(options: {
  organizationUrl: string;
  agentBotId: string;
  searchTerm: string;
  limit?: number;
  since?: string;
  to?: string;
}): Promise<ConversationTranscriptListItem[]> {
  await ensurePowerAppsInitialized();
  const client = getDataverseClient();

  const limit = options.limit ?? 50;
  const term = escapeODataStringLiteral(options.searchTerm.trim());
  if (!term) return [];

  let filter =
    `_bot_conversationtranscriptid_value eq ${options.agentBotId} ` +
    `and contains(name,'${term}')`;
  if (options.since) filter += ` and conversationstarttime ge ${options.since}`;
  if (options.to) filter += ` and conversationstarttime le ${options.to}`;

  // Single page only — no $top (which would suppress paging); maxpagesize bounds
  // the page to `limit` matches, which is ample for an id search.
  const result = await client.executeAsync<
    ListRecordsWithOrganizationParams,
    ConversationTranscriptListResponse
  >({
    connectorOperation: {
      tableName: "commondataserviceforapps",
      operationName: "ListRecordsWithOrganization",
      parameters: {
        organization: options.organizationUrl,
        entityName: "conversationtranscripts",
        accept: "application/json",
        prefer: `odata.maxpagesize=${limit}`,
        $select: "conversationtranscriptid,name,createdon,conversationstarttime",
        $filter: filter,
        $orderby: "conversationstarttime desc,createdon desc",
      },
    },
  });

  if (!result.success) return [];

  const records = (result.data?.value ?? []) as ConversationTranscriptListItem[];

  // Deduplicate by conversation name (transcripts can be split across records).
  const seen = new Set<string>();
  const unique: ConversationTranscriptListItem[] = [];
  for (const r of records) {
    if (!r.name || seen.has(r.name)) continue;
    seen.add(r.name);
    unique.push(r);
    if (unique.length >= limit) break;
  }
  return unique;
}

type TranscriptMetadata = {
  BatchId?: number;
  [key: string]: unknown;
};

function getBatchId(entity: ConversationTranscriptEntity): number {
  if (!entity.metadata) return 0;
  const parsed = safeJsonParse<TranscriptMetadata>(entity.metadata);
  return typeof parsed?.BatchId === "number" && Number.isFinite(parsed.BatchId) ? parsed.BatchId : 0;
}

export function mergeConversationTranscriptRecords(
  entities: ConversationTranscriptEntity[],
  fallbackId: string
): ConversationTranscriptEntity {
  if (entities.length === 0) {
    return {
      conversationtranscriptid: fallbackId,
      name: undefined,
      conversationstarttime: undefined,
      content: JSON.stringify({ activities: [] } satisfies TranscriptContent),
    };
  }

  // 1) Group by ConversationStartTime (represents separate saved sessions after inactivity).
  // 2) Within the same start time, sort by Metadata.BatchId (represents 1MB splits).
  const byStartTime = new Map<string, ConversationTranscriptEntity[]>();
  for (const entity of entities) {
    const key = entity.conversationstarttime ?? "__missing_start__";
    const list = byStartTime.get(key);
    if (list) list.push(entity);
    else byStartTime.set(key, [entity]);
  }

  const sortedStartTimes = Array.from(byStartTime.keys()).sort((a, b) => {
    if (a === "__missing_start__") return 1;
    if (b === "__missing_start__") return -1;
    return a.localeCompare(b);
  });

  const allActivities: NonNullable<TranscriptContent["activities"]> = [];
  let segmentIndex = 0;
  for (const startTime of sortedStartTimes) {
    const group = byStartTime.get(startTime) ?? [];
    const sortedBatches = [...group].sort((a, b) => getBatchId(a) - getBatchId(b));
    const segmentKey = `${startTime}__seg${segmentIndex++}`;

    for (const entity of sortedBatches) {
      if (!entity.content) continue;
      const parsed = safeJsonParse<TranscriptContent>(entity.content);
      const activities = parsed?.activities ?? [];
      if (activities.length) {
        for (const activity of activities) {
          activity.mergedSessionKey = segmentKey;
        }
        allActivities.push(...activities);
      }
    }
  }

  // Prefer the most common name if there are multiple.
  const nameCounts = new Map<string, number>();
  for (const entity of entities) {
    if (!entity.name) continue;
    nameCounts.set(entity.name, (nameCounts.get(entity.name) ?? 0) + 1);
  }
  const name = Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? entities[0].name;

  const firstWithStart = entities.find((e) => !!e.conversationstarttime);
  const conversationstarttime = firstWithStart?.conversationstarttime ?? entities[0].conversationstarttime;
  const mergedId = name && conversationstarttime ? `${name}_${conversationstarttime}` : entities[0].conversationtranscriptid ?? fallbackId;

  const mergedContent: TranscriptContent = { activities: allActivities };

  return {
    conversationtranscriptid: mergedId,
    name,
    conversationstarttime,
    schematype: entities[0].schematype,
    schemaversion: entities[0].schemaversion,
    statecode: entities[0].statecode,
    createdon: entities[0].createdon,
    metadata: entities.find((e) => getBatchId(e) === 0)?.metadata ?? entities[0].metadata,
    content: JSON.stringify(mergedContent),
  };
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function toIsoTimestamp(value: unknown): string {
  const ms = normalizeTimestampMs(value);
  if (ms !== undefined) return new Date(ms).toISOString();
  return new Date().toISOString();
}

type TranscriptContent = {
  activities?: Array<{
    id?: string;
    type?: string;
    timestamp?: unknown;
    from?: { role?: number };
    text?: string;
    speak?: string;
    valueType?: string;
    value?: unknown;
    attachments?: Array<{ contentType?: string; content?: unknown }>;
    channelData?: Record<string, unknown>;
    mergedSessionKey?: string;
  }>;
};

function inferMessageRole(activity: NonNullable<TranscriptContent["activities"]>[number]): Message["role"] {
  // Standard PVA Studio transcript format: role=0 is bot, role=1 is user
  if (activity.from?.role === 0) return "bot";
  if (activity.from?.role === 1) return "user";

  return "bot";
}

export function conversationDataFromTranscriptEntity(
  entity: ConversationTranscriptEntity,
  fallbackId: string
): ConversationData {
  const parsedMetadata = entity.metadata ? safeJsonParse<Record<string, unknown>>(entity.metadata) : undefined;
  const parsedContent = entity.content ? safeJsonParse<TranscriptContent>(entity.content) : undefined;
  const activities = parsedContent?.activities ?? [];

  const isOAuthCardMessage = (activity: NonNullable<TranscriptContent["activities"]>[number]): boolean => {
    if (activity.type !== "message") return false;
    const content = extractActivityText(activity).trim();
    // Hide the OAuth sign-in card messages (typically have no text content).
    if (content.length > 0 && content !== "[OAuth Card]") return false;
    const attachments = activity.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) return false;
    return attachments.some((att) => att?.contentType === "application/vnd.microsoft.card.oauth");
  };

  // Extract GPT answer state from channelData.pva:gpt-feedback
  const extractGptAnswerState = (): string => {
    for (const activity of activities) {
      if (activity.type === "message") {
        const channelData = activity.channelData;
        if (channelData) {
          const gptFeedback = channelData["pva:gpt-feedback"] as Record<string, unknown> | undefined;
          if (gptFeedback) {
            const gptAnswerState = gptFeedback["gptAnswerState"];
            if (typeof gptAnswerState === "string") {
              return gptAnswerState;
            }
          }
        }
      }
    }
    return "";
  };

  const messages: Message[] = activities
    .filter((a) => a.type === "message" && !isOAuthCardMessage(a))
    .map((a, index) => {
      const role: Message["role"] = inferMessageRole(a);
      const content = extractActivityText(a).trim();

      const adaptiveCard = (() => {
        const attachments = a.attachments;
        if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
        const found = attachments.find(
          (att) => att?.contentType === "application/vnd.microsoft.card.adaptive" && att?.content
        );
        return found?.content as unknown;
      })();

      return {
        // Always include an index-based prefix to avoid React key collisions.
        id: `${entity.conversationtranscriptid ?? fallbackId}-msg-${index}-${a.id ?? "noid"}`,
        role,
        content: content.length > 0 ? content : adaptiveCard ? "" : "[message with no text]",
        timestamp: toIsoTimestamp(a.timestamp),
        adaptiveCard,
      };
    });

  const conversationStartTime = entity.conversationstarttime;
  const metadataString =
    entity.metadata ?? (parsedMetadata ? JSON.stringify(parsedMetadata) : undefined) ?? "";
  const botSuffix = typeof parsedMetadata?.BotId === "string" && parsedMetadata.BotId
    ? `_${parsedMetadata.BotId}` : undefined;
  const conversationId = botSuffix && entity.name?.endsWith(botSuffix)
    ? entity.name.slice(0, -botSuffix.length) : undefined;

  return {
    id: entity.conversationtranscriptid ?? fallbackId,
    generalInfo: {
      conversationId,
      numberOfSessions: 1,
      numberOfTurns: messages.length,
      globalOutcome: messages.length > 0 ? "Resolved" : "Unresolved",
      totalDuration: 0,
      inactivityCounts: 0,
      totalTokensUsed: 0,
      model: (typeof parsedMetadata?.BotName === "string" ? (parsedMetadata.BotName as string) : "unknown"),
      gptAnswerState: extractGptAnswerState(),
      contentModeration: "",
      conversationStartTime,
      metadata: metadataString,
    },
    messages,
  };
}
