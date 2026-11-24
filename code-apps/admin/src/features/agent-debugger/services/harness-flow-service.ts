import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { ProcessedTurn } from '../contracts/transcript';
import { FLOW_ID_PATTERN } from '../utils/flow-run-links';
import { hasHarnessToolSteps, resolveHarnessFlowSteps } from '../utils/harness-flow-steps';
import { ensurePowerAppsInitialized } from '../utils/power-apps-init';
import { normalizeOrganizationUrl, type ComponentInfo } from './botcomponents-service';

/** Hydrate only harness tools, scoped to their owning bot. Classic transcripts issue no query. */
export async function hydrateHarnessFlowSteps(
  organizationUrl: string,
  botId: string | undefined,
  turns: ProcessedTurn[],
): Promise<{ turns: ProcessedTurn[]; components: Record<string, ComponentInfo> }> {
  if (!hasHarnessToolSteps(turns)) return { turns, components: {} };
  const components = await loadHarnessToolComponents(organizationUrl, botId);
  return { turns: resolveHarnessFlowSteps(turns, components), components };
}

export async function loadHarnessToolComponents(
  organizationUrl: string,
  botId: string | undefined,
): Promise<Record<string, ComponentInfo>> {
  if (!botId || !FLOW_ID_PATTERN.test(botId)) {
    throw new Error('The owning agent could not be identified. Harness flow links are unavailable.');
  }
  await ensurePowerAppsInitialized();
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    normalizeOrganizationUrl(organizationUrl), 'botcomponents', 'odata.maxpagesize=500', 'application/json',
    undefined, undefined, 'schemaname,name,data',
    `_parentbotid_value eq ${botId} and componenttype eq 9 and contains(schemaname,'.tool.')`,
    undefined, undefined, undefined, 501,
  );
  if (!result.success) {
    throw new Error('Could not read harness tool definitions. Check access to the agent components and analyze again.', { cause: result.error });
  }
  const rows: unknown = result.data?.value;
  if (!Array.isArray(rows)) throw new Error('Harness tool definitions returned an invalid response.');
  if (rows.length > 500 || result.data?.['@odata.nextLink']) {
    throw new Error('The agent has too many tool definitions to resolve flow links safely.');
  }
  const components: Record<string, ComponentInfo> = {};
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Harness tool definitions returned an invalid record.');
    const value = row as Record<string, unknown>;
    if (typeof value.schemaname !== 'string' || !value.schemaname.includes('.tool.')) continue;
    if (typeof value.name !== 'string' || typeof value.data !== 'string') {
      throw new Error('A harness tool definition is incomplete. Flow links are unavailable.');
    }
    if (components[value.schemaname]) throw new Error('Duplicate harness tool definitions prevent safe flow matching.');
    components[value.schemaname] = { name: value.name, rawData: value.data };
  }
  return components;
}
