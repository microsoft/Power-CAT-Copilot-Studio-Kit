/**
 * AgentTypeHelpScreen — Educational screen for the 6 agent types (US2).
 * List-detail layout: selectable card grid on the left, detail panel on the right.
 */
import { useState } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { HelpScreenLayout } from '../components/help/HelpScreenLayout';
import { SelectableCardGrid } from '../components/help/SelectableCardGrid';
import { DetailPanel } from '../components/help/DetailPanel';
import { agentTypeHelpItems } from '../data/agentTypeHelp';

const TITLE = 'What is an agent type?';
const SUBTITLE =
  'Agent type describes the role or identity of an agent — what it\'s designed to do in your organization.';

interface AgentTypeHelpScreenProps {
  onReturnToDashboard: () => void;
}

const useStyles = makeStyles({
  contentArea: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalXXL,
    alignItems: 'flex-start',
  },
  gridColumn: {
    width: '572px',
    flexShrink: 0,
  },
  detailColumn: {
    flex: 1,
    minWidth: 0,
  },
});

/**
 * Shows 6 agent type cards in a selectable 2x3 grid (left) and a detail panel (right).
 * The selected card drives what is shown in the detail panel.
 */
export function AgentTypeHelpScreen({
  onReturnToDashboard,
}: AgentTypeHelpScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const styles = useStyles();

  const selectedItem = agentTypeHelpItems[selectedIndex];

  const gridItems = agentTypeHelpItems.map((item) => ({
    name: item.name,
    description: item.definition,
    example: item.example,
  }));

  // Use the customerExample from .msapp source data
  const customerStory = selectedItem.customerExample;

  return (
    <HelpScreenLayout
      title={TITLE}
      subtitle={SUBTITLE}
      onReturnToDashboard={onReturnToDashboard}
    >
      <div className={styles.contentArea}>
        <div className={styles.gridColumn}>
          <SelectableCardGrid
            items={gridItems}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        </div>
        <div className={styles.detailColumn}>
          <DetailPanel
            customerLogoSrc={selectedItem.customerLogo}
            customerName={selectedItem.customer}
            customerStory={customerStory}
            heading={`Agent type: ${selectedItem.name}`}
            listLabel="Value benefits"
            listItems={selectedItem.valueBenefits}
            storyUrl={selectedItem.customerStoryUrl}
          />
        </div>
      </div>
    </HelpScreenLayout>
  );
}

export default AgentTypeHelpScreen;
