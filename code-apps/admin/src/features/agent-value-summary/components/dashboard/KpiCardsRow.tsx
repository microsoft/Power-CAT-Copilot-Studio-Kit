/**
 * KpiCardsRow — horizontal row of 5 KPI summary cards.
 *
 * Cards 1-2: compact number cards (agent counts) — label on top, big number below.
 * Cards 3-5: donut chart cards — donut (left) with percentage inside, text (right).
 *
 * DonutChart size=80, innerRadius = Math.round((80/2)*0.45) = 18 per Chart.md rules.
 * Uses plain <div> wrapper for donut containers — NOT CardPreview per Cards.md.
 * Tooltip wraps description text for full text on hover per Tooltip.md rules.
 */
import { memo } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  Tooltip,
  useId,
} from '@fluentui/react-components';
import type { DashboardKpis, DrillthroughFilter } from '../../contracts/types';
import { activateOnEnterOrSpace } from '../shared/activateOnKey';

interface KpiCardsRowProps {
  kpis: DashboardKpis;
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

const DONUT_SIZE = 56;
const SECONDARY_COLOR = '#d7dbdd';

/** Custom SVG donut — renders reliably at any size unlike react-charting DonutChart */
function SvgDonut({ size, percentage, color }: { size: number; percentage: number; color: string }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={SECONDARY_COLOR} strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.22} fontWeight="600" fill="#242424">{percentage}%</text>
    </svg>
  );
}

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'stretch',
    flexWrap: 'wrap',
  },
  numberCardWrapper: {
    flex: '0 0 auto',
    width: '140px',
    display: 'flex',
  },
  donutCardWrapper: {
    flex: '1 1 0',
    minWidth: '220px',
    display: 'flex',
    '& > *': { flex: '1', width: '100%' },
  },
  /* ---------- Number cards (compact) ---------- */
  numberCard: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    gap: '2px',
    width: '100%',
  },
  numberLabel: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  bigNumber: {
    fontFamily: tokens.fontFamilyNumeric,
    fontSize: tokens.fontSizeHero800,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightHero800,
    color: tokens.colorNeutralForeground1,
    textAlign: 'center',
  },
  /* ---------- Donut cards (horizontal layout) ---------- */
  donutCard: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  donutContainer: {
    flexShrink: 0,
    overflow: 'hidden',
    width: `${DONUT_SIZE}px`,
    height: `${DONUT_SIZE}px`,
  },
  donutTextBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    flex: '1',
    minWidth: 0,
    overflow: 'hidden',
  },
  donutTitle: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  donutDescription: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
});

interface DonutKpiCardProps {
  title: string;
  percentage: number;
  primaryColor: string;
  description: string;
  /** Drillthrough action; omitted when there is nothing to list. */
  onActivate?: () => void;
}

function DonutKpiCard({ title, percentage, primaryColor, description, onActivate }: DonutKpiCardProps) {
  const styles = useStyles();
  const descriptionId = useId('kpi-description');

  return (
    <Card
      className={styles.donutCard}
      appearance="filled"
      aria-label={onActivate ? `${title}: ${percentage}%. View agents` : `${title}: ${percentage}%`}
      aria-describedby={descriptionId}
      {...(onActivate && {
        role: 'button',
        onClick: onActivate,
        onKeyDown: activateOnEnterOrSpace(onActivate),
      })}
    >
      <div className={styles.donutContainer}>
        <SvgDonut size={DONUT_SIZE} percentage={percentage} color={primaryColor} />
      </div>
      <Tooltip content={description} relationship="description">
        <div className={styles.donutTextBlock}>
          <span className={styles.donutTitle}>{title}</span>
          <span className={styles.donutDescription} id={descriptionId}>{description}</span>
        </div>
      </Tooltip>
    </Card>
  );
}

/** Horizontal row of 5 KPI cards: 2 number cards + 3 donut chart cards. Each card drills through. */
export const KpiCardsRow = memo(function KpiCardsRow({ kpis, onDrillthrough }: KpiCardsRowProps) {
  const styles = useStyles();

  const showAllAgents = () => onDrillthrough({ kind: 'all-agents' });
  const showClassified = () => onDrillthrough({ kind: 'classified' });
  const showUnclassified = () => onDrillthrough({ kind: 'unclassified' });
  const showTopValue = kpis.topValueBenefit
    ? () => onDrillthrough({ kind: 'value-benefit', value: kpis.topValueBenefit })
    : undefined;

  return (
    <div className={styles.row}>
      {/* Card 1: Number of Agents */}
      <div className={styles.numberCardWrapper}>
        <Card
          className={styles.numberCard}
          appearance="filled"
          role="button"
          aria-label={`Number of Agents: ${kpis.allAgentsCount.toLocaleString()}. View agents`}
          onClick={showAllAgents}
          onKeyDown={activateOnEnterOrSpace(showAllAgents)}
        >
          <span className={styles.numberLabel}>Number of Agents</span>
          <span className={styles.bigNumber}>{kpis.allAgentsCount.toLocaleString()}</span>
        </Card>
      </div>

      {/* Card 2: Agents with Value Classification */}
      <div className={styles.numberCardWrapper}>
        <Card
          className={styles.numberCard}
          appearance="filled"
          role="button"
          aria-label={`Agents with value classification: ${kpis.classifiedAgentsCount.toLocaleString()}. View agents`}
          onClick={showClassified}
          onKeyDown={activateOnEnterOrSpace(showClassified)}
        >
          <span className={styles.numberLabel}>Agents with value classification</span>
          <span className={styles.bigNumber}>{kpis.classifiedAgentsCount.toLocaleString()}</span>
        </Card>
      </div>

      {/* Card 3: Value Classification donut */}
      <div className={styles.donutCardWrapper}>
        <DonutKpiCard
          title="Value classification"
          percentage={kpis.classifiedPercentage}
          primaryColor="#E3008C"
          description={`${kpis.classifiedPercentage}% of agents have classified value benefits.`}
          onActivate={showClassified}
        />
      </div>

      {/* Card 4: Untapped Potential donut */}
      <div className={styles.donutCardWrapper}>
        <DonutKpiCard
          title="Untapped potential"
          percentage={kpis.untappedPercentage}
          primaryColor="#3A96DD"
          description={`The number of agents without value benefit assigned: ${kpis.untappedCount} (${kpis.untappedPercentage}%).`}
          onActivate={showUnclassified}
        />
      </div>

      {/* Card 5: Top Value Delivered donut */}
      <div className={styles.donutCardWrapper}>
        <DonutKpiCard
          title="Top value delivered"
          percentage={kpis.topValueBenefitPercentage}
          primaryColor="#9373C0"
          description={`The most popular value benefit is ${kpis.topValueBenefit.toLowerCase()}.`}
          onActivate={showTopValue}
        />
      </div>
    </div>
  );
});

export default KpiCardsRow;
