import { useId, useState } from 'react';
import {
  makeStyles,
  shorthands,
  Switch,
  Tab,
  TabList,
  tokens,
} from '@fluentui/react-components';
import {
  MapRegular,
  PuzzlePieceRegular,
} from '@fluentui/react-icons';
import type { AgentComponentSection } from '../../contracts/types';
import { AgentComponentsTab } from './AgentComponentsTab';
import AgentMapTab from './AgentMapTab';

type ComponentView = 'component-map' | 'component-group';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
    boxShadow: tokens.shadow2,
  },
  tabList: {
    flex: '1 1 0',
    minWidth: 0,
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
    boxSizing: 'border-box',
    ...shorthands.padding(tokens.spacingVerticalSNudge, tokens.spacingHorizontalM, 0),
    '& [role="tab"]': {
      minHeight: 'unset',
    },
  },
  tabBar: {
    minHeight: '45px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  rawSwitch: {
    flex: '0 0 auto',
  },
  panel: {
    minWidth: 0,
  },
  listPanel: {
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
});

interface ComponentsTabProps {
  sections: AgentComponentSection[];
  agentName: string;
}

/** Combine component list and map presentations under nested tabs. */
export default function ComponentsTab({ sections, agentName }: ComponentsTabProps) {
  const styles = useStyles();
  const [selectedView, setSelectedView] = useState<ComponentView>('component-map');
  const [raw, setRaw] = useState(false);
  const mapTabId = useId();
  const groupTabId = useId();
  const panelId = useId();

  return (
    <div className={styles.root}>
      <div className={styles.tabBar}>
        <TabList
          className={styles.tabList}
          selectedValue={selectedView}
          onTabSelect={(_, event) => setSelectedView(event.value as ComponentView)}
          aria-label="Component views"
        >
          <Tab
            id={mapTabId}
            value="component-map"
            icon={<MapRegular />}
            aria-controls={panelId}
          >
            Component map
          </Tab>
          <Tab
            id={groupTabId}
            value="component-group"
            icon={<PuzzlePieceRegular />}
            aria-controls={panelId}
          >
            Component group
          </Tab>
        </TabList>
        {selectedView === 'component-group' && (
          <Switch
            className={styles.rawSwitch}
            label="Raw"
            checked={raw}
            onChange={(_, data) => setRaw(data.checked)}
          />
        )}
      </div>
      <div
        id={panelId}
        className={styles.panel}
        role="tabpanel"
        aria-labelledby={selectedView === 'component-map' ? mapTabId : groupTabId}
      >
        {selectedView === 'component-map'
          ? <AgentMapTab agentName={agentName} sections={sections} />
          : <div className={styles.listPanel}><AgentComponentsTab sections={sections} raw={raw} /></div>}
      </div>
    </div>
  );
}
