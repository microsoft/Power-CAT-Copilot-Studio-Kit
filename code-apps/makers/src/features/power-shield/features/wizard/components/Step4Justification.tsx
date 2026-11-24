import { useState } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { ArrowLeft20Regular, ArrowRight20Regular, Eye20Regular, Dismiss16Regular } from '@fluentui/react-icons';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Field,
  Textarea,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';
import { CancelWizardDialog } from './CancelWizardDialog';
import { SaveDraftButton } from './SaveDraftButton';
import { DocumentPreviewDialog } from '../../../shared/components/DocumentPreviewDialog';
import { formatFileSize } from '../../../shared/utils/fileUtils';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  fileSection:{
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  navRowGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  fileChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalXXS,
  },
});

export function Step4Justification() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { state, dispatch } = useWizard();
  const [justification, setJustification] = useState(state.justification);
  const [hasAttemptedNext, setHasAttemptedNext] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const justificationInvalid = justification.trim().length === 0;
  const showJustificationError = hasAttemptedNext && justificationInvalid;

  function handleJustificationChange(value: string) {
    setJustification(value);
    dispatch({ type: 'SET_JUSTIFICATION', payload: value });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      dispatch({ type: 'SET_DOCUMENT', payload: undefined });
      setFileError(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('File type not allowed. Please upload PDF, DOCX, XLSX, PNG, or JPG.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError('File size exceeds 25 MB limit.');
      e.target.value = '';
      return;
    }

    setFileError(null);
    dispatch({ type: 'SET_DOCUMENT', payload: file });
  }

  function handleNext() {
    setHasAttemptedNext(true);
    console.log('[Wizard Step 4] handleNext — justificationInvalid:', justificationInvalid);
    if (justificationInvalid) return;
    dispatch({ type: 'ADVANCE_STEP', payload: 4 });
    navigate('/new-request/review');
  }


  return (
    <div className={styles.root}>
      <Field
        label="Business justification"
        required
        validationState={showJustificationError ? 'error' : 'none'}
        validationMessage={
          showJustificationError
            ? 'Business justification is required.'
            : undefined
        }
      >
        <Textarea
          value={justification}
          onChange={(_, data) => handleJustificationChange(data.value)}
          placeholder="Explain why your team needs access to these connectors..."
          rows={5}
          resize="vertical"
        />
      </Field>

      <div className={styles.fileSection}>
        <Text weight="semibold">Supporting Document (optional)</Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          PDF, DOCX, XLSX, PNG or JPG - max 25 MB
        </Text>
        {/* ⚡ SPIKE PENDING (research.md R-002): File upload via context.webAPI not yet verified. */}
        <input
          type="file"
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
          onChange={handleFileChange}
        />
        {fileError && (
          <MessageBar intent="error">
            <MessageBarBody>{fileError}</MessageBarBody>
          </MessageBar>
        )}
        {state.supportingDocument && !fileError && (
          <div className={styles.fileChip}>
            <Text size={200}>{state.supportingDocument.name}</Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              ({formatFileSize(state.supportingDocument.size)})
            </Text>
            <Button
              appearance="subtle"
              size="small"
              icon={<Eye20Regular />}
              onClick={() => setPreviewOpen(true)}
              aria-label={`Preview ${state.supportingDocument.name}`}
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<Dismiss16Regular />}
              onClick={() => dispatch({ type: 'SET_DOCUMENT', payload: undefined })}
              aria-label={`Remove ${state.supportingDocument.name}`}
            />
          </div>
        )}
        {state.supportingDocument && !fileError && (
          <DocumentPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            fileName={state.supportingDocument.name}
            mimeType={state.supportingDocument.type}
            file={state.supportingDocument}
          />
        )}
      </div>

      <div className={styles.navRow}>
        <div className={styles.navRowGroup}>
          <Button
            appearance="secondary"
            onClick={() => navigate('/new-request/connectors')}
            icon={<ArrowLeft20Regular />}
          >
            Back
          </Button>
          <CancelWizardDialog />
        </div>
        <div className={styles.navRowGroup}>
          <SaveDraftButton />
          <Button
            appearance="primary"
            onClick={handleNext}
            icon={<ArrowRight20Regular />}
            iconPosition="after"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
