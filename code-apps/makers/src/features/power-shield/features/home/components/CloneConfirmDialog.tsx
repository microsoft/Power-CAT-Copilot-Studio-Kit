import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import { cloneRequest } from '../../../shared/services/dataverse/requestService';
import type { PolicyRequestSummary } from '../../../models/policyRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  infoNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: tokens.spacingVerticalSNudge,
    paddingBottom: tokens.spacingVerticalSNudge,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    marginTop: '12px',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    lineHeight: '1.5',
  },
  infoIcon: {
    flexShrink: 0,
    marginTop: '1px',
    color: tokens.colorBrandForeground1,
  },
  bodyText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    lineHeight: '1.5',
  },
  cloneBtn: {
    backgroundColor: tokens.colorBrandForeground1,
    color: tokens.colorNeutralBackground1,
    ':hover': {
      backgroundColor: tokens.colorBrandForeground2,
      color: tokens.colorNeutralBackground1,
    },
    ':disabled': {
      opacity: '0.6',
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface CloneConfirmDialogProps {
  open: boolean;
  request: PolicyRequestSummary;
  onClose: () => void;
  onCloned: (newId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CloneConfirmDialog({ open, request, onClose, onCloned }: CloneConfirmDialogProps) {
  const styles = useStyles();
  const { aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [isCloning, setIsCloning] = useState(false);

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const newId = await cloneRequest(request.id, { aadObjectId, upn });
      notifySuccess(`${request.requestNumber} cloned successfully. Opening new Draft…`);
      onCloned(newId);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to clone request.');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !isCloning) onClose(); }}>
      <DialogSurface data-clone-ui="true">
        <DialogBody>
          <DialogTitle>Clone this request?</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              A copy of <strong>{request.requestNumber}</strong> will be created with the same
              service tree, environment group, and connector configuration.
            </p>
            <div className={styles.infoNotice}>
              <InfoRegular className={styles.infoIcon} style={{ width: 16, height: 16 }} />
              <span>The cloned request will open as a Draft. You can edit it before submitting.</span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={isCloning}>
              Cancel
            </Button>
            <Button
              className={styles.cloneBtn}
              onClick={() => void handleClone()}
              disabled={isCloning}
              icon={isCloning ? <Spinner size="tiny" /> : undefined}
            >
              {isCloning ? 'Cloning…' : 'Clone request'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default CloneConfirmDialog;
