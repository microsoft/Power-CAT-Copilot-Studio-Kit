import { getContext } from '@microsoft/power-apps/app';
import yaml from 'js-yaml';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import {
  buildCopilotStudioUrl,
  getConfiguredCopilotStudioBaseUrl,
} from '../../../shared/services/copilotStudioUrl';
import { parseAgentConfiguration } from './model-parser';

export type EvaluationLinks = Readonly<Record<string, string>>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAssessmentEvaluationLinks(botId: string): Promise<EvaluationLinks> {
  if (!GUID.test(botId)) throw new Error('A valid Copilot Studio agent ID is required for evaluation links.');
  const bot = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current', 'bots', undefined, 'application/json', undefined, undefined,
    'configuration', `botid eq ${botId}`, undefined, undefined, undefined, 1,
  );
  if (!bot.success) throw new Error('Failed to load the agent type for evaluation links.');
  const bots = (bot.data as { value?: Array<{ configuration?: unknown }> } | undefined)?.value;
  if (!Array.isArray(bots) || bots.length !== 1 || typeof bots[0].configuration !== 'string'
    || !bots[0].configuration.trim()) {
    throw new Error('The agent configuration is unavailable for evaluation links.');
  }
  // Copilot Studio does not provide a reliable evaluation deep link for harness agents.
  if (parseAgentConfiguration(bots[0].configuration).isHarness) return {};

  const [response, context, baseUrl] = await Promise.all([
    MicrosoftDataverseService.ListRecordsWithOrganization(
      'current', 'botcomponents', 'odata.maxpagesize=5000', 'application/json',
      undefined, undefined,
      'botcomponentid,name,data,_parentbotid_value,componenttype',
      `_parentbotid_value eq ${botId} and componenttype eq 19`,
    ),
    getContext(),
    getConfiguredCopilotStudioBaseUrl(),
  ]);
  if (!response.success) throw new Error('Failed to load evaluation configurations from Dataverse.');
  const environmentId = context.app?.environmentId;
  if (!environmentId) throw new Error('The current environment ID is unavailable for evaluation links.');
  const data: unknown = response.data;
  if (!data || typeof data !== 'object' || !('value' in data) || !Array.isArray(data.value)) {
    throw new Error('Dataverse returned an invalid evaluation configuration list.');
  }
  // Never infer a unique name from a truncated page.
  if ('@odata.nextLink' in data && data['@odata.nextLink']) {
    throw new Error('The evaluation configuration list is incomplete; links cannot be resolved safely.');
  }
  const idsByName = new Map<string, Set<string>>();
  for (const row of data.value) {
    if (!row || typeof row !== 'object'
      || typeof row._parentbotid_value !== 'string'
      || row._parentbotid_value.toLowerCase() !== botId.toLowerCase()
      || row.componenttype !== 19) continue;
    let payload: unknown;
    try {
      payload = typeof row.data === 'string' ? yaml.load(row.data) : undefined;
    } catch {
      throw new Error(`Unable to read evaluation metadata for component ${String(row.botcomponentid)}.`);
    }
    // EvaluationData components also use type 19 but are not configurations.
    if (!payload || typeof payload !== 'object' || !('kind' in payload) || payload.kind !== 'EvaluationSet') continue;
    if (typeof row.botcomponentid !== 'string' || !GUID.test(row.botcomponentid)
      || typeof row.name !== 'string' || !row.name.trim()) {
      throw new Error('An evaluation configuration is missing a valid ID or name.');
    }
    const name = row.name.trim().toLowerCase();
    const ids = idsByName.get(name) ?? new Set<string>();
    ids.add(row.botcomponentid.toLowerCase());
    idsByName.set(name, ids);
  }
  return Object.fromEntries([...idsByName].flatMap(([name, ids]) => {
    const link = (id: string) => buildCopilotStudioUrl(baseUrl, [
      'environments', environmentId, 'bots', botId, 'evaluation', 'configsDetails', id,
    ]);
    // Set ids always resolve; a name only when it identifies exactly one set.
    const byId = [...ids].map((id) => [id, link(id)] as const);
    if (ids.size !== 1) return byId;
    const [id] = ids;
    return [...byId, [name, link(id)] as const];
  }));
}
