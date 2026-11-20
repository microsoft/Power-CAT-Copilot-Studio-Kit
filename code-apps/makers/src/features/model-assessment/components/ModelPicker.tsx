import {
  Button,
  Field,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Select,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import { sameModel } from '../contracts/model-assessment';
import { useModelPublishFailure, usePreviewModelsEnabled, useUpdateAgentModel } from '../hooks/useModelUpdate';
import { AgentModelPublishError, modelOptionLabel, modelOptionsFor } from '../services/model-update-service';
import { useAssessmentSelectStyles } from '../theme/assessmentSelectStyles';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  select: { maxWidth: '320px' },
  studioHint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  studioLink: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS, fontSize: 'inherit' },
  saving: { justifyContent: 'flex-start' },
});

export interface ModelPickerProps {
  botId: string;
  harness: boolean;
  /** Publish model changes before allowing Kit evaluations. */
  kitMode?: boolean;
  disabled?: boolean;
  /** The agent's model in Copilot Studio now. */
  liveModel?: string;
  /** The agent in Copilot Studio, for models the list does not offer. */
  studioUrl?: string;
}

/** Picks and saves a model, publishing the agent for Kit evaluations only. */
export function ModelPicker({ botId, harness, kitMode = false, disabled = false, liveModel, studioUrl }: ModelPickerProps) {
  const styles = useStyles();
  const selectStyles = useAssessmentSelectStyles();
  const update = useUpdateAgentModel(botId, harness, kitMode);
  const publishFailure = useModelPublishFailure(botId);
  const preview = usePreviewModelsEnabled();
  const allowPreview = preview.data !== false;
  const options = modelOptionsFor(harness, liveModel, allowPreview);
  const selected = update.isPending ? update.variables : options.find((option) => sameModel(option.code, liveModel));
  const error = kitMode
    ? publishFailure ?? update.error
    : update.error instanceof AgentModelPublishError ? undefined : update.error;

  return (
    <div className={styles.root}>
      <Field
        label="Model"
        hint={allowPreview ? undefined : 'Preview and experimental models are turned off for this environment.'}
      >
        <Select
          size="medium"
          className={mergeClasses(selectStyles.select, styles.select)}
          value={selected?.code ?? ''}
          disabled={disabled || update.isPending || preview.isPending}
          onChange={(_, data) => {
            const option = options.find((o) => o.code === data.value);
            if (option && !sameModel(option.code, liveModel)) update.mutate(option);
          }}
        >
          <option value="" disabled>Select a model</option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>{modelOptionLabel(option)}</option>
          ))}
        </Select>
      </Field>
      {update.isPending && (
        <Spinner
          className={styles.saving}
          size="tiny"
          labelPosition="after"
          label={kitMode
            ? 'Please wait while the new model is saved and the agent is published…'
            : 'Please wait while the new model is saved to the agent…'}
        />
      )}
      {studioUrl && (
        <span className={styles.studioHint}>
          Model not found?{' '}
          <Link href={studioUrl} target="_blank" rel="noopener noreferrer" className={styles.studioLink}>
            Open and update this agent<Open16Regular aria-hidden />
          </Link>
          .
        </span>
      )}
      {error && !update.isPending && (
        <MessageBar intent="error">
          <MessageBarBody>{error.message}</MessageBarBody>
          {kitMode && publishFailure && (
            <MessageBarActions>
              <Button disabled={disabled} onClick={() => update.mutate(publishFailure.option)}>Retry publishing</Button>
            </MessageBarActions>
          )}
        </MessageBar>
      )}
    </div>
  );
}
