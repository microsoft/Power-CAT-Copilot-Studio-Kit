import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Combobox,
  Option,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useTrackableAgents, useAddTrackingConfig, useTrackingEnvironmentId } from '../hooks/useChangeTracker';
import type { AvailableAgent, TrackingConfig } from '../contracts/change-tracker';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    width: '100%',
    minWidth: 0,
  },
});

interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configuredAgents: TrackingConfig[];
}

/** Display label for an agent: name plus its environment (e.g. "Agent (FDE-DEV)"). */
function agentDisplayName(agent: AvailableAgent): string {
  return agent.environmentName ? `${agent.name} (${agent.environmentName})` : agent.name;
}

function normalizeId(value: string | undefined): string {
  return (value ?? '').trim().replace(/[{}]/g, '').toLowerCase();
}

/** Dialog to opt a catalog agent into change tracking via a single agent lookup. */
export function AddAgentDialog({ open, onOpenChange, configuredAgents }: AddAgentDialogProps) {
  const styles = useStyles();
  const { data: trackable, isLoading } = useTrackableAgents();
  const { data: currentEnvironmentId, isLoading: isEnvironmentLoading } = useTrackingEnvironmentId();
  const addConfig = useAddTrackingConfig();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');

  const configuredIds = useMemo(
    () => new Set(configuredAgents.map((c) => `${c.agentId}|${c.environmentId ?? ''}`.toLowerCase())),
    [configuredAgents],
  );

  // The catalog spans all inventoried environments, but this app tracks only
  // agents in its host environment.
  const selectableAgents = useMemo<AvailableAgent[]>(
    () =>
      (trackable ?? [])
        .filter(
          (a) =>
            a.agentId &&
            normalizeId(a.environmentId) === normalizeId(currentEnvironmentId) &&
            !configuredIds.has(`${a.agentId}|${a.environmentId ?? ''}`.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [trackable, configuredIds, currentEnvironmentId],
  );

  // Filter the lookup by the typed query against both the agent name and its
  // environment, so users can find an agent by either.
  const filteredAgents = useMemo<AvailableAgent[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectableAgents;
    return selectableAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.environmentName ?? '').toLowerCase().includes(q),
    );
  }, [selectableAgents, query]);

  const selected = selectableAgents.find((a) => a.id === selectedId);

  const handleAdd = () => {
    if (!selected?.agentId) return;
    const input = {
      agentId: selected.agentId,
      agentName: selected.name,
      environmentId: selected.environmentId,
      environmentUrl: selected.environmentUrl,
    };
    setSelectedId(undefined);
    setQuery('');
    onOpenChange(false);
    addConfig.mutate(input);
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Select agent for tracking</DialogTitle>
          <DialogContent className={styles.content}>
            {isLoading || isEnvironmentLoading ? (
              <Spinner size="small" label="Loading agents..." />
            ) : selectableAgents.length === 0 ? (
              <MessageBar intent="info">
                <MessageBarBody>
                  No additional agents are available to configure.
                </MessageBarBody>
              </MessageBar>
            ) : (
              <Field label="Agent" required>
                <Combobox
                  placeholder="Type to search agents..."
                  selectedOptions={selectedId ? [selectedId] : []}
                  value={selected ? agentDisplayName(selected) : query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedId(undefined);
                  }}
                  onOptionSelect={(_, data) => {
                    setSelectedId(data.optionValue);
                    setQuery('');
                  }}
                >
                  {filteredAgents.map((agent) => (
                    <Option key={agent.id} value={agent.id} text={agentDisplayName(agent)}>
                      {agentDisplayName(agent)}
                    </Option>
                  ))}
                </Combobox>
              </Field>
            )}
            {addConfig.isError && (
              <MessageBar intent="error">
                <MessageBarBody>
                  {addConfig.error instanceof Error
                    ? addConfig.error.message
                    : 'Failed to configure the agent. Please try again.'}
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={!selected || addConfig.isPending}
              onClick={handleAdd}
            >
              {addConfig.isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
