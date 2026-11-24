/**
 * AgentPickerToolbar — agent selector + Analyze button shown on the Overview tab.
 *
 * Lists the same agents as the Agents tab (`useAgentsTable`) and navigates to
 * New analysis exactly like the row's "Run analysis" action.
 */

import { makeStyles, tokens, Body1, Caption1, Combobox, Option, Button } from '@fluentui/react-components';
import { Play16Regular } from '@fluentui/react-icons';
import { useMemo, useState, type UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentsTable, type AgentTableRow } from '../../hooks/useAgentsTable';
import { originQuery } from '../../utils/resultsOrigin';

const PAGE_SIZE = 50;
const SCROLL_THRESHOLD_PX = 48;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  combobox: {
    minWidth: '260px',
  },
  optionContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  optionName: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  optionEnv: {
    color: tokens.colorNeutralForeground3,
  },
});

function formatAgentLabel(agent: AgentTableRow | undefined): string {
  if (!agent) return '';
  return agent.environmentName ? `${agent.name} (${agent.environmentName})` : agent.name;
}

/** Overview-tab agent picker that launches New analysis for the chosen agent. */
export function AgentPickerToolbar() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data: agents, isLoading, isError } = useAgentsTable();
  const [selectedKey, setSelectedKey] = useState('');
  const [searchText, setSearchText] = useState('');
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sortedAgents = useMemo(
    () => (agents ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  const selectedAgent = useMemo(
    () => sortedAgents.find((a) => a.agentDetailsId === selectedKey),
    [sortedAgents, selectedKey],
  );

  const filteredAgents = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return sortedAgents;
    return sortedAgents.filter(
      (a) => a.name.toLowerCase().includes(term) || (a.environmentName ?? '').toLowerCase().includes(term),
    );
  }, [sortedAgents, searchText]);

  const visibleAgents = filteredAgents.slice(0, visibleCount);

  // Rendering every option makes the popup slow to open, so options are appended as the list nears its end.
  const handleListScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX && visibleCount < filteredAgents.length) {
      setVisibleCount((n) => n + PAGE_SIZE);
    }
  };

  const handleAnalyze = () => {
    if (!selectedAgent) return;
    const id = encodeURIComponent(selectedAgent.agentId ?? selectedAgent.agentDetailsId);
    navigate(`/conversation-analyzer/agents/${id}/new-analysis${originQuery(undefined, selectedAgent.environmentUrl)}`);
  };

  const placeholder = isLoading ? 'Loading agents…' : isError ? 'Unable to load agents' : 'Select agent';

  return (
    <div className={styles.root}>
      <Combobox
        className={styles.combobox}
        aria-label="Select agent to analyze"
        placeholder={placeholder}
        freeform
        appearance="outline"
        value={open ? searchText : formatAgentLabel(selectedAgent)}
        selectedOptions={selectedKey ? [selectedKey] : []}
        onChange={(e) => {
          setSearchText(e.target.value);
          setVisibleCount(PAGE_SIZE);
        }}
        onOptionSelect={(_e, d) => {
          if (d.optionValue) setSelectedKey(d.optionValue);
        }}
        onOpenChange={(_e, d) => {
          setOpen(d.open);
          if (d.open) {
            setSearchText('');
            setVisibleCount(PAGE_SIZE);
          }
        }}
        listbox={{ onScroll: handleListScroll }}
        disabled={isLoading || isError}
      >
        {visibleAgents.map((agent) => (
          <Option key={agent.agentDetailsId} value={agent.agentDetailsId} text={formatAgentLabel(agent)}>
            <div className={styles.optionContent}>
              <Body1 className={styles.optionName}>{agent.name}</Body1>
              {agent.environmentName && <Caption1 className={styles.optionEnv}>{agent.environmentName}</Caption1>}
            </div>
          </Option>
        ))}
      </Combobox>
      <Button appearance="primary" icon={<Play16Regular />} onClick={handleAnalyze} disabled={!selectedAgent}>
        Analyze
      </Button>
    </div>
  );
}
