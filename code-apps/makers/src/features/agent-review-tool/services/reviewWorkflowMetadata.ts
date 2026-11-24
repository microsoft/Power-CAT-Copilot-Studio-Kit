import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { PowerAppsforMakersService } from '../../../generated/services/PowerAppsforMakersService';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRows(
  result: { success: boolean; data?: unknown; error?: { message?: string } },
  operation: string,
): Record<string, unknown>[] {
  if (result.success !== true) {
    throw new Error(`${operation}: ${result.error?.message ?? 'The request failed.'}`);
  }
  const rows = isRecord(result.data) ? result.data.value : undefined;
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    throw new Error(`${operation}: The response did not contain a valid row list.`);
  }
  return rows;
}

/** Resolves the app's Dataverse URL, never the selected agent's environment. */
export async function getReviewServiceOrganizationUrl(): Promise<string> {
  const context = await getContext();
  const environmentId = context.app.environmentId?.trim();
  if (!environmentId) {
    throw new Error('The Power Apps host did not return the app environment.');
  }
  const result = await PowerAppsforMakersService.Get_Environments('2022-11-01', 250);
  const environments = requireRows(result, 'Read the app environment');
  const matches = environments.filter(
    (environment) => typeof environment.name === 'string'
      && environment.name.toLowerCase() === environmentId.toLowerCase(),
  );
  if (matches.length !== 1) {
    throw new Error('The app environment could not be resolved from your available environments.');
  }
  const properties = matches[0].properties;
  const metadata = isRecord(properties) ? properties.linkedEnvironmentMetadata : undefined;
  const instanceUrl = isRecord(metadata) ? metadata.instanceUrl : undefined;
  if (typeof instanceUrl !== 'string' || !instanceUrl.trim()) {
    throw new Error('The app environment did not return a Dataverse URL.');
  }
  const url = new URL(instanceUrl);
  if (url.protocol !== 'https:' || url.username || url.password
    || url.search || url.hash || !/^\/?$/.test(url.pathname)) {
    throw new Error('The app environment returned an invalid Dataverse URL.');
  }
  return url.origin;
}

/** Reads metadata through the existing connector with an explicit app organization. */
export async function readReviewMetadataRows(
  organizationUrl: string,
  entitySet: string,
  select: string,
  filter: string,
  top = 2,
  orderBy?: string,
): Promise<Record<string, unknown>[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    organizationUrl,
    entitySet,
    undefined,
    undefined,
    undefined,
    undefined,
    select,
    filter,
    orderBy,
    undefined,
    undefined,
    top,
  );
  return requireRows(result, `Read ${entitySet}`);
}
