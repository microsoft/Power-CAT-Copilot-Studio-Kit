import {
  DataverseClient,
  discoverEnvironments,
  escapeOData,
  guid,
  type DiscoveryEnvironment,
} from "../../agent-review/server/dataverse.js";
import { ReviewError } from "../../agent-review/server/types.js";
import { exactAgentFilter, exactSelection, type AgentSelection } from "../../tools/target-selection.js";
import type { Activity, ProcessedTranscript, ProcessedTurn } from "../contracts/transcript.js";
import type { SessionSummary } from "../contracts/workspace.js";
import type { AgentConfig } from "../services/agent-config-service.js";
import {
  parseBotComponentData,
  type ComponentInfo,
} from "../services/botcomponents-service.js";
import { conversationDataFromActivities } from "../services/conversation-transcript-service.js";
import { populateConnectedAgentFromChildTranscript } from "../utils/transcript/parse-transcript.js";
import { parseTranscriptWithConnectedAgents } from "../utils/transcript/parse-transcript.js";
import { deriveRecommendations } from "../utils/recommendations.js";
import { fmtMs } from "../utils/format-ms.js";
import type { ConversationDateRange } from "../contracts/filters.js";
import { exportConversationTranscript, TRANSCRIPT_EXPORT_LIMITS } from "./transcript-export.js";
import { deriveUsageInsights } from "../utils/usage-insights.js";
import type { UsageDiagnostics } from "../contracts/diagnostics.js";
import {
  mergeConversationTranscriptRecords,
  type ConversationTranscriptRecord,
} from "../core/transcript-merge.js";
import {
  DEFAULT_DEBUGGER_ENVIRONMENT,
  type DebuggerAgentRef,
  type DebuggerEnvironmentRef,
} from "./selection.js";

interface BotRow {
  botid: string;
  name?: string;
  schemaname?: string;
  componentidunique?: string;
  configuration?: string;
  modifiedon?: string;
  iconbase64?: string;
  language?: number;
  authenticationmode?: number;
}

interface BotComponentRow {
  botcomponentid?: string;
  name?: string;
  description?: string;
  schemaname?: string;
  componenttype?: number;
  content?: string;
  data?: string;
}

interface ConversationSummaryRow {
  conversationtranscriptid: string;
  name?: string;
  createdon?: string;
  conversationstarttime?: string;
}

export interface DebuggerEnvironment extends DebuggerEnvironmentRef {
  region: string;
  url: string;
}

export interface DebuggerAgent extends DebuggerAgentRef {
  componentIdUnique?: string;
  schemaName?: string;
  modifiedOn?: string;
  iconBase64?: string;
  experience: "classic" | "generative";
}

export interface DebuggerConversation {
  id: string;
  name: string;
  createdOn?: string;
  conversationStartTime?: string;
}

export interface DebuggerAnalysis {
  environment: DebuggerEnvironment;
  agent: DebuggerAgent;
  conversation: DebuggerConversation;
  processedTranscript: ProcessedTranscript;
  conversationData: ReturnType<typeof conversationDataFromActivities>;
  componentNameBySchemaName: Record<string, ComponentInfo>;
  connectedAgents: ReturnType<typeof parseTranscriptWithConnectedAgents>["connectedAgents"];
  recommendations: ReturnType<typeof deriveRecommendations>;
  agentConfig: AgentConfig;
  sessions: SessionSummary[];
  usage: UsageDiagnostics;
  usageBySession: Record<string, UsageDiagnostics>;
}

function isGuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function agentExperience(configuration: string | undefined): DebuggerAgent["experience"] {
  if (!configuration) return "classic";
  try {
    const parsed = JSON.parse(configuration) as {
      agentSettings?: unknown;
      recognizer?: { $kind?: string };
    };
    return parsed.agentSettings !== undefined
      || parsed.recognizer?.$kind === "CLICopilotRecognizer"
      ? "generative"
      : "classic";
  } catch {
    return "classic";
  }
}

export function mapAgentRows(rows: BotRow[], query: string, includeIcons = true): DebuggerAgent[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.flatMap((row) => {
    if (!isGuid(row.botid)) return [];
    const name = row.name?.trim() || "Unnamed agent";
    if (needle && !name.toLocaleLowerCase().includes(needle)) return [];
    return [{
      id: row.botid.toLocaleLowerCase(),
      name,
      componentIdUnique: isGuid(row.componentidunique)
        ? row.componentidunique.toLocaleLowerCase()
        : undefined,
      schemaName: row.schemaname?.trim() || undefined,
      modifiedOn: row.modifiedon,
      ...(includeIcons ? { iconBase64: row.iconbase64?.trim() || undefined } : {}),
      experience: agentExperience(row.configuration),
    }];
  });
}

function queryPath(
  entitySet: string,
  parameters: Record<string, string>,
): string {
  return `${entitySet}?${new URLSearchParams(parameters).toString()}`;
}

export function buildConversationListPath(options: {
  agentId: string;
  query?: string;
  limit?: number;
  startedAfter?: string;
  startedBefore?: string;
}): string {
  const agentId = guid(options.agentId);
  const limit = Math.max(1, Math.min(50, options.limit ?? 50));
  const fetchSize = Math.min(250, limit * 5);
  const query = options.query?.trim();
  const after = options.startedAfter ? Date.parse(options.startedAfter) : undefined;
  const before = options.startedBefore ? Date.parse(options.startedBefore) : undefined;
  if ((after !== undefined && !Number.isFinite(after))
    || (before !== undefined && !Number.isFinite(before))
    || (after !== undefined && before !== undefined && after > before)) {
    throw new ReviewError("INVALID_DATE_RANGE", "The conversation date range is invalid.");
  }
  const filter = [
    `_bot_conversationtranscriptid_value eq ${agentId}`,
    query ? `contains(name,'${escapeOData(query)}')` : undefined,
    after !== undefined ? `conversationstarttime ge ${new Date(after).toISOString()}` : undefined,
    before !== undefined ? `conversationstarttime le ${new Date(before).toISOString()}` : undefined,
  ].filter(Boolean).join(" and ");
  return queryPath("conversationtranscripts", {
    "$select": "conversationtranscriptid,name,createdon,conversationstarttime",
    "$filter": filter,
    "$orderby": "conversationstarttime desc,createdon desc",
    "$top": String(fetchSize),
  });
}

export function buildConversationTranscriptPath(agentIdValue: string, conversationId: string): string {
  const id = conversationId.trim();
  if (!id) throw new ReviewError("INVALID_CONVERSATION", "An exact conversation ID is required.");
  return queryPath("conversationtranscripts", {
    "$select": "conversationtranscriptid,name,content,metadata,conversationstarttime,schematype,schemaversion,statecode,createdon",
    "$filter": `_bot_conversationtranscriptid_value eq ${guid(agentIdValue)} and name eq '${escapeOData(id)}'`,
    "$orderby": "conversationstarttime asc,createdon asc",
    "$top": String(TRANSCRIPT_EXPORT_LIMITS.maxItems + 1),
  });
}

function buildTranscriptPath(agentIdValue: string, conversationId: string): string {
  const agentId = guid(agentIdValue);
  const filter = `_bot_conversationtranscriptid_value eq ${agentId} and contains(name,'${escapeOData(conversationId)}')`;
  return queryPath("conversationtranscripts", {
    "$select": "conversationtranscriptid,name,content,metadata,conversationstarttime,schematype,schemaversion,statecode,createdon",
    "$filter": filter,
    "$orderby": "conversationstarttime asc,createdon asc",
    "$top": "500",
  });
}

export function buildChildTranscriptPath(
  conversationId: string,
  childAgentId?: string,
): string {
  const filter = [
    `contains(name,'${escapeOData(conversationId)}')`,
    childAgentId
      ? `_bot_conversationtranscriptid_value eq ${guid(childAgentId)}`
      : undefined,
  ].filter(Boolean).join(" and ");
  return queryPath("conversationtranscripts", {
    "$select": "conversationtranscriptid,name,content,metadata,conversationstarttime,schematype,schemaversion,statecode,createdon",
    "$filter": filter,
    "$orderby": "conversationstarttime asc,createdon asc",
    "$top": "100",
  });
}

function mergeTranscriptRecords(
  records: ConversationTranscriptRecord[],
  fallbackId: string,
): ConversationTranscriptRecord {
  try {
    return mergeConversationTranscriptRecords(records, fallbackId);
  } catch {
    throw new ReviewError(
      "TRANSCRIPT_INVALID",
      "The transcript records were found, but their content or metadata is invalid.",
    );
  }
}

function transcriptActivities(record: ConversationTranscriptRecord): Activity[] {
  try {
    const parsed = JSON.parse(record.content ?? "") as { activities?: unknown };
    if (!Array.isArray(parsed.activities)) throw new Error("Activities are missing.");
    return parsed.activities as Activity[];
  } catch {
    throw new ReviewError(
      "TRANSCRIPT_INVALID",
      "The transcript records were found, but their content is invalid.",
    );
  }
}

function transcriptMetadata(
  record: ConversationTranscriptRecord,
): Record<string, unknown> | undefined {
  if (!record.metadata) return undefined;
  try {
    const parsed = JSON.parse(record.metadata) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Metadata is not an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ReviewError(
      "TRANSCRIPT_INVALID",
      "The transcript records were found, but their metadata is invalid.",
    );
  }
}

export function compactTranscript(
  transcript: ProcessedTranscript,
): ProcessedTranscript {
  return {
    ...transcript,
    turns: transcript.turns.map((turn) => {
      const sessionKey = turn.activities.find((activity) => activity.mergedSessionKey)
        ?.mergedSessionKey;
      return {
        ...turn,
        activities: sessionKey
          ? [{ type: "session", mergedSessionKey: sessionKey }]
          : [],
      };
    }),
    raw: { activities: [] },
  };
}

function environmentRef(environment: DiscoveryEnvironment): DebuggerEnvironment {
  return {
    id: environment.id,
    name: environment.name,
    region: environment.region,
    url: environment.apiUrl.origin,
  };
}

function configurationInstructions(configuration: string | undefined): string | undefined {
  if (!configuration) return undefined;
  try {
    const parsed = JSON.parse(configuration) as {
      agentSettings?: {
        instructions?: { segments?: Array<{ value?: string }> };
      };
    };
    const value = parsed.agentSettings?.instructions?.segments
      ?.map((segment) => segment.value ?? "")
      .join("")
      .trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function componentKind(row: BotComponentRow): "topic" | "tool" | "knowledge" | "agent" | "skill" {
  const schema = row.schemaname?.toLocaleLowerCase() ?? "";
  if (schema.includes(".topic.")) return "topic";
  if (schema.includes(".action.") || schema.includes("tool")) return "tool";
  if (schema.includes(".agent.")) return "agent";
  if (schema.includes("knowledge")) return "knowledge";
  return row.componenttype === 9 ? "skill" : "topic";
}

function buildAgentConfig(agent: BotRow, components: BotComponentRow[]): AgentConfig {
  const topics: AgentConfig["topics"] = [];
  const tools: AgentConfig["tools"] = [];
  const knowledge: AgentConfig["knowledge"] = [];
  const childAgents: AgentConfig["childAgents"] = [];
  const skills: AgentConfig["skills"] = [];

  for (const component of components) {
    const parsed = parseBotComponentData(component.data);
    const name = parsed.modelDisplayName
      || component.name?.trim()
      || component.schemaname?.trim()
      || "Unnamed component";
    switch (componentKind(component)) {
      case "tool":
        tools.push({ name, description: component.description, toolType: "unknown" });
        break;
      case "knowledge":
        knowledge.push({ name, sourceType: "Unknown" });
        break;
      case "agent":
        childAgents.push({ name, description: component.description, relationship: "Connected" });
        break;
      case "skill":
        skills.push({ name, description: component.description });
        break;
      default:
        topics.push({
          topicName: name,
          modelName: parsed.modelDisplayName,
          modelDescription: parsed.modelDescription ?? component.description,
        });
    }
  }

  return {
    botName: agent.name?.trim() || "Unnamed agent",
    settings: {
      orchestrationType: agentExperience(agent.configuration),
      isGenerativeDesigner: agentExperience(agent.configuration) === "generative",
    },
    instructions: configurationInstructions(agent.configuration),
    topics,
    tools,
    knowledge,
    childAgents,
    skills,
  };
}

function componentMap(rows: BotComponentRow[]): Record<string, ComponentInfo> {
  const result: Record<string, ComponentInfo> = {};
  for (const row of rows) {
    const schemaName = row.schemaname?.trim();
    if (!schemaName) continue;
    const parsed = parseBotComponentData(row.data);
    result[schemaName] = {
      name: row.name?.trim() || schemaName,
      description: row.description,
      modelDisplayName: parsed.modelDisplayName,
      modelDescription: parsed.modelDescription,
      triggerQueries: parsed.triggerQueries,
    };
  }
  return result;
}

function sessionSummaries(
  transcript: ProcessedTranscript,
  activities: Activity[],
  fallbackOutcome: string,
): SessionSummary[] {
  const info = new Map<string, {
    startTimeUtc?: string;
    endTimeUtc?: string;
    type?: string;
    outcome?: string;
    turnCount?: number;
  }>();
  for (const activity of activities) {
    if (activity.valueType !== "SessionInfo" || !activity.value) continue;
    info.set(
      activity.mergedSessionKey ?? "__single__",
      activity.value as {
        startTimeUtc?: string;
        endTimeUtc?: string;
        type?: string;
        outcome?: string;
        turnCount?: number;
      },
    );
  }

  const order = [...info.keys()];
  const buckets = new Map<string, ProcessedTurn[]>(
    order.map((key) => [key, []]),
  );
  for (const turn of transcript.turns) {
    const key = turn.activities.find((activity) => activity.mergedSessionKey)
      ?.mergedSessionKey ?? "__single__";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(turn);
  }

  let previousEnd: number | undefined;
  return order.map((key, index) => {
    const turns = buckets.get(key) ?? [];
    const details = info.get(key);
    const start = details?.startTimeUtc ?? turns[0]?.timestamp;
    const end = details?.endTimeUtc ?? turns.at(-1)?.timestamp;
    const startMs = start ? Date.parse(start) : Number.NaN;
    const endMs = end ? Date.parse(end) : Number.NaN;
    const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, endMs - startMs)
      : 0;
    const idleMs = Number.isFinite(startMs) && previousEnd !== undefined
      ? Math.max(0, startMs - previousEnd)
      : 0;
    if (Number.isFinite(endMs)) previousEnd = endMs;
    const observedTurns = turns.filter((turn) => turn.role === "user").length;
    const turnCount = observedTurns || details?.turnCount || turns.length;
    const startText = start && Number.isFinite(startMs)
      ? new Date(startMs).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      : "";
    return {
      n: index + 1,
      startText,
      startTimeUtc: start,
      endTimeUtc: end,
      durationMs,
      type: details?.type ?? "",
      outcome: details?.outcome ?? (index === order.length - 1 ? fallbackOutcome : ""),
      turnCount,
      turnText: `${turnCount} turn${turnCount === 1 ? "" : "s"}`,
      idleText: idleMs > 0 ? fmtMs(idleMs) : undefined,
    };
  });
}

export class AgentDebuggerService {
  constructor(private readonly incomingToken: string) {}

  private async environments(): Promise<DiscoveryEnvironment[]> {
    return discoverEnvironments(this.incomingToken);
  }

  private async resolveEnvironment(environmentId: string): Promise<DiscoveryEnvironment> {
    const id = guid(environmentId);
    const environment = (await this.environments()).find((candidate) => candidate.id === id);
    if (!environment) {
      throw new ReviewError("ENVIRONMENT_NOT_FOUND", "The selected environment is unavailable.");
    }
    return environment;
  }

  async listEnvironments(): Promise<DebuggerEnvironment[]> {
    return (await this.environments()).map(environmentRef);
  }

  async defaultEnvironment(): Promise<DebuggerEnvironment> {
    const environments = await this.environments();
    const matches = environments.filter(
      (environment) => environment.name.trim().toLocaleLowerCase()
        === DEFAULT_DEBUGGER_ENVIRONMENT.toLocaleLowerCase(),
    );
    if (matches.length === 1) return environmentRef(matches[0]);

    const configured = process.env.AGENT_KIT_HOME_ENVIRONMENT_ID;
    if (configured) {
      const configuredId = guid(configured);
      const environment = environments.find((candidate) => candidate.id === configuredId);
      if (environment) return environmentRef(environment);
    }
    throw new ReviewError(
      "DEBUGGER_ENVIRONMENT_NOT_FOUND",
      `The ${DEFAULT_DEBUGGER_ENVIRONMENT} environment is unavailable.`,
    );
  }

  async listAgents(environmentId: string, query = ""): Promise<DebuggerAgent[]> {
    const environment = await this.resolveEnvironment(environmentId);
    const rows = await new DataverseClient(environment.apiUrl, this.incomingToken)
      .list<BotRow>(queryPath("bots", {
        "$select": "botid,name,schemaname,componentidunique,configuration,modifiedon",
        "$filter": "statecode eq 0",
        "$orderby": "name asc",
        "$top": "500",
      }));
    return mapAgentRows(rows, query, false);
  }

  async resolveAgent(environmentId: string, input: AgentSelection): Promise<DebuggerAgent> {
    const filter = exactAgentFilter(input);
    const environment = await this.resolveEnvironment(environmentId);
    const rows = await new DataverseClient(environment.apiUrl, this.incomingToken)
      .list<BotRow>(queryPath("bots", {
        "$select": "botid,name,schemaname,componentidunique,configuration,modifiedon",
        "$filter": filter,
        "$top": "500",
      }));
    return exactSelection(mapAgentRows(rows, ""), "AGENT", input.agentId, input.agentName);
  }

  async listConversations(
    environmentId: string,
    agentId: string,
    query = "",
    limit = 50,
    dates: ConversationDateRange = {},
  ): Promise<DebuggerConversation[]> {
    const environment = await this.resolveEnvironment(environmentId);
    const rows = await new DataverseClient(environment.apiUrl, this.incomingToken)
      .list<ConversationSummaryRow>(buildConversationListPath({
        agentId,
        query,
        limit,
        ...dates,
      }));
    const seen = new Set<string>();
    const conversations: DebuggerConversation[] = [];
    for (const row of rows) {
      const name = row.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      conversations.push({
        id: name,
        name,
        createdOn: row.createdon,
        conversationStartTime: row.conversationstarttime,
      });
      if (conversations.length >= Math.max(1, Math.min(50, limit))) break;
    }
    return conversations;
  }

  async getConversationTranscript(environmentId: string, agentId: string, conversationId: string) {
    const id = conversationId.trim();
    const path = buildConversationTranscriptPath(agentId, id);
    const environment = await this.resolveEnvironment(environmentId);
    const botId = guid(agentId);
    const client = new DataverseClient(environment.apiUrl, this.incomingToken);
    const agents = await client.list<BotRow>(queryPath("bots", {
      "$select": "botid", "$filter": `statecode eq 0 and botid eq ${botId}`, "$top": "1",
    }));
    if (!agents.length) throw new ReviewError("AGENT_NOT_FOUND", "The selected agent is unavailable.");
    try {
      const records = await client.listBounded<ConversationTranscriptRecord>(path, TRANSCRIPT_EXPORT_LIMITS);
      return exportConversationTranscript(id, records);
    } catch (error) {
      if (error instanceof ReviewError && error.code === "DATA_LIMIT_EXCEEDED") {
        throw new ReviewError("TRANSCRIPT_TOO_LARGE", "Full JSON is limited to 500 transcript records and an 8 MiB response. No partial export was returned.");
      }
      throw error;
    }
  }

  private async loadAnalysisSource(
    environmentId: string,
    agentId: string,
    conversationId: string,
  ): Promise<{
    environment: DiscoveryEnvironment;
    agentRow: BotRow;
    agent: DebuggerAgent;
    records: ConversationTranscriptRecord[];
    components: BotComponentRow[];
  }> {
    const environment = await this.resolveEnvironment(environmentId);
    const id = guid(agentId);
    const client = new DataverseClient(environment.apiUrl, this.incomingToken);
    const [agents, records, components] = await Promise.all([
      client.list<BotRow>(queryPath("bots", {
        "$select": "botid,name,schemaname,componentidunique,configuration,modifiedon,iconbase64,language,authenticationmode",
        "$filter": `statecode eq 0 and botid eq ${id}`,
        "$top": "1",
      })),
      client.list<ConversationTranscriptRecord>(
        buildTranscriptPath(id, conversationId.trim()),
      ),
      client.list<BotComponentRow>(queryPath("botcomponents", {
        "$select": "botcomponentid,name,description,schemaname,componenttype,content,data",
        "$filter": `_parentbotid_value eq ${id} and statecode eq 0`,
        "$orderby": "name asc",
      })),
    ]);
    const agentRow = agents[0];
    const agent = mapAgentRows(agents, "")[0];
    if (!agentRow || !agent) {
      throw new ReviewError("AGENT_NOT_FOUND", "The selected agent is unavailable.");
    }
    if (records.length === 0) {
      throw new ReviewError(
        "TRANSCRIPT_NOT_FOUND",
        "No transcript records were found for this conversation ID.",
      );
    }
    return { environment, agentRow, agent, records, components };
  }

  async analyze(
    environmentId: string,
    agentId: string,
    conversationId: string,
  ): Promise<DebuggerAnalysis> {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      throw new ReviewError("INVALID_CONVERSATION", "A conversation ID is required.");
    }
    const source = await this.loadAnalysisSource(
      environmentId,
      agentId,
      normalizedConversationId,
    );
    const merged = mergeTranscriptRecords(
      source.records,
      normalizedConversationId,
    );
    const activities = transcriptActivities(merged);
    const parsed = parseTranscriptWithConnectedAgents(
      { activities },
      normalizedConversationId,
    );
    const components = componentMap(source.components);
    const conversationData = conversationDataFromActivities(
      normalizedConversationId,
      activities,
      transcriptMetadata(merged),
    );
    conversationData.generalInfo.numberOfSessions = new Set(
      activities.map((activity) => activity.mergedSessionKey).filter(Boolean),
    ).size || 1;
    conversationData.generalInfo.numberOfTurns = parsed.transcript.turns
      .filter((turn) => turn.role === "user").length;
    conversationData.generalInfo.globalOutcome = parsed.transcript.generalInfo.outcome
      ?? conversationData.generalInfo.globalOutcome;
    conversationData.generalInfo.totalDuration = parsed.transcript.generalInfo.durationMs;
    conversationData.generalInfo.inactivityCounts = Math.max(
      0,
      conversationData.generalInfo.numberOfSessions - 1,
    );
    conversationData.generalInfo.totalTokensUsed = parsed.transcript.turns.reduce(
      (total, turn) => total + (turn.debugInfo?.tokenInfo?.totalTokens ?? 0),
      0,
    );
    const lastModel = parsed.transcript.turns
      .map((turn) => turn.debugInfo?.tokenInfo?.model)
      .filter((value): value is string => Boolean(value))
      .at(-1);
    if (lastModel) conversationData.generalInfo.model = lastModel;
    conversationData.generalInfo.channelId = activities.find(
      (activity) => activity.type === "message" && activity.channelId,
    )?.channelId;
    conversationData.generalInfo.conversationStartTime = merged.conversationstarttime;
    const usageBySession: Record<string, UsageDiagnostics> = {};
    for (const key of new Set(activities.map((activity) => activity.mergedSessionKey).filter((key): key is string => Boolean(key)))) {
      usageBySession[key] = deriveUsageInsights({
        ...parsed.transcript,
        turns: parsed.transcript.turns.filter((turn) => turn.activities.some((activity) => activity.mergedSessionKey === key)),
        raw: { activities: activities.filter((activity) => activity.mergedSessionKey === key) },
      }, source.agent.experience);
    }

    return {
      environment: environmentRef(source.environment),
      agent: source.agent,
      conversation: {
        id: normalizedConversationId,
        name: merged.name ?? normalizedConversationId,
        createdOn: merged.createdon,
        conversationStartTime: merged.conversationstarttime,
      },
      processedTranscript: compactTranscript(parsed.transcript),
      conversationData,
      componentNameBySchemaName: components,
      connectedAgents: parsed.connectedAgents,
      recommendations: deriveRecommendations(
        parsed.transcript,
        conversationData,
        parsed.connectedAgents,
        components,
      ),
      agentConfig: buildAgentConfig(source.agentRow, source.components),
      usage: deriveUsageInsights(parsed.transcript, source.agent.experience),
      usageBySession,
      sessions: sessionSummaries(
        parsed.transcript,
        activities,
        conversationData.generalInfo.globalOutcome,
      ),
    };
  }

  async getTurnDetails(
    environmentId: string,
    agentId: string,
    conversationId: string,
    turnId: string,
  ): Promise<ProcessedTurn> {
    const normalizedTurnId = turnId.trim();
    if (!normalizedTurnId) {
      throw new ReviewError("INVALID_TURN", "A turn ID is required.");
    }
    const source = await this.loadAnalysisSource(environmentId, agentId, conversationId);
    const merged = mergeTranscriptRecords(source.records, conversationId);
    const activities = transcriptActivities(merged);
    const transcript = parseTranscriptWithConnectedAgents(
      { activities },
      conversationId,
    ).transcript;
    const turn = transcript.turns.find((candidate) => candidate.id === normalizedTurnId);
    if (!turn) {
      throw new ReviewError("TURN_NOT_FOUND", "The selected turn is unavailable.");
    }
    return turn;
  }

  async getChildTranscript(
    environmentId: string,
    agentId: string,
    conversationId: string,
    sessionId: string,
  ) {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new ReviewError("INVALID_SESSION", "A connected-agent session ID is required.");
    }
    const source = await this.loadAnalysisSource(environmentId, agentId, conversationId);
    const merged = mergeTranscriptRecords(source.records, conversationId);
    const activities = transcriptActivities(merged);
    const connectedAgent = parseTranscriptWithConnectedAgents(
      { activities },
      conversationId,
    ).connectedAgents.find((candidate) => candidate.sessionId === normalizedSessionId);
    if (!connectedAgent?.childConversationId || !connectedAgent.botSchemaName) {
      throw new ReviewError(
        "CONNECTED_AGENT_NOT_FOUND",
        "The selected connected-agent invocation is unavailable.",
      );
    }
    const client = new DataverseClient(
      source.environment.apiUrl,
      this.incomingToken,
    );
    const childBots = await client.list<Pick<BotRow, "botid">>(queryPath("bots", {
      "$select": "botid",
      "$filter": `statecode eq 0 and schemaname eq '${escapeOData(connectedAgent.botSchemaName)}'`,
      "$top": "2",
    }));
    if (childBots.length !== 1 || !isGuid(childBots[0].botid)) {
      throw new ReviewError(
        "CONNECTED_AGENT_NOT_FOUND",
        "The connected agent could not be resolved uniquely in this environment.",
      );
    }
    const childRecords = await client.list<ConversationTranscriptRecord>(
      buildChildTranscriptPath(connectedAgent.childConversationId, childBots[0].botid),
    );
    if (childRecords.length === 0) {
      throw new ReviewError(
        "CHILD_TRANSCRIPT_NOT_FOUND",
        "The connected-agent transcript is unavailable.",
      );
    }
    const child = mergeTranscriptRecords(
      childRecords,
      connectedAgent.childConversationId,
    );
    const populated = populateConnectedAgentFromChildTranscript(
      connectedAgent,
      transcriptActivities(child),
    );
    populated.childTranscriptRecordIds = childRecords
      .map((record) => record.conversationtranscriptid)
      .filter(Boolean);
    return populated;
  }
}
