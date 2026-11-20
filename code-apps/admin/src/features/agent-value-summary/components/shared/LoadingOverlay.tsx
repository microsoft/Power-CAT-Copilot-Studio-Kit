/**
 * LoadingOverlay — full-screen semi-transparent overlay with a Spinner.
 * Controlled by `visible` prop; renders nothing when false.
 */
import { makeStyles, Spinner } from '@fluentui/react-components';

interface LoadingOverlayProps {
  visible: boolean;
}

const useStyles = makeStyles({
  overlay: {
    position: 'absolute',
    inset: '0',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});

/** Full-viewport loading overlay. Set `visible` to false to hide. */
export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  const styles = useStyles();

  if (!visible) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label="Loading">
      <Spinner size="large" label="Loading..." labelPosition="below" />
    </div>
  );
}

export default LoadingOverlay;
