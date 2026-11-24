import { Text, Button, makeStyles, tokens } from '@fluentui/react-components';
import { useNavigate } from '../hooks/useNavigate';

// ─────────────────────────────────────────────────────────────────────────────
// Typed not-found / not-available screen (T026, FR-020/FR-024). Replaces the old
// silent redirect on an unknown route and is the landing spot for a credit id
// hit on a connector route (or vice versa). No connector/credit shell is shown.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    minHeight: '240px',
    textAlign: 'center',
  },
});

interface PowerShieldNotFoundProps {
  title?: string;
  description?: string;
}

export function PowerShieldNotFound({
  title = 'This page is not available',
  description = 'The page you are looking for does not exist, or is not available in this experience.',
}: PowerShieldNotFoundProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  return (
    <div className={styles.container} role="alert">
      <Text size={600} weight="semibold">
        {title}
      </Text>
      <Text size={300}>{description}</Text>
      <Button appearance="primary" onClick={() => void navigate('/')}>
        Back to my requests
      </Button>
    </div>
  );
}

export default PowerShieldNotFound;
