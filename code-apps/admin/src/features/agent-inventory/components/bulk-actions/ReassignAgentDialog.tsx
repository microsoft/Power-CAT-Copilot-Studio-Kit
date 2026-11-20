import { useCallback, useEffect, useState } from 'react';
import {
  Body1,
  Button,
  Caption1,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type { AgentInventoryRecord } from '../../contracts/types';
import type { TenantUser } from '../../services/tenantUserService';
import { useTenantUserSearch } from '../../hooks/useTenantUserSearch';
import { useAgentAction } from '../../hooks/useAgentAction';
import { useActionCompletionTracker } from '../../hooks/useActionCompletionTracker';
import {
  summarizeActionCompletion,
  type ActionAuditRecord,
  type ActionCompletionSummary,
} from '../../services/actionCompletionService';
import { ActionStatusCell } from './ActionStatusCell';

const useStyles = makeStyles({
  surface: {
    maxWidth: '720px',
    width: '720px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  intro: {
    color: tokens.colorNeutralForeground2,
  },
  combobox: {
    width: '100%',
  },
  listbox: {
    maxHeight: '240px',
  },
  subhead: {
    fontWeight: tokens.fontWeightSemibold,
  },
  currentOwner: {
    color: tokens.colorNeutralForeground1,
  },
  optionContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  optionSub: {
    color: tokens.colorNeutralForeground3,
  },
  tableScroll: {
    maxHeight: '280px',
    overflowY: 'auto',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  statusOption: {
    color: tokens.colorNeutralForeground3,
  },
});

interface ReassignAgentDialogProps {
  open: boolean;
  agents: AgentInventoryRecord[];
  onClose: () => void;
  onCompleted: (summary: ActionCompletionSummary) => void;
}

export function ReassignAgentDialog({ open, agents, onClose, onCompleted }: ReassignAgentDialogProps) {
  const styles = useStyles();
  const single = agents.length === 1;
  const [comboOpen, setComboOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [settled, setSettled] = useState(false);
  const [statusByAgent, setStatusByAgent] = useState<Record<string, ActionAuditRecord>>({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data: users = [], isFetching, isError } = useTenantUserSearch(debouncedTerm);
  const mutation = useAgentAction();
  const resetMutation = mutation.reset;

  const handleSettled = useCallback(
    (records: ActionAuditRecord[]) => {
      setSettled(true);
      if (single) {
        onCompleted(summarizeActionCompletion('Reassign', true, records));
        return;
      }
      const map: Record<string, ActionAuditRecord> = {};
      records.forEach((record) => { map[record.agentId] = record; });
      setStatusByAgent(map);
    },
    [single, onCompleted],
  );

  const { begin: beginTracking, stop: stopTracking, isTracking } = useActionCompletionTracker('reassign', handleSettled);
  const processing = mutation.isPending || isTracking;

  useEffect(() => {
    if (!open) {
      setComboOpen(false);
      setSearchText('');
      setDebouncedTerm('');
      setSelectedUser(null);
      setSubmitted(false);
      setSettled(false);
      setStatusByAgent({});
      resetMutation();
      stopTracking();
    }
  }, [open, resetMutation, stopTracking]);

  const showEmpty = !isFetching && !isError && debouncedTerm.length >= 2 && users.length === 0;

  const handleClose = () => {
    if (submitted) {
      onCompleted(summarizeActionCompletion('Reassign', single, Object.values(statusByAgent)));
    } else {
      onClose();
    }
  };

  const handleReassign = () => {
    if (!selectedUser) return;
    setSubmitted(true);
    setSettled(false);
    setStatusByAgent({});
    mutation.mutate(
      { action: 'Reassign', agents, user: selectedUser },
      {
        onSuccess: (result) => {
          if (result.name) beginTracking({ name: result.name, expectedCount: agents.length });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !processing) handleClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle
            action={<Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} onClick={handleClose} disabled={processing} />}
          >
            Reassign agent
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Text className={styles.intro}>
              Some organizations require agents to have owners for compliance purposes. The agent&apos;s owner
              can edit the agent, publish updates, delete it, or share it with teammates. You can select any
              user who has a license for Microsoft 365 Copilot.
            </Text>
            <Field label="Search by name">
              <Combobox
                className={styles.combobox}
                placeholder="Search by name"
                freeform
                appearance="outline"
                disabled={submitted}
                open={comboOpen}
                listbox={{ className: styles.listbox }}
                value={comboOpen ? searchText : (selectedUser?.displayName ?? '')}
                selectedOptions={selectedUser ? [selectedUser.id] : []}
                onChange={(e) => {
                  setSearchText((e.target as HTMLInputElement).value);
                  setSelectedUser(null);
                }}
                onOptionSelect={(_e, d) => {
                  const user = users.find((u) => u.id === d.optionValue);
                  if (user) {
                    setSelectedUser(user);
                    setSearchText(user.displayName);
                  }
                }}
                onOpenChange={(_, d) => setComboOpen(d.open)}
              >
                {isFetching && (
                  <Option key="__loading" value="__loading" text="Searching…" disabled>
                    <Spinner size="tiny" label="Searching…" />
                  </Option>
                )}
                {isError && (
                  <Option key="__error" value="__error" text="Error" disabled>
                    <span className={styles.statusOption}>Couldn&apos;t search users.</span>
                  </Option>
                )}
                {showEmpty && (
                  <Option key="__empty" value="__empty" text="No users found" disabled>
                    <span className={styles.statusOption}>No users found</span>
                  </Option>
                )}
                {!isFetching && !isError && debouncedTerm.length < 2 && (
                  <Option key="__hint" value="__hint" text="Type to search" disabled>
                    <span className={styles.statusOption}>Type at least 2 characters to search</span>
                  </Option>
                )}
                {users.map((user) => (
                  <Option key={user.id} value={user.id} text={user.displayName}>
                    <div className={styles.optionContent}>
                      <Body1>{user.displayName}</Body1>
                      {user.userPrincipalName && <Caption1 className={styles.optionSub}>{user.userPrincipalName}</Caption1>}
                    </div>
                  </Option>
                ))}
              </Combobox>
            </Field>
            {single ? (
              <Text className={styles.currentOwner}>Current owner: {agents[0].owner || 'Unknown'}</Text>
            ) : (
              <>
                <Text className={styles.subhead}>Below agents will be reassigned to the selected user</Text>
                <div className={styles.tableScroll}>
                  <Table aria-label="Agents to reassign" size="small">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell><span className={styles.headerCell}>Environment</span></TableHeaderCell>
                        <TableHeaderCell><span className={styles.headerCell}>Agent</span></TableHeaderCell>
                        <TableHeaderCell><span className={styles.headerCell}>Current owner</span></TableHeaderCell>
                        <TableHeaderCell><span className={styles.headerCell}>Reassign status</span></TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell><TableCellLayout truncate>{agent.environmentName || '-'}</TableCellLayout></TableCell>
                          <TableCell><TableCellLayout truncate>{agent.name}</TableCellLayout></TableCell>
                          <TableCell><TableCellLayout truncate>{agent.owner || '-'}</TableCellLayout></TableCell>
                          <TableCell>
                            <ActionStatusCell record={statusByAgent[agent.agentId]} polling={submitted && !settled} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {mutation.isError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : 'Unable to reassign the selected agents.'}
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {settled && !single ? (
              <Button appearance="primary" onClick={handleClose}>Done</Button>
            ) : (
              <>
                <Button appearance="secondary" onClick={handleClose} disabled={processing}>Cancel</Button>
                <Button
                  appearance="primary"
                  disabled={!selectedUser || agents.length === 0 || processing}
                  onClick={handleReassign}
                  icon={processing ? <Spinner size="tiny" /> : undefined}
                >
                  Reassign
                </Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
