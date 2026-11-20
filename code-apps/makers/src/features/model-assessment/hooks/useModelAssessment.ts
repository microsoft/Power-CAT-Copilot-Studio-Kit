/**
 * React Query hooks for Model Assessment.
 *
 * The four reads are independent Dataverse queries; they are fetched in
 * parallel and joined in memory (agent → runs → results → history) so the grid,
 * drawer and compare surfaces render from a single cached snapshot.
 */

import { useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEvaluationResults,
  getEvaluationRuns,
  getModelHistory,
  getTestCaseDetails,
  getTestSetGraders,
  getTrackedAgents,
} from '../services/model-assessment-service';
import {
  type EvaluationResultVM,
  type EvaluationRunVM,
  type ModelHistoryVM,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { withRunSummary } from '../contracts/comparison-utils';
import { withUniqueTestSetNames } from '../contracts/test-sets';
import { classificationGraderName } from '../contracts/test-set-graders';
import { getAgentIcons, getLiveAgentModel } from '../services/agent-discovery-service';
import { syncEligibleAgents } from '../services/agent-eligibility-service';

const GUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

const KEYS = {
  agents: ['mat', 'tracked-agents'] as const,
  history: ['mat', 'model-history'] as const,
  runs: ['mat', 'evaluation-runs'] as const,
  results: ['mat', 'evaluation-results'] as const,
  testCases: ['mat', 'test-case-details'] as const,
  graders: ['mat', 'test-set-graders'] as const,
  liveModels: ['mat', 'live-models'] as const,
  eligibility: ['mat', 'eligibility'] as const,
  icons: ['mat', 'agent-icons'] as const,
};

export interface AssessmentData {
  agents: TrackedAgentVM[];
  history: ModelHistoryVM[];
  runs: EvaluationRunVM[];
  results: EvaluationResultVM[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
}

// Reloads when the page opens or the app regains focus (at most every 30 seconds).
const AUTO_REFRESH = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: false,
} as const;


export function useAssessmentData(): AssessmentData {
  const queryClient = useQueryClient();
  const queries = useQueries({
    queries: [
      { queryKey: KEYS.agents, queryFn: getTrackedAgents, ...AUTO_REFRESH },
      { queryKey: KEYS.history, queryFn: getModelHistory, ...AUTO_REFRESH },
      { queryKey: KEYS.runs, queryFn: getEvaluationRuns, ...AUTO_REFRESH },
      { queryKey: KEYS.results, queryFn: getEvaluationResults, ...AUTO_REFRESH },
    ],
  });

  const [agentsQ, historyQ, runsQ, resultsQ] = queries;

  // Tracks every eligible agent automatically, then re-reads the tracked data.
  const eligibilityQ = useQuery({
    queryKey: KEYS.eligibility,
    queryFn: async () => {
      const sync = await syncEligibleAgents(agentsQ.data ?? []);
      if (sync.changed) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: KEYS.agents }),
          queryClient.invalidateQueries({ queryKey: KEYS.history }),
        ]);
      }
      return sync.engines;
    },
    enabled: agentsQ.isSuccess,
    ...AUTO_REFRESH,
  });

  const history = useMemo(() => historyQ.data ?? [], [historyQ.data]);
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const rawResults = useMemo(() => resultsQ.data ?? [], [resultsQ.data]);
  const resultRunIds = useMemo(
    () => new Set(rawResults.flatMap((result) => result.runId ? [result.runId.toLowerCase()] : [])),
    [rawResults],
  );
  // Every case is looked up: multi-turn cases need their full conversation, and
  // legacy results without a saved question need a current label.
  const caseIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawResults) {
      if (r.testCaseId) set.add(r.testCaseId.toLowerCase());
    }
    return Array.from(set).sort();
  }, [rawResults]);
  const needsLabels = useMemo(
    () => rawResults.some((r) => !r.question?.trim() && r.testCaseId),
    [rawResults],
  );

  const detailsQ = useQuery({
    queryKey: [...KEYS.testCases, caseIds],
    queryFn: () => getTestCaseDetails(caseIds),
    enabled: caseIds.length > 0,
    ...AUTO_REFRESH,
  });

  // Test sets with Business Classification results, to name each of their classification methods.
  const graderSetIds = useMemo(() => Array.from(new Set(rawResults.flatMap((r) =>
    r.testSetId && /^customlabels(?:#\d+)?$/i.test(r.metric?.trim() ?? '') ? [r.testSetId.toLowerCase()] : [],
  ))).sort(), [rawResults]);
  const gradersQ = useQuery({
    queryKey: [...KEYS.graders, graderSetIds],
    queryFn: () => getTestSetGraders(graderSetIds),
    enabled: graderSetIds.length > 0,
    ...AUTO_REFRESH,
  });

  // Each agent's live Copilot Studio model (read-only).
  const botIds = useMemo(
    () => Array.from(new Set((agentsQ.data ?? []).flatMap((a) =>
      a.copilotAgentId && GUID.test(a.copilotAgentId) ? [a.copilotAgentId.toLowerCase()] : []))).sort(),
    [agentsQ.data],
  );
  const liveModelsQ = useQuery({
    queryKey: [...KEYS.liveModels, botIds],
    queryFn: () => getLiveModels(botIds),
    enabled: botIds.length > 0,
    ...AUTO_REFRESH,
  });

  // Icons rarely change; a failed read just leaves the default icon.
  const iconsQ = useQuery({ queryKey: KEYS.icons, queryFn: getAgentIcons, staleTime: 10 * 60_000 });

  const agents = useMemo(() => {
    const live = liveModelsQ.data;
    const icons = iconsQ.data;
    const engines = eligibilityQ.data;
    if (!engines) return [];
    // Only agents with a MODELCHECK evaluation or Kit configuration are shown.
    return (agentsQ.data ?? []).flatMap((agent) => {
      const botId = agent.copilotAgentId?.toLowerCase();
      const agentEngines = botId ? engines[botId] : undefined;
      if (!botId || !agentEngines) return [];
      const summarized = { ...withRunSummary(agent, runs, resultRunIds, history), engines: agentEngines };
      const liveModel = live?.[botId];
      const iconUrl = icons?.[botId];
      return [{ ...summarized, ...(liveModel ? { liveModel } : {}), ...(iconUrl ? { iconUrl } : {}) }];
    });
  }, [agentsQ.data, runs, resultRunIds, history, liveModelsQ.data, eligibilityQ.data, iconsQ.data]);

  const results = useMemo(() => {
    const map = detailsQ.data;
    const graders = gradersQ.data;
    const agentByRun = new Map(runs.map((run) => [run.id.toLowerCase(), run.agentId]));
    const named = graders
      ? rawResults.map((r) => {
        const grader = classificationGraderName(r.metric, r.reason, r.testSetId ? graders[r.testSetId.toLowerCase()] : undefined);
        return grader ? { ...r, grader } : r;
      })
      : rawResults;
    if (!map) return withUniqueTestSetNames(named, agentByRun);
    return withUniqueTestSetNames(named.map((r) => {
      const details = r.testCaseId ? map[r.testCaseId.toLowerCase()] : undefined;
      if (!details) return r;
      const saved = r.question?.trim();
      const [first] = details.questions;
      // The saved snapshot stays authoritative: the current conversation is only
      // used while it still starts with the saved question.
      const sameCase = !saved || !first || sameText(saved, first);
      const question = saved || first || details.name;
      const questions = sameCase && details.questions.length > 1 ? details.questions : undefined;
      const multiTurn = details.multiTurn || undefined;
      if (question === r.question && !questions && !multiTurn) return r;
      return { ...r, question, ...(questions ? { questions } : {}), ...(multiTurn ? { multiTurn } : {}) };
    }), agentByRun);
  }, [rawResults, detailsQ.data, gradersQ.data, runs]);

  return {
    agents,
    history,
    runs,
    results,
    isLoading: queries.some((q) => q.isLoading) || eligibilityQ.isLoading,
    isError: queries.some((q) => q.isError) || eligibilityQ.isError || (needsLabels && detailsQ.isError),
    isFetching: queries.some((q) => q.isFetching) || detailsQ.isFetching || gradersQ.isFetching || liveModelsQ.isFetching || eligibilityQ.isFetching,
    refetch: () => {
      queries.forEach((q) => void q.refetch());
      void eligibilityQ.refetch();
      if (caseIds.length > 0) void detailsQ.refetch();
      if (graderSetIds.length > 0) void gradersQ.refetch();
      if (botIds.length > 0) void liveModelsQ.refetch();
    },
  };
}

const sameText = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** Live Copilot Studio model per bot id; agents whose model cannot be read are omitted. */
async function getLiveModels(botIds: string[]): Promise<Record<string, string>> {
  const settled = await Promise.allSettled(botIds.map((id) => getLiveAgentModel(id)));
  const map: Record<string, string> = {};
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) map[botIds[index]] = result.value;
  });
  return map;
}

export interface AgentDetail {
  latestRun?: EvaluationRunVM;
  runs: EvaluationRunVM[];
  history: ModelHistoryVM[];
  resultsFor: (runId: string | undefined) => EvaluationResultVM[];
}

/** Slice the shared snapshot down to a single agent for the drawer. */
export function useAgentDetail(
  data: AssessmentData,
  agentId: string | undefined,
): AgentDetail {
  return useMemo(() => {
    const runs = agentId
      ? data.runs.filter((r) => r.agentId === agentId)
      : [];
    const history = agentId
      ? data.history.filter((h) => h.agentId === agentId)
      : [];
    const resultsFor = (runId: string | undefined): EvaluationResultVM[] =>
      runId ? data.results.filter((r) => r.runId === runId) : [];
    return { latestRun: runs[0], runs, history, resultsFor };
  }, [data.runs, data.history, data.results, agentId]);
}
