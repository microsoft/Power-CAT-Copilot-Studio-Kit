import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { AgentService, type AgentLite } from './AgentService';
import { extractSkiptokenFromNextLink } from '../utils/dataversePagination';
import { toConnectorError } from '../utils/accessErrors';
import type {
  ConversationAgentOption,
  ConversationEnvironment,
  ConversationTranscriptPage,
  ConversationTranscriptRow,
  ConversationTranscriptSortColumn,
  ConversationTranscriptSortDirection,
} from '../contracts/types';
import {
  buildTranscriptAgentsFetchXml,
  buildTranscriptCountFetchXml,
  buildTranscriptFilter,
  buildTranscriptOrderBy,
  toConversationAgentOptions,
  toGuid,
} from '../utils/conversationBrowserQuery';
import { parseTranscriptContent } from '../utils/parseTranscriptContent';
import { summarizeTranscript } from '../utils/transcriptSummary';

/** Transcript row with the derived topic and greeting-only flag used by the conversation grid. */
export interface ConversationBrowserRow extends ConversationTranscriptRow {
  topic?: string;
  isGreetingOnly: boolean;
}

export interface ConversationBrowserPage extends ConversationTranscriptPage {
  rows: ConversationBrowserRow[];
}

// Each page also carries transcript content for duration and message counts, so pages stay small.
const DATAVERSE_PAGE_SIZE = 25;
const AGENT_PAGE_SIZE = 5000;
// FetchXML page-number paging stops at 50,000 rows.
const MAX_AGENT_PAGES = 10;
const MORE_RECORDS_ANNOTATION = '@Microsoft.Dynamics.CRM.morerecords';

const TRANSCRIPT_COLUMNS =
  'conversationtranscriptid,name,_bot_conversationtranscriptid_value,conversationstarttime,createdon,content';
// The legacy generated schema exposes bot_conversationtranscriptidname, but the Web API returns lookup names as annotations.
const TRANSCRIPT_NAME_ANNOTATION =
  '_bot_conversationtranscriptid_value@OData.Community.Display.V1.FormattedValue';

function getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Maps an agent details row to its Dataverse environment; rows without a valid HTTPS URL are skipped. */
function toConversationEnvironment(agent: AgentLite): ConversationEnvironment | undefined {
  const environmentUrl = agent.environmentUrl?.trim();
  if (!environmentUrl) return undefined;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(environmentUrl);
  } catch {
    return undefined;
  }
  if (parsedUrl.protocol !== 'https:') return undefined;

  return {
    name: agent.environmentName?.trim() || parsedUrl.host,
    organizationUrl: parsedUrl.origin,
  };
}

function mapTranscriptRow(value: unknown): ConversationBrowserRow {
  if (!isRecord(value)) {
    throw new Error('The Dataverse connector returned an invalid conversation transcript row.');
  }

  const id = getString(value, 'conversationtranscriptid');
  if (!id) {
    throw new Error('The Dataverse connector returned a transcript without its record ID.');
  }

  const content = getString(value, 'content');
  const parsed = content ? parseTranscriptContent(content) : undefined;
  const summary = summarizeTranscript(content);

  return {
    id,
    conversationId: getString(value, 'name') ?? id,
    agentId: getString(value, '_bot_conversationtranscriptid_value'),
    agentName:
      getString(value, TRANSCRIPT_NAME_ANNOTATION) ??
      getString(value, '_bot_conversationtranscriptid_value'),
    conversationStartTime: getString(value, 'conversationstarttime'),
    createdOn: getString(value, 'createdon'),
    durationSeconds: parsed?.durationSeconds,
    messageCount: parsed?.messageCount,
    topic: summary.topic,
    isGreetingOnly: summary.isGreetingOnly,
  };
}

function mapAgentRecord(value: unknown): { id: string; name: string; schemaName?: string } {
  if (!isRecord(value)) {
    throw new Error('The Dataverse connector returned an invalid agent row.');
  }

  const id = getString(value, 'botid');
  if (!id) {
    throw new Error('The Dataverse connector returned an agent without its ID.');
  }

  return {
    id,
    name: getString(value, 'name') ?? 'Unnamed agent',
    schemaName: getString(value, 'schemaname'),
  };
}

function getResponseRows(data: Record<string, unknown> | undefined, recordLabel: string): unknown[] {
  const rows = data?.value;
  if (!Array.isArray(rows)) {
    throw new Error(`The Dataverse connector returned an invalid ${recordLabel} response.`);
  }
  return rows;
}

export class ConversationBrowserService {
  /**
   * Lists the distinct environments of agents flagged with conversation transcripts
   * in `cat_agentdetails`, sorted by their display names.
   */
  static async listEnvironments(): Promise<ConversationEnvironment[]> {
    const agents = await AgentService.listWithTranscripts();

    const byUrl = new Map<string, ConversationEnvironment>();
    for (const agent of agents) {
      const environment = toConversationEnvironment(agent);
      if (!environment) continue;
      const key = environment.organizationUrl.toLowerCase();
      if (!byUrl.has(key)) byUrl.set(key, environment);
    }
    return [...byUrl.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lists every agent with at least one conversation transcript in the environment.
   * Resolved server-side so the agent filter does not depend on which grid pages are loaded.
   */
  static async listTranscriptAgents(environmentUrl: string): Promise<ConversationAgentOption[]> {
    const agents = new Map<string, { id: string; name: string; schemaName?: string }>();

    for (let page = 1; ; page++) {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        environmentUrl,
        'bots',
        'odata.include-annotations="Microsoft.Dynamics.CRM.morerecords"',
        'application/json',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        buildTranscriptAgentsFetchXml(page, AGENT_PAGE_SIZE),
      );
      if (!result.success) {
        throw toConnectorError(result.error, 'Unable to load agents with conversation transcripts.');
      }

      const rows = getResponseRows(result.data, 'agent');
      const knownAgentCount = agents.size;
      for (const row of rows) {
        const agent = mapAgentRecord(row);
        agents.set(agent.id.toLowerCase(), agent);
      }

      // Prefer Dataverse's more-records flag; a page without new agents means the page number was ignored.
      const moreRecords = result.data?.[MORE_RECORDS_ANNOTATION];
      const hasMorePages =
        moreRecords === true || (moreRecords !== false && rows.length >= AGENT_PAGE_SIZE);
      if (!hasMorePages || agents.size === knownAgentCount) break;
      if (page === MAX_AGENT_PAGES) {
        console.warn(
          '[ConversationBrowserService] Stopped agent paging at the FetchXML paging limit; the agent list may be incomplete.',
        );
        break;
      }
    }

    return toConversationAgentOptions([...agents.values()]);
  }

  /** Fetches one Dataverse page so the grid can render before requesting more records. */
  static async listTranscriptPage(options: {
    environmentUrl: string;
    agentId?: string;
    search: string;
    searchAgentIds?: readonly string[];
    sortColumn: ConversationTranscriptSortColumn;
    sortDirection: ConversationTranscriptSortDirection;
    since?: string;
    until?: string;
    skipToken?: string;
    usedSkipTokens: readonly string[];
  }): Promise<ConversationBrowserPage> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      options.environmentUrl,
      'conversationtranscripts',
      `odata.maxpagesize=${DATAVERSE_PAGE_SIZE},odata.include-annotations="OData.Community.Display.V1.FormattedValue"`,
      'application/json',
      undefined,
      undefined,
      TRANSCRIPT_COLUMNS,
      buildTranscriptFilter(options.search, options.agentId, options.searchAgentIds, options.since, options.until),
      buildTranscriptOrderBy(options.sortColumn, options.sortDirection),
      undefined,
      undefined,
      undefined,
      options.skipToken,
    );
    if (!result.success) {
      throw toConnectorError(result.error, 'Unable to load conversation transcripts.');
    }

    const rows = getResponseRows(result.data, 'conversation transcript').map(mapTranscriptRow);
    const nextLink = getString(result.data, '@odata.nextLink') ?? getString(result.data, 'nextLink');
    const nextPageToken = extractSkiptokenFromNextLink(nextLink);
    if (nextLink && !nextPageToken) {
      throw new Error('Transcript pagination returned a continuation link without a token.');
    }
    if (rows.length === 0 && nextPageToken) {
      throw new Error('Transcript pagination returned an empty page with more records available.');
    }
    if (nextPageToken && options.usedSkipTokens.includes(nextPageToken)) {
      throw new Error('Transcript pagination returned a repeated continuation token.');
    }

    return { rows, nextPageToken };
  }

  /**
   * Counts the transcripts matching the grid filters. Returns undefined when Dataverse cannot
   * aggregate the set (for example, above its 50,000-row aggregate limit).
   */
  static async countTranscripts(options: {
    environmentUrl: string;
    agentId?: string;
    search: string;
    searchAgentIds?: readonly string[];
    since?: string;
    until?: string;
  }): Promise<number | undefined> {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      options.environmentUrl,
      'conversationtranscripts',
      undefined,
      'application/json',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      buildTranscriptCountFetchXml(options.search, options.agentId, options.searchAgentIds, options.since, options.until),
    );
    if (!result.success) {
      console.warn('[ConversationBrowserService] Unable to count conversation transcripts.', result.error);
      return undefined;
    }

    const [row] = getResponseRows(result.data, 'conversation transcript count');
    const total = isRecord(row) ? Number(row.total) : Number.NaN;
    return Number.isFinite(total) ? total : undefined;
  }

  /** Loads the raw content of one transcript for the chat viewer. */
  static async getTranscriptContent(environmentUrl: string, transcriptId: string): Promise<string> {
    const id = toGuid(transcriptId);
    if (!id) throw new Error('The conversation has an invalid transcript ID.');

    const result = await MicrosoftDataverseService.GetItemWithOrganization(
      '',
      'application/json',
      environmentUrl,
      'conversationtranscripts',
      id,
      undefined,
      undefined,
      'conversationtranscriptid,content',
    );
    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Unable to load the conversation transcript.');
    }
    return getString(result.data, 'content') ?? '';
  }
}
