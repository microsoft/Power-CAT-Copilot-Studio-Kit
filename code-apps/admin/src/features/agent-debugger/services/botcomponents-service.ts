import { ensurePowerAppsInitialized } from "../utils/power-apps-init";

import type { IOperationResult } from "@microsoft/power-apps/data";
import { getDataverseClient, escapeODataStringLiteral } from "./dataverse-client";

type ListRecordsWithOrganizationParams = {
  organization: string;
  entityName: string;
  prefer?: string;
  accept?: string;
  $select?: string;
  $filter?: string;
  $top?: number;
};

type GetItemWithOrganizationParams = {
  prefer: string;
  accept: string;
  organization: string;
  entityName: string;
  recordId: string;
  x_ms_odata_metadata_full?: boolean;
  "MSCRM.IncludeMipSensitivityLabel"?: boolean;
  $select?: string;
  $expand?: string;
  partitionId?: string;
};

export type BotComponentEntity = {
  botcomponentid?: string;
  schemaname?: string;
  name?: string;
  description?: string;
  data?: string;
};

/**
 * Parsed data from the botcomponent's data field (YAML-based OBI format).
 */
export type BotComponentParsedData = {
  modelDisplayName?: string;
  modelDescription?: string;
  triggerQueries?: string[];
};

/**
 * Parse the OBI data field (YAML) to extract modelDisplayName, modelDescription, and triggerQueries.
 * Uses simple regex-based parsing to avoid adding a YAML library dependency.
 */
function parseObiData(data: string | undefined): BotComponentParsedData {
  if (!data) return {};

  // Normalize line endings to \n for consistent parsing
  const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const result: BotComponentParsedData = {};

  // Extract modelDisplayName
  const displayNameMatch = normalizedData.match(/^modelDisplayName:\s*(.+)$/m);
  if (displayNameMatch) {
    result.modelDisplayName = displayNameMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  // Extract modelDescription (may be quoted or unquoted)
  const descMatch = normalizedData.match(/^modelDescription:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) {
    // Handle multi-line or long descriptions enclosed in quotes
    let desc = descMatch[1];
    // If description starts with a quote and the match didn't capture the closing quote properly,
    // try a more comprehensive match
    const fullDescMatch = normalizedData.match(/modelDescription:\s*["']([^"']+)["']/s);
    if (fullDescMatch) {
      desc = fullDescMatch[1];
    }
    result.modelDescription = desc.trim();
  }

  // Extract triggerQueries (YAML array format)
  const triggerQueriesMatch = normalizedData.match(/triggerQueries:\s*\n((?:\s+-\s*.+\n?)+)/m);
  if (triggerQueriesMatch) {
    const lines = triggerQueriesMatch[1].split('\n');
    const queries: string[] = [];
    for (const line of lines) {
      const itemMatch = line.match(/^\s+-\s*(.+)$/);
      if (itemMatch) {
        queries.push(itemMatch[1].trim());
      }
    }
    if (queries.length > 0) {
      result.triggerQueries = queries;
    }
  }

  return result;
}

export type BotComponentListResponse = {
  value?: BotComponentEntity[];
};

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function buildSchemaNameFilter(schemaNames: string[]): string {
  // (schemaname eq 'a' or schemaname eq 'b' ...)
  const terms = schemaNames
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `schemaname eq '${escapeODataStringLiteral(s)}'`);
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" or ")})`;
}

/**
 * Extended component info including parsed OBI data fields.
 */
export type ComponentInfo = {
  name: string;
  botComponentId?: string;
  description?: string;
  modelDisplayName?: string;
  modelDescription?: string;
  triggerQueries?: string[];
  rawData?: string;
};

export async function lookupBotComponentNames(options: {
  organizationUrl: string;
  schemaNames: string[];
}): Promise<IOperationResult<Record<string, ComponentInfo>>> {
  await ensurePowerAppsInitialized();

  const unique = Array.from(new Set(options.schemaNames.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return { success: true, data: {} };
  }

  const client = getDataverseClient();
  const mapping: Record<string, ComponentInfo> = {};

  // Keep URL lengths sane; 10–20 per chunk tends to be safe.
  for (const group of chunk(unique, 15)) {
    const params: ListRecordsWithOrganizationParams = {
      organization: options.organizationUrl,
      entityName: "botcomponents",
      accept: "application/json",
      prefer: "odata.maxpagesize=500",
      $select: "botcomponentid,schemaname,name,description,data",
      $filter: buildSchemaNameFilter(group),
      $top: 500,
    };

    const result = await client.executeAsync<ListRecordsWithOrganizationParams, BotComponentListResponse>({
      connectorOperation: {
        tableName: "commondataserviceforapps",
        operationName: "ListRecordsWithOrganization",
        parameters: params,
      },
    });

    if (!result.success) return result as unknown as IOperationResult<Record<string, ComponentInfo>>;

    for (const entity of result.data?.value ?? []) {
      if (!entity.schemaname || !entity.name) continue;

      // Parse the OBI data field to extract additional metadata
      const parsed = parseObiData(entity.data);

      mapping[entity.schemaname] = {
        name: entity.name,
        botComponentId: entity.botcomponentid,
        description: entity.description,
        modelDisplayName: parsed.modelDisplayName,
        modelDescription: parsed.modelDescription,
        triggerQueries: parsed.triggerQueries,
        rawData: entity.data,
      };
    }
  }

  return { success: true, data: mapping };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeOrganizationUrl(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}

export async function lookupBotComponentNamesById(options: {
  organizationUrl: string;
  botComponentIds: string[];
}): Promise<IOperationResult<Record<string, ComponentInfo>>> {
  await ensurePowerAppsInitialized();

  const organizationUrl = normalizeOrganizationUrl(options.organizationUrl);

  const unique = Array.from(
    new Set(options.botComponentIds.map((id) => id.trim()).filter(Boolean))
  );
  if (unique.length === 0) return { success: true, data: {} };

  // Keep this bounded; we only need a few redirect targets.
  const ids = unique.slice(0, 25);
  const mapping: Record<string, ComponentInfo> = {};

  const client = getDataverseClient();

  for (const id of ids) {
    const params: GetItemWithOrganizationParams = {
      prefer: "",
      accept: "application/json",
      organization: organizationUrl,
      entityName: "botcomponents",
      recordId: id,
      x_ms_odata_metadata_full: false,
      "MSCRM.IncludeMipSensitivityLabel": false,
      $select: "name,description,data",
    };

    const result = await client.executeAsync<GetItemWithOrganizationParams, Record<string, unknown>>({
      connectorOperation: {
        tableName: "commondataserviceforapps",
        operationName: "GetItemWithOrganization",
        parameters: params,
      },
    });

    if (!result.success) return result as unknown as IOperationResult<Record<string, ComponentInfo>>;

    const name = result.data?.["name"];
    if (isNonEmptyString(name)) {
      const dataField = typeof result.data?.["data"] === "string" ? result.data.data : undefined;
      const parsed = parseObiData(dataField);

      mapping[id] = {
        name,
        description: typeof result.data?.["description"] === "string" ? result.data.description : undefined,
        modelDisplayName: parsed.modelDisplayName,
        modelDescription: parsed.modelDescription,
        triggerQueries: parsed.triggerQueries,
        rawData: dataField,
      };
    }
  }

  return { success: true, data: mapping };
}
