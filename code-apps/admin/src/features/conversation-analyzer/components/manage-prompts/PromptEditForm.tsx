/** Create / edit form for a custom prompt (MP-4, MP-5) with a 4,000-character limit. */

import { Field, Input, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { MAX_PROMPT_LENGTH } from '../../contracts/constants';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  textarea: { minHeight: '220px' },
  counter: { display: 'block', textAlign: 'right', color: tokens.colorNeutralForeground3 },
  counterOver: { color: tokens.colorPaletteRedForeground1 },
});

interface PromptEditFormProps {
  displayName: string;
  userPrompt: string;
  onDisplayNameChange: (value: string) => void;
  onUserPromptChange: (value: string) => void;
  nameError?: string;
  disabled?: boolean;
}

export function PromptEditForm({
  displayName, userPrompt, onDisplayNameChange, onUserPromptChange, nameError, disabled,
}: PromptEditFormProps) {
  const styles = useStyles();
  const length = userPrompt.length;

  return (
    <div className={styles.root}>
      <Field
        label="Prompt name"
        required
        validationState={nameError ? 'error' : 'none'}
        validationMessage={nameError}
        hint={nameError ? undefined : 'Shown in Prompt insights, analysis results and the prompt picker.'}
      >
        <Input
          value={displayName}
          onChange={(_e, d) => onDisplayNameChange(d.value)}
          placeholder="Frustration detection"
          disabled={disabled}
        />
      </Field>
      <Field
        label="Prompt"
        required
        hint={(
          <span className={length >= MAX_PROMPT_LENGTH ? styles.counterOver : styles.counter} aria-live="polite">
            {`${length.toLocaleString()} / ${MAX_PROMPT_LENGTH.toLocaleString()}`}
          </span>
        )}
      >
        <Textarea
          className={styles.textarea}
          value={userPrompt}
          maxLength={MAX_PROMPT_LENGTH}
          onChange={(_e, d) => onUserPromptChange(d.value.slice(0, MAX_PROMPT_LENGTH))}
          placeholder="Instructions sent to the AI model along with each conversation transcript."
          resize="vertical"
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
