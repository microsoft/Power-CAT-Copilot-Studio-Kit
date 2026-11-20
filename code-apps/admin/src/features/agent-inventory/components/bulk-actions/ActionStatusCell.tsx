import {
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { ActionAuditRecord } from '../../services/actionCompletionService';

const useStyles = makeStyles({
  complete: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  errorTrigger: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    padding: 0,
    margin: 0,
    background: 'none',
    border: 'none',
    font: 'inherit',
    textDecorationLine: 'underline',
  },
  cancelled: {
    color: tokens.colorNeutralForeground3,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  errorSurface: {
    maxWidth: '320px',
  },
});

interface ActionStatusCellProps {
  record?: ActionAuditRecord;
  polling: boolean;
}

/**
 * Renders a single agent's action outcome inside a bulk-action dialog table: a
 * spinner while the run is in flight, a green "Complete", a neutral
 * "Cancelled", or a red, clickable "Error" that reveals the captured error
 * message in a popover.
 */
export function ActionStatusCell({ record, polling }: ActionStatusCellProps) {
  const styles = useStyles();

  if (!record) {
    return polling ? <Spinner size="tiny" /> : <Text className={styles.muted}>-</Text>;
  }

  switch (record.status) {
    case 'complete':
      return <Text className={styles.complete}>Complete</Text>;
    case 'error':
      return (
        <Popover withArrow>
          <PopoverTrigger disableButtonEnhancement>
            <button type="button" className={styles.errorTrigger}>Error</button>
          </PopoverTrigger>
          <PopoverSurface className={styles.errorSurface}>
            <Text>{record.errorMessage?.trim() || 'The action failed. No error detail was provided.'}</Text>
          </PopoverSurface>
        </Popover>
      );
    case 'cancelled':
      return <Text className={styles.cancelled}>Cancelled</Text>;
    default:
      return <Spinner size="tiny" />;
  }
}
