import { useMemo, useState } from 'react';
import {
  Body1,
  Body1Strong,
  Caption1,
  Card,
  CardHeader,
  Dropdown,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  Option,
  Subtitle2,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowTrendingLines20Regular,
  Clock20Regular,
  DataHistogram20Regular,
  Filter20Regular,
  Info16Regular,
} from '@fluentui/react-icons';
import type { AgentInventoryRecord, AgentUsageRecord } from '../../contracts/types';
import { useAgentInventorySurfaceStyles } from '../../styles/surfaceStyles';
import { FluentDonutChart, FluentLineChart } from '../shared/charts';
import { deriveUsageInsights } from '../../utils/usageAnalytics';
import { getUsageDateRanges, type UsageRangeKey } from '../../utils/usageDateRanges';
import { useAgentUsageStyles } from './usage/AgentUsageTab.styles';
import { UsageMetric, UsageSignal } from './usage/UsagePresentation';
import { UsageRecordsGrid } from './usage/UsageRecordsGrid';

function formatNumber(value: number, maximumFractionDigits = 0) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

function formatPercent(value?: number) {
  return value === undefined ? 'Not available' : `${value.toFixed(1)}% of total credits`;
}

function formatDate(value?: Date) {
  return value?.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) ?? 'Not available';
}

function formatMonthName(value?: Date) {
  return value?.toLocaleDateString(undefined, { month: 'long' }) ?? '';
}

function formatAge(value: Date | undefined, asOf: Date) {
  if (!value) return '';
  const days = Math.max(0, Math.floor((asOf.getTime() - value.getTime()) / 86_400_000));
  return days === 0 ? 'Today' : `${days}d`;
}

/** Card header title with a hover/focus info tooltip, matching the metric-card info pattern. */
function HeaderWithInfo({ title, info }: { title: string; info: string }) {
  const styles = useAgentUsageStyles();
  return (
    <div className={styles.headerWithInfo}>
      <Subtitle2 as="h2">{title}</Subtitle2>
      <Tooltip content={info} relationship="description">
        <span className={styles.infoIcon} tabIndex={0} aria-label={`${title}: ${info}`}>
          <Info16Regular aria-hidden="true" />
        </span>
      </Tooltip>
    </div>
  );
}

export interface AgentUsageTabProps {
  agent: AgentInventoryRecord;
  records: AgentUsageRecord[];
}

/** Range-aware Agent Usage History dashboard for the selected Agent Details record. */
export function AgentUsageTab({ agent, records }: AgentUsageTabProps) {
  const styles = useAgentUsageStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const [asOf] = useState(() => new Date());
  const [rangeKey, setRangeKey] = useState<UsageRangeKey>('last-six-months');
  const ranges = useMemo(() => getUsageDateRanges(asOf), [asOf]);
  const range = ranges.find((item) => item.key === rangeKey) ?? ranges[ranges.length - 1];
  const insights = useMemo(() => deriveUsageInsights(records, range), [range, records]);
  const userDifference = insights.reportedUsersDifference;
  const partialMessages = [
    insights.invalidDateCount > 0
      ? `${insights.invalidDateCount.toLocaleString()} record${insights.invalidDateCount === 1 ? '' : 's'} with an invalid or missing usage date are shown in records and export but excluded from analytics.`
      : '',
    insights.correctedNegativeCount > 0
      ? `${insights.correctedNegativeCount.toLocaleString()} record${insights.correctedNegativeCount === 1 ? '' : 's'} with negative values are preserved in records and export but treated as zero in analytics.`
      : '',
  ].filter(Boolean);
  const contextAgentId = agent.agentId || 'Not available';
  const environmentName = agent.environmentName || 'Not available';
  const totalText = formatNumber(insights.totalCredits, 2);

  return (
    <div className={styles.root}>
      <Card className={mergeClasses(surfaceStyles.section, styles.contextCard)}>
        <div className={styles.contextRow}>
          <div className={styles.contextItem}>
            <Caption1 className={styles.contextLabel}>Environment:</Caption1>
            <Body1Strong className={styles.contextValue} title={environmentName}>{environmentName}</Body1Strong>
          </div>
          <div className={styles.contextItem}>
            <Caption1 className={styles.contextLabel}>Agent:</Caption1>
            <Body1Strong className={styles.contextValue} title={agent.name}>{agent.name}</Body1Strong>
          </div>
          <div className={styles.contextItem}>
            <Caption1 className={styles.contextLabel}>Agent ID:</Caption1>
            <Body1Strong className={styles.contextValue} title={contextAgentId}>{contextAgentId}</Body1Strong>
          </div>
          <div className={mergeClasses(styles.contextItem, styles.contextLast)}>
            <Caption1 className={styles.timeRangeLabel}>Time range:</Caption1>
            <Dropdown
              className={styles.dropdown}
              size="small"
              aria-label="Usage time range"
              value={range.label}
              selectedOptions={[range.key]}
              onOptionSelect={(_, data) => {
                if (data.optionValue) setRangeKey(data.optionValue as UsageRangeKey);
              }}
            >
              {ranges.map((item) => (
                <Option key={item.key} value={item.key}>{item.label}</Option>
              ))}
            </Dropdown>
          </div>
        </div>
      </Card>

      {partialMessages.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>{partialMessages.join(' ')}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.metrics}>
        <UsageMetric
          label="Total Copilot credits"
          value={totalText}
          support={`${formatNumber(insights.billedCredits, 2)} billed · ${formatNumber(insights.nonBilledCredits, 2)} non-billed`}
          accentColor="#637CEF"
        />
        <UsageMetric
          label="Average per active week"
          value={insights.averagePerActiveWeek === undefined
            ? '0'
            : formatNumber(insights.averagePerActiveWeek, 2)}
          support={`${insights.activeWeeks.toLocaleString()} active week${insights.activeWeeks === 1 ? '' : 's'}`}
          accentColor="#E3008C"
        />
        <UsageMetric
          label="Reported users across features"
          value={formatNumber(insights.reportedUsers)}
          support="Includes repeat users across features"
          detail={userDifference === undefined
            ? undefined
            : `${userDifference > 0 ? '+' : ''}${formatNumber(userDifference)} users`}
          detailIntent={userDifference !== undefined && userDifference < 0 ? 'negative' : 'positive'}
          accentColor="#13A10E"
        />
        <UsageMetric
          label="Primary usage feature"
          value={insights.primaryFeature?.label ?? 'Not available'}
          support={formatPercent(insights.primaryFeature?.percentage)}
          accentColor="#9373C0"
          valueTooltipOnOverflow
        />
      </div>

      <div className={styles.primaryRow}>
        <Card className={mergeClasses(surfaceStyles.section, styles.chartCard)}>
          <CardHeader
            className={styles.chartHeader}
            header={(
              <HeaderWithInfo
                title="Weekly credit trend"
                info="Weekly credits show consumption for each week; cumulative credits show the running total across the selected period."
              />
            )}
            description={<Body1>Weekly consumption and cumulative growth for the selected period</Body1>}
          />
          <div className={styles.chartBody}>
            {insights.trend.length > 0 ? (
              <FluentLineChart
                chartTitle="Weekly credit trend"
                minHeight={260}
                customDateTimeFormatter={(date) => date.toLocaleDateString(undefined, { month: 'short' })}
                series={[
                  {
                    legend: 'Weekly credits',
                    color: '#637CEF',
                    data: insights.trend.map((point) => ({
                      x: point.date,
                      y: point.weeklyCredits,
                      xAxisCalloutData: formatDate(point.date),
                      yAxisCalloutData: formatNumber(point.weeklyCredits, 2),
                    })),
                  },
                  {
                    legend: 'Cumulative credits',
                    color: '#9373C0',
                    useSecondaryYScale: true,
                    data: insights.trend.map((point) => ({
                      x: point.date,
                      y: point.cumulativeCredits,
                      xAxisCalloutData: formatDate(point.date),
                      yAxisCalloutData: formatNumber(point.cumulativeCredits, 2),
                    })),
                  },
                ]}
              />
            ) : (
              <Body1 className={styles.emptyChart} role="status">
                No weekly credit activity is available for this period.
              </Body1>
            )}
          </div>
        </Card>

        <Card className={mergeClasses(surfaceStyles.section, styles.standoutCard)}>
          <CardHeader
            className={styles.chartHeader}
            header={(
              <HeaderWithInfo
                title="What stands out"
                info="Highlights the most recent usage, latest feature used, primary channel, and peak activity month from available usage history."
              />
            )}
            description={<Body1>Key signals from available usage history</Body1>}
          />
          <div className={styles.standoutList}>
            <UsageSignal
              icon={<Clock20Regular />}
              label="Last usage"
              value={formatDate(insights.lastUsage)}
              support="Most recent usage record"
              detail={formatAge(insights.lastUsage, asOf)}
            />
            <UsageSignal
              icon={<DataHistogram20Regular />}
              label="Last feature used"
              value={insights.lastFeature ?? 'Not available'}
              support="Latest weekly record"
              detail={insights.lastFeatureCredits === undefined
                ? undefined
                : formatNumber(insights.lastFeatureCredits, 2)}
            />
            <UsageSignal
              icon={<Filter20Regular />}
              label="Primary channel"
              value={insights.primaryChannel?.label ?? 'Not available'}
              support="Share of total credits"
              detail={insights.primaryChannel?.percentage === undefined
                ? undefined
                : `${insights.primaryChannel.percentage.toFixed(1)}%`}
            />
            <UsageSignal
              icon={<ArrowTrendingLines20Regular />}
              label="Peak activity"
              value="Highest usage month"
              support="Within the selected reporting period"
              detail={formatMonthName(insights.peakMonth)}
              last
            />
          </div>
        </Card>
      </div>

      <div className={styles.distributions}>
        {([
          {
            title: 'Credits by feature',
            description: 'Contribution to copilot credit usage',
            info: 'Feature consumed credits for the selected period.',
            empty: 'No feature credit distribution is available for this period.',
            items: insights.featureDistribution,
          },
          {
            title: 'Credits by channel',
            description: 'Where this agent consumed copilot credits',
            info: 'Channel consumed credits for the selected period.',
            empty: 'No channel credit distribution is available for this period.',
            items: insights.channelDistribution,
          },
        ] as const).map((distribution) => (
          <Card key={distribution.title} className={mergeClasses(surfaceStyles.section, styles.chartCard)}>
            <CardHeader
              className={styles.chartHeader}
              header={(
                <HeaderWithInfo title={distribution.title} info={distribution.info} />
              )}
              description={<Body1>{distribution.description}</Body1>}
            />
            <div className={styles.donutBody}>
              {distribution.items.length > 0 ? (
                <FluentDonutChart
                  chartTitle={distribution.title}
                  centerValue={totalText}
                  items={distribution.items.map((item) => ({
                    legend: item.label,
                    data: item.credits,
                  }))}
                />
              ) : (
                <Body1 className={styles.emptyChart} role="status">{distribution.empty}</Body1>
              )}
            </div>
          </Card>
        ))}
      </div>

      <UsageRecordsGrid agent={agent} range={range} insights={insights} />
    </div>
  );
}
