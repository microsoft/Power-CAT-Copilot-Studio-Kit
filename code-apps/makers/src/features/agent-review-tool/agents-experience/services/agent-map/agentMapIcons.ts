import { MicrosoftDataverseService } from '../../../../../generated/services/MicrosoftDataverseService';
import { BotsService } from '../../../../../generated/services/BotsService';
import { toAgentMapIconDataUrl } from './agentMapIconData';

/**
 * Per-agent icons for the map, keyed by lower-cased bot schema name.
 *
 * The root agent is keyed `root` because a saved review may not carry its
 * schema name, and the map still needs to show its icon.
 */
export type AgentMapIcons = Record<string, string>;

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Load the icons for the reviewed agent and every connected agent it names.
 *
 * Icons are decoration: a failure here must never block the map, so every path
 * resolves to an empty map rather than throwing. They are fetched in one query
 * rather than per node to keep this to a single round trip.
 *
 * @param rootAgentId - Bot id of the reviewed agent, when known.
 * @param connectedSchemaNames - `botSchemaName` of each connected agent.
 * @param orgUrl - Source environment, when the review targets another org.
 */
export async function loadAgentMapIcons(
  rootAgentId: string | undefined,
  connectedSchemaNames: readonly string[],
  orgUrl?: string | null,
): Promise<AgentMapIcons> {
  const schemaNames = [...new Set(
    connectedSchemaNames.map(name => name.trim()).filter(Boolean),
  )];
  if (!rootAgentId && schemaNames.length === 0) return {};

  const clauses: string[] = [];
  if (rootAgentId) clauses.push(`botid eq ${rootAgentId}`);
  schemaNames.forEach(name => {
    clauses.push(`schemaname eq '${escapeODataString(name)}'`);
  });

  try {
    const select = 'botid,schemaname,iconbase64';
    const filter = clauses.join(' or ');
    let rows: Array<Record<string, unknown>>;

    if (orgUrl) {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl, 'bots', undefined, undefined, undefined, undefined, select, filter,
      );
      if (!result.success || !result.data) return {};
      rows = ((result.data as { value?: Array<Record<string, unknown>> }).value) ?? [];
    } else {
      const result = await BotsService.getAll({
        select: ['botid', 'schemaname', 'iconbase64'] as never,
        filter,
      });
      if (!result.success || !result.data) return {};
      rows = result.data as unknown as Array<Record<string, unknown>>;
    }

    const icons: AgentMapIcons = {};
    for (const row of rows) {
      const icon = toAgentMapIconDataUrl(row['iconbase64']);
      if (!icon) continue;
      const schemaName = typeof row['schemaname'] === 'string' ? row['schemaname'] : '';
      if (schemaName) icons[schemaName.toLowerCase()] = icon;
      if (rootAgentId && String(row['botid']).toLowerCase() === rootAgentId.toLowerCase()) {
        icons.root = icon;
      }
    }
    return icons;
  } catch {
    // Decoration only — the map renders with category glyphs instead.
    return {};
  }
}
