import { useState } from 'react';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { MoreVerticalRegular, CopyRegular, ArrowUndoRegular, EditRegular, ArrowRepeatAllRegular } from '@fluentui/react-icons';
import type { PolicyRequestSummary } from '../../../models/policyRequest';
import { CloneConfirmDialog } from './CloneConfirmDialog';
import { WithdrawConfirmDialog } from './WithdrawConfirmDialog';
import { ResumeDraftDialog } from './ResumeDraftDialog';
import { ReviseResubmitDialog } from './ReviseResubmitDialog';
import { useNavigate } from '../../../shared/hooks/useNavigate';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  wrapper: {
    // Prevents · click from bubbling to DataGridRow onClick (row navigation)
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    ':hover': {
      backgroundColor: '#f0f0f4',
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface RowActionsMenuProps {
  item: PolicyRequestSummary;
  showWithdraw: boolean;
  currentUserAadObjectId: string;
  onCloned: (newId: string) => void;
  onWithdrawn: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RowActionsMenu({
  item,
  showWithdraw,
  currentUserAadObjectId,
  onCloned,
  onWithdrawn,
}: RowActionsMenuProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);

  const canWithdraw =
    showWithdraw &&
    (item.status === 'Draft' || item.status === 'Submitted') &&
    item.createdByAadObjectId === currentUserAadObjectId;

  const canResume = item.status === 'Draft';

  const canResubmit =
    item.status === 'Withdrawn' &&
    item.createdByAadObjectId === currentUserAadObjectId;

  return (
    // stopPropagation prevents the DataGridRow onClick (navigate) from firing
    // when the user interacts with the · button or any dialog it opens
    <div
      className={styles.wrapper}
      onClick={(e) => e.stopPropagation()}
    >
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            icon={<MoreVerticalRegular />}
            size="small"
            aria-label="Row actions"
            style={{
              minWidth: '24px',
              width: '24px',
              height: '24px',
              borderRadius: tokens.borderRadiusMedium,
              color: '#9090a0',
            }}
          />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {canResume && (
              <MenuItem icon={<EditRegular />} onClick={() => setResumeOpen(true)}>
                Resume Draft
              </MenuItem>
            )}
            <MenuItem icon={<CopyRegular />} onClick={() => setCloneOpen(true)}>
              Clone
            </MenuItem>
            {canResubmit && (
              <MenuItem icon={<ArrowRepeatAllRegular />} onClick={() => setResubmitOpen(true)}>
                Revise {'&'} Resubmit
              </MenuItem>
            )}
            {canWithdraw && (
              <MenuItem icon={<ArrowUndoRegular />} onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </MenuItem>
            )}
          </MenuList>
        </MenuPopover>
      </Menu>

      <CloneConfirmDialog
        open={cloneOpen}
        request={item}
        onClose={() => setCloneOpen(false)}
        onCloned={(newId) => {
          setCloneOpen(false);
          onCloned(newId);
        }}
      />

      {canResume && (
        <ResumeDraftDialog
          open={resumeOpen}
          requestNumber={item.requestNumber}
          onClose={() => setResumeOpen(false)}
          onConfirm={() => {
            setResumeOpen(false);
            navigate('/new-request/environment', {
              state: { draftRequestId: item.id },
            });
          }}
        />
      )}

      {canWithdraw && (
        <WithdrawConfirmDialog
          open={withdrawOpen}
          requestId={item.id}
          requestNumber={item.requestNumber}
          onClose={() => setWithdrawOpen(false)}
          onWithdrawn={() => {
            setWithdrawOpen(false);
            onWithdrawn();
          }}
        />
      )}

      {canResubmit && (
        <ReviseResubmitDialog
          open={resubmitOpen}
          requestNumber={item.requestNumber}
          onClose={() => setResubmitOpen(false)}
          onConfirm={() => {
            setResubmitOpen(false);
            navigate('/new-request/environment', {
              state: { templateRequestId: item.id },
            });
          }}
        />
      )}
    </div>
  );
}

export default RowActionsMenu;
