import { makeStyles, tokens } from '@fluentui/react-components';
import type { ModelHistoryVM } from '../contracts/model-assessment';
import { modelDisplayName } from '../contracts/model-display';
import { StatusBadge } from './StatusBadge';

const useStyles = makeStyles({
  transition: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
});

type ModelTransitionProps = Pick<ModelHistoryVM, 'changeType' | 'previousModel' | 'currentModel'>;

export function ModelTransition({ changeType, previousModel, currentModel }: ModelTransitionProps) {
  const styles = useStyles();
  const previous = modelDisplayName(previousModel);
  const current = modelDisplayName(currentModel) || '—';
  const baseline = changeType.toLowerCase() === 'baseline' || !previous;

  return (
    <span className={styles.transition}>
      {baseline
        ? <><StatusBadge tone="neutral" label="Baseline" /><span>{current}</span></>
        : <span>{`${previous} → ${current}`}</span>}
    </span>
  );
}
