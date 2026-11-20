import type {
  ConversationAgentOption,
  ConversationTranscriptSortColumn,
  ConversationTranscriptSortDirection,
} from '../contracts/types';

const SORT_FIELD_BY_COLUMN: Record<ConversationTranscriptSortColumn, string> = {
  conversationId: 'name',
  conversationStart: 'conversationstarttime',
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrows a DataGrid sort identifier to the supported transcript columns. */
export function isConversationTranscriptSortColumn(
  value: unknown,
): value is ConversationTranscriptSortColumn {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SORT_FIELD_BY_COLUMN, value);
}

/** Normalizes Dataverse GUID literals before inserting them into connector queries. */
export function toGuid(value: string): string | undefined {
  const trimmed = value.trim();
  const unwrapped = trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1) : trimmed;
  return GUID_PATTERN.test(unwrapped) ? unwrapped : undefined;
}

// Keeps agent-name searches within connector URL limits.
const MAX_SEARCH_AGENT_IDS = 50;

/** Returns the IDs of agents whose names contain the search term, for agent-name search. */
export function findAgentIdsByName(
  agents: readonly ConversationAgentOption[],
  search: string,
): string[] {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return [];
  return agents
    .filter((agent) => agent.name.toLocaleLowerCase().includes(term))
    .map((agent) => toGuid(agent.id))
    .filter((id): id is string => Boolean(id))
    .slice(0, MAX_SEARCH_AGENT_IDS);
}

function buildSearchClause(search: string, searchAgentIds: readonly string[]): string | undefined {
  const term = search.trim();
  if (!term) return undefined;

  const safeTerm = term.replace(/'/g, "''");
  // Message text lives in the transcript content (slower than the name match, but required by CV-7).
  const clauses = [`contains(name,'${safeTerm}')`, `contains(content,'${safeTerm}')`];
  const guid = toGuid(term);
  if (guid) {
    clauses.push(`conversationtranscriptid eq ${guid}`);
  }
  for (const agentId of searchAgentIds) {
    clauses.push(`_bot_conversationtranscriptid_value eq ${agentId}`);
  }

  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' or ')})`;
}

/** Validates an ISO timestamp before it is embedded in a query. */
function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getAgentGuid(agentId: string): string {
  const agentGuid = toGuid(agentId);
  if (!agentGuid) throw new Error('The selected agent has an invalid ID.');
  return agentGuid;
}

/**
 * Builds the OData transcript filter: a conversation ID, message text or agent name search (including
 * exact transcript GUID matches), optionally narrowed to one agent and a start-time window (`since` inclusive, `until` exclusive).
 */
export function buildTranscriptFilter(
  search: string,
  agentId?: string,
  searchAgentIds: readonly string[] = [],
  since?: string,
  until?: string,
): string | undefined {
  const clauses: string[] = [];
  const sinceIso = toIsoDate(since);
  if (sinceIso) clauses.push(`conversationstarttime ge ${sinceIso}`);
  const untilIso = toIsoDate(until);
  if (untilIso) clauses.push(`conversationstarttime lt ${untilIso}`);
  const searchClause = buildSearchClause(search, searchAgentIds);
  if (searchClause) clauses.push(searchClause);
  if (agentId) clauses.push(`_bot_conversationtranscriptid_value eq ${getAgentGuid(agentId)}`);

  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Counts the transcripts matching the same filters as {@link buildTranscriptFilter}. */
export function buildTranscriptCountFetchXml(
  search: string,
  agentId?: string,
  searchAgentIds: readonly string[] = [],
  since?: string,
  until?: string,
): string {
  const conditions: string[] = [];
  const sinceIso = toIsoDate(since);
  if (sinceIso) {
    conditions.push(`<condition attribute="conversationstarttime" operator="ge" value="${sinceIso}" />`);
  }
  const untilIso = toIsoDate(until);
  if (untilIso) {
    conditions.push(`<condition attribute="conversationstarttime" operator="lt" value="${untilIso}" />`);
  }
  if (agentId) {
    conditions.push(
      `<condition attribute="bot_conversationtranscriptid" operator="eq" value="${getAgentGuid(agentId)}" />`,
    );
  }

  const term = search.trim();
  if (term) {
    // Brackets make LIKE wildcards in the search term literal.
    const likeTerm = term.replace(/[[%_]/g, (char) => `[${char}]`);
    const searchConditions = [
      `<condition attribute="name" operator="like" value="%${escapeXml(likeTerm)}%" />`,
      `<condition attribute="content" operator="like" value="%${escapeXml(likeTerm)}%" />`,
    ];
    const guid = toGuid(term);
    if (guid) {
      searchConditions.push(`<condition attribute="conversationtranscriptid" operator="eq" value="${guid}" />`);
    }
    if (searchAgentIds.length > 0) {
      searchConditions.push(
        `<condition attribute="bot_conversationtranscriptid" operator="in">${searchAgentIds
          .map((id) => `<value>${id}</value>`)
          .join('')}</condition>`,
      );
    }
    conditions.push(`<filter type="or">${searchConditions.join('')}</filter>`);
  }

  return [
    '<fetch version="1.0" mapping="logical" aggregate="true">',
    '<entity name="conversationtranscript">',
    '<attribute name="conversationtranscriptid" alias="total" aggregate="count" />',
    conditions.length > 0 ? `<filter type="and">${conditions.join('')}</filter>` : '',
    '</entity>',
    '</fetch>',
  ].join('');
}

/**
 * Lists each agent referenced by at least one transcript. The exists join returns every agent once
 * without scanning transcripts through an aggregate query, which Dataverse caps at 50,000 rows.
 */
export function buildTranscriptAgentsFetchXml(page: number, pageSize: number): string {
  return [
    `<fetch version="1.0" mapping="logical" count="${pageSize}" page="${page}">`,
    '<entity name="bot">',
    '<attribute name="botid" />',
    '<attribute name="name" />',
    '<attribute name="schemaname" />',
    '<order attribute="name" />',
    '<order attribute="botid" />',
    '<link-entity name="conversationtranscript" from="bot_conversationtranscriptid" to="botid" link-type="exists" />',
    '</entity>',
    '</fetch>',
  ].join('');
}

/** Sorts agents by name and adds the schema name when several agents share a display name. */
export function toConversationAgentOptions(
  agents: readonly { id: string; name: string; schemaName?: string }[],
): ConversationAgentOption[] {
  const nameCounts = new Map<string, number>();
  for (const agent of agents) {
    const key = agent.name.toLocaleLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  return agents
    .map((agent) => ({
      id: agent.id,
      name:
        (nameCounts.get(agent.name.toLocaleLowerCase()) ?? 0) > 1
          ? `${agent.name} (${agent.schemaName ?? agent.id})`
          : agent.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Adds a unique record-ID tie-breaker so Dataverse continuation pages stay stable. */
export function buildTranscriptOrderBy(
  sortColumn: ConversationTranscriptSortColumn,
  sortDirection: ConversationTranscriptSortDirection,
): string {
  const direction = sortDirection === 'ascending' ? 'asc' : 'desc';
  return `${SORT_FIELD_BY_COLUMN[sortColumn]} ${direction},conversationtranscriptid asc`;
}
