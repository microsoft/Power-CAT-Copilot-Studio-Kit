import { useState } from 'react';
import {
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  MessageBarTitle,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, PlugConnectedRegular } from '@fluentui/react-icons';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import type { HealthReason } from '../../admin/services/workflowService';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  banner: {
    marginBottom: tokens.spacingVerticalS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Message variants
// ─────────────────────────────────────────────────────────────────────────────

interface BannerContent {
  intent: 'info' | 'warning';
  title: string;
  body: string;
}

function getBannerContent(reason: HealthReason): BannerContent {
  switch (reason) {
    case 'flows-off':
      return {
        intent: 'warning',
        title: 'Cloud flows are turned off',
        body: 'Some Request Center cloud flows are turned off. Turn them on from the Connections tab in Setup to keep connector data in sync.',
      };
    case 'data-pending':
      return {
        intent: 'info',
        title: 'Waiting for data sync',
        body: 'Cloud flows are on but connector data hasn\'t synced yet. This may take a few minutes depending on the flow schedule.',
      };
    case 'no-data':
    default:
      return {
        intent: 'info',
        title: 'Getting started with Request Center',
        body: 'Connection references need to be configured and cloud flows turned on before Request Center can sync connector data. Open Setup to resolve this in a few clicks.',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface SyncFlowPrerequisitesBannerProps {
  visible: boolean;
  reason?: HealthReason;
}

/**
 * Contextual banner alerting admins about Power Shield health issues.
 * Displays different messages based on the health check reason:
 * - `no-data`: First-time setup guidance (CRs + flows)
 * - `flows-off`: Warning that flows are turned off
 * - `data-pending`: Info that flows are on but data hasn't synced yet
 */
export function SyncFlowPrerequisitesBanner({ visible, reason = 'no-data' }: SyncFlowPrerequisitesBannerProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  const content = getBannerContent(reason);

  return (
    <MessageBar intent={content.intent} className={styles.banner}>
      <MessageBarBody>
        <MessageBarTitle>{content.title}</MessageBarTitle>
        {content.body}
      </MessageBarBody>
      <MessageBarActions
        containerAction={
          <Button
            appearance="transparent"
            icon={<DismissRegular />}
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
          />
        }
      >
        <Button
          appearance="primary"
          size="small"
          icon={<PlugConnectedRegular />}
          onClick={() => void navigate('/settings/setup?tab=connections')}
        >
          Open Setup
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}
