import { useState } from 'react';
import {
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  MessageBarTitle,
  Button,
  Link,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PREREQUISITES_URL =
  'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/POWER_SHIELD.md#prerequisites';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  banner: {
    marginBottom: tokens.spacingVerticalS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Informational banner for Makers when prerequisite cloud flows have not
 * yet populated the Connectors and/or Connector Actions tables.
 *
 * Directs the maker to contact their Power Platform Administrator.
 * Dismissible per session.
 */
export function SyncFlowPrerequisitesBanner({ visible }: { visible: boolean }) {
  const styles = useStyles();
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  return (
    <MessageBar intent="warning" className={styles.banner}>
      <MessageBarBody>
        <MessageBarTitle>Request Center setup is not yet complete</MessageBarTitle>
        Your Power Platform Administrator needs to configure the required Connection References and
        run the prerequisite cloud flows before Request Center is fully available. Please reach out to
        your admin for assistance.{' '}
        <Link href={PREREQUISITES_URL} target="_blank" rel="noopener noreferrer" inline>
          Learn more →
        </Link>
      </MessageBarBody>
      <MessageBarActions
        containerAction={
          <Button
            appearance="transparent"
            icon={<DismissRegular />}
            onClick={() => setDismissed(true)}
            aria-label="Dismiss setup notice"
          />
        }
      />
    </MessageBar>
  );
}
