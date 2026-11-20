import { MicrosoftDataverseService } from "../../generated/services/MicrosoftDataverseService";

const POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME = "cat_PowerAutomateEndpoint";
const COMMERCIAL_COPILOT_STUDIO_BASE_URL = "https://copilotstudio.microsoft.com";

type EnvironmentVariableDefinitionRow = Record<string, unknown> & {
  environmentvariabledefinitionid?: string;
  defaultvalue?: string | null;
};

type EnvironmentVariableValueRow = Record<string, unknown> & {
  value?: string | null;
};

let configuredCopilotStudioBaseUrlPromise: Promise<string> | undefined;

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function getStringValue(row: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unwrapRows<T>(data: unknown): T[] {
  const value = (data as { value?: T[] } | undefined)?.value;
  return Array.isArray(value) ? value : [];
}

async function listCurrentEnvironmentRows<T>(
  entityName: string,
  select: string,
  filter: string,
  orderBy?: string,
): Promise<T[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    entityName,
    undefined,
    undefined,
    undefined,
    undefined,
    select,
    filter,
    orderBy,
    undefined,
    undefined,
    1,
  );

  if (!result.success) return [];
  return unwrapRows<T>(result.data);
}

export async function getPowerAutomateEndpointValue(): Promise<string | undefined> {
  const definitionRows = await listCurrentEnvironmentRows<EnvironmentVariableDefinitionRow>(
    "environmentvariabledefinitions",
    "environmentvariabledefinitionid,defaultvalue,schemaname",
    `schemaname eq '${escapeODataString(POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME)}'`,
  );

  const definition = definitionRows[0];
  const definitionId = getStringValue(definition, "environmentvariabledefinitionid");
  const defaultValue = getStringValue(definition, "defaultvalue");
  if (!definitionId) return defaultValue;

  const currentRows = await listCurrentEnvironmentRows<EnvironmentVariableValueRow>(
    "environmentvariablevalues",
    "value,createdon",
    `_environmentvariabledefinitionid_value eq ${definitionId}`,
    "createdon desc",
  );

  return getStringValue(currentRows[0], "value") ?? defaultValue;
}

async function resolveConfiguredCopilotStudioBaseUrl(): Promise<string> {
  try {
    const endpointValue = await getPowerAutomateEndpointValue();
    return getCopilotStudioBaseUrlForEndpoint(endpointValue);
  } catch {
    return COMMERCIAL_COPILOT_STUDIO_BASE_URL;
  }
}

/** Returns the Copilot Studio base URL for a Power Automate endpoint/cloud value. */
export function getCopilotStudioBaseUrlForEndpoint(endpointValue?: string | null): string {
  const normalized = endpointValue?.replace(/[\s_-]/g, "").toLowerCase();

  switch (normalized) {
    case "gcc":
      return "https://gcc.powerva.microsoft.us";
    case "gcc(high)":
    case "gcchigh":
      return "https://high.powerva.microsoft.us";
    case "commercial":
    default:
      return COMMERCIAL_COPILOT_STUDIO_BASE_URL;
  }
}

/** Fetches the configured Copilot Studio base URL from Dataverse environment variables. */
export async function getConfiguredCopilotStudioBaseUrl(): Promise<string> {
  configuredCopilotStudioBaseUrlPromise ??= resolveConfiguredCopilotStudioBaseUrl();
  return configuredCopilotStudioBaseUrlPromise;
}

/** Builds the correct overview URL for classic and new-experience agents. */
export function buildCopilotStudioAgentOverviewUrl(
  baseUrl: string,
  environmentId: string,
  agentId: string,
  isNewExperience: boolean,
): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/environments/${encodeURIComponent(environmentId)}`;
  return isNewExperience
    ? `${base}/agents/${encodeURIComponent(agentId)}`
    : `${base}/bots/${encodeURIComponent(agentId)}/overview`;
}

/** Builds a Copilot Studio URL from a configured cloud host and path segments. */
export function buildCopilotStudioUrl(baseUrl: string, pathSegments: string[]): string {
  const path = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

/** Builds the direct Copilot Studio Evaluate URL for an agent. */
export function buildCopilotStudioAgentEvaluateUrl(
  baseUrl: string,
  environmentId: string,
  agentId: string,
): string {
  return buildCopilotStudioUrl(baseUrl, [
    "environments",
    environmentId,
    "agents",
    agentId,
    "evaluate",
  ]);
}