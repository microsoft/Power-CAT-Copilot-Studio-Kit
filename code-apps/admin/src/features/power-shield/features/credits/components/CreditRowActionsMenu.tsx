import { useState } from 'react';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  makeStyles,
} from '@fluentui/react-components';
import { MoreVerticalRegular, PersonArrowLeftRegular } from '@fluentui/react-icons';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import { useAuth } from '../../../shared/hooks/useAuth';
import { CreditAssignDialog } from './CreditAssignDialog';

const useStyles = makeStyles({
  wrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRadius: '4px',
    ':hover': {
      backgroundColor: '#f0f0f4',
    },
  },
});

interface CreditRowActionsMenuProps {
  item: CreditRequestSummary;
  /** Called after a successful assignment so the list can refresh. */
  onActionComplete: () => void;
}

/**
 * Row-level context menu for the Copilot Credits list.
 * Shows "Assign to Me" for Submitted / UnderReview requests not already assigned to the current admin.
 */
export function CreditRowActionsMenu({ item, onActionComplete }: CreditRowActionsMenuProps) {
  const styles = useStyles();
  const { dvUserId } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAssignedToMe =
    !!item.assignedAdminDvUserId &&
    !!dvUserId &&
    item.assignedAdminDvUserId.toLowerCase() === dvUserId.toLowerCase();
  const canAssign = (item.status === 'Submitted' || item.status === 'UnderReview') && !isAssignedToMe;
  if (!canAssign) return null;

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
              borderRadius: '4px',
              color: '#9090a0',
            }}
          />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem icon={<PersonArrowLeftRegular />} onClick={() => setDialogOpen(true)}>
              Assign to Me
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <CreditAssignDialog
        item={item}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAssigned={onActionComplete}
      />
    </div>
  );
}

export default CreditRowActionsMenu;
