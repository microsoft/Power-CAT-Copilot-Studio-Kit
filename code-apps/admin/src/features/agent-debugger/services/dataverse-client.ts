import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

let cachedClient: ReturnType<typeof getClient> | undefined;

export function getDataverseClient(): ReturnType<typeof getClient> {
  cachedClient ??= getClient(dataSourcesInfo);
  return cachedClient;
}

export function escapeODataStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
