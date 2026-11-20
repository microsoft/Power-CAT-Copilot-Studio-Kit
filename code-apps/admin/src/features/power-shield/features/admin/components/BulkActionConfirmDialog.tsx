import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type { RiskLevel } from '../../../models/connector';
import { bulkUpdateConnectors } from '../services/connectorService';
import type { BulkUpdateResult } from '../services/connectorService';

export type BulkActionType = 'block' | 'unblock' | 'setRisk';

interface BulkActionConfirmDialogProps {
  open: boolean;
  actionType: BulkActionType;
  riskLevel?: RiskLevel;
  selectedIds: string[];
  onClose: () => void;
  onComplete: (result: BulkUpdateResult) => void;
}

function getActionDescription(actionType: BulkActionType, count: number, riskLevel?: RiskLevel): string {
  switch (actionType) {
    case 'block':
      return `This will block ${count} connector${count !== 1 ? 's' : ''} from being requested by makers.`;
    case 'unblock':
      return `This will unblock ${count} connector${count !== 1 ? 's' : ''}, allowing makers to request them.`;
    case 'setRisk':
      return `This will set the risk level to "${riskLevel}" for ${count} connector${count !== 1 ? 's' : ''}.`;
  }
}

export function BulkActionConfirmDialog({
  open,
  actionType,
  riskLevel,
  selectedIds,
  onClose,
  onComplete,
}: BulkActionConfirmDialogProps) {
  const [isApplying, setIsApplying] = useState(false);

  async function handleApply() {
    setIsApplying(true);
    try {
      const fields: { riskLevel?: RiskLevel; blockedByAdmin?: boolean } = {};
      if (actionType === 'block') fields.blockedByAdmin = true;
      if (actionType === 'unblock') fields.blockedByAdmin = false;
      if (actionType === 'setRisk' && riskLevel) fields.riskLevel = riskLevel;

      const result = await bulkUpdateConnectors(selectedIds, fields);
      onComplete(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onComplete({ successCount: 0, failedCount: selectedIds.length, failedIds: selectedIds, errors: [msg] });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !isApplying) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<Dismiss24Regular />}
                onClick={onClose}
                disabled={isApplying}
              />
            }
          >
            Are you sure you want to make the following changes?
          </DialogTitle>
          <DialogContent>
            <Text style={{ color: tokens.colorNeutralForeground2 }}>
              {getActionDescription(actionType, selectedIds.length, riskLevel)}
            </Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => void handleApply()}
              disabled={isApplying}
              icon={isApplying ? <Spinner size="tiny" /> : undefined}
            >
              {isApplying ? 'Applying...' : 'Apply'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
