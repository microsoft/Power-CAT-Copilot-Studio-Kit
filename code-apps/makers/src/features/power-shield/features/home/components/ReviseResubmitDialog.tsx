import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';

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
  resubmitBtn: {
    backgroundColor: tokens.colorBrandForeground1,
    color: tokens.colorNeutralBackground1,
    ':hover': {
      backgroundColor: tokens.colorBrandForeground2,
      color: tokens.colorNeutralBackground1,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ReviseResubmitDialogProps {
  open: boolean;
  requestNumber: string;
  onClose: () => void;
  onConfirm: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviseResubmitDialog({ open, requestNumber, onClose, onConfirm }: ReviseResubmitDialogProps) {
  const styles = useStyles();

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Revise {'&'} Resubmit {requestNumber}?</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              A new Policy Request will be created with the details copied from{' '}
              <strong>{requestNumber}</strong>. The withdrawn request will remain
              unchanged for audit purposes.
            </p>
            <div className={styles.infoNotice}>
              <InfoRegular className={styles.infoIcon} style={{ width: 16, height: 16 }} />
              <span>
                The new request will open in the submission wizard at Step 1.
                You can review, make changes, and submit when ready.
              </span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button className={styles.resubmitBtn} onClick={onConfirm}>
              Revise {'&'} Resubmit
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default ReviseResubmitDialog;
