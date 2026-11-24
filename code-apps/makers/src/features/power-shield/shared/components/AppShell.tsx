import type { ReactNode } from 'react';
import { Button, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ErrorBoundary } from './ErrorBoundary';
import { UnauthorizedScreen } from './UnauthorizedScreen';
import { useAuthBoot } from '../contexts/AuthContext';
import type { AuthBootState } from '../contexts/AuthContext';

const useGateStyles = makeStyles({
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '400px',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
  },
  errorMessage: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
    maxWidth: '480px',
  },
});

function AuthContentGate({ boot, children }: { boot: AuthBootState; children: ReactNode }) {
  const styles = useGateStyles();
  switch (boot.phase) {
    case 'loading':
      return (<div className={styles.centered}><Spinner size="large" label="Loading Request Center..." /></div>);
    case 'error':
      return (
        <div className={styles.centered} role="alert">
          <Text size={500} weight="semibold">Unable to load Request Center</Text>
          <Text className={styles.errorMessage}>{boot.message}</Text>
          <Button appearance="primary" onClick={boot.retry}>Retry</Button>
        </div>
      );
    case 'unauthorized':
      return <UnauthorizedScreen />;
    case 'ready':
      return <>{children}</>;
  }
}

/**
 * AppShell — wraps PowerShield content with auth gating.
 *
 * When embedded inside a host Code App (CopilotStudioKitAdmin / CopilotStudioKitMakers),
 * the host Layout already provides the sidebar navigation. AppShell only handles
 * auth state (loading/error/unauthorized/ready) and renders children directly.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const boot = useAuthBoot();

  return (
    <ErrorBoundary>
      <AuthContentGate boot={boot}>{children}</AuthContentGate>
    </ErrorBoundary>
  );
}

export default AppShell;
