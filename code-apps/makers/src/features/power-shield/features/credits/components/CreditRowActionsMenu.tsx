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
import { MoreVerticalRegular, ArrowUndoRegular, EditRegular, ArrowSyncRegular } from '@fluentui/react-icons';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { CreditWithdrawConfirmDialog } from './CreditWithdrawConfirmDialog';
import { CreditRequestChangeDialog } from './CreditRequestChangeDialog';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits row actions menu (T030, FR-006). Keyboard-operable. There is
// NO generic Clone. Actions are gated by ownership and the maker label:
//   • Resume draft        — Draft, owned by the maker
//   • Withdraw            — Awaiting approval, owned by the maker
//   • Request a change    — Allocated, owned by the maker
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  wrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

interface CreditRowActionsMenuProps {
  item: CreditRequestSummary;
  currentUserAadObjectId: string;
  /** Re-fetch the list after a withdraw. */
  onWithdrawn: () => void;
}

export function CreditRowActionsMenu({
  item,
  currentUserAadObjectId,
  onWithdrawn,
}: CreditRowActionsMenuProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  const isOwner = item.createdByAadObjectId === currentUserAadObjectId;
  const canResume = isOwner && item.status === 'Draft';
  const canWithdraw = isOwner && item.creditLabel === 'Awaiting approval';
  const canRequestChange = isOwner && item.creditLabel === 'Allocated';

  const hasAnyAction = canResume || canWithdraw || canRequestChange;
  if (!hasAnyAction) {
    // Render a disabled affordance so the column stays visually aligned.
    return (
      <div className={styles.wrapper} onClick={(e) => e.stopPropagation()}>
        <Button
          appearance="subtle"
          icon={<MoreVerticalRegular />}
          size="small"
          disabled
          aria-label="No actions available"
          style={{ minWidth: '24px', width: '24px', height: '24px', color: tokens.colorNeutralForegroundDisabled }}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper} onClick={(e) => e.stopPropagation()}>
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
              color: tokens.colorNeutralForeground3,
            }}
          />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {canResume && (
              <MenuItem
                icon={<EditRegular />}
                onClick={() =>
                  navigate('/new-request-credits', { state: { draftRequestId: item.id } })
                }
              >
                Resume draft
              </MenuItem>
            )}
            {canRequestChange && (
              <MenuItem icon={<ArrowSyncRegular />} onClick={() => setChangeOpen(true)}>
                Request a change
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

      {canWithdraw && (
        <CreditWithdrawConfirmDialog
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

      {canRequestChange && (
        <CreditRequestChangeDialog
          open={changeOpen}
          sourceRequestId={item.id}
          requestNumber={item.requestNumber}
          onClose={() => setChangeOpen(false)}
          onDraftCreated={(draftRequestId) => {
            setChangeOpen(false);
            navigate('/new-request-credits', { state: { draftRequestId } });
          }}
        />
      )}
    </div>
  );
}

export default CreditRowActionsMenu;
