/**
 * Agent Value Summary KPI drillthrough: URL (de)serialization, labels and the
 * rows listed on the Agent values screen for a selected KPI.
 *
 * Matching rules mirror the dashboard aggregations (blank values excluded,
 * environments grouped by id, local calendar months) so each list contains
 * exactly the records behind the KPI value that was selected.
 */
import type {
  AgentDetailsRecord,
  AgentValueListRow,
  AgentValueRecord,
  DrillthroughFilter,
} from '../contracts/types';

const VIEW_PARAM = 'view';
const AGENT_VALUES_VIEW = 'agents';
const FILTER_PARAM = 'valueFilter';
const VALUE_PARAM = 'value';
const ENV_PARAM = 'env';
const ENV_NAME_PARAM = 'envName';
const MONTH_PARAM = 'month';
const ALL_PARAMS = [FILTER_PARAM, VALUE_PARAM, ENV_PARAM, ENV_NAME_PARAM, MONTH_PARAM];

/** `cat_poweredbycode` value for agents built with the new (GitHub Copilot) designer. */
const POWERED_BY_GITHUB_COPILOT = 1;

/** True when the value is a non-empty, non-whitespace string. */
export const isNonBlank = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value.trim() !== '';

/** Grouping key for an Agent Value's environment: id when present, else display name. */
export function getAgentValueEnvironmentKey(record: AgentValueRecord): string {
  return isNonBlank(record.cat_environmentid)
    ? record.cat_environmentid.toLowerCase()
    : record.cat_environmentdisplayname ?? '';
}

/** Long month label used by the trend chart menu and the filter banner, e.g. "October 2026". */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * True when the URL opens the Agent values list (`/agent-value-summary?view=agents&…`).
 * The list is a view of the Agent Value Summary route, so no app-level route is needed.
 */
export function isAgentValuesView(params: URLSearchParams): boolean {
  return params.get(VIEW_PARAM) === AGENT_VALUES_VIEW;
}

/** Serialises a KPI selection into query-string parameters that open the Agent values list. */
export function toDrillthroughParams(filter: DrillthroughFilter): URLSearchParams {
  const params = new URLSearchParams({ [VIEW_PARAM]: AGENT_VALUES_VIEW, [FILTER_PARAM]: filter.kind });
  switch (filter.kind) {
    case 'value-benefit':
    case 'agent-type':
    case 'agent-behavior':
      params.set(VALUE_PARAM, filter.value);
      break;
    case 'environment-benefit':
      params.set(VALUE_PARAM, filter.valueBenefit);
      params.set(ENV_PARAM, filter.environmentKey);
      params.set(ENV_NAME_PARAM, filter.environmentDisplayName);
      break;
    case 'classification-month':
      params.set(MONTH_PARAM, `${filter.year}-${String(filter.month + 1).padStart(2, '0')}`);
      break;
  }
  return params;
}

/** Parses a KPI selection from query-string parameters; returns null when absent or invalid. */
export function parseDrillthroughParams(params: URLSearchParams): DrillthroughFilter | null {
  const kind = params.get(FILTER_PARAM);
  const value = params.get(VALUE_PARAM);
  switch (kind) {
    case 'all-agents':
    case 'classified':
    case 'unclassified':
      return { kind };
    case 'value-benefit':
    case 'agent-type':
    case 'agent-behavior':
      return isNonBlank(value) ? { kind, value } : null;
    case 'environment-benefit': {
      const environmentKey = params.get(ENV_PARAM);
      if (!isNonBlank(value) || !isNonBlank(environmentKey)) return null;
      return {
        kind,
        valueBenefit: value,
        environmentKey,
        environmentDisplayName: params.get(ENV_NAME_PARAM) || environmentKey,
      };
    }
    case 'classification-month': {
      const match = /^(\d{4})-(\d{2})$/.exec(params.get(MONTH_PARAM) ?? '');
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      if (month < 0 || month > 11) return null;
      return { kind, year, month, monthLabel: formatMonthLabel(year, month) };
    }
    default:
      return null;
  }
}

/** Removes the drillthrough filter parameters, keeping the list view and any other query-string state. */
export function clearDrillthroughParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  ALL_PARAMS.forEach((key) => next.delete(key));
  return next;
}

/** Banner label describing the selection, e.g. `Agents delivering "Time saved"`. */
export function describeDrillthrough(filter: DrillthroughFilter): string {
  switch (filter.kind) {
    case 'all-agents':
      return 'All agents in the agent inventory';
    case 'classified':
      return 'Agents with value classification';
    case 'unclassified':
      return 'Agents without value classification (untapped potential)';
    case 'value-benefit':
      return `Agents delivering "${filter.value}"`;
    case 'agent-type':
      return `${filter.value} agents`;
    case 'agent-behavior':
      return `Agents with "${filter.value}" behavior`;
    case 'environment-benefit':
      return `Agents delivering "${filter.valueBenefit}" in ${filter.environmentDisplayName}`;
    case 'classification-month':
      return `Agents classified in ${filter.monthLabel}`;
  }
}

/** True when the selection lists inventory agents (Agent Details) rather than Agent Value records. */
export function isInventoryDrillthrough(filter: DrillthroughFilter | null): boolean {
  return filter?.kind === 'all-agents' || filter?.kind === 'unclassified';
}

function matchesRecord(record: AgentValueRecord, filter: DrillthroughFilter): boolean {
  switch (filter.kind) {
    case 'value-benefit':
      return record.cat_agentvaluebenefit === filter.value;
    case 'agent-type':
      return record.cat_agenttypes === filter.value;
    case 'agent-behavior':
      return record.cat_agentbehaviors === filter.value;
    case 'environment-benefit':
      return (
        isNonBlank(record.cat_environmentdisplayname) &&
        getAgentValueEnvironmentKey(record) === filter.environmentKey &&
        record.cat_agentvaluebenefit === filter.valueBenefit
      );
    case 'classification-month': {
      if (!isNonBlank(record.cat_classificationdate)) return false;
      const date = new Date(record.cat_classificationdate);
      return (
        !isNaN(date.getTime()) &&
        date.getFullYear() === filter.year &&
        date.getMonth() === filter.month
      );
    }
    default:
      return true;
  }
}

const pairKey = (environmentId: string, agentId: string) =>
  `${environmentId.toLowerCase()}|${agentId.toLowerCase()}`;

/**
 * Finds the classification for an inventory agent: environment + agent id first
 * (an agent imported into several environments only matches the classified
 * copy), then agent id alone when no inventory agent shares the
 * classification's environment.
 */
export function createClassificationLookup(
  classifications: AgentValueRecord[],
  inventory: AgentDetailsRecord[],
): (agent: AgentDetailsRecord) => AgentValueRecord | undefined {
  const inventoryPairs = new Set(
    inventory.flatMap((a) =>
      isNonBlank(a.cat_agentid) && isNonBlank(a.cat_environmentid)
        ? [pairKey(a.cat_environmentid, a.cat_agentid)]
        : [],
    ),
  );
  const byPair = new Map<string, AgentValueRecord>();
  const byAgentId = new Map<string, AgentValueRecord>();
  for (const c of classifications) {
    if (!isNonBlank(c.cat_agentid)) continue;
    const key = isNonBlank(c.cat_environmentid) ? pairKey(c.cat_environmentid, c.cat_agentid) : null;
    if (key && inventoryPairs.has(key)) byPair.set(key, c);
    else byAgentId.set(c.cat_agentid.toLowerCase(), c);
  }
  return (agent) => {
    if (!isNonBlank(agent.cat_agentid)) return undefined;
    const byEnvironment = isNonBlank(agent.cat_environmentid)
      ? byPair.get(pairKey(agent.cat_environmentid, agent.cat_agentid))
      : undefined;
    return byEnvironment ?? byAgentId.get(agent.cat_agentid.toLowerCase());
  };
}

/** Inventory agents with no active Agent Value classification (Untapped potential). */
export function getUnclassifiedAgents(
  agentDetails: AgentDetailsRecord[],
  records: AgentValueRecord[],
): AgentDetailsRecord[] {
  const lookup = createClassificationLookup(records, agentDetails);
  return agentDetails.filter((d) => !lookup(d));
}

function inventoryAgentKey(environmentId?: string, agentId?: string): string | null {
  return isNonBlank(environmentId) && isNonBlank(agentId) ? pairKey(environmentId, agentId) : null;
}

/**
 * Builds the rows shown for a KPI selection (or every active Agent Value
 * record when `filter` is null). Agent Details supplies the designer type
 * used to build the correct Copilot Studio link.
 */
export function buildAgentValueListRows(
  filter: DrillthroughFilter | null,
  records: AgentValueRecord[],
  agentDetails: AgentDetailsRecord[],
): AgentValueListRow[] {
  const generativeAgents = new Set(
    agentDetails
      .filter((d) => d.cat_poweredbycode === POWERED_BY_GITHUB_COPILOT)
      .flatMap((d) => {
        const key = inventoryAgentKey(d.cat_environmentid, d.cat_agentid);
        return key ? [key] : [];
      }),
  );
  const isGenerative = (environmentId?: string, agentId?: string) => {
    const key = inventoryAgentKey(environmentId, agentId);
    return key !== null && generativeAgents.has(key);
  };

  const fromRecord = (r: AgentValueRecord): AgentValueListRow => ({
    id: r.cat_agentvalueid,
    name: r.cat_name ?? '',
    agentId: r.cat_agentid,
    environmentId: r.cat_environmentid,
    environmentName: r.cat_environmentdisplayname ?? '',
    agentType: r.cat_agenttypes ?? '',
    agentBehavior: r.cat_agentbehaviors ?? '',
    valueBenefit: r.cat_agentvaluebenefit ?? '',
    classificationDate: r.cat_classificationdate ?? '',
    isGenerativeDesigner: isGenerative(r.cat_environmentid, r.cat_agentid),
    valueRecord: r,
  });

  if (filter && isInventoryDrillthrough(filter)) {
    const lookup = createClassificationLookup(records, agentDetails);
    const source = filter.kind === 'unclassified' ? agentDetails.filter((d) => !lookup(d)) : agentDetails;
    return source.map((d) => {
      const classification = lookup(d);
      return {
        ...(classification ? fromRecord(classification) : {
          agentType: '',
          agentBehavior: '',
          valueBenefit: '',
          classificationDate: '',
        }),
        id: d.cat_agentdetailsid,
        name: d.cat_name || classification?.cat_name || '',
        agentId: d.cat_agentid,
        environmentId: d.cat_environmentid,
        environmentName: d.cat_environmentname ?? classification?.cat_environmentdisplayname ?? '',
        isGenerativeDesigner: d.cat_poweredbycode === POWERED_BY_GITHUB_COPILOT,
      };
    });
  }

  return (filter ? records.filter((r) => matchesRecord(r, filter)) : records).map(fromRecord);
}
