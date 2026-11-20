import { useQuery } from '@tanstack/react-query';
import { useFilterContext } from '../context/FilterContext';
import { queryKeys } from './queryKeys';
import { timePeriodToIsoRange } from '../utils/dateRange';
import {
  AI_MODEL_LABELS,
  AiCreditService,
  type AiModelLabel,
} from '../services/AiCreditService';

export type { AiModelLabel };

export interface AiConsumptionByModel {
  label: AiModelLabel;
  credits: number;
}

export interface WeeklyCredits {
  weekLabel: string;
  credits: number;
}

export interface AiConsumptionData {
  totalCredits: number;
  byModel: AiConsumptionByModel[];
  weeklyTrend: WeeklyCredits[];
}

/** Fetches AI credits consumed per model type within the active time period. */
export function useAiConsumption() {
  const { timePeriod, customStartDate, customEndDate } = useFilterContext();
  const { from, to } = timePeriodToIsoRange(timePeriod, customStartDate, customEndDate);
  const periodKey = `${from}/${to}`;

  return useQuery<AiConsumptionData>({
    queryKey: queryKeys.aiConsumption(periodKey),
    queryFn: async () => {
      const totals = await AiCreditService.getCreditTotalsByModel(from, to);
      const byModel: AiConsumptionByModel[] = AI_MODEL_LABELS.map((label) => ({
        label,
        credits: totals.get(label)?.credits ?? 0,
      }));
      const totalCredits = byModel.reduce((sum, m) => sum + m.credits, 0);
      return { totalCredits, byModel, weeklyTrend: [] };
    },
  });
}
