import { useState } from 'react';
import { makeStyles, tokens, Title2, Body1, Badge } from '@fluentui/react-components';
import { FlashRegular } from '@fluentui/react-icons';
import { TrackedAgentsPanel } from './components/TrackedAgentsPanel';
import { ChangeTimeline } from './components/ChangeTimeline';
import { AllAgentsAuditView } from './components/AllAgentsAuditView';
import { useLocalPreviewMode, useTrackingConfigs } from './hooks/useChangeTracker';
import { type TrackingConfig } from './contracts/change-tracker';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    // Fill the window, but don't lock to it. `minHeight` lets the card stretch
    // to the full height when content is short (so no dead space below it),
    // while still allowing the page to grow and let the document scroll when
    // content is tall — a fixed `height: 100vh` overflows inside the Power
    // Apps host, which renders its own chrome above the app.
    minHeight: '100vh',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    gap: tokens.spacingVerticalM,
    boxSizing: 'border-box',
    '@media (min-width: 640px)': {
      paddingLeft: tokens.spacingHorizontalXL,
      paddingRight: tokens.spacingHorizontalXL,
    },
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  title: {
    margin: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  description: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalM,
  },
  body: {
    display: 'flex',
    flex: '1 1 auto',
    minHeight: 0,
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    overflow: 'hidden',
    '@media (max-width: 639px)': {
      flexDirection: 'column',
    },
  },
});

/** Agent Change Tracker — opt agents in and review their change history. */
export default function AgentChangeTrackerPage() {
  useFeatureTelemetry('agent-change-tracker', 'Agent Change Tracker');
  const styles = useStyles();
  const [selected, setSelected] = useState<TrackingConfig | undefined>(undefined);
  const [allAgentsScope, setAllAgentsScope] = useState(false);
  const { data: isLocalPreview } = useLocalPreviewMode();
  const { data: configs } = useTrackingConfigs();

  const selectAgentById = (configId: string) => {
    const match = configs?.find((config) => config.id === configId);
    if (!match) return;
    setAllAgentsScope(false);
    setSelected(match);
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <Title2 as="h1" className={styles.title}>
              Agent Change Tracker
            </Title2>
            {isLocalPreview && (
              <Badge appearance="tint" color="informative" icon={<FlashRegular />}>
                Local preview data
              </Badge>
            )}
          </div>
          <Body1 className={styles.description}>
            Track what changed in your Copilot Studio agents, who changed it, and when — on every save.
          </Body1>
        </div>
      </div>

      <div className={styles.body}>
        <TrackedAgentsPanel
          selectedConfigId={allAgentsScope ? 'all' : selected?.id}
          onSelectAgent={(agent) => {
            setAllAgentsScope(false);
            setSelected(agent);
          }}
          onSelectAllAgents={() => {
            setAllAgentsScope(true);
            setSelected(undefined);
          }}
          onSelectNone={() => {
            // Leaves the right pane on the "No agent selected" prompt, used
            // when a search matches no tracked agent.
            setAllAgentsScope(false);
            setSelected(undefined);
          }}
          onRemoveAgent={(removed) => {
            if (selected?.id === removed.id) setSelected(undefined);
          }}
        />
        {allAgentsScope ? (
          <AllAgentsAuditView configs={configs} onSelectAgent={selectAgentById} />
        ) : (
          <ChangeTimeline agent={selected} />
        )}
      </div>
    </div>
  );
}
