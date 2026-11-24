/**
 * InsightCards — Two side-by-side insight cards for agent behavior and agent type.
 *
 * Each card has: title (Subtitle2), SVG donut, dynamic description text
 * built from static help data (matching the .msapp PowerFx logic),
 * and a "Learn more" link.
 *
 * Uses a custom SVG donut (same approach as KpiCardsRow) instead of
 * react-charting DonutChart which doesn't render well at small sizes.
 */
import { memo } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  CardFooter,
  Subtitle2,
  Body1,
  Caption1,
  Link,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import type { DashboardKpis, DrillthroughFilter } from '../../contracts/types';
import { agentBehaviorHelpItems } from '../../data/agentBehaviorHelp';
import { agentTypeHelpItems } from '../../data/agentTypeHelp';

interface InsightCardsProps {
  kpis: DashboardKpis;
  onLearnMoreBehavior: () => void;
  onLearnMoreType: () => void;
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

const SMALL_DONUT_SIZE = 56;
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
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
  },
  cardWrapper: {
    flex: '1 1 0',
    minWidth: '200px',
    display: 'flex',
    '& > *': {
      flex: '1',
      width: '100%',
    },
  },
  card: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalS}`,
    flex: '1',
  },
  donutRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  donutContainer: {
    flexShrink: 0,
    overflow: 'hidden',
    width: '56px',
    height: '56px',
  },
  donutLink: {
    display: 'block',
    padding: 0,
    borderRadius: tokens.borderRadiusCircular,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorSubtleBackgroundHover,
    },
    ':active': {
      backgroundColor: tokens.colorSubtleBackgroundPressed,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  description: {
    color: tokens.colorNeutralForeground1,
    flex: '1',
  },
  detail: {
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalL,
  },
  footerLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontWeight: tokens.fontWeightSemibold,
  },
});

interface SingleInsightCardProps {
  title: string;
  percentage: number;
  primaryColor: string;
  description: string;
  detail: string;
  learnMoreLabel: string;
  onLearnMore: () => void;
  viewAgentsLabel: string;
  /** Omitted when there is no top category to list. */
  onViewAgents?: () => void;
}

function SingleInsightCard({
  title,
  percentage,
  primaryColor,
  description,
  detail,
  learnMoreLabel,
  onLearnMore,
  viewAgentsLabel,
  onViewAgents,
}: SingleInsightCardProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card} appearance="filled" aria-label={`${title}: ${percentage}%`}>
      <CardHeader header={<Subtitle2>{title}</Subtitle2>} />

      <div className={styles.cardBody}>
        <div className={styles.donutRow}>
          {onViewAgents ? (
            // The percentage drills through to the matching agents, like the KPI donuts above.
            <Tooltip content={viewAgentsLabel} relationship="description">
              <Link
                as="button"
                appearance="subtle"
                className={mergeClasses(styles.donutContainer, styles.donutLink)}
                onClick={onViewAgents}
                aria-label={`${title}: ${percentage}%. ${viewAgentsLabel}`}
              >
                <SvgDonut size={SMALL_DONUT_SIZE} percentage={percentage} color={primaryColor} />
              </Link>
            </Tooltip>
          ) : (
            <Tooltip content={`${title}: ${percentage}%`} relationship="description">
              <div className={styles.donutContainer} aria-label={`${title} ${percentage}%`}>
                <SvgDonut size={SMALL_DONUT_SIZE} percentage={percentage} color={primaryColor} />
              </div>
            </Tooltip>
          )}
          <Tooltip content={description} relationship="description">
            <Body1 className={styles.description}>{description}</Body1>
          </Tooltip>
        </div>
        <Caption1 className={styles.detail}>{detail}</Caption1>
      </div>

      <CardFooter className={styles.footer}>
        {/* Navigates to the help screen, so it is a Fluent Link (Button.md: buttons don't navigate). */}
        <Link as="button" onClick={onLearnMore} aria-label={learnMoreLabel} className={styles.footerLink}>
          Learn more
          <Open16Regular aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}

/**
 * Builds the dynamic description text for the behavior insight card,
 * matching the .msapp PowerFx: "The {agentNoun} agent {definition}."
 */
function getBehaviorDetail(topBehavior: string): string {
  const item = agentBehaviorHelpItems.find(
    (b) => b.name.toLowerCase() === topBehavior.toLowerCase(),
  );
  if (!item) return '';
  const def = item.definition.charAt(0).toLowerCase() + item.definition.slice(1);
  return `The ${item.agentNoun.toLowerCase()} ${def}${def.endsWith('.') ? '' : '.'}`;
}

/**
 * Builds the dynamic description text for the type insight card,
 * matching the .msapp PowerFx: "The {typeName} {definition}."
 */
function getTypeDetail(topType: string): string {
  const item = agentTypeHelpItems.find(
    (t) => t.name.toLowerCase() === topType.toLowerCase(),
  );
  if (!item) return '';
  const def = item.definition.charAt(0).toLowerCase() + item.definition.slice(1);
  return `The ${topType.toLowerCase()} ${def}${def.endsWith('.') ? '' : '.'}`;
}

/** Two side-by-side insight cards: agent behavior and agent type. */
export const InsightCards = memo(function InsightCards({ kpis, onLearnMoreBehavior, onLearnMoreType, onDrillthrough }: InsightCardsProps) {
  const styles = useStyles();

  const behaviorDescription = `The most common agent behavior is to '${kpis.topAgentBehavior.toLowerCase()}'.`;
  const behaviorDetail = getBehaviorDetail(kpis.topAgentBehavior);

  const typeDescription = `The most popular type of agent is ${kpis.topAgentType.toLowerCase()}.`;
  const typeDetail = getTypeDetail(kpis.topAgentType);

  return (
    <div className={styles.row}>
      <div className={styles.cardWrapper}>
        <SingleInsightCard
          title="Agent behavior"
          percentage={kpis.topAgentBehaviorPercentage}
          primaryColor="#AE8C01"
          description={behaviorDescription}
          detail={behaviorDetail}
          learnMoreLabel="Learn more about agent behaviors"
          onLearnMore={onLearnMoreBehavior}
          viewAgentsLabel={`View agents with ${kpis.topAgentBehavior} behavior`}
          onViewAgents={
            kpis.topAgentBehavior
              ? () => onDrillthrough({ kind: 'agent-behavior', value: kpis.topAgentBehavior })
              : undefined
          }
        />
      </div>

      <div className={styles.cardWrapper}>
        <SingleInsightCard
          title="Agent type"
          percentage={kpis.topAgentTypePercentage}
          primaryColor="#2BA0A3"
          description={typeDescription}
          detail={typeDetail}
          learnMoreLabel="Learn more about agent types"
          onLearnMore={onLearnMoreType}
          viewAgentsLabel={`View agents of type ${kpis.topAgentType}`}
          onViewAgents={
            kpis.topAgentType
              ? () => onDrillthrough({ kind: 'agent-type', value: kpis.topAgentType })
              : undefined
          }
        />
      </div>
    </div>
  );
});

export default InsightCards;
