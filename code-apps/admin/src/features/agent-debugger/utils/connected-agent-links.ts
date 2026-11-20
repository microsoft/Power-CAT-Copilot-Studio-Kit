import type { ConnectedAgentInfo } from '../contracts/connected-agent';

const DATAVERSE_RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function connectedAgentTranscriptUrls(
  agent: ConnectedAgentInfo,
  environmentUrl?: string,
): string[] {
  const baseUrl = environmentUrl?.replace(/\/+$/, '');
  if (!baseUrl) return [];

  try {
    if (!/\.crm\d*\.dynamics\.com$/i.test(new URL(baseUrl).hostname)) return [];
  } catch {
    return [];
  }

  return (agent.childTranscriptRecordIds ?? [])
    .filter((id) => DATAVERSE_RECORD_ID.test(id))
    .map(
      (id) =>
        `${baseUrl}/main.aspx?forceUCI=1&pagetype=entityrecord&etn=conversationtranscript&id=${id}`,
    );
}
