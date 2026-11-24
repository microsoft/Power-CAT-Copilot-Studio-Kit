import { useRef } from 'react';
import {
  Field,
  Textarea,
  Button,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DocumentRegular, DismissRegular } from '@fluentui/react-icons';
import { useCreditWizard } from '../contexts/CreditWizardContext';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '800px',
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  hiddenInput: {
    display: 'none',
  },
});

/**
 * Step 3 — Justification.
 *
 * One required free-text question ("what are you building, and who will use
 * it?") with a short example, plus at most one optional supporting document.
 * The amount is asked for in step 2, not here.
 */
export function CreditStep3Justification() {
  const styles = useStyles();
  const { state, dispatch } = useCreditWizard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attemptedStep3 = state.attemptedNextSteps.includes(3);
  const justificationError =
    attemptedStep3 && state.justification.trim().length === 0
      ? 'Tell the administrator what you are building and who will use it.'
      : undefined;

  const attachedName = state.supportingDocument?.name ?? state.existingSupportingDocumentName;

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) dispatch({ type: 'SET_DOCUMENT', payload: file });
    // Reset the input so re-selecting the same file still fires onChange.
    e.target.value = '';
  }

  function removeDocument() {
    dispatch({ type: 'SET_DOCUMENT', payload: undefined });
  }

  return (
    <div className={styles.root}>
      <Field
        label="What are you building, and who will use it?"
        required
        hint="Example: A sales-copilot using the Microsoft Copilot harness; ~40 sellers in EU/US during a 6-week pilot."
        validationState={justificationError ? 'error' : 'none'}
        validationMessage={justificationError}
      >
        <Textarea
          resize="vertical"
          rows={5}
          value={state.justification}
          onChange={(_, d) => dispatch({ type: 'SET_JUSTIFICATION', payload: d.value })}
          placeholder="Describe the workload and who it serves."
        />
      </Field>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          className={styles.hiddenInput}
          onChange={handleFileChosen}
        />
        {attachedName ? (
          <div className={styles.docRow}>
            <DocumentRegular />
            <Text>{attachedName}</Text>
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              aria-label="Remove supporting document"
              onClick={removeDocument}
            />
          </div>
        ) : (
          <Button
            appearance="secondary"
            icon={<DocumentRegular />}
            onClick={() => fileInputRef.current?.click()}
          >
            Attach a supporting document (optional)
          </Button>
        )}
      </div>
    </div>
  );
}
