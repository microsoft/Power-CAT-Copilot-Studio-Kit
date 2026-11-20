/**
 * DataverseFileService - Wrapper for downloading file attachments from Dataverse.
 *
 * Uses the Power Apps SDK client with the commondataserviceforapps connector
 * to call GetEntityFileImageFieldContentWithOrganization.
 */

import type { IOperationResult } from "@microsoft/power-apps/data";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

const client = getClient(dataSourcesInfo);

interface FileDownloadParams {
  Range: string;
  organization: string;
  entityName: string;
  recordId: string;
  fileImageFieldName: string;
  size?: string;
}

function normalizeFileDataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) {
    return new TextDecoder("utf-8").decode(data);
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder("utf-8").decode(new Uint8Array(data));
  }
  return "";
}

/** Download a file attachment from a Dataverse record. */
export async function downloadFileContent(
  entityName: string,
  recordId: string,
  fieldName: string,
): Promise<IOperationResult<string>> {
  const params: FileDownloadParams = {
    Range: "bytes=0-",
    organization: "current",
    entityName,
    recordId,
    fileImageFieldName: fieldName,
  };

  const result = await client.executeAsync<FileDownloadParams, unknown>({
    connectorOperation: {
      tableName: "commondataserviceforapps",
      operationName: "GetEntityFileImageFieldContentWithOrganization",
      parameters: params,
    },
  });

  return {
    ...result,
    data: normalizeFileDataToString(result.data),
  } as IOperationResult<string>;
}
