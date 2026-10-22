/**
 * Channel constants — single source of truth shared across features.
 *
 * The `value` of each option is the raw Bot Framework / Copilot Studio
 * `channelId` string as it appears both in Dataverse metric tables
 * (`cat_channelid`) and inside conversation transcript activities
 * (`activity.channelId`). Reused by Agent Insights Hub (server-side OData
 * filtering) and Agent Debugger (client-side transcript scanning) so the two
 * features can never drift.
 */

export const CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "msteams", label: "Teams" },
  { value: "webchat", label: "Web Chat" },
  { value: "directline", label: "Direct Line" },
  { value: "pva-studio", label: "Test Panel" },
  { value: "pva-autonomous", label: "Autonomous" },
  { value: "pva-published-engine-direct", label: "Published Engine" },
  { value: "pva-maker-evaluation", label: "Copilot Evaluation" },
  { value: "m365copilot", label: "M365 Copilot" },
  { value: "sharepoint", label: "SharePoint" },
  { value: "mobile", label: "Mobile" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "unknown", label: "Unknown" },
] as const;

export const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  msteams: "Teams",
  webchat: "Web Chat",
  directline: "Direct Line",
  "pva-studio": "Test Panel",
  "pva-autonomous": "Autonomous",
  "pva-published-engine-direct": "Published Engine",
  "pva-maker-evaluation": "Copilot Evaluation",
  m365copilot: "M365 Copilot",
  sharepoint: "SharePoint",
  mobile: "Mobile",
  whatsapp: "WhatsApp",
  unknown: "Unknown",
};

/** Sentinel option value representing an empty or unrecognized channel. */
export const UNKNOWN_CHANNEL_VALUE = "unknown";

/** Concrete, recognized channel values (excludes "all" and "unknown"). */
export const KNOWN_CHANNEL_VALUES: string[] = CHANNEL_OPTIONS.map(
  (option) => option.value
).filter((value) => value !== "all" && value !== UNKNOWN_CHANNEL_VALUE);

/** Resolve a channel id to its friendly label, falling back to the raw id. */
export function resolveChannelLabel(channelId: string | undefined): string {
  if (!channelId) return CHANNEL_DISPLAY_NAMES[UNKNOWN_CHANNEL_VALUE];
  return CHANNEL_DISPLAY_NAMES[channelId] ?? channelId;
}

/**
 * Test whether a transcript's channel id satisfies the selected channel filter.
 * Mirrors the Insights Hub OData semantics client-side:
 * - "all"      -> matches everything
 * - "unknown"  -> matches empty/undefined ids OR ids not in the known list
 * - otherwise  -> exact match on the raw channel id
 */
export function matchesChannel(
  channelId: string | undefined,
  selectedChannel: string
): boolean {
  if (!selectedChannel || selectedChannel === "all") return true;
  if (selectedChannel === UNKNOWN_CHANNEL_VALUE) {
    return !channelId || !KNOWN_CHANNEL_VALUES.includes(channelId);
  }
  return channelId === selectedChannel;
}
