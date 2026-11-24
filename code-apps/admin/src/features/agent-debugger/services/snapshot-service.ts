/**
 * Snapshot service — parses a Copilot Studio snapshot ZIP file.
 *
 * A snapshot is downloaded from the Copilot Studio test pane ("Download snapshot")
 * and contains two files:
 *   - dialog.json  — Bot Framework activities for the conversation
 *   - botContent.yml — Full bot definition (topics, actions, flows, agents)
 *
 * This service extracts both, building the same activity array and component-name
 * map that the Dataverse transcript fetch + botcomponents lookup produces — so the
 * existing parser and UI can be reused unchanged.
 */

import JSZip from "jszip";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import type { Activity } from "../contracts/transcript";
import type {
  ActivityWithValue,
  DynamicPlanStepFinishedValue,
} from "../contracts/transcript-events";
import { normalizeTimestampMs } from "../utils/transcript/timestamp";
import { getSessionInfoTurnCount } from "../utils/transcript/session-info";
import type { ComponentInfo } from "./botcomponents-service";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SnapshotData {
  /** Bot Framework activities parsed from dialog.json */
  activities: Activity[];
  /** Schema-name → ComponentInfo map built from botContent.yml */
  componentNames: Record<string, ComponentInfo>;
  /** Display name of the agent (from first bot activity) */
  botName: string;
  /** Raw bot ID (from.id of first bot activity) */
  botId: string;
  /** Conversation ID from activities */
  conversationId: string;
  /** ISO timestamp of the first activity */
  startTime: string;
}

type SnapshotActivity = Activity & {
  conversation?: {
    id?: string;
  };
};

// ---------------------------------------------------------------------------
// Internal YAML types (loosely typed — content can vary widely)
// ---------------------------------------------------------------------------

interface YamlComponent {
  kind?: string;
  schemaName?: string;
  displayName?: string;
  description?: string;
  metadata?: {
    displayName?: string;
    instructions?: string;
  };
  dialog?: {
    kind?: string;
    modelDisplayName?: string;
    modelDescription?: string;
  };
}

interface YamlFlow {
  workflowId?: string;
  displayName?: string;
}

interface BotContentYaml {
  components?: YamlComponent[];
  flows?: YamlFlow[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a Copilot Studio snapshot ZIP file into a SnapshotData object.
 * Throws an Error with a user-friendly message if the file is invalid.
 */
export async function parseSnapshotZip(file: File): Promise<SnapshotData> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error(
      "Could not read the ZIP file. Please make sure it is a valid Copilot Studio snapshot."
    );
  }

  // 1. dialog.json — required
  const dialogFile = zip.file("dialog.json");
  if (!dialogFile) {
    throw new Error(
      "dialog.json not found in the snapshot. Please upload a valid Copilot Studio snapshot ZIP."
    );
  }

  let activities: Activity[] = [];
  try {
    const raw = await dialogFile.async("string");
    const parsed = JSON.parse(raw) as { activities?: Activity[] };
    activities = parsed.activities ?? [];
  } catch {
    throw new Error("Failed to parse dialog.json. The file may be corrupted.");
  }

  // 2. botContent.yml — optional (component names fall back to schema names)
  const componentNames: Record<string, ComponentInfo> = {};
  const botContentFile = zip.file("botContent.yml");
  if (botContentFile) {
    try {
      const yamlText = await botContentFile.async("string");
      const parsed = yamlLoad(yamlText) as BotContentYaml;

      for (const comp of parsed?.components ?? []) {
        if (!comp.schemaName) continue;

        const displayName =
          comp.metadata?.displayName?.trim() ||
          comp.displayName?.trim() ||
          "";
        const modelDisplayName =
          comp.dialog?.modelDisplayName?.trim() || displayName;
        const modelDescription =
          comp.dialog?.modelDescription?.trim() ||
          comp.description?.trim() ||
          "";

        componentNames[comp.schemaName] = {
          name: displayName,
          description: comp.description?.trim() ?? "",
          modelDisplayName,
          modelDescription,
          triggerQueries: [],
          rawData: comp.dialog ? yamlDump(comp.dialog) : undefined,
        };
      }

      // Index flows by workflowId so step names resolve in connector/flow steps
      for (const flow of parsed?.flows ?? []) {
        if (!flow.workflowId || !flow.displayName) continue;
        componentNames[flow.workflowId] = {
          name: flow.displayName,
          description: "",
          modelDisplayName: flow.displayName,
          modelDescription: "",
          triggerQueries: [],
        };
      }
    } catch {
      // YAML parse failures are non-fatal — steps fall back to schema names
    }
  }

  // 3. Derive top-level metadata from activities
  const snapshotActivities = activities as SnapshotActivity[];
  const firstActivity = snapshotActivities[0];
  const firstBotActivity = activities.find(
    (activity) => activity.from?.role === "bot" || activity.from?.role === 0
  );

  const botName =
    firstBotActivity?.from?.name ||
    firstActivity?.from?.name ||
    "Agent";
  const botId = firstBotActivity?.from?.id || "";
  const conversationId = firstActivity?.conversation?.id || "";
  const startTime = String(firstActivity?.timestamp ?? "");

  return { activities, componentNames, botName, botId, conversationId, startTime };
}

/** Returns true if the file has a .zip extension or application/zip MIME type. */
export function isZipFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

/**
 * Derives a ConversationData-compatible GeneralInfo from snapshot activities
 * and a parsed ProcessedTranscript. Used by TranscriptAnalysisPage in snapshot mode.
 */
/**
 * Normalises an activity's timestamp to an ISO string.
 *
 * Snapshot activities carry `timestamp` in epoch **seconds** plus a
 * `timestampMs` in milliseconds. Live Dataverse transcripts instead carry an
 * ISO string. Accepts all three shapes and returns "" when none is usable.
 */
function toIsoTimestamp(activity: Activity | undefined): string {
  const timestamp =
    normalizeTimestampMs(activity?.timestampMs) ??
    normalizeTimestampMs(activity?.timestamp);
  if (timestamp !== undefined) return new Date(timestamp).toISOString();
  return "";
}

/**
 * Derives the general-info block shown above the analysis tabs from a snapshot's
 * activities.
 */
export function deriveSnapshotGeneralInfo(
  activities: Activity[],
  fallbackTurnCount: number,
  durationMs: number,
  outcome: string
): {
  numberOfSessions: number;
  numberOfTurns: number;
  globalOutcome: string;
  totalDuration: number;
  inactivityCounts: number;
  conversationStartTime: string;
  channelId: string | undefined;
  modelName: string | undefined;
} {
  const firstActivity: Activity | undefined = activities[0];
  // `timestamp` on a snapshot activity is epoch **seconds**, so stringifying it
  // yields "1784799249" — not a parseable date, which surfaced verbatim in the
  // Agent insights header. Prefer the sibling `timestampMs`, and normalise a
  // bare epoch number to an ISO string so every consumer can `new Date(...)` it.
  const conversationStartTime = toIsoTimestamp(firstActivity);

  const channelId = activities.find((a) => a?.channelId)?.channelId;

  const totalTurnCount = getSessionInfoTurnCount(activities) ?? fallbackTurnCount;

  // Model name: prefer predictionOutput.modelName from any AI Builder step
  let modelName: string | undefined;
  for (const a of activities) {
    const aAny = a as ActivityWithValue<DynamicPlanStepFinishedValue>;
    if (
      aAny?.name === "DynamicPlanStepFinished" ||
      aAny?.valueType === "DynamicPlanStepFinished"
    ) {
      const mn = aAny?.value?.observation?.predictionOutput?.modelName;
      if (typeof mn === "string" && mn.trim()) {
        modelName = mn.trim();
        break;
      }
    }
  }

  return {
    numberOfSessions: 1,
    numberOfTurns: totalTurnCount,
    globalOutcome: outcome && outcome !== "Unknown" ? outcome : "Test Pane",
    totalDuration: durationMs,
    inactivityCounts: 0,
    conversationStartTime,
    channelId,
    modelName,
  };
}
