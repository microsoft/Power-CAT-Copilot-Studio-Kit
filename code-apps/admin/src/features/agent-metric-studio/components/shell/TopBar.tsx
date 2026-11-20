import { useState } from 'react';
import {
  makeStyles, tokens, Text, Button,
  TabList, Tab, Tooltip, Caption1,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Spinner,
} from '@fluentui/react-components';
import {
  ArrowLeft20Regular, CompassNorthwest20Regular, Sparkle20Regular, QuestionCircle20Regular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { hasTourForView } from './GuidedTour';
import type { AppView } from '../../types';

const useStyles = makeStyles({
  wrapper: { display: 'flex', flexDirection: 'column' },
  titleBar: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  titleSection: { display: 'flex', flexDirection: 'column', gap: '2px' },
  appTitle: { fontSize: '20px', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  appSubtitle: { color: tokens.colorNeutralForeground3 },
  globalActions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  tabBar: {
    padding: `0 ${tokens.spacingHorizontalL}`,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

const SUGGEST_FEATURE_URL = 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/new?template=feature_request.yml';

interface TopBarProps {
  onStartTour: () => void;
}

export function TopBar({ onStartTour }: TopBarProps) {
  const s = useStyles();
  const view = useAppStore(st => st.view);
  const setView = useAppStore(st => st.setView);
  const layoutDirty = useAppStore(st => st.layoutDirty);
  const currentLayout = useAppStore(st => st.currentLayout);
  const saveLayout = useAppStore(st => st.saveLayout);
  const navigate = useNavigate();

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleBack = () => {
    if (layoutDirty) {
      setShowUnsavedDialog(true);
    } else {
      setShowConfirmDialog(true);
    }
  };

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleDontSave = () => {
    useAppStore.setState({ layoutDirty: false });
    setShowUnsavedDialog(false);
    navigate('/agent-insights-hub');
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await saveLayout(currentLayout.name);
    setSaving(false);
    if (res.ok) {
      setShowUnsavedDialog(false);
      navigate('/agent-insights-hub');
    }
  };

  return (
    <>
    <div className={s.wrapper}>
      {/* Row 0: App title + global actions */}
      <div className={s.titleBar}>
        <div className={s.titleSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Tooltip content="Back to Agent Insights Hub" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowLeft20Regular />}
                onClick={handleBack}
                aria-label="Back to Agent Insights Hub"
              />
            </Tooltip>
            <Text className={s.appTitle}>Dashboard & forecasting</Text>
          </div>
          <Caption1 className={s.appSubtitle}>
            Create custom dashboards and forecasts from your agent metrics.
          </Caption1>
        </div>
        <div className={s.globalActions}>
          <Tooltip content="Opens GitHub to submit a feature request (new tab)" relationship="description">
            <Button
              appearance="outline"
              size="small"
              icon={<Sparkle20Regular />}
              as="a"
              href={SUGGEST_FEATURE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Suggest a feature
            </Button>
          </Tooltip>
          <Tooltip content={hasTourForView(view) ? "Take a guided tour of this view" : "Tour not available for this view"} relationship="description">
            <Button
              appearance="outline"
              size="small"
              icon={<CompassNorthwest20Regular />}
              onClick={onStartTour}
              disabled={!hasTourForView(view)}
            >
              Tour
            </Button>
          </Tooltip>
          <Tooltip content="Opens documentation on GitHub (new tab)" relationship="description">
            <Button
              appearance="subtle"
              size="small"
              icon={<QuestionCircle20Regular />}
              as="a"
              href="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Help"
            />
          </Tooltip>
        </div>
      </div>

      {/* Row 1: Tab navigation */}
      <div className={s.tabBar}>
        <TabList
          size="medium"
          appearance="subtle"
          selectedValue={view}
          onTabSelect={(_, d) => setView(d.value as AppView)}
        >
          <Tab value="dashboard">Dashboards</Tab>
          <Tab value="forecast">Forecast</Tab>
          <Tab value="metric-registry" data-tour-id="tab-metric-registry">Metrics</Tab>
        </TabList>
      </div>
    </div>

      {/* Unsaved changes confirmation when navigating back */}
      <Dialog open={showUnsavedDialog} onOpenChange={(_, d) => { if (!d.open) setShowUnsavedDialog(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogContent>
              You have unsaved changes to <b>{currentLayout.name || 'Untitled dashboard'}</b>. Save them before continuing?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={handleDontSave} disabled={saving}>Don&apos;t save</Button>
              <Button appearance="secondary" onClick={() => setShowUnsavedDialog(false)} disabled={saving}>Cancel</Button>
              <Button appearance="primary" onClick={handleSave} disabled={saving}
                icon={saving ? <Spinner size="extra-tiny" /> : undefined}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* General confirmation when leaving without unsaved changes */}
      <Dialog open={showConfirmDialog} onOpenChange={(_, d) => { if (!d.open) setShowConfirmDialog(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Leave Dashboard & forecasting?</DialogTitle>
            <DialogContent>
              You will be navigated back to the Agent Insights Hub.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
              <Button appearance="primary" onClick={() => { setShowConfirmDialog(false); navigate('/agent-insights-hub'); }}>
                Leave
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
