import { Button, makeStyles } from '@fluentui/react-components';
import { ArrowLeft16Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  button: {
    alignSelf: 'flex-start',
    width: 'fit-content',
  },
});

interface AgentInventoryBackButtonProps {
  onClick: () => void;
}

/** Renders compact navigation back to the Agent Inventory dashboard. */
export function AgentInventoryBackButton({ onClick }: AgentInventoryBackButtonProps) {
  const styles = useStyles();
  return (
    <Button
      className={styles.button}
      appearance="subtle"
      size="small"
      icon={<ArrowLeft16Regular />}
      onClick={onClick}
    >
      Back to Agent Inventory
    </Button>
  );
}
