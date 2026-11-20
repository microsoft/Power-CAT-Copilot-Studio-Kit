import { BRAND_CHART_COLORS, TIME_PERIOD_OPTIONS } from '../../contracts/constants';
import { useFilterContext } from '../../context/FilterContext';
import { useConversationAnalyzerSummary } from '../../hooks/useConversationAnalyzerSummary';
import { KpiStrip, type KpiStripTile } from '../shared/KpiStrip';

/** Formats a net sentiment score with an explicit sign, e.g. "+0.26". */
function signed(score: number): string {
  return `${score > 0 ? '+' : ''}${score.toFixed(2)}`;
}

/** Overview KPI strip: one header-less card with four tiles (OV-2, OV-3). */
export function OverviewKpiStrip() {
  const { timePeriod } = useFilterContext();
  const { data, isLoading } = useConversationAnalyzerSummary();
  const periodLabel = TIME_PERIOD_OPTIONS.find((o) => o.value === timePeriod)?.label ?? 'Last 7 days';

  const total = data?.totalAgents ?? 0;
  const analyzed = data?.agentsAnalyzed ?? 0;
  const conversations = data?.conversationsAnalyzed ?? 0;
  const coveragePct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  const tiles: KpiStripTile[] = [
    {
      id: 'total-agents',
      label: 'Total agents',
      color: BRAND_CHART_COLORS.primary,
      value: total.toLocaleString(),
      description: 'From Agent Inventory',
    },
    {
      id: 'agents-analyzed',
      label: 'Agents analyzed',
      color: BRAND_CHART_COLORS.tint120,
      value: analyzed.toLocaleString(),
      valueSuffix: `/ ${total.toLocaleString()}`,
      description: `${coveragePct}% coverage`,
    },
    {
      id: 'conversations-analyzed',
      label: 'Conversations analyzed',
      color: BRAND_CHART_COLORS.shade70,
      value: conversations.toLocaleString(),
      description:
        data && data.sentiment.total > 0
          ? `${signed(data.sentiment.netScore)} avg sentiment · ${periodLabel}`
          : periodLabel,
    },
    {
      id: 'pii-exposure',
      label: 'PII exposure',
      color: BRAND_CHART_COLORS.shade40,
      value: (data?.piiConversations ?? 0).toLocaleString(),
      valueSuffix: 'conversations',
      description: `${data?.piiPct ?? 0}% of analyzed conversations`,
    },
  ];

  return <KpiStrip tiles={tiles} isLoading={isLoading} ariaLabel="Key metrics" />;
}
