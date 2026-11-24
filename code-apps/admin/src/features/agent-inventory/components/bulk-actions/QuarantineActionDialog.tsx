import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
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
import { useAgentAction } from '../../hooks/useAgentAction';
import { useActionCompletionTracker } from '../../hooks/useActionCompletionTracker';
import {
  summarizeActionCompletion,
  type ActionAuditRecord,
  type ActionCompletionSummary,
} from '../../services/actionCompletionService';
import type { AgentActionType } from '../../services/agentActionsService';
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
  tableScroll: {
    maxHeight: '320px',
    overflowY: 'auto',
  },
  statusHeader: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

export type QuarantineActionMode = 'quarantine' | 'unquarantine';

interface QuarantineActionDialogProps {
  open: boolean;
  mode: QuarantineActionMode;
  agents: AgentInventoryRecord[];
  onClose: () => void;
  onCompleted: (summary: ActionCompletionSummary) => void;
}

const COPY: Record<QuarantineActionMode, { title: string; prompt: string; action: string; statusHeader: string }> = {
  quarantine: {
    title: 'Quarantine agent',
    prompt: 'Are you sure you want to quarantine the selected agents?',
    action: 'Quarantine',
    statusHeader: 'Quarantine status',
  },
  unquarantine: {
    title: 'Unquarantine agent',
    prompt: 'Are you sure you want to unquarantine the selected agents?',
    action: 'Unquarantine',
    statusHeader: 'Unquarantine status',
  },
};

export function QuarantineActionDialog({
  open,
  mode,
  agents,
  onClose,
  onCompleted,
}: QuarantineActionDialogProps) {
  const styles = useStyles();
  const copy = COPY[mode];
  const single = agents.length === 1;
  const prompt = single
    ? `Are you sure you want to ${copy.action.toLowerCase()} the agent "${agents[0].name}"?`
    : copy.prompt;
  const action: AgentActionType = mode === 'unquarantine' ? 'Unquarantine' : 'Quarantine';
  const mutation = useAgentAction();
  const resetMutation = mutation.reset;

  const [submitted, setSubmitted] = useState(false);
  const [settled, setSettled] = useState(false);
  const [statusByAgent, setStatusByAgent] = useState<Record<string, ActionAuditRecord>>({});

  const handleSettled = useCallback(
    (records: ActionAuditRecord[]) => {
      setSettled(true);
      if (single) {
        onCompleted(summarizeActionCompletion(action, true, records));
        return;
      }
      const map: Record<string, ActionAuditRecord> = {};
      records.forEach((record) => { map[record.agentId] = record; });
      setStatusByAgent(map);
    },
    [single, action, onCompleted],
  );

  const { begin: beginTracking, stop: stopTracking, isTracking } = useActionCompletionTracker(mode, handleSettled);
  const processing = mutation.isPending || isTracking;

  useEffect(() => {
    if (!open) {
      resetMutation();
      stopTracking();
      setSubmitted(false);
      setSettled(false);
      setStatusByAgent({});
    }
  }, [open, resetMutation, stopTracking]);

  const handleClose = () => {
    if (submitted) {
      onCompleted(summarizeActionCompletion(action, single, Object.values(statusByAgent)));
    } else {
      onClose();
    }
  };

  const handleConfirm = () => {
    setSubmitted(true);
    setSettled(false);
    setStatusByAgent({});
    mutation.mutate(
      { action, agents },
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
            {copy.title}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Text className={styles.intro}>{prompt}</Text>
            {!single && (
              <div className={styles.tableScroll}>
                <Table aria-label={`${copy.action} selected agents`} size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell><span className={styles.statusHeader}>Environment</span></TableHeaderCell>
                      <TableHeaderCell><span className={styles.statusHeader}>Agent</span></TableHeaderCell>
                      <TableHeaderCell><span className={styles.statusHeader}>Agent status</span></TableHeaderCell>
                      <TableHeaderCell><span className={styles.statusHeader}>{copy.statusHeader}</span></TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <TableRow key={agent.id}>
                        <TableCell><TableCellLayout truncate>{agent.environmentName || '-'}</TableCellLayout></TableCell>
                        <TableCell><TableCellLayout truncate>{agent.name}</TableCellLayout></TableCell>
                        <TableCell><TableCellLayout truncate>{agent.status}</TableCellLayout></TableCell>
                        <TableCell>
                          <ActionStatusCell record={statusByAgent[agent.agentId]} polling={submitted && !settled} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {mutation.isError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : `Unable to ${action.toLowerCase()} the selected agents.`}
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
                  onClick={handleConfirm}
                  disabled={agents.length === 0 || processing}
                  icon={processing ? <Spinner size="tiny" /> : undefined}
                >
                  {copy.action}
                </Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
