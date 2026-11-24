/**
 * AgentBehaviorHelpScreen — Educational screen for the 6 agent behaviors (US3).
 * List-detail layout: selectable card grid on the left, detail panel on the right.
 */
import { useState } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { HelpScreenLayout } from '../components/help/HelpScreenLayout';
import { SelectableCardGrid } from '../components/help/SelectableCardGrid';
import { DetailPanel } from '../components/help/DetailPanel';
import { agentBehaviorHelpItems } from '../data/agentBehaviorHelp';

const TITLE = 'What is agent behavior?';
const SUBTITLE =
  "Agent behavior describes how the agent operates - the actions it takes, the decisions it makes, and how it interacts with people, data, or systems.";

interface AgentBehaviorHelpScreenProps {
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
 * Shows 6 agent behavior cards in a selectable 2x3 grid (left) and a detail panel (right).
 * The selected card drives what is shown in the detail panel.
 */
export function AgentBehaviorHelpScreen({
  onReturnToDashboard,
}: AgentBehaviorHelpScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const styles = useStyles();

  const selectedItem = agentBehaviorHelpItems[selectedIndex];

  const gridItems = agentBehaviorHelpItems.map((item) => ({
    name: item.name,
    description: `This ${item.definition.charAt(0).toLowerCase()}${item.definition.slice(1)}`,
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
            heading={selectedItem.name}
            exampleText={selectedItem.example}
            listLabel="Common agent types"
            listItems={selectedItem.commonAgentTypes}
            storyUrl={selectedItem.customerStoryUrl}
          />
        </div>
      </div>
    </HelpScreenLayout>
  );
}

export default AgentBehaviorHelpScreen;
