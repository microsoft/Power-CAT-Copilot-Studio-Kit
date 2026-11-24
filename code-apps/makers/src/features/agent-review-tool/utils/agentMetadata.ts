/**
 * agentMetadata
 *
 * The two `bots` columns that need interpreting before Stage A can use them: the manifest blob that
 * carries the agent's description, and the settings spread across `language`, `authenticationmode`
 * and the configuration JSON.
 *
 * Pure, and separate from `BotService` on purpose. A second host reads the same columns through its
 * own transport, and these values feed rules — the description clarity checks and the AI-settings
 * checks — so a host that parsed them slightly differently would score the same agent differently.
 */
import type { AgentSettings } from '../contracts/ServiceContracts';

/** Language code → human-readable name (subset of Copilot Studio supported languages) */
const LANGUAGE_NAMES: Record<number, string> = {
  1033: 'English', 1034: 'Spanish', 1046: 'Portuguese (Brazil)', 1036: 'French',
  1043: 'Dutch', 1044: 'Norwegian', 1030: 'Danish', 1053: 'Swedish', 1040: 'Italian',
  1031: 'German', 2052: 'Chinese (Simplified)', 1028: 'Chinese (Traditional)',
  1025: 'Arabic', 1041: 'Japanese', 1042: 'Korean', 1081: 'Hindi', 1057: 'Indonesian',
  1049: 'Russian', 1045: 'Polish', 1055: 'Turkish', 1054: 'Thai', 1035: 'Finnish',
  1032: 'Greek', 1029: 'Czech', 2057: 'English (UK)', 3084: 'French (Canada)',
  21514: 'Spanish (US)', 3081: 'English (Australia)', 1037: 'Hebrew',
  2070: 'Portuguese (Portugal)',
};

/**
 * Authentication mode int → label. 0 means that the mode is not set. It is not the same as
 * 1 (No authentication), so it has its own label.
 */
const AUTH_MODE_LABELS: Record<number, string> = {
  0: 'Unspecified',
  1: 'No Authentication',
  2: 'Microsoft Entra ID',
  3: 'Microsoft Entra ID (Custom)',
  4: 'Generic OAuth2',
};

/**
 * Parse agent description from applicationmanifestinformation JSON.
 * The field contains a JSON string like: { "description": "...", ... }
 */
export function parseAgentDescription(applicationManifestInfo?: string | null): string | undefined {
  if (!applicationManifestInfo) return undefined;
  try {
    const manifest = JSON.parse(applicationManifestInfo) as Record<string, unknown>;
    const desc = manifest['description'] as string | undefined;
    return desc?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse agent settings from bot record fields and configuration JSON.
 */
export function parseAgentSettings(
  language?: number,
  authenticationmode?: number,
  configuration?: string | null,
): AgentSettings {
  const settings: AgentSettings = {};
  if (language !== undefined) settings.language = LANGUAGE_NAMES[language] ?? `Language ${language}`;
  if (authenticationmode !== undefined) settings.authenticationMode = AUTH_MODE_LABELS[authenticationmode] ?? 'Unknown';
  if (configuration) {
    try {
      const config = JSON.parse(configuration) as {
        aISettings?: { useModelKnowledge?: boolean; isSemanticSearchEnabled?: boolean; optInUseLatestModels?: boolean };
      };
      if (config.aISettings) {
        settings.useModelKnowledge = config.aISettings.useModelKnowledge;
        settings.isSemanticSearchEnabled = config.aISettings.isSemanticSearchEnabled;
        settings.optInUseLatestModels = config.aISettings.optInUseLatestModels;
      }
    } catch {
      // ignore malformed config
    }
  }
  return settings;
}
