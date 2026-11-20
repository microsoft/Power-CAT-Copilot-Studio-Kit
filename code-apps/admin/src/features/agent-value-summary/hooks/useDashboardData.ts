/**
 * useDashboardData — main hook that orchestrates data fetching and aggregation
 * for the Agent Value Summary dashboard.
 *
 * Combines useAgentValues + useAgentDetails, then computes all aggregations
 * via useMemo calling pure functions from aggregations.ts.
 */
import { useMemo } from 'react';
import { useAgentValues } from './useAgentValues';
import { useAgentDetails } from './useAgentDetails';
import {
  computeValueBenefitCounts,
  computeAgentTypeCounts,
  computeAgentBehaviorCounts,
  computeClassificationTrend,
  computeValueByEnvironment,
  computeDashboardKpis,
  computeUnclassifiedAgents,
} from '../services/aggregations';
import type {
  AgentValueRecord,
  AgentDetailsRecord,
  DashboardKpis,
  ValueBenefitCount,
  AgentTypeCount,
  AgentBehaviorCount,
  ClassificationTrendPoint,
  ValueByEnvironmentRow,
} from '../contracts/types';

interface DashboardData {
  /** Active Agent Value rows (drillthrough source). */
  records: AgentValueRecord[];
  /** Agent Details inventory rows (drillthrough source). */
  agentDetails: AgentDetailsRecord[];
  kpis: DashboardKpis;
  valueBenefitCounts: ValueBenefitCount[];
  agentTypeCounts: AgentTypeCount[];
  agentBehaviorCounts: AgentBehaviorCount[];
  classificationTrend: ClassificationTrendPoint[];
  valueByEnvironment: ValueByEnvironmentRow[];
  isLoading: boolean;
  error: Error | null;
}

const EMPTY_KPIS: DashboardKpis = {
  allAgentsCount: 0,
  classifiedAgentsCount: 0,
  classifiedPercentage: 0,
  untappedCount: 0,
  untappedPercentage: 0,
  topValueBenefit: '',
  topValueBenefitPercentage: 0,
  topAgentType: '',
  topAgentTypePercentage: 0,
  topAgentBehavior: '',
  topAgentBehaviorPercentage: 0,
  commonValueBenefit: { name: '', count: 0 },
  rareValueBenefit: { name: '', count: 0 },
};

const STABLE_EMPTY_RECORDS: AgentValueRecord[] = [];
const STABLE_EMPTY_DETAILS: AgentDetailsRecord[] = [];

/** Main hook that fetches and aggregates all dashboard data. */
export function useDashboardData(): DashboardData {
  const agentValuesQuery = useAgentValues();
  const agentDetailsQuery = useAgentDetails();

  const isLoading = agentValuesQuery.isPending || agentDetailsQuery.isPending;
  const error = agentValuesQuery.error ?? agentDetailsQuery.error ?? null;

  const records = useMemo(
    () => agentValuesQuery.data ?? STABLE_EMPTY_RECORDS,
    [agentValuesQuery.data],
  );
  const agentDetails = useMemo(
    () => agentDetailsQuery.data ?? STABLE_EMPTY_DETAILS,
    [agentDetailsQuery.data],
  );
  const allAgentsCount = agentDetails.length;

  const untappedCount = useMemo(
    () => computeUnclassifiedAgents(agentDetails, records).length,
    [agentDetails, records],
  );

  const valueBenefitCounts = useMemo(
    () => computeValueBenefitCounts(records),
    [records],
  );

  const agentTypeCounts = useMemo(
    () => computeAgentTypeCounts(records),
    [records],
  );

  const agentBehaviorCounts = useMemo(
    () => computeAgentBehaviorCounts(records),
    [records],
  );

  const classificationTrend = useMemo(
    () => computeClassificationTrend(records),
    [records],
  );

  const valueByEnvironment = useMemo(
    () => computeValueByEnvironment(records),
    [records],
  );

  const kpis = useMemo(() => {
    if (isLoading) return EMPTY_KPIS;
    return computeDashboardKpis(
      allAgentsCount,
      untappedCount,
      records,
      valueBenefitCounts,
      agentTypeCounts,
      agentBehaviorCounts,
    );
  }, [isLoading, allAgentsCount, untappedCount, records, valueBenefitCounts, agentTypeCounts, agentBehaviorCounts]);

  return {
    records,
    agentDetails,
    kpis,
    valueBenefitCounts,
    agentTypeCounts,
    agentBehaviorCounts,
    classificationTrend,
    valueByEnvironment,
    isLoading,
    error,
  };
}
