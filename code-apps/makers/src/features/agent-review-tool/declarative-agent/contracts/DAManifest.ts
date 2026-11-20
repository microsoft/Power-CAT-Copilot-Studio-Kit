/**
 * DAManifest TypeScript interfaces
 *
 * Represents the parsed Declarative Agent manifest extracted from a ZIP package
 * or Graph API definition field. Maps fields from both manifest.json and
 * declarativeAgent_*.json (filename resolved dynamically).
 */

export interface SharePointItem {
  site_id?: string;
  web_id?: string;
  list_id?: string;
  unique_id?: string;
}

export interface DACapability {
  /** Capability type name: "OneDriveAndSharePoint", "WebSearch", "GraphicArt", "CodeInterpreter", etc. */
  name: string;

  // SharePoint / OneDrive scoped items
  items_by_sharepoint_ids?: SharePointItem[];
  items_by_url?: { url: string }[];

  // WebSearch scoped sites
  urls?: string[];

  // Additional capability-specific properties
  [key: string]: unknown;
}

export interface DAAction {
  /** Action unique identifier */
  id: string;

  /** Path to plugin.json within ZIP */
  file: string;

  /** True when the plugin manifest is embedded in the action object. */
  inline?: boolean;
}

export interface DAConversationStarter {
  /** Optional display title shown in Copilot UI */
  title?: string;

  /** The prompt text sent to the agent when clicked */
  text: string;
}

/** Package-local custom-skill folders declared by both required manifests. */
export interface DACustomSkillRegistrations {
  appFolders: string[];
  agentFolders: string[];
}

export interface DAAppMetadata {
  /** App registration ID from manifest.json → id */
  appId: string;

  /** App version from manifest.json → version */
  appVersion: string;

  /** Manifest file version from manifest.json → manifestVersion */
  manifestVersion: string;

  /** Short display name from manifest.json → name.short */
  shortName: string;

  /** Full display name from manifest.json → name.full */
  fullName: string;

  /** Short description from manifest.json → description.short */
  shortDescription: string;

  /** Full description from manifest.json → description.full */
  fullDescription: string;

  /** Developer/publisher name from manifest.json → developer.name */
  developerName: string;

  /** Brand accent color hex from manifest.json → accentColor */
  accentColor: string;
}

export interface DAManifest extends DAAppMetadata {
  /** color.png extracted as base64 string (null when loaded from Graph API) */
  iconBase64: string | null;

  /**
   * Raw parsed plugin JSON files keyed by filename.
   * Used by Stage A checks: isConsequential flags, HTTPS URLs, MCP discovery flags.
   * Populated during ZIP parsing; empty object when loaded from Graph API.
   */
  pluginFiles: Record<string, unknown>;

  // Fields from declarativeAgent_*.json (filename resolved via manifest reference)

  /** DA schema version from the required declarativeAgent.version field. */
  schemaVersion: string;

  /** DA unique identifier from declarativeAgent.id */
  daId: string;

  /** DA display name from declarativeAgent.name */
  name: string;

  /** DA description from declarativeAgent.description */
  description: string;

  /** Agent system instructions from declarativeAgent.instructions */
  instructions: string;

  /** Enabled capabilities (knowledge sources + special capabilities) */
  capabilities: DACapability[];

  /** API plugin actions (optional, maximum 10 in schema v1.8). */
  actions: DAAction[];

  /** Conversation starter prompts (optional, maximum 12 in schema v1.8). */
  conversationStarters: DAConversationStarter[];

  /** Custom-skill folder registrations, when either manifest declares them. */
  customSkills?: DACustomSkillRegistrations;
}
