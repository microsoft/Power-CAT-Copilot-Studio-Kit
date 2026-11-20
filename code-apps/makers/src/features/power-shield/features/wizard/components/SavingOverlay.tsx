import {
  makeStyles,
  tokens,
  Spinner,
  Text,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1000000,
    gap: tokens.spacingVerticalM,
  },
  label: {
    color: tokens.colorNeutralForegroundOnBrand,
  },
});

interface SavingOverlayProps {
  visible: boolean;
  message?: string;
}

/**
 * Full-screen overlay with a spinner shown while a save operation is in progress.
 * Blocks all user interaction until the operation completes.
 */
export function SavingOverlay({ visible, message = 'Saving draft...' }: SavingOverlayProps) {
  const styles = useStyles();

  if (!visible) return null;

  return (
    <div className={styles.overlay}>
      <Spinner size="large" />
      <Text size={400} weight="semibold" className={styles.label}>
        {message}
      </Text>
    </div>
  );
}
