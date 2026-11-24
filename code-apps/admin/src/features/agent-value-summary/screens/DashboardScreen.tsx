/**
 * DashboardScreen — assembles all dashboard components in a vertical layout.
 *
 * Layout:
 *   Header row: Title1 "Agent Value Summary" + subtitle + FeedbackButton
 *   KpiCardsRow
 *   Horizontal row: ValueSpreadChart (left, flex 1) + ValueByEnvironmentGrid (right, flex 1)
 *   Horizontal row:
 *     Left column (flex 1): AgentTypesPanel + AgentBehaviorsPanel
 *     Right column (flex 1): ClassificationTrendChart + InsightCards
 *
 * Spacing: 24px between major sections, 16px between cards within a section.
 * Page background: tokens.colorNeutralBackground2
 */
import {
  makeStyles,
  tokens,
  Title1,
  Body1,
} from '@fluentui/react-components';
import { FeedbackButton } from '../components/shared/FeedbackButton';
import { KpiCardsRow } from '../components/dashboard/KpiCardsRow';
import { ValueSpreadChart } from '../components/dashboard/ValueSpreadChart';
import { ValueByEnvironmentGrid } from '../components/dashboard/ValueByEnvironmentGrid';
import { AgentTypesPanel } from '../components/dashboard/AgentTypesPanel';
import { AgentBehaviorsPanel } from '../components/dashboard/AgentBehaviorsPanel';
import { ClassificationTrendChart } from '../components/dashboard/ClassificationTrendChart';
import { InsightCards } from '../components/dashboard/InsightCards';
import type {
  DashboardKpis,
  DrillthroughFilter,
  ValueBenefitCount,
  AgentTypeCount,
  AgentBehaviorCount,
  ClassificationTrendPoint,
  ValueByEnvironmentRow,
} from '../contracts/types';

interface DashboardScreenProps {
  kpis: DashboardKpis;
  valueBenefitCounts: ValueBenefitCount[];
  agentTypeCounts: AgentTypeCount[];
  agentBehaviorCounts: AgentBehaviorCount[];
  classificationTrend: ClassificationTrendPoint[];
  valueByEnvironment: ValueByEnvironmentRow[];
  onLearnMoreTypes: () => void;
  onLearnMoreBehaviors: () => void;
  /** Opens the list of agents behind a chart/card. */
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '1366px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalNone,
    paddingLeft: tokens.spacingHorizontalXL,
  },
  titleDescriptionGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: '0',
  },
  description: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalXXXL,
  },
  contentRegion: {
    maxWidth: '1366px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM, // 12px within section
    marginTop: tokens.spacingVerticalL, // 16px between sections
  },
  twoColRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
  },
  colLeft: {
    flex: '1 1 0',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  colRight: {
    flex: '1 1 0',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
});

/** Full dashboard layout composing all dashboard sub-components. */
export function DashboardScreen({
  kpis,
  valueBenefitCounts,
  agentTypeCounts,
  agentBehaviorCounts,
  classificationTrend,
  valueByEnvironment,
  onLearnMoreTypes,
  onLearnMoreBehaviors,
  onDrillthrough,
}: DashboardScreenProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      {/* Header — matches Agent Debugger/Component Library pattern */}
      <header className={styles.header}>
        <div className={styles.titleDescriptionGroup}>
          <div className={styles.titleRow}>
            <Title1 as="h1" className={styles.title}>Agent Value Summary</Title1>
            <FeedbackButton />
          </div>
          <Body1 className={styles.description}>
            A detailed overview of the strategic impact Copilot Studio agents are delivering in your organization.
          </Body1>
        </div>
      </header>

      <div className={styles.contentRegion}>
        {/* KPI Cards Row */}
        <div className={styles.section}>
          <KpiCardsRow kpis={kpis} onDrillthrough={onDrillthrough} />
        </div>

        {/* Value spread + Environment grid */}
        <div className={styles.section}>
          <div className={styles.twoColRow}>
            <div className={styles.colLeft}>
              <ValueSpreadChart
                valueBenefitCounts={valueBenefitCounts}
                kpis={kpis}
                onDrillthrough={onDrillthrough}
              />
            </div>
            <div className={styles.colRight}>
              <ValueByEnvironmentGrid data={valueByEnvironment} onDrillthrough={onDrillthrough} />
            </div>
          </div>
        </div>

        {/* Agent types/behaviors + Trend + Insights */}
        <div className={styles.section}>
          <div className={styles.twoColRow}>
            <div className={styles.colLeft}>
              <AgentTypesPanel
                agentTypeCounts={agentTypeCounts}
                onDrillthrough={onDrillthrough}
              />
              <AgentBehaviorsPanel
                agentBehaviorCounts={agentBehaviorCounts}
                onDrillthrough={onDrillthrough}
              />
            </div>
            <div className={styles.colRight}>
              <ClassificationTrendChart
                classificationTrend={classificationTrend}
                onDrillthrough={onDrillthrough}
              />
              <InsightCards
                kpis={kpis}
                onLearnMoreBehavior={onLearnMoreBehaviors}
                onLearnMoreType={onLearnMoreTypes}
                onDrillthrough={onDrillthrough}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
