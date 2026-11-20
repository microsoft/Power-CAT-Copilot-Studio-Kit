/**
 * ActionBar — Dialog action bar with Install, View, and Download buttons.
 *
 * States:
 *   No privilege         -> Download only
 *   not-installed + priv -> Install (primary) + Download
 *   installing           -> "Installing component..." (disabled + spinner) + Download
 *   installed            -> View (primary, deep links to Copilot Studio) + Download
 *   failed               -> Retry Install (primary) + Download
 */

import {
  Button,
  DialogActions,
  Spinner,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, Open24Regular } from '@fluentui/react-icons';
import type { InstallState } from '../contracts/types';

interface ActionBarProps {
  installState: InstallState;
  hasInstallPrivilege: boolean;
  onInstall: () => void;
  onDownload: () => void;
  onView: () => void;
}

export default function ActionBar({
  installState,
  hasInstallPrivilege,
  onInstall,
  onDownload,
  onView,
}: ActionBarProps) {
  const canInstall = hasInstallPrivilege;

  return (
    <DialogActions>
      <Button
        appearance="secondary"
        icon={<ArrowDownload24Regular />}
        onClick={onDownload}
        aria-label="Download solution file"
      >
        Download
      </Button>

      {canInstall && installState === 'not-installed' && (
        <Button appearance="primary" onClick={onInstall}>
          Import
        </Button>
      )}
      {canInstall && installState === 'installing' && (
        <Button
          appearance="primary"
          disabled
          icon={<Spinner size="tiny" />}
          aria-label="Import in progress"
          aria-busy="true"
        >
          Importing...
        </Button>
      )}
      {canInstall && installState === 'failed' && (
        <Button appearance="primary" onClick={onInstall}>
          Retry Import
        </Button>
      )}
      {installState === 'installed' && (
        <Button
          appearance="primary"
          icon={<Open24Regular />}
          onClick={onView}
          aria-label="View component in Copilot Studio"
        >
          View
        </Button>
      )}
    </DialogActions>
  );
}
