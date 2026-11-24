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
  requireSuccessfulRead = false,
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

  if (requireSuccessfulRead && (!result.success || !Array.isArray(result.data?.value))) {
    throw new Error("Could not read the Power Automate cloud configuration. Try again.", { cause: result.error });
  }
  if (!result.success) return [];
  return unwrapRows<T>(result.data);
}

/**
 * Reads the effective value of a Dataverse environment variable by schema name:
 * the current value when one is set, otherwise the definition default. Returns
 * undefined when the variable is missing or has no value.
 */
export async function getEnvironmentVariableValue(
  schemaName: string,
  requireSuccessfulRead = false,
): Promise<string | undefined> {
  const definitionRows = await listCurrentEnvironmentRows<EnvironmentVariableDefinitionRow>(
    "environmentvariabledefinitions",
    "environmentvariabledefinitionid,defaultvalue,schemaname",
    `schemaname eq '${escapeODataString(schemaName)}'`,
    undefined,
    requireSuccessfulRead,
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
    requireSuccessfulRead,
  );
  return getStringValue(currentRows[0], "value") ?? defaultValue;
}

export async function getPowerAutomateEndpointValue(): Promise<string | undefined> {
  return getEnvironmentVariableValue(POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME);
}

export function getPowerAutomateBaseUrlForEndpoint(endpointValue?: string | null): string {
  const normalized = endpointValue?.replace(/[\s_-]/g, "").toLowerCase();
  switch (normalized) {
    case undefined:
    case "":
    case "commercial":
      return "https://make.powerautomate.com";
    case "gcc":
      return "https://make.gov.powerautomate.us";
    case "gcc(high)":
    case "gcchigh":
      return "https://make.high.powerautomate.us";
    case "dod":
      return "https://make.powerautomate.appsplatform.us";
    default:
      throw new Error("The Power Automate cloud configuration is unsupported. Check cat_PowerAutomateEndpoint.");
  }
}

export async function getConfiguredPowerAutomateBaseUrl(): Promise<string> {
  try {
    const endpointValue = await getEnvironmentVariableValue(POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME, true);
    return getPowerAutomateBaseUrlForEndpoint(endpointValue);
  } catch (error) {
    console.warn("[AgentDebugger] Could not resolve the Power Automate cloud configuration; using Commercial.", error);
    return getPowerAutomateBaseUrlForEndpoint();
  }
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

/**
 * Builds an agent overview URL using the configured Copilot Studio cloud host.
 * New designer (generative) agents live under `/agents/{id}` (no `/overview`
 * suffix); classic agents under `/bots/{id}/overview`. A new designer agent is
 * identified by the bot's `configuration.recognizer.$kind === "CLICopilotRecognizer"`.
 */
export function buildCopilotStudioAgentOverviewUrl(
  baseUrl: string,
  environmentId: string,
  botId: string,
  isGenerativeDesigner?: boolean,
): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/environments/${encodeURIComponent(environmentId)}`;
  return isGenerativeDesigner
    ? `${base}/agents/${encodeURIComponent(botId)}`
    : `${base}/bots/${encodeURIComponent(botId)}/overview`;
}