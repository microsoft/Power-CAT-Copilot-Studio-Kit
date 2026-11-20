import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ConversationAgentOption, ConversationTranscriptSortColumn } from '../contracts/types';
import { STORAGE_KEYS } from '../contracts/constants';
import {
  defaultDateRange,
  periodLabel as getPeriodLabel,
  periodWindow,
  type ConversationDateRange,
  type ConversationPeriod,
} from '../components/conversations/conversationPeriods';
import type { ConversationGridSortState } from '../components/shared/conversation-grid/types';
import { findAgentIdsByName } from '../utils/conversationBrowserQuery';
import {
  useConversationAgents,
  useConversationEnvironments,
  useConversationTranscriptCount,
  useConversationTranscripts,
} from './useConversationBrowser';
import { useConversationAnalysisIndex } from './useConversationAnalysisIndex';
import { useConversationListView, type AnalysisStatusFilter } from './useConversationListView';
import type { ConversationAnalysisRunState } from './useConversationAnalysis';
import { usePersistentState } from './usePersistentState';
import { usePromptLabelMap } from './usePromptLabelMap';

const NO_AGENTS: ConversationAgentOption[] = [];

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();

/** Grid columns the transcript query can sort server-side; others are sorted on loaded rows. */
function toServerSort(sort: ConversationGridSortState): ConversationTranscriptSortColumn | undefined {
  if (sort.sortColumn === 'conversation') return 'conversationId';
  if (sort.sortColumn === 'startTime') return 'conversationStart';
  return undefined;
}

/** Filter, persistence, query and list state for the Conversations tab (CV-1…CV-13). */
export function useConversationsTabState(run: ConversationAnalysisRunState | null | undefined) {
  const environmentsQuery = useConversationEnvironments();
  const environments = useMemo(() => environmentsQuery.data ?? [], [environmentsQuery.data]);
  const [storedEnvironmentUrl, setEnvironmentUrl] = usePersistentState(STORAGE_KEYS.conversationsEnvironment, '');
  const [agentByEnvironment, setAgentByEnvironment] = usePersistentState<Record<string, string>>(
    STORAGE_KEYS.conversationsAgentByEnvironment,
    {},
  );
  const [period, setPeriod] = usePersistentState<ConversationPeriod>(STORAGE_KEYS.conversationsTimePeriod, 'last30');
  const [storedRange, setDateRange] = usePersistentState<ConversationDateRange | null>(
    STORAGE_KEYS.conversationsCustomRange,
    null,
  );
  const [defaultRange] = useState(defaultDateRange);
  const dateRange = storedRange ?? defaultRange;
  // Deep link from Agents "View conversations": ?env=<orgUrl>&agent=<botId> overrides the remembered selection once.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedEnv = searchParams.get('env');
  const linkedAgent = searchParams.get('agent');
  useEffect(() => {
    if (!linkedEnv || environments.length === 0) return;
    const match = environments.find((env) => normalizeUrl(env.organizationUrl) === normalizeUrl(linkedEnv));
    if (match) {
      setEnvironmentUrl(match.organizationUrl);
      if (linkedAgent) setAgentByEnvironment((prev) => ({ ...prev, [match.organizationUrl]: linkedAgent }));
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('env');
        next.delete('agent');
        return next;
      },
      { replace: true },
    );
  }, [linkedEnv, linkedAgent, environments, setEnvironmentUrl, setAgentByEnvironment, setSearchParams]);

  const environment = environments.find((env) => env.organizationUrl === storedEnvironmentUrl);
  const environmentUrl = environment?.organizationUrl;

  const agentsQuery = useConversationAgents(environmentUrl);
  const agents = agentsQuery.data ?? NO_AGENTS;
  const storedAgentId = (environmentUrl && agentByEnvironment[environmentUrl]) || '';
  // A remembered agent that no longer exists falls back to All agents.
  const agentId = agentsQuery.data && !agents.some((a) => a.id === storedAgentId) ? '' : storedAgentId;

  const [status, setStatus] = useState<AnalysisStatusFilter>('all');
  const [hideGreetingOnly, setHideGreetingOnly] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);
  const searchPending = searchInput.trim() !== searchTerm;
  const searchAgentIds = useMemo(
    () => (agentId ? [] : findAgentIdsByName(agents, searchTerm)),
    [agentId, agents, searchTerm],
  );

  const { since, until } = useMemo(() => periodWindow(period, dateRange), [period, dateRange]);
  const periodLabel = getPeriodLabel(period, dateRange);
  const [sort, setSort] = useState<ConversationGridSortState>({ sortColumn: 'startTime', sortDirection: 'descending' });
  const serverSortColumn = toServerSort(sort);

  const transcriptsQuery = useConversationTranscripts(
    environmentUrl,
    agentId || undefined,
    searchTerm,
    searchAgentIds,
    serverSortColumn ?? 'conversationStart',
    serverSortColumn ? sort.sortDirection : 'descending',
    since,
    until,
  );
  const countQuery = useConversationTranscriptCount(environmentUrl, agentId || undefined, searchTerm, searchAgentIds, since, until);
  const indexQuery = useConversationAnalysisIndex(environmentUrl);
  const { labels: promptLabels } = usePromptLabelMap();

  const filterScope = JSON.stringify([environmentUrl ?? '', agentId, searchTerm, since, until ?? '', status, hideGreetingOnly]);
  const list = useConversationListView({
    source: transcriptsQuery,
    index: indexQuery.data,
    promptLabels,
    run,
    environmentUrl,
    status,
    hideGreetingOnly,
    clientSort: serverSortColumn ? undefined : sort,
    scopeKey: `${filterScope}|${sort.sortColumn}|${sort.sortDirection}`,
  });

  const filtersActive = status !== 'all' || Boolean(searchTerm) || hideGreetingOnly;
  const clearFilters = () => {
    setStatus('all');
    setSearchInput('');
    setSearchTerm('');
    setHideGreetingOnly(false);
  };

  return {
    environmentsQuery,
    environments,
    environment,
    environmentUrl,
    setEnvironmentUrl,
    agentsQuery,
    agents,
    agentId,
    setAgentId: (id: string) => {
      if (environmentUrl) setAgentByEnvironment({ ...agentByEnvironment, [environmentUrl]: id });
    },
    period,
    setPeriod,
    dateRange,
    setDateRange,
    periodLabel,
    since,
    until,
    status,
    setStatus,
    hideGreetingOnly,
    setHideGreetingOnly,
    searchInput,
    setSearchInput,
    searchTerm,
    searchPending,
    sort,
    setSort,
    transcriptsQuery,
    countQuery,
    indexQuery,
    promptLabels,
    list,
    filterScope,
    filtersActive,
    clearFilters,
  };
}
