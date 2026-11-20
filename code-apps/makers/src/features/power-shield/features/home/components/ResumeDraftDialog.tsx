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
  resumeBtn: {
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

interface ResumeDraftDialogProps {
  open: boolean;
  requestNumber: string;
  onClose: () => void;
  onConfirm: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ResumeDraftDialog({ open, requestNumber, onClose, onConfirm }: ResumeDraftDialogProps) {
  const styles = useStyles();

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Resume draft request?</DialogTitle>
          <DialogContent>
            <p className={styles.bodyText}>
              You are about to resume editing policy request{' '}
              <strong>{requestNumber}</strong>. The wizard will restore your
              previously saved progress so you can continue where you left off.
            </p>
            <div className={styles.infoNotice}>
              <InfoRegular className={styles.infoIcon} style={{ width: 16, height: 16 }} />
              <span>
                The request will open in the submission wizard at the last completed step.
                You can review, make changes, and submit when ready.
              </span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button className={styles.resumeBtn} onClick={onConfirm}>
              Resume Draft
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default ResumeDraftDialog;
