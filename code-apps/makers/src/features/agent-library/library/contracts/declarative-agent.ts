/**
 * Declarative Agent Flow — TypeScript Contracts
 *
 * Types for the declarative agent edit-and-download flow.
 * Declarative agents are M365 Copilot agents packaged as ZIP files
 * containing a declarativeAgent*.json manifest.
 */

import type JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Manifest Types (parsed from declarativeAgent*.json)
// ---------------------------------------------------------------------------

export interface DeclarativeAgentManifest {
  version: string;
  id: string;
  name: string;
  description: string;
  instructions: string;
  actions: unknown[];
  conversation_starters: ConversationStarter[];
  capabilities: DeclarativeCapability[];
  behavior_overrides?: BehaviorOverrides;
  /** Allow additional unknown fields to be preserved during editing */
  [key: string]: unknown;
}

export interface ConversationStarter {
  title: string;
  text: string;
}

export interface DeclarativeCapability {
  name: string;
  items_by_url?: SharePointItem[];
}

export interface SharePointItem {
  url: string;
}

interface BehaviorOverrides {
  special_instructions?: {
    discourage_model_knowledge?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Dialog State
// ---------------------------------------------------------------------------

export type DeclarativeDialogStep = 'options' | 'loading' | 'edit' | 'download' | 'agent-builder' | 'vs-code';

export interface DeclarativeEditFormState {
  name: string;
  description: string;
  instructions: string;
  capabilities: Record<string, boolean>;
  /** Ordered list of SharePoint URLs (one per input row in the dynamic list) */
  sharePointUrls: string[];
  starters: ConversationStarter[];
  isDownloading: boolean;
  /** Custom agent icon as a PNG data URL. Null/undefined means use the template default. */
  iconDataUrl?: string | null;
}

/** SharePoint validation error message matching Figma 1949:28580 */
export const SP_VALIDATION_ERROR_MESSAGE =
  "Invalid SharePoint URL. Use the format: https://{tenant}.sharepoint.com/sites/{SiteName} or /teams/{SiteName}. Don't include query parameters (?id=, &viewid=) or sharing links (/:/, /x:/).";

// ---------------------------------------------------------------------------
// Service Types
// ---------------------------------------------------------------------------

export interface ParsedDeclarativeAgent {
  manifest: DeclarativeAgentManifest;
  manifestFilename: string;
  hasSharePoint: boolean;
}

export interface CreateDeclarativeAgentInput {
  zipInstance: JSZip;
  manifestFilename: string;
  editedManifest: DeclarativeAgentManifest;
  templateName: string;
  /** Custom agent icon PNG data URL. When set, replaces Color.png (192×192) and Outline.png (32×32) in the ZIP. */
  iconDataUrl?: string | null;
}

// ---------------------------------------------------------------------------
// SharePoint URL Validation (reused from AgentTemplateDialog)
// ---------------------------------------------------------------------------

/** Regex for valid SharePoint site URLs */
export const SP_URL_PATTERN =
  /^https:\/\/[a-zA-Z0-9-]+\.(sharepoint\.com|sharepoint-df\.com|sharepointonline\.com)\/[^?#]+$/i;

/** Validates a SharePoint URL: must match SP_URL_PATTERN and not end with .aspx */
export function validateSharePointUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return SP_URL_PATTERN.test(trimmed) && !/\.aspx(\b|$)/i.test(trimmed);
}
