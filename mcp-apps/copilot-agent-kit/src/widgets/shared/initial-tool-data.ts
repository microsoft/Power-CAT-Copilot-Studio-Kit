import type { App } from "@modelcontextprotocol/ext-apps";
import { createCompleteToolResultReader } from "./tool-result";

interface RecoveryOptions {
  name: string;
  callTool: App["callServerTool"];
  getData: () => unknown;
  replaceData: (data: unknown) => void;
  replaceMetadata?: (metadata: Record<string, unknown> | undefined) => void;
  reportError: (error: unknown) => void;
}

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;
type Data = Record<string, unknown>;
type ToolRequest = Parameters<App["callServerTool"]>[0];

export interface InitialDataLoadError {
  source: "initial-data";
  toolName?: string;
  stage?: string;
}

function hasData(data: unknown): data is Data {
  return typeof data === "object" && data !== null && "state" in data && typeof data.state === "string";
}

function sameInitialRequest(data: Data, previous: unknown): boolean {
  if (!hasData(previous)) return false;
  return ["selectionId", "environmentId", "agentId", "componentIdUnique", "conversationId", "jobId", "reviewId", "contextId"]
    .every(field => {
      const current = data[field];
      const before = previous[field];
      return typeof current === "string" && typeof before === "string"
        ? field === "selectionId" ? current === before : current.toLowerCase() === before.toLowerCase()
        : current === before;
    });
}

function identifier(data: Data, field: string): string {
  const direct = data[`${field}Id`];
  if (typeof direct === "string" && direct) return direct;
  const item = data[field];
  if (typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && item.id) return item.id;
  throw new Error(`The initial widget data is missing its ${field} identifier.`);
}

function dataRequests(name: string, data: Data): { request: ToolRequest; field: string }[] {
  if (!Array.isArray(data.deferred)) {
    throw new Error("The initial widget data has an unsupported deferred operation.");
  }
  return [...new Set(data.deferred)].map((field) => {
    if (field === "context" && typeof data.contextId === "string") return {
      request: { name: "get_initial_widget_data", arguments: { contextId: data.contextId } }, field: "context",
    };
    if (!["open_agent_review", "open_agent_debugger", "open_evaluation_builder"].includes(name)) {
      throw new Error("The initial widget data has an unsupported deferred operation.");
    }
    if (field === "agents") return {
      request: { name: name === "open_agent_review" ? "list_reviewable_agents" : "list_debugger_agents",
        arguments: { environmentId: identifier(data, "environment") } },
      field: "agents",
    };
    if (field === "model" && name === "open_agent_review") return {
      request: { name: "get_agent_review_result", arguments: { reviewId: identifier(data, "review"), presentation: "summary" } },
      field: "model",
    };
    if ((field === "conversations" || field === "analysis") && name === "open_agent_debugger") return {
      request: {
        name: field === "analysis" ? "analyze_debugger_conversation" : "list_debugger_conversations",
        arguments: {
          environmentId: identifier(data, "environment"), agentId: identifier(data, "agent"),
          ...(field === "analysis" ? { conversationId: identifier(data, "conversation") } : {}),
          ...(field === "conversations" && typeof data.startedAfter === "string" ? { startedAfter: data.startedAfter } : {}),
          ...(field === "conversations" && typeof data.startedBefore === "string" ? { startedBefore: data.startedBefore } : {}),
        },
      },
      field: field === "analysis" ? "processedTranscript" : "conversations",
    };
    throw new Error("The initial widget data has an unsupported deferred operation.");
  });
}

function resultMessage(result: ToolResult): string {
  const error = result.structuredContent?.error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return result.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n")
    || "The initial widget data is unavailable.";
}

class InitialDataCallbackError extends Error {
  constructor(readonly request: ToolRequest, readonly stage: string, cause: unknown, readonly data?: Data) {
    super(`Initial widget data ${stage} failed (${request.name}): ${cause instanceof Error ? cause.message : "The callback failed."}`, { cause });
  }
}

export function createInitialToolDataRecovery(options: RecoveryOptions) {
  let applicationReady = false;
  let input: Record<string, unknown> | undefined;
  let requested = false;
  let pullsRequested = false;
  let revision = 0;
  let origin = options.getData();
  let pendingData = hasData(origin) && origin.deferred !== undefined ? origin : undefined;
  let complete = hasData(origin) && !pendingData;

  const unchanged = (version: number, before: unknown): boolean =>
    !complete && version === revision && options.getData() === before;
  const publish = (data: unknown, finished = true): void => {
    complete = finished;
    revision += 1;
    pendingData = undefined;
    origin = data;
    options.replaceData(data);
  };
  const fail = (error: unknown, version: number, before: unknown, acknowledged = pendingData): void => {
    if (!unchanged(version, before)) return;
    requested = true;
    options.reportError(error);
    const returned = error instanceof InitialDataCallbackError ? error.data : undefined;
    const { deferred, ...context } = acknowledged ?? returned ?? {};
    const details = returned?.error ?? context.error;
    const status = context.status;
    const jobId = typeof context.jobId === "string" && context.jobId.trim() ? context.jobId
      : status && typeof status === "object" && "jobId" in status
        && typeof status.jobId === "string" && status.jobId.trim() ? status.jobId : undefined;
    const originalMessage = context.error && typeof context.error === "object" && "message" in context.error
      && typeof context.error.message === "string" ? context.error.message : undefined;
    const message = error instanceof Error ? error.message : "Unable to load the initial widget data.";
    const reviewJob = options.name === "open_agent_review" && Boolean(jobId);
    const jobFailed = context.state === "failed"
      || (status && typeof status === "object" && "status" in status && status.status === "failed");
    const dataLoadError: InitialDataLoadError = {
      source: "initial-data",
      ...(error instanceof InitialDataCallbackError ? { toolName: error.request.name, stage: error.stage } : {}),
    };
    // A failed recovery is not completion of the original invocation.
    publish({
      ...context,
      state: reviewJob ? jobFailed ? "failed" : "load-error" : "error",
      ...(jobId ? { jobId } : {}),
      dataLoadError,
      error: {
        ...(details && typeof details === "object" && !Array.isArray(details) ? details : {}),
        message: originalMessage && !message.includes(originalMessage) ? `${originalMessage} ${message}` : message,
      },
    }, false);
  };
  const call = async (request: ToolRequest, stage: string): Promise<ToolResult> => {
    let result: ToolResult;
    try {
      result = await options.callTool(request);
    } catch (error) {
      throw new InitialDataCallbackError(request, stage, error);
    }
    if (!result._meta?.completeToolResult && (result.isError || result.structuredContent?.state === "error")) {
      throw new InitialDataCallbackError(request, stage, new Error(resultMessage(result)),
        hasData(result.structuredContent) ? result.structuredContent : undefined);
    }
    return result;
  };
  const decode = createCompleteToolResultReader(request => call(request, "complete-result chunk"));

  const hydrate = async (): Promise<void> => {
    if (!applicationReady || !pendingData || pullsRequested || complete) return;
    pullsRequested = true;
    const data = pendingData;
    let version = revision;
    let before = origin;
    try {
      const requests = dataRequests(options.name, data);
      const { deferred, restoring, ...base } = data;
      let merged = base;
      const remaining = new Set(requests.map((_, index) => index));
      const progressive = options.name !== "open_agent_review" || !data.reviewId;
      await Promise.all(requests.map(async ({ request, field }, index) => {
        const operation = field === "processedTranscript" ? "analysis" : field;
        const result = await decode(await call(request, `deferred ${operation}`));
        if (!unchanged(version, before)) return;
        if (result.isError || result.structuredContent?.state === "error") {
          throw new InitialDataCallbackError(request, `deferred ${operation}`,
            new Error(resultMessage(result)), hasData(result.structuredContent) ? result.structuredContent : undefined);
        }
        const pulled = result.structuredContent;
        for (const identity of ["selectionId", "environmentId", "agentId", "conversationId", "jobId", "reviewId"]) {
          const ref = identity.slice(0, -2);
          const expected = data[identity] ?? (data[ref] && typeof data[ref] === "object" && "id" in data[ref] ? data[ref].id : undefined);
          const actual = pulled?.[identity] ?? (pulled?.[ref] && typeof pulled[ref] === "object" && "id" in pulled[ref] ? pulled[ref].id : undefined);
          if (typeof expected === "string" && typeof actual === "string"
            && (identity === "selectionId" ? expected !== actual : expected.toLowerCase() !== actual.toLowerCase())) {
            throw new InitialDataCallbackError(request, `deferred ${operation}`,
              new Error("The supplemental data does not match the selected target or selection."));
          }
        }
        options.replaceMetadata?.(result._meta);
        if (field === "context") {
          if (!hasData(pulled) || (Array.isArray(pulled.deferred) && pulled.deferred.includes("context"))) {
            throw new Error("The complete initial widget context is unavailable.");
          }
          if (pulled.deferred === undefined) publish(pulled);
          else {
            publish({ ...pulled, restoring: true }, false);
            pendingData = pulled;
            pullsRequested = false;
            await hydrate();
          }
          return;
        }
        if (!pulled || pulled[field] == null
          || ((field === "agents" || field === "conversations") && !Array.isArray(pulled[field]))) {
          throw new Error("The initial widget data is unavailable.");
        }
        merged = { ...merged, ...pulled };
        remaining.delete(index);
        if (progressive || remaining.size === 0) {
          const next = {
            ...merged, state: data.state,
            ...(remaining.size ? { deferred: [...remaining].map(index =>
              requests[index].field === "processedTranscript" ? "analysis" : requests[index].field), restoring: true } : {}),
          };
          publish(next, remaining.size === 0);
          version = revision;
          before = origin;
          if (remaining.size) pendingData = next;
        }
      }));
    } catch (error) {
      fail(error, version, before);
    }
  };

  const receiveResult = async (result: ToolResult, recoveryRequest?: ToolRequest): Promise<void> => {
    let version = revision;
    let before = origin;
    if (!unchanged(version, before)) return;
    if (options.name === "open_agent_review" && typeof input?.reviewId === "string"
      && !result.isError && hasData(result.structuredContent) && result.structuredContent.state !== "error"
      && (typeof result.structuredContent.reviewId !== "string"
        || result.structuredContent.reviewId.trim().toLowerCase() !== input.reviewId.trim().toLowerCase())) {
      if (recoveryRequest) fail(new InitialDataCallbackError(recoveryRequest, "recovery",
        new Error("The saved Review result does not match the requested review ID.")), version, before);
      return;
    }
    const acknowledged = hasData(result.structuredContent) ? result.structuredContent : pendingData;
    if (acknowledged?.deferred !== undefined && pullsRequested) {
      if (sameInitialRequest(acknowledged, origin)) return;
      pullsRequested = false;
      pendingData = undefined;
    }
    if (acknowledged) requested = true;
    const earlyAcknowledged = ["open_agent_review", "open_agent_debugger", "open_evaluation_builder"].includes(options.name)
      && acknowledged && !(options.name === "open_agent_review" && acknowledged.reviewId)
      && (options.name !== "open_agent_review" || acknowledged.state === "selecting"
        || (typeof acknowledged.jobId === "string" && Boolean(acknowledged.jobId.trim())));
    if (earlyAcknowledged && acknowledged
      && (acknowledged.deferred !== undefined || result._meta?.completeToolResult)) {
      const early = { ...acknowledged, restoring: true };
      if (JSON.stringify(origin) !== JSON.stringify(early)) publish(early, false);
      version = revision;
      before = origin;
    }
    try {
      result = await decode(result);
      if (!unchanged(version, before) || !hasData(result.structuredContent)) return;
      if (recoveryRequest && (result.isError || result.structuredContent.state === "error")) {
        throw new InitialDataCallbackError(recoveryRequest, "recovery", new Error(resultMessage(result)), result.structuredContent);
      }
      options.replaceMetadata?.(result._meta);
      const data = result.structuredContent;
      if (data.deferred !== undefined) {
        if (pullsRequested) return;
        revision += 1;
        pendingData = { ...data, ...(earlyAcknowledged ? { restoring: true } : {}) };
        await hydrate();
      } else {
        publish(data);
      }
    } catch (error) {
      fail(error, version, before, acknowledged);
    }
  };

  const recover = async (): Promise<void> => {
    if (!applicationReady || complete || options.getData() !== origin) return;
    if (pendingData) {
      await hydrate();
      return;
    }
    if (!input || requested) return;
    requested = true;
    const version = revision;
    const before = origin;
    try {
      const request: ToolRequest = options.name === "open_agent_review" && input.reviewId !== undefined
        ? { name: "get_agent_review_result", arguments: {
          reviewId: input.reviewId,
          ...(input.presentation !== undefined ? { presentation: input.presentation } : {}),
        } }
        : { name: options.name, arguments: options.name === "open_agent_review"
          ? { ...input, resumeOnly: true } : input };
      const result = await call(request, "recovery");
      if (!unchanged(version, before)) return;
      if (!hasData(result.structuredContent)) {
        throw new Error(result.isError ? resultMessage(result) : "The initial widget data is unavailable.");
      }
      await receiveResult(result, request);
    } catch (error) {
      fail(error, version, before);
    }
  };

  return {
    receiveInput: async (params: { arguments?: Record<string, unknown> }): Promise<void> => {
      if (input && JSON.stringify(input) !== JSON.stringify(params.arguments ?? {})) {
        revision += 1;
        complete = false;
        requested = false;
        pullsRequested = false;
        pendingData = undefined;
        origin = null;
        options.replaceData(null);
      }
      input = params.arguments ?? {};
      await recover();
    },
    receiveResult,
    ready: async (): Promise<void> => {
      applicationReady = true;
      await recover();
    },
  };
}
