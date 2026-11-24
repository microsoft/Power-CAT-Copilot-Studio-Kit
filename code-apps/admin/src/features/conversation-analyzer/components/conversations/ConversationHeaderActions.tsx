import { createPortal } from 'react-dom';
import { Button, Dropdown, Option, Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { DocumentBulletList20Regular, Play20Filled } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { agentResultsPath, CONVERSATIONS_ORIGIN } from '../../utils/resultsOrigin';

const useStyles = makeStyles({
  root: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  resultsDropdown: { minWidth: 'unset', width: '220px' },
  resultsLabel: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
});

export interface ResultsAgentLink {
  id: string;
  name: string;
}

interface ConversationHeaderActionsProps {
  container?: HTMLElement | null;
  selectedCount: number;
  analyzeDisabled: boolean;
  onAnalyze: () => void;
  /** Agents with analyzed conversations in the current scope. */
  resultsAgents: readonly ResultsAgentLink[];
  resultsLoading: boolean;
  resultsError: boolean;
  resultsDisabled: boolean;
  promptId?: string;
  /** Environment of the listed agents; scopes the results screen. */
  environmentUrl?: string;
}

/** Results dropdown and Analyze action portaled into the tab-row slot (CV-14). */
export function ConversationHeaderActions({
  container,
  selectedCount,
  analyzeDisabled,
  onAnalyze,
  resultsAgents,
  resultsLoading,
  resultsError,
  resultsDisabled,
  promptId,
  environmentUrl,
}: ConversationHeaderActionsProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const openResults = (agentId: string) => {
    navigate(agentResultsPath(agentId, { promptId, origin: CONVERSATIONS_ORIGIN, environmentUrl }));
  };

  const resultsButton = (
    <Dropdown
      className={styles.resultsDropdown}
      aria-label="Analysis results"
      value="Analysis results"
      selectedOptions={[]}
      disabled={resultsDisabled}
      positioning="below-end"
      button={{ children: (
        <span className={styles.resultsLabel}>
          <DocumentBulletList20Regular aria-hidden="true" />
          <span>Analysis results</span>
        </span>
      ) }}
      onOptionSelect={(_event, data) => { if (data.optionValue) openResults(data.optionValue); }}
    >
      {resultsLoading ? (
        <Option disabled text="Loading analyzed agents…"><Spinner size="tiny" label="Loading analyzed agents…" /></Option>
      ) : resultsAgents.length === 0 ? (
        <Option disabled>{resultsError ? 'Unable to load analyzed agents.' : 'No analyzed conversations.'}</Option>
      ) : resultsAgents.map((agent) => (
        <Option key={agent.id} value={agent.id}>{agent.name}</Option>
      ))}
    </Dropdown>
  );

  const content = (
    <div className={styles.root}>
      {resultsButton}
      <Button appearance="primary" icon={<Play20Filled />} disabled={analyzeDisabled} onClick={onAnalyze}>
        Analyze{selectedCount > 0 ? ` (${selectedCount.toLocaleString()})` : ''}
      </Button>
    </div>
  );

  return container ? createPortal(content, container) : content;
}
