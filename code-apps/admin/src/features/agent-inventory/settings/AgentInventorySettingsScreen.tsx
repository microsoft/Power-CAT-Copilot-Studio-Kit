import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Body1,
  Button,
  Caption1,
  Dropdown,
  Field,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  Title2,
  Toast,
  ToastBody,
  ToastTitle,
  Toaster,
  makeStyles,
  tokens,
  useId,
  useToastController,
} from '@fluentui/react-components';
import {
  ArrowLeft24Regular,
  Dismiss20Regular,
  Info16Regular,
  Save20Regular,
} from '@fluentui/react-icons';
import type {
  EnvironmentGroup,
  SettingsDraft,
  SettingsPageData,
} from './contracts/types';
import {
  AGENT_TYPE_OPTIONS,
  ENVIRONMENT_TYPE_OPTIONS,
} from './contracts/types';
import { createDraft, draftEqual } from './utils/settingsUtils';
import {
  useEnvironmentGroupMutations,
  useSaveSettings,
  useSettingsData,
} from './hooks/useSettingsData';
import { DeleteEnvironmentGroupDialog } from './components/DeleteEnvironmentGroupDialog';
import { EnvironmentGroupDrawer } from './components/EnvironmentGroupDrawer';
import { EnvironmentGroupsCard } from './components/EnvironmentGroupsCard';
import { SettingsSectionCard } from './components/SettingsSectionCard';
import { PageLoader } from '../../../shared/components/PageLoader';
import { AgentInventoryBackButton } from '../components/AgentInventoryBackButton';

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: '1440px',
    boxSizing: 'border-box',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalXXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingInlineStart: 'clamp(16px, 5.56vw, 80px)',
    paddingInlineEnd: 'clamp(16px, 5.56vw, 80px)',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: tokens.spacingVerticalXXS,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  pageIntro: {
    display: 'flex',
    flexDirection: 'column',
  },
  pageHeading: {
    margin: 0,
  },
  pageDescription: {
    marginLeft: '52px',
  },
  backButton: {
    minWidth: '44px',
    minHeight: '44px',
    color: tokens.colorBrandForeground1,
  },
  selector: {
    width: '100%',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (min-width: 900px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  guidance: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  guidanceIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  optionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  switchRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    width: '100%',
    minHeight: '44px',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  switchCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalXXS,
  },
  switchDescription: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  actionBar: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    '@media (max-width: 479px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  actionStatus: {
    marginRight: 'auto',
    color: tokens.colorNeutralForeground3,
  },
  optionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalL,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load Agent Inventory settings.';
}

function assembleData(
  settings: NonNullable<ReturnType<typeof useSettingsData>['settingsQuery']['data']>,
  groups: NonNullable<ReturnType<typeof useSettingsData>['groupsQuery']['data']>,
  environments: NonNullable<ReturnType<typeof useSettingsData>['environmentsQuery']['data']>,
  processes: NonNullable<ReturnType<typeof useSettingsData>['processesQuery']['data']>,
): SettingsPageData {
  return { settings, groups, environments, processes };
}

export default function AgentInventorySettingsScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const queries = useSettingsData();
  const saveMutation = useSaveSettings();
  const groupMutations = useEnvironmentGroupMutations();
  const toasterId = useId('agent-inventory-settings-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const [baseline, setBaseline] = useState<SettingsPageData>();
  const [draft, setDraft] = useState<SettingsDraft>();
  const [editingGroup, setEditingGroup] = useState<EnvironmentGroup>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState<EnvironmentGroup>();
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loading = queries.settingsQuery.isLoading
    || queries.groupsQuery.isLoading
    || queries.environmentsQuery.isLoading
    || queries.processesQuery.isLoading;
  const queryError = queries.settingsQuery.error
    ?? queries.groupsQuery.error
    ?? queries.environmentsQuery.error
    ?? queries.processesQuery.error;
  const groupMutationPending = groupMutations.create.isPending
    || groupMutations.update.isPending
    || groupMutations.remove.isPending;
  const mutationPending = saveMutation.isPending || groupMutationPending;

  useEffect(() => {
    if (
      baseline
      || !queries.settingsQuery.data
      || !queries.groupsQuery.data
      || !queries.environmentsQuery.data
      || !queries.processesQuery.data
    ) return;
    const data = assembleData(
      queries.settingsQuery.data,
      queries.groupsQuery.data,
      queries.environmentsQuery.data,
      queries.processesQuery.data,
    );
    // Seed the editable draft once after the four independent server queries complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBaseline(data);
    setDraft(createDraft(data));
  }, [
    baseline,
    queries.environmentsQuery.data,
    queries.groupsQuery.data,
    queries.processesQuery.data,
    queries.settingsQuery.data,
  ]);

  const initialDraft = useMemo(() => baseline ? createDraft(baseline) : undefined, [baseline]);
  const dirty = Boolean(draft && initialDraft && !draftEqual(draft, initialDraft));
  const contentReady = Boolean(baseline && draft);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Agent Sync Configuration | Copilot Studio Kit';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (contentReady) {
      headingRef.current?.focus();
    }
  }, [contentReady]);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const updateSettings = (changes: Partial<SettingsDraft['settings']>) => {
    setDraft((current) => current
      ? { ...current, settings: { ...current.settings, ...changes } }
      : current);
  };

  const leavePage = () => {
    if (!dirty || window.confirm('Discard unsaved Agent Inventory settings?')) {
      navigate('/agent-inventory');
    }
  };

  const retryLoad = () => {
    void Promise.all([
      queries.settingsQuery.refetch(),
      queries.groupsQuery.refetch(),
      queries.environmentsQuery.refetch(),
      queries.processesQuery.refetch(),
    ]);
  };

  const refreshBaseline = async () => {
    const [settings, groups, environments, processes] = await Promise.all([
      queries.settingsQuery.refetch(),
      queries.groupsQuery.refetch(),
      queries.environmentsQuery.refetch(),
      queries.processesQuery.refetch(),
    ]);
    if (!settings.data || !groups.data || !environments.data || !processes.data) {
      throw new Error('Saved values could not be reloaded.');
    }
    const data = assembleData(settings.data, groups.data, environments.data, processes.data);
    setBaseline(data);
    setDraft(createDraft(data));
    return data;
  };

  const handleSave = async () => {
    if (!baseline || !draft) return;
    const desiredDraft = draft;
    setSaveErrors([]);
    setSaving(true);
    try {
      const result = await saveMutation.mutateAsync({ baseline, draft });
      const refreshed = await refreshBaseline();
      const failures = result.operations
        .filter((item) => item.status === 'failed')
        .map((item) => `${item.label}: ${item.message ?? 'Save failed.'}`);
      if (failures.length > 0) {
        const refreshedDraft = createDraft(refreshed);
        const failedKeys = new Set(
          result.operations.filter((item) => item.status === 'failed').map((item) => item.key),
        );
        if (failedKeys.has('settings')) {
          refreshedDraft.settings = desiredDraft.settings;
          refreshedDraft.usageEnabled = desiredDraft.usageEnabled;
        }
        for (const key of failedKeys) {
          if (!key.startsWith('group:')) continue;
          const id = key.slice('group:'.length);
          const desiredEnabled = desiredDraft.enabledGroupIds.includes(id);
          refreshedDraft.enabledGroupIds = desiredEnabled
            ? [...new Set([...refreshedDraft.enabledGroupIds, id])]
            : refreshedDraft.enabledGroupIds.filter((value) => value !== id);
        }
        if ([...failedKeys].some((key) => key.startsWith('process:'))) {
          const failedProcesses = baseline.processes.filter((process) => failedKeys.has(`process:${process.id}`));
          if (failedProcesses.some((process) => process.name.includes('Agents Data Load Scheduler'))) {
            refreshedDraft.autoSyncEnabled = desiredDraft.autoSyncEnabled;
          }
          if (failedProcesses.some((process) => process.name.includes('Usage Data Load'))) {
            refreshedDraft.usageEnabled = desiredDraft.usageEnabled;
          }
        }
        setDraft(refreshedDraft);
      }
      setSaveErrors(failures);
      dispatchToast(
        <Toast>
          <ToastTitle>{result.succeeded ? 'Settings saved' : 'Settings partially saved'}</ToastTitle>
          <ToastBody>
            {result.succeeded ? 'Agent Inventory settings are up to date.' : 'Review the failed operations shown on the page.'}
          </ToastBody>
        </Toast>,
        { intent: result.succeeded ? 'success' : 'error' },
      );
    } catch (error) {
      const message = errorMessage(error);
      setSaveErrors([message]);
      dispatchToast(
        <Toast>
          <ToastTitle>Settings could not be saved</ToastTitle>
          <ToastBody>{message}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleGroupSave = async (input: Parameters<typeof groupMutations.save>[0]) => {
    if (!baseline) return;
    try {
      await groupMutations.save(input);
      const refreshed = await queries.groupsQuery.refetch();
      if (!refreshed.data) throw new Error('The saved environment groups could not be reloaded.');
      const validIds = new Set(refreshed.data.map((group) => group.id));
      setBaseline((current) => current ? { ...current, groups: refreshed.data } : current);
      setDraft((current) => current
        ? { ...current, enabledGroupIds: current.enabledGroupIds.filter((id) => validIds.has(id)) }
        : current);
      setDrawerOpen(false);
      setEditingGroup(undefined);
    } catch (error) {
      setSaveErrors([errorMessage(error)]);
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup || !baseline) return;
    try {
      await groupMutations.remove.mutateAsync(deleteGroup.id);
      const refreshed = await queries.groupsQuery.refetch();
      if (!refreshed.data) throw new Error('The remaining environment groups could not be reloaded.');
      setBaseline((current) => current ? { ...current, groups: refreshed.data } : current);
      setDraft((current) => current
        ? { ...current, enabledGroupIds: current.enabledGroupIds.filter((id) => id !== deleteGroup.id) }
        : current);
      setDeleteGroup(undefined);
    } catch (error) {
      setSaveErrors([errorMessage(error)]);
    }
  };

  if (queryError) {
    return (
      <main className={styles.root}>
        <AgentInventoryBackButton
          onClick={() => navigate('/agent-inventory')}
        />
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Agent sync configuration could not be loaded.</MessageBarTitle>
            {errorMessage(queryError)}
          </MessageBarBody>
          <MessageBarActions>
            <Button appearance="transparent" onClick={retryLoad} disabled={loading}>
              {loading ? 'Retrying...' : 'Retry'}
            </Button>
          </MessageBarActions>
        </MessageBar>
      </main>
    );
  }

  if (!baseline || !draft) {
    return <PageLoader ariaLabel="Loading agent sync configuration" />;
  }

  return (
    <main className={styles.root}>
      <Toaster toasterId={toasterId} position="top-end" />
      <div className={styles.pageIntro}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <Button
              className={styles.backButton}
              appearance="transparent"
              icon={<ArrowLeft24Regular />}
              aria-label="Back to Agent Inventory"
              onClick={leavePage}
            />
            <h1 ref={headingRef} tabIndex={-1} className={styles.pageHeading}>
              <Title2 as="span">Agent sync configuration</Title2>
            </h1>
          </div>
          <Body1 className={styles.pageDescription}>
            Configure how Agent Inventory discovers and syncs agents across your tenant.
          </Body1>
        </header>
      </div>

      {saveErrors.length > 0 && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Some settings could not be saved.</MessageBarTitle>
            {saveErrors.join(' ')}
          </MessageBarBody>
          <MessageBarActions
            containerAction={(
              <Button
                appearance="transparent"
                icon={<Dismiss20Regular />}
                aria-label="Dismiss save errors"
                onClick={() => setSaveErrors([])}
              />
            )}
          />
        </MessageBar>
      )}

      <div className={styles.settingsGrid}>
        <SettingsSectionCard
          title="Environment types"
          description="Select which environment types to include in agent discovery."
        >
          <Field label="Included environment types">
            <Dropdown
              className={styles.selector}
              multiselect
              inlinePopup
              value={draft.settings.environmentTypeValues.length === 0
                ? 'All environment types (default)'
                : `${draft.settings.environmentTypeValues.length} selected`}
              selectedOptions={draft.settings.environmentTypeValues.map(String)}
              onOptionSelect={(_, data) => updateSettings({ environmentTypeValues: data.selectedOptions.map(Number) })}
              aria-describedby="environment-types-guidance"
            >
              {ENVIRONMENT_TYPE_OPTIONS.map((option) => (
                <Option key={option.value} value={String(option.value)}>{option.label}</Option>
              ))}
            </Dropdown>
          </Field>
          <div className={styles.guidance} id="environment-types-guidance">
            <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
            <Caption1>
              <strong>No selection includes every environment type.</strong>{' '}
              Otherwise, only the selected types are scanned.
            </Caption1>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Agent types"
          description="Choose which types of agents to include in inventory sync."
        >
          <Field label="Included agent types">
            <Dropdown
              className={styles.selector}
              multiselect
              inlinePopup
              value={draft.settings.agentTypeValues.length === 0
                ? 'All agent types (default)'
                : `${draft.settings.agentTypeValues.length} selected`}
              selectedOptions={draft.settings.agentTypeValues.map(String)}
              onOptionSelect={(_, data) => updateSettings({ agentTypeValues: data.selectedOptions.map(Number) })}
              aria-describedby="agent-types-guidance"
            >
              {AGENT_TYPE_OPTIONS.map((option) => (
                <Option key={option.value} value={String(option.value)}>{option.label}</Option>
              ))}
            </Dropdown>
          </Field>
          <div className={styles.guidance} id="agent-types-guidance">
            <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
            <Caption1>
              <strong>No selection includes every agent type.</strong>{' '}
              Otherwise, only the selected types are included.
            </Caption1>
          </div>
        </SettingsSectionCard>
      </div>

      <EnvironmentGroupsCard
        groups={baseline.groups}
        enabledGroupIds={draft.enabledGroupIds}
        disabled={mutationPending}
        onEnabledChange={(ids) => setDraft({ ...draft, enabledGroupIds: ids })}
        onCreate={() => { setEditingGroup(undefined); setDrawerOpen(true); }}
        onEdit={(group) => { setEditingGroup(group); setDrawerOpen(true); }}
        onDelete={setDeleteGroup}
      />

      <div className={styles.settingsGrid}>
        <SettingsSectionCard
          title="Inventory options"
          description="Choose which additional agent information to collect."
        >
          <div className={styles.optionStack}>
            <div className={styles.switchRow}>
              <span className={styles.switchCopy}>
                <Body1>Exclude system agents</Body1>
                <span className={styles.switchDescription} id="exclude-system-agents-description">
                  <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
                  <Caption1>Skip Microsoft-provided system agents during synchronization.</Caption1>
                </span>
              </span>
              <Switch
                checked={draft.settings.excludeSystemAgents}
                onChange={(_, data) => updateSettings({ excludeSystemAgents: data.checked })}
                aria-label="Exclude system agents"
                aria-describedby="exclude-system-agents-description"
              />
            </div>
            <div className={styles.optionSection}>
              <div className={styles.switchRow}>
                <span className={styles.switchCopy}>
                  <Body1>Enable AI-generated description for GitHub Copilot agents</Body1>
                  <span className={styles.switchDescription} id="ai-generated-description-description">
                    <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
                    <Caption1>Use AI to generate description for GitHub Copilot agent in the agent details page.</Caption1>
                  </span>
                </span>
                <Switch
                  checked={draft.settings.aiGeneratedDescription}
                  onChange={(_, data) => updateSettings({ aiGeneratedDescription: data.checked })}
                  aria-label="Enable AI-generated description for GitHub Copilot agents"
                  aria-describedby="ai-generated-description-description"
                />
              </div>
            </div>
            <div className={styles.optionSection}>
              <div className={styles.switchRow}>
                <span className={styles.switchCopy}>
                  <Body1>Include usage metrics</Body1>
                  <span className={styles.switchDescription} id="usage-metrics-description">
                    <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
                    <Caption1>Fetch 180-day usage data during synchronization.</Caption1>
                  </span>
                </span>
                <Switch
                  checked={draft.usageEnabled}
                  onChange={(_, data) => setDraft({
                    ...draft,
                    usageEnabled: data.checked,
                    settings: { ...draft.settings, enableUsage: data.checked },
                  })}
                  aria-label="Include usage metrics"
                  aria-describedby="usage-metrics-description"
                />
              </div>
            </div>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Sync schedule"
          description="Configure the data source and automatic synchronization."
        >
          <div className={styles.optionStack}>
            <Field label="Data collection mode">
              <RadioGroup
                className={styles.radioGroup}
                value={draft.settings.oneInventory ? 'one' : 'standard'}
                onChange={(_, data) => updateSettings({ oneInventory: data.value === 'one' })}
              >
                <Radio value="one" label="One Inventory (Power Platform admin center)" />
                <Radio value="standard" label="Standard (environments only)" />
              </RadioGroup>
            </Field>
            <div className={styles.guidance}>
              <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
              <Caption1>
                One inventory mode retrieves data from the environments and admin center for richer metadata.
                {' '}Standard mode retrieves data from the environments only.
              </Caption1>
            </div>
            <div className={styles.optionSection}>
              <div className={styles.switchRow}>
                <span className={styles.switchCopy}>
                  <Body1>Enable daily automatic sync</Body1>
                  <span className={styles.switchDescription} id="automatic-sync-description">
                    <Info16Regular className={styles.guidanceIcon} aria-hidden="true" />
                    <Caption1>Refresh agent inventory automatically every day.</Caption1>
                  </span>
                </span>
                <Switch
                  checked={draft.autoSyncEnabled}
                  onChange={(_, data) => setDraft({ ...draft, autoSyncEnabled: data.checked })}
                  aria-label="Enable daily automatic sync"
                  aria-describedby="automatic-sync-description"
                />
              </div>
            </div>
          </div>
        </SettingsSectionCard>
      </div>

      <div className={styles.actionBar}>
        {dirty && (
          <Body1 className={styles.actionStatus} role="status" aria-live="polite">
            You have unsaved changes.
          </Body1>
        )}
        <Button
          appearance="primary"
          icon={saving ? <Spinner size="tiny" /> : <Save20Regular />}
          onClick={() => { void handleSave(); }}
          disabled={!dirty || mutationPending || saving}
        >
          {saving ? 'Saving' : 'Save'}
        </Button>
        <Button appearance="secondary" onClick={leavePage} disabled={mutationPending || saving}>
          Cancel
        </Button>
      </div>

      <EnvironmentGroupDrawer
        open={drawerOpen}
        group={editingGroup}
        groups={baseline.groups}
        environments={baseline.environments}
        isSaving={mutationPending}
        error={(groupMutations.create.error ?? groupMutations.update.error)?.message}
        onClose={() => { setDrawerOpen(false); setEditingGroup(undefined); }}
        onSave={(input) => { void handleGroupSave(input); }}
      />
      <DeleteEnvironmentGroupDialog
        group={deleteGroup}
        isDeleting={groupMutations.remove.isPending}
        onCancel={() => setDeleteGroup(undefined)}
        onConfirm={() => { void handleDelete(); }}
      />
    </main>
  );
}
