import { useState } from 'react';
import {
  Button,
  Field,
  Label,
  type LabelProps,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Select,
  Spinner,
  Switch,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import type { KitSettingsVM, TrackedAgentVM } from '../contracts/model-assessment';
import { useKitOptions, useSaveKitSettings } from '../hooks/useKitTests';
import { AssessmentInfo } from './AssessmentInfo';
import { useAssessmentSelectStyles } from '../theme/assessmentSelectStyles';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalS,
  },
  engine: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  prompt: { textAlign: 'left', fontSize: tokens.fontSizeBase300 },
  engineLabel: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground3 },
  engineActive: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  pickers: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  fieldLabel: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS },
});

const PIPELINE_INFO =
  'Kit tests use an Agent Configuration of type Test Automation for this agent with "Pipeline Enabled" '
  + 'turned on.';

export interface AssessmentEngineSectionProps {
  agent: TrackedAgentVM;
  /** An assessment is in progress, so the engine cannot change until it finishes. */
  locked?: boolean;
}

/**
 * Chooses how the agent is assessed when its model changes: the Copilot Studio
 * evaluations or the Copilot Agent Kit tests (never both). Kit mode needs an
 * existing pipeline-enabled Agent Configuration and a Kit test set.
 */
export function AssessmentEngineSection({ agent, locked = false }: AssessmentEngineSectionProps) {
  const styles = useStyles();
  const selectStyles = useAssessmentSelectStyles();
  const saved: KitSettingsVM = agent.kit ?? { enabled: false };
  const [draft, setDraft] = useState<KitSettingsVM>(saved);
  const [syncedFrom, setSyncedFrom] = useState(agent.kit);
  if (syncedFrom !== agent.kit) {
    setSyncedFrom(agent.kit);
    setDraft(saved);
  }

  const options = useKitOptions(agent, true);
  const save = useSaveKitSettings(agent.id);
  const configurations = options.data?.configurations ?? [];
  const testSets = options.data?.testSets ?? [];
  const harness = options.data?.harness ?? false;
  const published = options.data?.published ?? true;

  const update = (next: KitSettingsVM) => {
    setDraft(next);
    save.mutate(next, { onError: () => setDraft(saved) });
  };

  const onEngine = (enabled: boolean) => {
    // Pre-select the only matching configuration / test set so one click is enough.
    const configurationId = draft.configurationId
      ?? (configurations.length === 1 ? configurations[0].id : undefined);
    const testSetId = draft.testSetId ?? (testSets.length === 1 ? testSets[0].id : undefined);
    update({ enabled, configurationId, testSetId });
  };

  const configurationName = configurations.find((c) => c.id === draft.configurationId)?.name;
  const testSetName = testSets.find((t) => t.id === draft.testSetId)?.name;
  const busy = save.isPending || locked;
  const switchHint = locked
    ? 'An assessment is running. You can switch after it finishes.'
    : harness
      ? 'Kit tests support standard agents only, not the Copilot harness.'
      : 'Assess with the Copilot Studio evaluations or the Copilot Agent Kit tests.';

  // The engine can only be chosen when the agent has both kinds of tests.
  const canSwitch = !agent.engines || (agent.engines.copilot && agent.engines.kit);

  return (
    <div className={styles.root}>
      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            Could not save the evaluation settings. Your previous settings are still selected. {save.error.message}
          </MessageBarBody>
        </MessageBar>
      )}
      {canSwitch && (
        <Text className={styles.prompt}>
          This agent has both Copilot Agent Kit tests and Copilot Studio evaluations. Choose which one to run.
        </Text>
      )}
      {canSwitch && <Tooltip relationship="description" content={switchHint}>
        <div className={styles.engine}>
          <Text className={mergeClasses(styles.engineLabel, draft.enabled && styles.engineActive)}>
            Kit evaluation
          </Text>
          <Switch
            aria-label="Assess with Copilot Studio evaluations"
            checked={!draft.enabled}
            disabled={busy || (harness && !draft.enabled)}
            onChange={(_, data) => onEngine(!data.checked)}
          />
          <Text className={mergeClasses(styles.engineLabel, !draft.enabled && styles.engineActive)}>
            Copilot Studio evaluation
          </Text>
          {save.isPending && <Spinner size="extra-tiny" aria-label="Saving" />}
        </div>
      </Tooltip>}

      {draft.enabled && (options.isLoading ? (
        <Spinner size="tiny" label="Loading" />
      ) : options.isError ? (
        <MessageBar intent="error">
          <MessageBarBody>Could not load the Kit Agent Configurations and test sets.</MessageBarBody>
          <MessageBarActions>
            <Button size="small" disabled={options.isFetching} onClick={() => void options.refetch()}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      ) : harness ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            This agent uses the Copilot harness. Kit test automation supports standard agents only.
          </MessageBarBody>
        </MessageBar>
      ) : configurations.length === 0 ? (
        <MessageBar intent="info">
          <MessageBarBody>
            To run Kit tests, create an Agent Configuration (Test Automation) for this agent in Copilot Agent
            Kit and turn on <strong>Pipeline Enabled</strong>.
          </MessageBarBody>
          <MessageBarActions>
            <Button
              size="small"
              icon={<ArrowClockwise20Regular />}
              disabled={options.isFetching}
              onClick={() => void options.refetch()}
            >
              Refresh
            </Button>
          </MessageBarActions>
        </MessageBar>
      ) : (
        <>
          {!published && (
            <MessageBar intent="warning">
              <MessageBarBody>
                This agent has not been published. Kit tests run against the published agent.
              </MessageBarBody>
            </MessageBar>
          )}
          <div className={styles.pickers}>
            <Field
              size="medium"
              required
              label={{
                children: (_: unknown, props: LabelProps) => (
                  <div className={styles.fieldLabel}>
                    <Label {...props}>Agent configuration</Label>
                    <AssessmentInfo content={PIPELINE_INFO} />
                  </div>
                ),
              }}
            >
              <Select
                size="medium"
                className={selectStyles.select}
                value={configurationName ? draft.configurationId : ''}
                disabled={busy}
                onChange={(_, data) =>
                  data.value && update({ ...draft, configurationId: data.value })}
              >
                <option value="" disabled>Select a configuration</option>
                {configurations.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field
              size="medium"
              label="Test set"
              required
              validationState={testSets.length === 0 ? 'warning' : 'none'}
              validationMessage={testSets.length === 0 ? 'Create a test set in Copilot Agent Kit.' : undefined}
            >
              <Select
                size="medium"
                className={selectStyles.select}
                value={testSetName ? draft.testSetId : ''}
                disabled={busy || testSets.length === 0}
                onChange={(_, data) =>
                  data.value && update({ ...draft, testSetId: data.value })}
              >
                <option value="" disabled>Select a test set</option>
                {testSets.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      ))}
      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            {save.error instanceof Error ? save.error.message : 'Could not save the assessment settings.'}
          </MessageBarBody>
          <MessageBarActions>
            <Button size="small" onClick={() => save.mutate(draft)}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      )}
    </div>
  );
}