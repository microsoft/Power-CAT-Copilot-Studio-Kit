import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { classifyAgentDiscoveryError } from '../utils/agent-discovery-errors';
import { FLOW_ID_PATTERN, type FlowRunWindow } from '../utils/flow-run-links';
import { ensurePowerAppsInitialized } from '../utils/power-apps-init';
import { normalizeTimestampMs } from '../utils/transcript/timestamp';
import { normalizeOrganizationUrl } from './botcomponents-service';
import { escapeODataStringLiteral } from './dataverse-client';

export type FlowRunCandidate = {
  name: string;
  startTime: string;
  endTime?: string;
  status: string;
  durationMs?: number;
  conversationMatched: boolean;
};

type FlowRunQuery = FlowRunWindow & {
  organizationUrl: string;
  flowId: string;
  conversationId?: string;
};

const MAX_CANDIDATES = 50;

/** Read a bounded candidate set. Incomplete/error responses must never look like a unique match. */
export async function getFlowRunCandidates(options: FlowRunQuery): Promise<FlowRunCandidate[]> {
  const from = normalizeTimestampMs(options.from);
  const to = normalizeTimestampMs(options.to);
  if (!FLOW_ID_PATTERN.test(options.flowId) || from === undefined || to === undefined || to < from
    || !Number.isFinite(new Date(from).getTime()) || !Number.isFinite(new Date(to).getTime())) {
    throw new Error('The flow identity or execution window is invalid.');
  }
  await ensurePowerAppsInitialized();

  let result: Awaited<ReturnType<typeof MicrosoftDataverseService.ListRecordsWithOrganization>>;
  try {
    result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      normalizeOrganizationUrl(options.organizationUrl), 'flowruns', 'odata.maxpagesize=100', 'application/json',
      undefined, undefined,
      'name,workflowid,starttime,endtime,status,duration,conversationid',
      `workflowid eq '${escapeODataStringLiteral(options.flowId)}' and starttime ge ${new Date(from).toISOString()} and starttime le ${new Date(to).toISOString()}`,
      'starttime asc', undefined, undefined, MAX_CANDIDATES + 1,
    );
    if (!result.success) throw result.error ?? new Error('The Dataverse query failed.');
  } catch (error) {
    throw new Error(
      classifyAgentDiscoveryError(error) === 'access-denied'
        ? 'Access denied. Your account cannot read flow run history in this environment.'
        : 'Could not load flow run history. Try again.',
      { cause: error },
    );
  }

  const rows: unknown = result.data?.value;
  if (!Array.isArray(rows)) throw new Error('Flow run history returned an invalid response.');
  // $top can truncate without a nextLink. Do not infer uniqueness from a partial page.
  if (result.data?.['@odata.nextLink'] || rows.length > MAX_CANDIDATES) {
    throw new Error('Too many runs to identify a match in this execution window. Open the flow history in Power Automate.');
  }

  const candidates = new Map<string, FlowRunCandidate>();
  for (const value of rows) {
    if (!value || typeof value !== 'object') throw new Error('Flow run history returned an invalid record.');
    const row = value as Record<string, unknown>;
    const start = normalizeTimestampMs(row.starttime);
    if (typeof row.name !== 'string' || !row.name.trim() || typeof row.starttime !== 'string'
      || start === undefined || !Number.isFinite(new Date(start).getTime()) || typeof row.workflowid !== 'string'
      || row.workflowid.toLowerCase() !== options.flowId.toLowerCase()) {
      throw new Error('Flow run history returned an incomplete or inconsistent record.');
    }
    const conversationId = typeof row.conversationid === 'string' ? row.conversationid.trim() : '';
    const end = normalizeTimestampMs(row.endtime);
    if (row.endtime != null && (typeof row.endtime !== 'string' || end === undefined
      || !Number.isFinite(new Date(end).getTime()) || end < start)) {
      throw new Error('Flow run history returned an invalid completion time.');
    }
    if (start < from || start > to) continue;
    if (conversationId && options.conversationId && conversationId.toLowerCase() !== options.conversationId.toLowerCase()) continue;
    candidates.set(row.name, {
      name: row.name,
      startTime: row.starttime,
      endTime: typeof row.endtime === 'string' ? row.endtime : undefined,
      status: typeof row.status === 'string' && row.status ? row.status : 'Unknown',
      durationMs: typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration >= 0
        ? row.duration : undefined,
      conversationMatched: !!conversationId && !!options.conversationId,
    });
  }
  return [...candidates.values()];
}
