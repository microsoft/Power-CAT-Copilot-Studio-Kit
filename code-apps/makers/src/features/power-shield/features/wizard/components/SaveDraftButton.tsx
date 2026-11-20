import { useState, useRef } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Text,
} from '@fluentui/react-components';
import { Save20Regular } from '@fluentui/react-icons';
import { useWizard } from './WizardShell';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import { saveDraft } from '../../../shared/services/dataverse/wizardSubmitService';
import { SavingOverlay } from './SavingOverlay';
import type { RequestAnswerCreate } from '../../../models/requestAnswer';

interface SaveDraftButtonProps {
  disabled?: boolean;
}

/**
 * Reusable "Save Draft" button for all wizard steps.
 * Shows a confirmation dialog, then a full-screen overlay while persisting
 * the current wizard state to Dataverse as a Draft record.
 */
export function SaveDraftButton({ disabled }: SaveDraftButtonProps) {
  const { state, dispatch } = useWizard();
  const { aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Ref-based guard prevents concurrent saves from fast double-clicks
  // (React state batching means isSaving may not disable the button immediately)
  const savingRef = useRef(false);

  async function handleConfirmSave() {
    if (savingRef.current) return;
    if (!state.serviceTreeId || state.selectedEnvironments.length === 0) {
      notifyError('Complete Step 1 before saving draft.');
      setOpen(false);
      return;
    }

    // Close dialog first, then show full-screen overlay
    setOpen(false);
    setIsSaving(true);
    savingRef.current = true;

    try {
      // Map wizard answers to the create payload format
      const answers: RequestAnswerCreate[] = state.answers
        .filter((a) => a.answerValue !== '')
        .map((a) => ({
          policyRequestId: '', // Filled by service
          questionId: a.questionId,
          answerValue: a.answerValue,
          questionTextSnapshot: a.questionText,
        }));

      const result = await saveDraft({
        serviceTreeId: state.serviceTreeId,
        createdByAadObjectId: aadObjectId,
        createdByUpn: upn,
        justification: state.justification,
        environments: state.selectedEnvironments.map((e) => ({
          environmentId: e.environmentId,
          displayName: e.displayName,
        })),
        connectors: state.selectedConnectors.map((c) => ({
          connectorId: c.connectorId,
          displayName: c.displayName,
          connectorKey: c.connectorKey,
          connectorDetailsUrl: c.connectorDetailsUrl,
        })),
        connectorActionOverrides: state.connectorActionOverrides,
        customConnectorPatterns: state.customConnectorPatterns.map((p) => ({
          hostUrlPattern: p.hostUrlPattern,
          dataGroup: p.dataGroup,
          order: p.order,
        })),
        answers,
        participants: state.participants,
        supportingDocument: state.supportingDocument,
        draftRequestId: state.draftRequestId,
        environmentGroupId: state.selectedEnvironmentGroupId,
      });

      // Update draftRequestId in wizard state so subsequent saves use edit mode
      dispatch({
        type: 'LOAD_DRAFT',
        payload: { ...state, draftRequestId: result.requestId },
      });

      notifySuccess(`Draft saved (${result.requestNumber}).`);
      navigate(`/requests/${result.requestId}`, { state: { bypassGuard: true } });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <>
      <SavingOverlay visible={isSaving} />
      <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
        <DialogTrigger disableButtonEnhancement>
          <Button
            appearance="outline"
            icon={<Save20Regular />}
            disabled={disabled || isSaving}
          >
            Save Draft
          </Button>
        </DialogTrigger>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Save as Draft?</DialogTitle>
            <DialogContent>
              <Text>
                Your request will be saved as a draft. You can resume it later from the Home screen or Request Detail page.
              </Text>
              <br /><br />
              <Text weight="semibold">
                Note: Only one active request per Service Tree is allowed.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                onClick={() => void handleConfirmSave()}
              >
                Save Draft
              </Button>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
