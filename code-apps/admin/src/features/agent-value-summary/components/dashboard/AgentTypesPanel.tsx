/**
 * AgentTypesPanel — Card showing agent type distribution with indicator items.
 *
 * Shows the 6 agent types produced by the classification flow (see data/agentTypeHelp.ts)
 * and looks up counts from agentTypeCounts. If no match, shows 0.
 * Each type has a distinct left border color from the original design.
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
import type { AgentTypeCount, DrillthroughFilter } from '../../contracts/types';

interface AgentTypesPanelProps {
  agentTypeCounts: AgentTypeCount[];
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

/** Agent types emitted by the classification flow, in display order. */
const FIXED_TYPES: Array<{ name: string; color: string }> = [
  { name: 'Assistant', color: '#0078D4' },
  { name: 'Collaborator', color: '#98D046' },
  { name: 'Orchestrator', color: '#FF0000' },
  { name: 'Retriever', color: '#1E1E1E' },
  { name: 'Performer', color: '#B4B4B4' },
  { name: 'Advisor', color: '#8764B8' },
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

/** Card listing the 6 agent type counts with per-type colored indicators. */
export function AgentTypesPanel({ agentTypeCounts, onDrillthrough }: AgentTypesPanelProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader header={<Subtitle2>Agent types</Subtitle2>} />

      <Body1 className={styles.description}>
        Agent type describes the role, or identity of the agent &mdash; what kind of agent it is.
      </Body1>

      <div className={styles.indicatorsRow}>
        {FIXED_TYPES.map((type) => {
          const match = agentTypeCounts.find((c) => c.agentType === type.name);
          return (
            <div key={type.name} className={styles.indicatorItem}>
              <IndicatorItem
                name={type.name}
                count={match?.count ?? 0}
                borderColor={type.color}
                onClick={() => onDrillthrough({ kind: 'agent-type', value: type.name })}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default AgentTypesPanel;
