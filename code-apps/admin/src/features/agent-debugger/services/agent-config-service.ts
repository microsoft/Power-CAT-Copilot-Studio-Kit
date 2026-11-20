/**
 * agent-config-service — fetches full agent configuration.
 *
 * Primary data source: cat_agentdetailses (local Dataverse, fetched by
 * cat_agentdetailsid using the generated Cat_agentdetailsesService).
 * This table stores instructions, knowledge sources, connections/tools,
 * prompts, description, model, settings — already in the correct environment.
 *
 * Secondary data source: botcomponents table in the agent's remote environment
 * (for full topic list with display names, descriptions, and variables).
 * Uses cat_agentid + cat_environmenturl from the primary record to query.
 *
 * YAML parsing logic is an exact port of the Agent Review Tool
 * (StageAService + yamlUtils): preprocessYaml, isValidYamlStructure,
 * extractAgentInstructions, extractVariables.
 */

import { load as yamlLoad } from "js-yaml";
import { Cat_agentdetailsesService } from "../../../generated/services/Cat_agentdetailsesService";
import { MicrosoftDataverseService } from "../../../generated/services/MicrosoftDataverseService";
import { getCopilotLanguageLabel } from "../utils/copilot-languages";
import { ensurePowerAppsInitialized } from "../utils/power-apps-init";
import { normalizeOrganizationUrl, type ComponentInfo } from "./botcomponents-service";
import { listAgentRecords } from "./live-agent-service";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AgentToolType = "flow" | "mcp" | "connector" | "prompt" | "unknown";
export type AgentKnowledgeType = "SharePoint" | "Web" | "Dataverse" | "File" | "Unknown";

export interface AgentConfigVariable { name: string; description?: string }

export interface AgentConfigTopic {
  topicName: string;
  modelName?: string;
  modelDescription?: string;
  inputVariables?: AgentConfigVariable[];
  outputVariables?: AgentConfigVariable[];
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigTool {
  name: string;
  displayName?: string;
  description?: string;
  toolType: AgentToolType;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigKnowledge {
  name: string;
  sourceType: AgentKnowledgeType;
  url?: string;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigChildAgent {
  name: string;
  description?: string;
  status?: "Enabled" | "Disabled";
  relationship?: "Child" | "Connected";
}

/**
 * A new-designer (generative) agent skill — an `InlineAgentSkill` component.
 * New designer agents expose Skills rather than classic authored Topics.
 */
export interface AgentConfigSkill {
  name: string;
  description?: string;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigSettings {
  language?: string;
  authenticationMode?: string;
  useModelKnowledge?: boolean;
  isSemanticSearchEnabled?: boolean;
  optInUseLatestModels?: boolean;
  orchestrationType?: string;
  /**
   * True when the bot is a new-designer agent, based on cat_poweredbycode.
   * New designer agents have Skills (not Topics) and their Copilot Studio URL
   * uses `/agents/{id}` instead of `/bots/{id}`.
   */
  isGenerativeDesigner?: boolean;
  /**
   * True when conversation memory is enabled for a new-designer (generative)
   * agent — read from `configuration.agentSettings.enableMemory`. Undefined for
   * classic agents, which don't carry this setting.
   */
  isMemoryEnabled?: boolean;
}

export interface AgentConfig {
  botName: string;
  /** Reuses the bot-scoped configuration read; no separate entity lookup. */
  choiceEntities?: Record<string, ComponentInfo>;
  description?: string;
  settings?: AgentConfigSettings;
  instructions?: string;
  topics: AgentConfigTopic[];
  tools: AgentConfigTool[];
  knowledge: AgentConfigKnowledge[];
  childAgents: AgentConfigChildAgent[];
  /** New-designer (generative) agent skills (InlineAgentSkill components). */
  skills: AgentConfigSkill[];
}

// ---------------------------------------------------------------------------
// Fields to fetch from cat_agentdetailses
// ---------------------------------------------------------------------------

const AGENT_DETAILS_SELECT = [
  "cat_agentdetailsid",
  "cat_name",
  "cat_agentid",
  "cat_environmenturl",
  "cat_description",
  "cat_model",
  "cat_instructions",
  "cat_poweredbycode",
  "cat_orchestrationtype",
  "cat_enduserauthenticationtype",
  "cat_knowledgesources",
  "cat_connections",
  "cat_prompts",
  "cat_agenttriggers",
  "cat_classicdatasources",
  "cat_httprequestactions",
] as const;

// ---------------------------------------------------------------------------
// JSON field parsers — parse string arrays / object arrays from cat_ fields
// ---------------------------------------------------------------------------

/** Try to parse a JSON field that may be a string, array, or object. Returns null on failure. */
function tryParseJson(raw: string | null | undefined): unknown {
  if (!raw?.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Extract an array of {name, displayName?, description?, type?, url?, sourceType?} from a JSON field. */
function parseJsonItems(raw: string | null | undefined): Array<Record<string, unknown>> {
  const parsed = tryParseJson(raw);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  return [];
}

function parseKnowledge(raw: string | null | undefined): AgentConfigKnowledge[] {
  const items = parseJsonItems(raw);
  return items.map((item) => {
    const name = String(item["name"] ?? item["displayName"] ?? item["title"] ?? "Knowledge source");
    const type = String(item["type"] ?? item["sourceType"] ?? item["kind"] ?? "").toLowerCase();
    let sourceType: AgentKnowledgeType = "Unknown";
    if (type.includes("sharepoint")) sourceType = "SharePoint";
    else if (type.includes("web") || type.includes("url")) sourceType = "Web";
    else if (type.includes("dataverse")) sourceType = "Dataverse";
    else if (type.includes("file") || type.includes("document")) sourceType = "File";
    const url = item["url"] as string | undefined ?? item["site"] as string | undefined;
    return { name, sourceType, url };
  });
}

function parseTools(
  connectionsRaw: string | null | undefined,
  promptsRaw: string | null | undefined,
  httpRaw: string | null | undefined,
): AgentConfigTool[] {
  const tools: AgentConfigTool[] = [];

  for (const item of parseJsonItems(connectionsRaw)) {
    const name = String(item["name"] ?? item["displayName"] ?? "");
    if (!name) continue;
    const kind = String(item["type"] ?? item["kind"] ?? item["actionKind"] ?? "").toLowerCase();
    let toolType: AgentToolType = "unknown";
    if (kind.includes("flow")) toolType = "flow";
    else if (kind.includes("mcp") || kind.includes("external")) toolType = "mcp";
    else if (kind.includes("connector")) toolType = "connector";
    else if (kind.includes("prompt") || kind.includes("ai")) toolType = "prompt";
    tools.push({
      name,
      displayName: item["displayName"] as string | undefined,
      description: item["description"] as string | undefined,
      toolType,
    });
  }

  for (const item of parseJsonItems(promptsRaw)) {
    const name = String(item["name"] ?? item["displayName"] ?? "");
    if (!name) continue;
    tools.push({
      name,
      displayName: item["displayName"] as string | undefined,
      description: item["description"] as string | undefined,
      toolType: "prompt",
    });
  }

  for (const item of parseJsonItems(httpRaw)) {
    const name = String(item["name"] ?? item["displayName"] ?? "");
    if (!name) continue;
    tools.push({
      name,
      displayName: item["displayName"] as string | undefined,
      description: item["description"] as string | undefined,
      toolType: "connector",
    });
  }

  return tools;
}

const AUTH_MODE_LABELS: Record<number, string> = {
  0: "No Authentication", 1: "No Authentication",
  2: "Microsoft Entra ID", 3: "Microsoft Entra ID (Custom)", 4: "Generic OAuth2",
};

// Maps cat_enduserauthenticationtype string codes → display labels
// (cat_agentdetailses stores internal codes like "Integrated" not user-friendly labels)
const AUTH_TYPE_DISPLAY: Record<string, string> = {
  "NoAuth":            "No Authentication",
  "Integrated":        "Microsoft Entra ID",
  "IntegratedCustom":  "Microsoft Entra ID (Custom)",
  "Generic":           "Generic OAuth2",
  "ServiceProvider":   "No Authentication",
};

const POWERED_BY_CODE = {
  copilotChat: 0,
  githubCopilot: 1,
  standard: 2,
} as const;

function detectNewDesigner(
  poweredByCode: number | undefined,
  recognizerKind: unknown,
): boolean {
  if (poweredByCode === POWERED_BY_CODE.githubCopilot) {
    return true;
  }
  if (
    poweredByCode === POWERED_BY_CODE.copilotChat ||
    poweredByCode === POWERED_BY_CODE.standard
  ) {
    return false;
  }

  // Backward compatibility for rows collected before cat_poweredbycode existed.
  return recognizerKind === "CLICopilotRecognizer";
}

/**
 * Builds AgentConfigSettings from the bots table record + cat_agentdetailses fields.
 * Exact port of BotService.parseSettings + BotService.parseAgentSettings from Agent Review Tool.
 */
function parseSettings(
  language: number | undefined,
  authMode: number | undefined,
  configJson: string | null | undefined,
  orchestrationType: string | null | undefined,
  authTypeOverride: string | null | undefined,
  poweredByCode: number | undefined,
): AgentConfigSettings | undefined {
  const s: AgentConfigSettings = {};
  if (language !== undefined) s.language = getCopilotLanguageLabel(language);
  if (authMode !== undefined) s.authenticationMode = AUTH_MODE_LABELS[authMode] ?? "Unknown";
  // authTypeOverride from cat_agentdetailses — map internal codes to display labels
  if (authTypeOverride) {
    s.authenticationMode = AUTH_TYPE_DISPLAY[authTypeOverride] ?? AUTH_MODE_LABELS[Number(authTypeOverride)] ?? authTypeOverride;
  }
  if (orchestrationType) s.orchestrationType = orchestrationType;
  if (detectNewDesigner(poweredByCode, undefined)) {
    s.isGenerativeDesigner = true;
    s.orchestrationType = "generative";
  }
  if (configJson) {
    try {
      const cfg = JSON.parse(configJson) as Record<string, unknown>;
      const runtimeSettings = cfg["settings"] as Record<string, unknown> | undefined;
      if (!s.orchestrationType && typeof runtimeSettings?.["GenerativeActionsEnabled"] === "boolean") {
        s.orchestrationType = runtimeSettings["GenerativeActionsEnabled"] ? "generative" : "classic";
      }
      const ai = cfg["aISettings"] as Record<string, unknown> | undefined;
      if (ai) {
        if (ai["useModelKnowledge"] !== undefined) s.useModelKnowledge = Boolean(ai["useModelKnowledge"]);
        if (ai["isSemanticSearchEnabled"] !== undefined) s.isSemanticSearchEnabled = Boolean(ai["isSemanticSearchEnabled"]);
        if (ai["optInUseLatestModels"] !== undefined) s.optInUseLatestModels = Boolean(ai["optInUseLatestModels"]);
      }
      const recognizer = cfg["recognizer"] as Record<string, unknown> | undefined;
      if (detectNewDesigner(poweredByCode, recognizer?.["$kind"])) {
        s.isGenerativeDesigner = true;
        // New-designer agents are always generative orchestration. cat_orchestrationtype
        // (applied above) can carry a stale/blank/classic value for these agents, so force
        // the correct value here — the Agent Details "Orchestration" KPI reads this.
        s.orchestrationType = "generative";
      }
      // New designer (generative) agents store agent-level settings — including
      // whether conversation memory is enabled — under `agentSettings`.
      const agentSettings = cfg["agentSettings"] as Record<string, unknown> | undefined;
      if (agentSettings && agentSettings["enableMemory"] !== undefined) {
        s.isMemoryEnabled = Boolean(agentSettings["enableMemory"]);
      }
    } catch { /* ignore */ }
  }
  return Object.keys(s).length > 0 ? s : undefined;
}

/**
 * Extracts authored instructions from a new-designer (generative) agent's
 * `configuration.agentSettings.instructions.segments`. New-experience agents keep
 * their instructions here rather than in `cat_instructions` or a CustomGPT
 * component, so without this the Agent Details panel shows no instructions.
 * Segment values are concatenated; the surrounding ``` markdown code fence that
 * Copilot Studio wraps them in is stripped for clean display.
 */
function parseInstructionsFromConfig(configJson: string | null | undefined): string | undefined {
  if (!configJson) return undefined;
  try {
    const cfg = JSON.parse(configJson) as Record<string, unknown>;
    const agentSettings = cfg["agentSettings"] as Record<string, unknown> | undefined;
    const instructions = agentSettings?.["instructions"] as Record<string, unknown> | undefined;
    const segments = instructions?.["segments"];
    if (!Array.isArray(segments)) return undefined;
    let text = segments
      .map((seg) => {
        const s = seg as Record<string, unknown>;
        return typeof s["value"] === "string" ? (s["value"] as string) : "";
      })
      .join("")
      .trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
    }
    return text || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// YAML utilities — exact port from Agent Review Tool yamlUtils.ts
// ---------------------------------------------------------------------------

function preprocessYaml(content: string): string {
  if (!content || content.trim() === "") return content;
  const lines = content.split("\n");
  const processed: string[] = [];
  let previousIndent = 0;
  for (const line of lines) {
    let pl = line.replace(/\t/g, "  ");
    if (pl.trim() === "") { processed.push(pl); continue; }
    const leadingSpaces = pl.match(/^\s*/)?.[0].length ?? 0;
    let spaceCount = leadingSpaces % 2 !== 0 ? Math.floor(leadingSpaces / 2) * 2 : leadingSpaces;
    if (spaceCount > previousIndent + 4) spaceCount = previousIndent + 2;
    previousIndent = spaceCount;
    const trimmed = pl.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx);
      const rest = trimmed.substring(colonIdx);
      const sp = " ".repeat(spaceCount);
      pl = /^[@&*!|>%]/.test(key) && !/^['"]/.test(key) ? `${sp}'${key}'${rest}` : `${sp}${key}${rest}`;
    } else {
      pl = " ".repeat(spaceCount) + trimmed;
    }
    processed.push(pl);
  }
  return processed.join("\n");
}

function isValidYamlStructure(content: string): boolean {
  if (!content?.trim()) return false;
  if (!/^\s*[\w-]+\s*:/m.test(content)) return false;
  return (content.match(/\[/g)?.length ?? 0) === (content.match(/\]/g)?.length ?? 0) &&
         (content.match(/\{/g)?.length ?? 0) === (content.match(/\}/g)?.length ?? 0);
}

function extractAgentInstructions(parsed: Record<string, unknown>, raw: string): string {
  const val = parsed.instructions ?? parsed.systemInstructions ?? parsed.prompt ??
              parsed.agentInstructions ?? parsed.instruction ?? parsed.systemPrompt;
  if (val && typeof val === "string") return val.trim();

  const patterns = [
    /(?:^|\n)\s*(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,
    /(?:^|\n)\s+(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*\n\s+([\s\S]+?)(?=\n\S|\n\s*\w+\s*:|$)/i,
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([^\n]*(?:\n(?!\w+:)[^\n]*)*)/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

function extractVariables(vars: unknown): Array<{ VariableName: string; displayName?: string; VariableDescription?: string }> {
  if (!vars) return [];
  if (typeof vars === "object" && !Array.isArray(vars)) {
    return Object.entries(vars as Record<string, unknown>).map(([key, v]) => ({
      VariableName: key,
      displayName: (v as { displayName?: string })?.displayName,
      VariableDescription: (v as { description?: string })?.description,
    }));
  }
  if (Array.isArray(vars)) {
    return (vars as unknown[]).map((item) => {
      if (typeof item === "string") return { VariableName: item };
      const i = item as Record<string, unknown>;
      return {
        VariableName: String(i["name"] || i["VariableName"] || ""),
        displayName: i["displayName"] as string | undefined,
        VariableDescription: (i["description"] || i["VariableDescription"]) as string | undefined,
      };
    });
  }
  return [];
}

function parseYaml(raw: string | undefined): Record<string, unknown> | null {
  if (!raw?.trim() || !isValidYamlStructure(raw)) return null;
  try {
    const p = yamlLoad(preprocessYaml(raw));
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    try {
      const p = yamlLoad(raw);
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch { /* ignore */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// botcomponents fetch — for topics (cross-environment, uses YAML parsing)
// ---------------------------------------------------------------------------

// Exact port of ComponentType from StageAService (+ BotFileAttachment)
const CT = {
  Topic: "0", TopicV2: "9", CustomGPT: "15",
  BotEntity: "3", BotEntityV2: "11", KnowledgeSource: "16",
  BotFileAttachment: "14",   // file-based knowledge (PDFs, Word docs) — OBI is empty, name = filename
} as const;

// Built-in system topics users cannot rename/delete
// Includes standard Copilot Studio system topics + telephony/speech system topics
// (confirmed from live botcomponents data — all have canmodify=null, indistinguishable
//  by schema prefix or YAML kind from custom topics; name is the only reliable signal)
const SYSTEM_TOPIC_NAMES = new Set([
  // Standard system topics
  "Conversation Start", "Conversational boosting", "End of Conversation",
  "Fallback", "Multiple Topics Matched", "On Error", "Reset Conversation",
  "Escalate", "Sign in", "Sign out",
  // Telephony/speech system topics (statecode=1, OnRecognizedIntent — same as custom)
  "Answering Machine Detection", "Silence detection",
  "Speech unrecognized", "Unknown dial pad press",
]);

// System topic detection by beginDialog.kind — more reliable than name matching
// (confirmed from actual botcomponents YAML data)
const SYSTEM_BEGINDIALOG_KINDS = new Set([
  "OnConversationStart",  // Conversation Start
  "OnUnknownIntent",      // Conversational boosting, Fallback
  "OnSystemRedirect",     // End of Conversation, Reset Conversation
  "OnEscalate",           // Escalate
  "OnSelectIntent",       // Multiple Topics Matched
  "OnError",              // On Error
  "OnSignIn",             // Sign in
  "OnSignOut",            // Sign out
]);

type ComponentRecord = {
  botcomponentid?: string; name?: string;
  componenttype?: string; content?: string; data?: string;
  statecode?: number; category?: string;
  description?: string;
  canmodifystate?: number; // 0 = system (not editable), 1 = custom (user-created)
  schemaname?: string;     // mspva_ prefix = Microsoft-managed system component
};

async function fetchBotComponents(orgUrl: string, botId: string): Promise<ComponentRecord[]> {
  await ensurePowerAppsInitialized();

  // Use MicrosoftDataverseService.ListRecordsWithOrganization — exact same call as the
  // Agent Review Tool's BotService.getBotComponents cross-environment path.
  const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
    orgUrl,
    "botcomponents",
    "odata.maxpagesize=500",   // prefer
    "application/json",         // accept
    undefined,                  // x_ms_odata_metadata_full
    undefined,                  // mscrmIncludeMipSensitivityLabel
    "botcomponentid,name,schemaname,componenttype,content,data,statecode,category,canmodifystate,description",  // $select
    `_parentbotid_value eq ${botId}`,                  // $filter
    "name asc",                 // $orderby
  );

  if (!res.success) return [];

  const raw = res.data as Record<string, unknown> | undefined;
  const components: ComponentRecord[] = ((raw?.["value"] ?? []) as ComponentRecord[]);

  // Individual fetch for components with empty content/data (mirrors BotService)
  await Promise.all(components.map(async (comp) => {
    const needsFull = comp.componenttype === CT.CustomGPT ? !comp.data : !comp.content;
    if (!needsFull || !comp.botcomponentid) return;
    try {
      const full = await MicrosoftDataverseService.GetItemWithOrganization(
        "", "application/json", orgUrl, "botcomponents", comp.botcomponentid,
        undefined, undefined, "content,data",
      );
      if (full.success && full.data) {
        const d = full.data as Record<string, unknown>;
        comp.content = d["content"] as string | undefined;
        comp.data = d["data"] as string | undefined;
      }
    } catch { /* silently skip — component will show without parsed YAML detail */ }
  }));

  return components;
}

function yamlKind(comp: ComponentRecord): string | undefined {
  const raw = comp.data || comp.content || "";
  return /^\s*kind\s*:\s*(\w+)/m.exec(raw)?.[1];
}

/**
 * Exact port of detectToolType from StageAService.
 * Only the 4 confirmed action.kind values — no extras.
 * Falls back to raw YAML regex for robustness when full parse fails.
 */
function detectToolType(parsed: Record<string, unknown> | null, rawYaml: string): AgentToolType {
  // Primary: parsed YAML action.kind (exact StageAService logic)
  const k = (parsed?.action as Record<string, unknown> | undefined)?.kind as string | undefined;
  if (k === "InvokeFlowTaskAction") return "flow";
  if (k === "InvokeExternalAgentTaskAction") return "mcp";
  if (k === "InvokeConnectorTaskAction") return "connector";
  if (k === "InvokeAIBuilderModelTaskAction") return "prompt";

  // Fallback: raw YAML search when parseYaml returned null
  if (/InvokeFlowTaskAction/i.test(rawYaml)) return "flow";
  if (/InvokeExternalAgentTaskAction/i.test(rawYaml)) return "mcp";
  if (/InvokeConnectorTaskAction/i.test(rawYaml)) return "connector";
  if (/InvokeAIBuilderModelTaskAction/i.test(rawYaml)) return "prompt";
  // Copilot Studio native AI prompt — no action block, inputs use AutomaticTaskInput
  if (/AutomaticTaskInput/i.test(rawYaml)) return "prompt";

  return "unknown";
}

/**
 * Maps a new-designer (generative) type-9 tool `kind` to an {@link AgentToolType}.
 * New-designer tools are identified by a `*Tool` top-level YAML kind (e.g.
 * `ConnectorTool`, `McpTool`) rather than the classic `action.kind`, so
 * {@link detectToolType} (which reads `action.kind`) doesn't apply.
 */
function mapGenerativeToolType(kind: string): AgentToolType {
  switch (kind) {
    case "McpTool": return "mcp";
    case "ConnectorTool": return "connector";
    case "FlowTool": return "flow";
    case "PromptTool":
    case "AIBuilderPromptTool":
    case "AgentBuilderPromptTool": return "prompt";
    default: return "unknown";
  }
}

function detectKnowledgeFromYaml(parsed: Record<string, unknown>): { sourceType: AgentKnowledgeType; url?: string } {
  const source = parsed.source as Record<string, unknown> | undefined;
  const kind = (source?.kind as string | undefined) ?? (parsed.kind as string | undefined) ?? "";

  const firstString = (...vals: unknown[]): string | undefined => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };
  // URL field name varies by source kind and designer version
  const url = firstString(
    source?.site, source?.url, source?.siteUrl, source?.sharePointSiteUrl, source?.startUrl,
    parsed.site, parsed.url, parsed.siteUrl,
  );

  if (kind === "SharePointSearchSource") return { sourceType: "SharePoint", url };
  if (kind === "PublicSiteSearchSource" || kind === "WebSearchSource" || kind === "WebSource")
    return { sourceType: "Web", url };
  if (kind === "DataverseSource") return { sourceType: "Dataverse" };
  if (kind === "FileSource" || kind === "DocumentSource") return { sourceType: "File" };

  // New-designer kinds (e.g. WebsiteKnowledgeSource, SharePointKnowledgeSource)
  // are open-ended, so fall back to matching the kind name.
  const k = kind.toLowerCase();
  if (k.includes("sharepoint")) return { sourceType: "SharePoint", url };
  if (k.includes("dataverse") || k.includes("table")) return { sourceType: "Dataverse", url };
  if (k.includes("file") || k.includes("document") || k.includes("upload")) return { sourceType: "File", url };
  if (k.includes("website") || k.includes("web") || k.includes("site") || k.includes("url"))
    return { sourceType: "Web", url };

  return { sourceType: "Unknown", url };
}

function componentStatus(statecode: number | undefined): "Enabled" | "Disabled" {
  return statecode === 0 ? "Enabled" : "Disabled";
}

function parseTopicsFromComponents(components: ComponentRecord[]): {
  topics: AgentConfigTopic[];
  toolsFromComponents: AgentConfigTool[];
  knowledgeFromComponents: AgentConfigKnowledge[];
  childAgentsFromComponents: AgentConfigChildAgent[];
  skillsFromComponents: AgentConfigSkill[];
  instructionsFromComponents: string | undefined;
} {
  const topics: AgentConfigTopic[] = [];
  const toolsFromComponents: AgentConfigTool[] = [];
  const knowledgeFromComponents: AgentConfigKnowledge[] = [];
  const childAgentsFromComponents: AgentConfigChildAgent[] = [];
  const skillsFromComponents: AgentConfigSkill[] = [];
  let instructionsFromComponents: string | undefined;

  for (const comp of components) {
    const name = comp.name?.trim() || "";
    const status = componentStatus(comp.statecode);
    // Normalise componenttype to string — Dataverse returns integer
    const ct = String(comp.componenttype ?? "");

    // ── Instructions (CustomGPT type 15) ─────────────────────────────────────
    if (ct === CT.CustomGPT) {
      if (!instructionsFromComponents) {
        const raw = comp.data || comp.content || "";
        const parsed = parseYaml(raw);
        if (parsed) {
          const e = extractAgentInstructions(parsed, raw);
          if (e) instructionsFromComponents = e;
        }
      }
      continue;
    }

    // ── Knowledge sources (type 16, 3, 11) ───────────────────────────────────
    if (ct === CT.KnowledgeSource || ct === CT.BotEntity || ct === CT.BotEntityV2) {
      if (!name) continue;
      const raw = comp.data || comp.content || "";
      const parsed = parseYaml(raw);
      const { sourceType, url } = parsed ? detectKnowledgeFromYaml(parsed) : { sourceType: "Unknown" as AgentKnowledgeType, url: undefined };
      knowledgeFromComponents.push({ name, sourceType, url, status });
      continue;
    }

    // ── File-based knowledge (type 14 — Bot File Attachment) ─────────────────
    // OBI data is empty; the filename is stored in comp.name
    if (ct === CT.BotFileAttachment) {
      if (!name) continue;
      knowledgeFromComponents.push({ name, sourceType: "File", url: undefined, status });
      continue;
    }

    // ── Topics / Tools / Agents (type 0 and 9) ───────────────────────────────
    if (ct === CT.Topic || ct === CT.TopicV2) {
      const kind = yamlKind(comp);

      // ── New designer (generative) components ──────────────────────────────
      // These carry distinct top-level kinds instead of AgentDialog/TaskDialog:
      //   ConnectedAgentTool → connected agent, McpTool → tool, InlineAgentSkill
      //   → skill. Classic parsing treats them as topics, which is incorrect.
      if (kind === "ConnectedAgentTool") {
        const raw = comp.data || comp.content || "";
        const parsed = parseYaml(raw);
        const displayName = (parsed?.modelDisplayName as string | undefined)?.trim() || name || "Agent";
        childAgentsFromComponents.push({
          name: displayName,
          // YAML parsing can fail on tool payloads, so fall back to the botcomponent column
          description: (parsed?.modelDescription as string | undefined)?.trim()
            || comp.description?.trim()
            || undefined,
          status,
          relationship: "Connected",
        });
        continue;
      }
      // New-designer tools all carry a "*Tool" kind (McpTool, ConnectorTool,
      // FlowTool, PromptTool, …). ConnectedAgentTool is handled above as a
      // connected agent. Classic parsing only recognized McpTool, so connector,
      // flow and prompt tools fell through to the topic branch and were
      // mis-listed as Topics for new-experience agents.
      if (kind && kind !== "ConnectedAgentTool" && /Tool$/.test(kind)) {
        const raw = comp.data || comp.content || "";
        const parsed = parseYaml(raw);
        const displayName = (parsed?.modelDisplayName as string | undefined)?.trim() || name;
        toolsFromComponents.push({
          name: name || displayName,
          displayName: displayName || undefined,
          // YAML parsing can fail on tool payloads, so fall back to the botcomponent column
          description: (parsed?.modelDescription as string | undefined)?.trim()
            || comp.description?.trim()
            || undefined,
          toolType: mapGenerativeToolType(kind),
          status,
        });
        continue;
      }
      if (kind === "InlineAgentSkill") {
        // The skill's own name/description live in an inner YAML `content` block.
        const raw = comp.data || comp.content || "";
        const inner = /content:\s*\|([\s\S]*)/.exec(raw)?.[1] ?? "";
        const skillName = /^\s*name:\s*(.+)$/m.exec(inner)?.[1]?.trim() || name;
        const skillDesc = /^\s*description:\s*(.+)$/m.exec(inner)?.[1]?.trim() || undefined;
        skillsFromComponents.push({ name: skillName || name, description: skillDesc, status });
        continue;
      }

      // ── Child agent (AgentDialog) ──
      if (kind === "AgentDialog") {
        const raw = comp.data || comp.content || "";
        const parsed = parseYaml(raw);
        const displayName = (parsed?.modelDisplayName as string | undefined)?.trim()
          || (parsed?.displayName as string | undefined)?.trim()
          || name || "Agent";
        const beginDialog = parsed?.beginDialog as Record<string, unknown> | undefined;
        const desc = beginDialog?.description as string | undefined;
        const beginKind = beginDialog?.kind as string | undefined;
        const relationship: "Child" | "Connected" = beginKind === "OnToolSelected" ? "Child" : "Connected";
        childAgentsFromComponents.push({ name: displayName, description: desc?.trim() || undefined, status, relationship });
        continue;
      }

      // ── Tool or Connected agent (TaskDialog) ──
      if (kind === "TaskDialog") {
        const rawYaml = comp.data || comp.content || "";
        const parsed = parseYaml(rawYaml);
        const displayName = (parsed?.modelDisplayName as string | undefined)?.trim() || name;

        // InvokeConnectedAgentTaskAction = connected Copilot Studio agent → Agents tab
        // (distinct from InvokeExternalAgentTaskAction which is MCP and stays in Tools)
        if (/InvokeConnectedAgentTaskAction/i.test(rawYaml)) {
          childAgentsFromComponents.push({
            name: displayName || name,
            description: (parsed?.modelDescription as string | undefined)?.trim() || undefined,
            status,
            relationship: "Connected",
          });
          continue;
        }

        // All other TaskDialog kinds → Tools tab
        // (Flow, Connector, Prompt/AutomaticTaskInput, MCP/InvokeExternalAgentTaskAction)
        toolsFromComponents.push({
          name: name || displayName,
          displayName: displayName || undefined,
          description: parsed?.modelDescription as string | undefined,
          toolType: detectToolType(parsed, rawYaml),
          status,
        });
        continue;
      }

      // ── Regular topic — keep only Custom topics (portal Custom tab) ──
      if (!name) continue;

      // canmodifystate is null for all components in this environment — unusable
      // Schema prefix is identical for all — unusable
      // Use YAML beginDialog.kind + name exclusion list (confirmed from live data)
      const raw = comp.content || comp.data || "";
      const beginDialogKind = /beginDialog:\s*\n\s*kind:\s*(\w+)/m.exec(raw)?.[1];
      if (beginDialogKind && SYSTEM_BEGINDIALOG_KINDS.has(beginDialogKind)) continue;
      if (SYSTEM_TOPIC_NAMES.has(name)) continue;

      const parsed = parseYaml(comp.content || comp.data);
      const topic: AgentConfigTopic = {
        topicName: name,
        modelName: parsed?.modelDisplayName as string | undefined,
        modelDescription: parsed?.modelDescription as string | undefined,
        status,
      };
      if (parsed) {
        const inRaw  = (parsed.inputType  as Record<string, unknown> | undefined)?.properties ?? parsed.inputVariables;
        const outRaw = (parsed.outputType as Record<string, unknown> | undefined)?.properties ?? parsed.outputVariables;
        const inVars  = extractVariables(inRaw);
        const outVars = extractVariables(outRaw);
        if (inVars.length > 0)  topic.inputVariables  = inVars.map(v => ({ name: v.displayName || v.VariableName, description: v.VariableDescription }));
        if (outVars.length > 0) topic.outputVariables = outVars.map(v => ({ name: v.displayName || v.VariableName, description: v.VariableDescription }));
      }
      topics.push(topic);
    }
  }
  return { topics, toolsFromComponents, knowledgeFromComponents, childAgentsFromComponents, skillsFromComponents, instructionsFromComponents };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetches full agent configuration for the given cat_agentdetailsid.
 *
 * 1. Fetches the cat_agentdetailses record (local Dataverse, generated service)
 *    to get instructions, knowledge, tools, description, model, settings.
 * 2. Uses cat_agentid + cat_environmenturl from that record to query
 *    botcomponents in the remote environment for full topic details.
 */
export async function fetchAgentConfig(agentDetailsId: string): Promise<AgentConfig> {
  await ensurePowerAppsInitialized();

  // 1. Fetch the local cat_agentdetailses record by primary key
  const result = await Cat_agentdetailsesService.get(agentDetailsId, {
    select: AGENT_DETAILS_SELECT as unknown as string[],
  });

  if (!result.success || !result.data) {
    return { botName: "Agent", topics: [], tools: [], knowledge: [], childAgents: [], skills: [] };
  }

  const rec = result.data as unknown as Record<string, unknown>;

  const botName    = String(rec["cat_name"] ?? "Agent");
  const description = rec["cat_description"] as string | undefined;
  const instructions = rec["cat_instructions"] as string | undefined;
  const orchestration = rec["cat_orchestrationtype"] as string | undefined;
  const authType   = rec["cat_enduserauthenticationtype"] as string | undefined;
  const poweredByCode =
    typeof rec["cat_poweredbycode"] === "number"
      ? rec["cat_poweredbycode"]
      : undefined;
  const botId      = rec["cat_agentid"] as string | undefined;
  const envUrl     = rec["cat_environmenturl"] as string | undefined;

  // 2. Parse JSON fields from the record
  const knowledge = parseKnowledge(rec["cat_knowledgesources"] as string | undefined);
  const tools = parseTools(
    rec["cat_connections"] as string | undefined,
    rec["cat_prompts"] as string | undefined,
    rec["cat_httprequestactions"] as string | undefined,
  );

  // Fetch bot record for language, auth mode, and AI settings (configuration JSON)
  type BotSettingsRecord = { language?: number; authenticationmode?: number; configuration?: string };
  let botSettings: BotSettingsRecord = {};
  if (botId && envUrl) {
    try {
      const orgUrl = normalizeOrganizationUrl(envUrl);
      const br = await MicrosoftDataverseService.GetItemWithOrganization(
        "", "application/json", orgUrl, "bots", botId,
        undefined, undefined, "language,authenticationmode,configuration",
      );
      if (br.success && br.data) botSettings = br.data as BotSettingsRecord;
    } catch { /* non-fatal — settings still partially available */ }
  }

  const settings = parseSettings(
    botSettings.language,
    botSettings.authenticationmode,
    botSettings.configuration,
    orchestration,
    authType,
    poweredByCode,
  );

  // New-experience (generative) agents keep instructions in the bot
  // configuration (agentSettings.instructions), not in cat_instructions or a
  // CustomGPT component. Used as a fallback below.
  const instructionsFromConfig = parseInstructionsFromConfig(botSettings.configuration);

  // 3. Fetch botcomponents for topics + tools + knowledge (cross-environment)
  let topics: AgentConfigTopic[] = [];
  let childAgents: AgentConfigChildAgent[] = [];
  let skills: AgentConfigSkill[] = [];
  let instructionsFromComponents: string | undefined;
  let toolsFromComponents: AgentConfigTool[] = [];
  let knowledgeFromComponents: AgentConfigKnowledge[] = [];

  if (botId && envUrl) {
    try {
      const orgUrl = normalizeOrganizationUrl(envUrl);
      const components = await fetchBotComponents(orgUrl, botId);
      const parsed = parseTopicsFromComponents(components);
      topics = parsed.topics;
      childAgents = parsed.childAgentsFromComponents;
      skills = parsed.skillsFromComponents;
      instructionsFromComponents = parsed.instructionsFromComponents;
      toolsFromComponents = parsed.toolsFromComponents;
      knowledgeFromComponents = parsed.knowledgeFromComponents;
    } catch { /* silently continue with partial data */ }
  }

  // botcomponents data takes precedence over JSON fields from cat_agentdetailses
  const allTools = toolsFromComponents.length > 0 ? toolsFromComponents : tools;
  const allKnowledge = knowledgeFromComponents.length > 0 ? knowledgeFromComponents : knowledge;

  return {
    botName,
    description: description || undefined,
    settings: settings || (orchestration ? { orchestrationType: orchestration } : undefined),
    instructions: instructions || instructionsFromComponents || instructionsFromConfig || undefined,
    topics,
    tools: allTools,
    knowledge: allKnowledge,
    childAgents,
    skills,
  };
}

/** Live discovery must not depend on a collected cat_agentdetailses record. */
export async function fetchLiveAgentConfig(botId: string, environmentUrl: string): Promise<AgentConfig> {
  const orgUrl = normalizeOrganizationUrl(environmentUrl);
  const [result, records] = await Promise.all([
    MicrosoftDataverseService.GetItemWithOrganization(
      "", "application/json", orgUrl, "bots", botId, false, false,
      "name,language,authenticationmode,configuration,applicationmanifestinformation",
    ),
    listAgentRecords(
      orgUrl, "botcomponents",
      "botcomponentid,name,schemaname,componenttype,content,data,statecode,category,canmodifystate,description",
      `_parentbotid_value eq ${botId}`,
    ),
  ]);
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? "Unable to load the selected agent configuration.");
  }
  const bot = result.data;
  const components: ComponentRecord[] = records.map(value => ({
    botcomponentid: typeof value.botcomponentid === "string" ? value.botcomponentid : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    schemaname: typeof value.schemaname === "string" ? value.schemaname : undefined,
    componenttype: value.componenttype == null ? undefined : String(value.componenttype),
    content: typeof value.content === "string" ? value.content : undefined,
    data: typeof value.data === "string" ? value.data : undefined,
    statecode: typeof value.statecode === "number" ? value.statecode : undefined,
    category: typeof value.category === "string" ? value.category : undefined,
    canmodifystate: typeof value.canmodifystate === "number" ? value.canmodifystate : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
  }));
  const parsed = parseTopicsFromComponents(components);
  const configuration = typeof bot.configuration === "string" ? bot.configuration : undefined;
  const manifest = tryParseJson(typeof bot.applicationmanifestinformation === "string" ? bot.applicationmanifestinformation : undefined);
  const description = manifest && typeof manifest === "object" && "description" in manifest
    && typeof manifest.description === "string" ? manifest.description : undefined;
  return {
    botName: typeof bot.name === "string" ? bot.name : "Agent",
    choiceEntities: Object.fromEntries(components
      .filter(component => component.componenttype === CT.BotEntityV2 && component.schemaname)
      .map(component => [component.schemaname!, {
        name: component.name ?? component.schemaname!,
        botComponentId: component.botcomponentid,
        rawData: component.data,
      }])),
    description,
    settings: parseSettings(
      typeof bot.language === "number" ? bot.language : undefined,
      typeof bot.authenticationmode === "number" ? bot.authenticationmode : undefined,
      configuration, undefined, undefined, undefined,
    ),
    instructions: parsed.instructionsFromComponents || parseInstructionsFromConfig(configuration),
    topics: parsed.topics, tools: parsed.toolsFromComponents,
    knowledge: parsed.knowledgeFromComponents, childAgents: parsed.childAgentsFromComponents,
    skills: parsed.skillsFromComponents,
  };
}
