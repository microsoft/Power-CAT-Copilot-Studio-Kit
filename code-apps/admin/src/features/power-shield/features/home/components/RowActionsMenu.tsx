import { useState } from 'react';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Text,
  makeStyles,
} from '@fluentui/react-components';
import { MoreVerticalRegular, PersonArrowLeftRegular } from '@fluentui/react-icons';
import type { PolicyRequestSummary } from '../../../models/policyRequest';
import { takeOwnership } from '../../../shared/services/dataverse/requestService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';

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

interface RowActionsMenuProps {
  item: PolicyRequestSummary;
  onActionComplete: () => void;
}

/**
 * Row-level context menu for Admin home grid.
 * Shows "Assign to Me" for Submitted/UnderReview requests.
 */
export function RowActionsMenu({ item, onActionComplete }: RowActionsMenuProps) {
  const styles = useStyles();
  const { dvUserId } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isSubmitted = item.status === 'Submitted';
  const isUnderReview = item.status === 'UnderReview';
  const canAssign = isSubmitted || isUnderReview;

  if (!canAssign) return null;

  const isReassign = isUnderReview;

  async function handleAssign() {
    setConfirmOpen(false);
    setIsLoading(true);
    try {
      await takeOwnership(item.id, dvUserId);
      notifySuccess('Request assigned to you successfully.');
      onActionComplete();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to assign request.');
    } finally {
      setIsLoading(false);
    }
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
            disabled={isLoading}
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
            <MenuItem
              icon={<PersonArrowLeftRegular />}
              onClick={() => setConfirmOpen(true)}
            >
              Assign to Me
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <Dialog open={confirmOpen} onOpenChange={(_, data) => setConfirmOpen(data.open)}>
        <DialogSurface>
          <DialogTitle>{isReassign ? 'Reassign Request' : 'Assign Request'}</DialogTitle>
          <DialogBody>
            <DialogContent>
              {isReassign ? (
                <>
                  <Text>
                    This request is currently assigned to{' '}
                    <strong>{item.assignedAdminName ?? 'another administrator'}</strong>.
                    You are about to reassign it to yourself.
                  </Text>
                  <br />
                  <Text>Do you want to proceed?</Text>
                </>
              ) : (
                <>
                  <Text>
                    You are about to assign yourself as the reviewing administrator for{' '}
                    <strong>{item.requestNumber}</strong>. The request status will change to{' '}
                    <strong>Under Review</strong>.
                  </Text>
                  <br />
                  <Text>Do you want to proceed?</Text>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                onClick={() => void handleAssign()}
                disabled={isLoading}
              >
                Confirm
              </Button>
              <Button appearance="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

export default RowActionsMenu;
