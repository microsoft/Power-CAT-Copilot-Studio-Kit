/**
 * AgentBehaviorsPanel — Card showing agent behavior distribution with indicator items.
 *
 * The .msapp uses 6 HARDCODED behavior names (Sense, Decide, Act, Collaborate, Reflect, Respond)
 * and looks up counts from colAgentBenefit. If no match, shows 0.
 * Each behavior has a distinct left border color from the original design.
 */
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Body1,
} from '@fluentui/react-components';
import { IndicatorItem } from '../shared/IndicatorItem';
import type { AgentBehaviorCount, DrillthroughFilter } from '../../contracts/types';

interface AgentBehaviorsPanelProps {
  agentBehaviorCounts: AgentBehaviorCount[];
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

/** Fixed set of 6 behaviors matching the .msapp hardcoded indicators, in display order. */
const FIXED_BEHAVIORS: Array<{ name: string; color: string }> = [
  { name: 'Sense', color: '#34982F' },
  { name: 'Decide', color: '#6D31A2' },
  { name: 'Act', color: '#FFBF00' },
  { name: 'Collaborate', color: '#3E8095' },
  { name: 'Reflect', color: '#BD3133' },
  { name: 'Respond', color: '#2886DE' },
];

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
  },
  description: {
    color: tokens.colorNeutralForeground2,
    padding: `0 ${tokens.spacingHorizontalL}`,
    marginBottom: tokens.spacingVerticalS,
  },
  indicatorsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
  },
  indicatorItem: {
    flex: '0 0 calc(33.33% - 12px)',
    minWidth: 0,
  },
});

/** Card listing 6 hardcoded agent behavior counts with per-behavior colored indicators. */
export function AgentBehaviorsPanel({ agentBehaviorCounts, onDrillthrough }: AgentBehaviorsPanelProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader header={<Subtitle2>Agent behavior</Subtitle2>} />

      <Body1 className={styles.description}>
        Behaviors describe how an agent interacts &mdash; whether it senses, recommends, executes or
        collaborates &mdash; and understanding them helps align the agent&rsquo;s function with its value.
      </Body1>

      <div className={styles.indicatorsRow}>
        {FIXED_BEHAVIORS.map((behavior) => {
          const match = agentBehaviorCounts.find((c) => c.agentBehavior === behavior.name);
          return (
            <div key={behavior.name} className={styles.indicatorItem}>
              <IndicatorItem
                name={behavior.name}
                count={match?.count ?? 0}
                borderColor={behavior.color}
                onClick={() => onDrillthrough({ kind: 'agent-behavior', value: behavior.name })}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default AgentBehaviorsPanel;
