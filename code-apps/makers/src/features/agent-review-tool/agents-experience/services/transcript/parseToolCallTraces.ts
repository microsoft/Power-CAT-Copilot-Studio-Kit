import type {
  CoverageItem,
  ParsedTranscriptEvidence,
  RetainedToolCall,
} from '../../contracts/TranscriptEvidence';

/**
 * Parses `ToolCallTrace` events out of a Microsoft Copilot harness conversation
 * transcript.
 *
 * Ported from the Admin agent-debugger generative parser. The Admin parser
 * rebuilds a full turn-by-turn execution model; this one keeps only the tool
 * census needed for provisioning-gap evidence, so the two are deliberately
 * separate rather than shared (spec 019, decision D1).
 */

/** Marker that introduces the configured knowledge catalogue in a search call. */
const AVAILABLE_SOURCES_MARKER = 'Available search sources:';

/** Error code Copilot Studio emits when a conversation is blocked before planning. */
const AGENT_BLOCKED_CODE = 'AgentBlocked';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Knowledge-search calls expose the sources they searched in
 * `hiddenFilledParameters.sources`, as a JSON-encoded string array such as
 * `"[\"MDN Web Docs\"]"`. Parsed defensively: a value that fails `JSON.parse`
 * is treated as a single literal source name rather than discarded.
 */
export function parseSearchedSources(value: Record<string, unknown>): string[] {
  const hidden = value['hiddenFilledParameters'];
  if (!isRecord(hidden)) return [];
  const raw = hidden['sources'];
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (Array.isArray(arr)) {
    return arr.filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return [];
}

/**
 * Extracts the configured knowledge catalogue from a search call's
 * `description`.
 *
 * The harness renders the catalogue as a bulleted block, verified on live
 * transcripts:
 *
 * ```text
 * Available search sources:
 * - React Reference (Website): Reference documentation for React
 * - Coffee Gear (1).docx (Uploaded file)
 * ```
 *
 * The trailing type parenthetical and the optional `: description` suffix are
 * both stripped, so the returned name matches the value that appears in
 * `hiddenFilledParameters.sources`.
 */
export function parseAvailableSources(description: unknown): CoverageItem[] {
  if (typeof description !== 'string') return [];
  const markerAt = description.indexOf(AVAILABLE_SOURCES_MARKER);
  if (markerAt < 0) return [];

  const block = description.slice(markerAt + AVAILABLE_SOURCES_MARKER.length);
  const items: CoverageItem[] = [];
  const seen = new Set<string>();

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // The block ends at the first line that is not a bullet.
    if (!line.startsWith('- ') && !line.startsWith('* ')) break;

    // Drop the bullet, then the ": description" tail that may follow the name.
    let entry = line.slice(2).trim();
    const colonAt = entry.indexOf(':');
    if (colonAt >= 0) entry = entry.slice(0, colonAt).trim();
    if (!entry) continue;

    // Split a trailing "(Type)" qualifier off the name.
    let name = entry;
    let sourceType: string | undefined;
    const typeMatch = /^(.*)\s+\(([^()]*)\)$/.exec(entry);
    if (typeMatch) {
      name = typeMatch[1].trim();
      sourceType = typeMatch[2].trim() || undefined;
    }
    if (!name || seen.has(name)) continue;

    seen.add(name);
    items.push({ name, sourceType, state: 'not-observed', invocations: 0 });
  }

  return items;
}

/**
 * Decides whether a `ToolCallTrace` activity is a real tool call.
 *
 * Over 99% of `ToolCallTrace` events are empty streaming frames that carry
 * neither a tool name nor a status. Counting them naively overstates usage by
 * roughly 200x, so this filter runs before any aggregation.
 */
export function isRetainableToolCall(name: string, value: unknown): boolean {
  if (!name.startsWith('ToolCallTrace')) return false;
  if (!isRecord(value)) return false;
  const hasToolName =
    typeof value['toolName'] === 'string' && value['toolName'].trim().length > 0;
  const hasStatus =
    typeof value['status'] === 'string' && value['status'].trim().length > 0;
  return hasToolName || hasStatus;
}

/**
 * Classifies a retained call. Loaded skills report `toolName: "skill"` and
 * carry no `toolKind`, so they are detected by name, matching the Admin
 * parser's behaviour.
 */
function classifyTool(
  value: Record<string, unknown>,
): { toolName: string; displayName: string; toolKind: string } {
  const toolName = String(value['toolName'] ?? '').trim();
  const displayName = String(value['toolDisplayName'] ?? toolName).trim() || toolName;
  if (toolName === 'skill') {
    return { toolName, displayName, toolKind: 'skill' };
  }
  return { toolName, displayName, toolKind: String(value['toolKind'] ?? 'tool') };
}

/** Reads the invoked skill name from a skill call's filled parameters. */
function parseInvokedSkill(value: Record<string, unknown>): string | undefined {
  const filled = value['filledParameters'];
  if (!isRecord(filled)) return undefined;
  const skill = filled['skill'];
  return typeof skill === 'string' && skill.trim() ? skill.trim() : undefined;
}

/** True when the activity is an `AgentBlocked` error trace. */
function isAgentBlockedTrace(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return String(value['errorCode'] ?? '') === AGENT_BLOCKED_CODE;
}

/**
 * Parses one transcript `content` payload into its retained tool calls.
 *
 * A conversation that produced only an `AgentBlocked` error trace is reported
 * as `blocked`, so the caller can exclude it from the observation base. A
 * blocked conversation never reached tool selection, so treating it as "no
 * tools observed" would manufacture a false finding.
 */
export function parseToolCallTraces(content: unknown): ParsedTranscriptEvidence {
  const empty: ParsedTranscriptEvidence = { calls: [], blocked: false };

  let data: unknown = content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) return empty;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return empty;
    }
  }
  if (!isRecord(data)) return empty;

  const activities = data['activities'];
  if (!Array.isArray(activities)) return empty;

  const calls: RetainedToolCall[] = [];
  // A `:Started` and its `:Completed` describe one call, so they are collapsed
  // by `toolCallId` to avoid double counting.
  const seenCallIds = new Set<string>();
  let sawBlocked = false;

  for (const activity of activities) {
    if (!isRecord(activity)) continue;
    const value = activity['value'];
    const name = String(activity['name'] ?? '');

    if (isAgentBlockedTrace(value)) {
      sawBlocked = true;
      continue;
    }
    if (!isRetainableToolCall(name, value)) continue;
    if (!isRecord(value)) continue;

    const toolCallId = String(value['toolCallId'] ?? '');
    if (toolCallId && seenCallIds.has(toolCallId)) continue;
    if (toolCallId) seenCallIds.add(toolCallId);

    const { toolName, displayName, toolKind } = classifyTool(value);
    if (!toolName) continue;

    calls.push({
      toolName,
      displayName,
      toolKind,
      searchedSources: parseSearchedSources(value),
      availableSources: parseAvailableSources(value['description']),
      skill: parseInvokedSkill(value),
    });
  }

  // Blocked means the conversation never reached tool selection. Empty streaming
  // `ToolCallTrace` frames carry no toolName or status and are the majority of
  // events, so they must not count as "reached tool selection" — keying off
  // retained calls is the only signal that survives them.
  return { calls, blocked: sawBlocked && calls.length === 0 };
}
