/**
 * DeclarativeAgentDialog — Parent dialog for the declarative agent edit-and-download flow.
 *
 * Manages a 3-step state machine:
 *   1. Build Option Dialog — shows description + 3 CompoundButtons
 *   2. Edit Template Form — editable fields pre-populated from ZIP manifest
 *   3. Download Complete — Back + Done after ZIP download
 *
 * Owns the ZIP lifecycle (pre-fetch on mount) and form state (lifted from
 * edit form per react-reviewer recommendation for Back navigation persistence).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogSurface,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import JSZip from 'jszip';
import { useClient } from '../provider/AgentLibraryProvider';
import { resolveTemplateZipBase64 } from '../services/SolutionZipService';
import {
  parseManifest,
  buildModifiedManifest,
  createAndDownload,
} from '../services/DeclarativeAgentService';
import type { AgentTemplate } from '../contracts/types';
import type {
  DeclarativeDialogStep,
  DeclarativeAgentManifest,
  DeclarativeEditFormState,
} from '../contracts/declarative-agent';
import { DeclarativeBuildOptionDialog } from './DeclarativeBuildOptionDialog';
import { DeclarativeEditForm } from './DeclarativeEditForm';
import { DeclarativeDownloadComplete } from './DeclarativeDownloadComplete';
import { DeclarativeAgentBuilderView } from './DeclarativeAgentBuilderView';
import { DeclarativeVsCodeView } from './DeclarativeVsCodeView';
import { DeclarativeLoadingDialog } from './DeclarativeLoadingDialog';

interface DeclarativeAgentDialogProps {
  item: AgentTemplate;
  onClose: () => void;
  /** When true, the dialog starts on the loading step and auto-advances to the
   *  Edit Form once the ZIP/manifest are ready (skipping Build Options).
   *  Used for deep-link entries (host app passed `templateId`). */
  deepLinkMode?: boolean;
}

const useStyles = makeStyles({
  surface: {
    borderRadius: '16px',
    boxShadow: tokens.shadow64,
    padding: '24px',
    maxWidth: '839px',
    width: '839px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
});

/** Build initial form state from a parsed manifest */
function initFormState(manifest: DeclarativeAgentManifest): DeclarativeEditFormState {
  // Whether any capability has SharePoint URLs configured (those render as editable text fields)
  const hasSharePoint = manifest.capabilities.some(
    (cap) => Array.isArray(cap.items_by_url) && cap.items_by_url.length > 0,
  );

  // Build capabilities purely from the manifest (preserving order).
  // Exclude capabilities that:
  //   - carry items_by_url (SharePoint-type, handled via URL input fields)
  //   - are OneDriveAndSharePoint when SharePoint URLs are configured (shown as
  //     editable text instead, so the toggle would be redundant/confusing)
  const capabilities: Record<string, boolean> = {};
  for (const cap of manifest.capabilities) {
    if (cap.items_by_url) continue;
    if (hasSharePoint && cap.name === 'OneDriveAndSharePoint') continue;
    capabilities[cap.name] = true;
  }

  // Always start with one empty SharePoint URL field — user fills in their own
  const sharePointUrls: string[] = [''];

  return {
    name: manifest.name,
    description: manifest.description,
    instructions: manifest.instructions,
    capabilities,
    sharePointUrls,
    starters: manifest.conversation_starters ?? [],
    isDownloading: false,
  };
}

export default function DeclarativeAgentDialog({ item, onClose, deepLinkMode = false }: DeclarativeAgentDialogProps) {
  const styles = useStyles();
  const client = useClient();

  // Dialog step — deep links start on the loading step (auto-advance to edit on success)
  const [currentStep, setCurrentStep] = useState<DeclarativeDialogStep>(
    deepLinkMode ? 'loading' : 'options',
  );

  // ZIP lifecycle
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [manifest, setManifest] = useState<DeclarativeAgentManifest | null>(null);
  const [manifestFilename, setManifestFilename] = useState<string | null>(null);
  const [isZipLoading, setIsZipLoading] = useState(true);
  const [zipError, setZipError] = useState<string | null>(null);
  // Bumping this state re-runs the fetch effect (used by the Retry button)
  const [retryCount, setRetryCount] = useState(0);

  // Form state — lifted to parent for Back navigation persistence
  const [formState, setFormState] = useState<DeclarativeEditFormState | null>(null);

  // Derived: hasSharePoint from manifest (useMemo, not useState)
  const hasSharePoint = useMemo(
    () => manifest?.capabilities.some((c) => Array.isArray(c.items_by_url) && c.items_by_url.length > 0) ?? false,
    [manifest],
  );

  // Pre-fetch ZIP on mount with cancellation — retryCount in deps triggers re-run
  useEffect(() => {
    let cancelled = false;
    setIsZipLoading(true);
    setZipError(null);

    (async () => {
      try {
        const base64 = await resolveTemplateZipBase64(client, item);
        if (cancelled) return;

        const zip = await JSZip.loadAsync(base64, { base64: true });
        if (cancelled) return;

        const parsed = await parseManifest(zip);
        if (cancelled) return;

        setZipInstance(zip);
        setManifest(parsed.manifest);
        setManifestFilename(parsed.manifestFilename);
        setFormState(initFormState(parsed.manifest));
      } catch (err) {
        if (!cancelled) {
          setZipError(err instanceof Error ? err.message : 'Failed to download template');
        }
      } finally {
        if (!cancelled) {
          setIsZipLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [client, item.zipUrl, item.getZipBytes, retryCount]);

  // Deep link: auto-advance from 'loading' → 'edit' once the manifest/form are ready
  useEffect(() => {
    if (currentStep === 'loading' && formState && manifest && !isZipLoading && !zipError) {
      setCurrentStep('edit');
    }
  }, [currentStep, formState, manifest, isZipLoading, zipError]);

  const handleRetry = useCallback(() => {
    setRetryCount((n) => n + 1);
  }, []);

  // Form change handler
  const handleFormChange = useCallback((updates: Partial<DeclarativeEditFormState>) => {
    setFormState((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // Download handler — modify ZIP and trigger download
  const handleDownload = useCallback(async () => {
    if (!zipInstance || !manifest || !manifestFilename || !formState) return;

    handleFormChange({ isDownloading: true });

    try {
      // Filter out empty/incomplete starter prompts — only include rows with both title and text
      const nonEmptyStarters = formState.starters.filter(
        (s) => s.title.trim() !== '' && s.text.trim() !== '',
      );

      const editedManifest = buildModifiedManifest(manifest, {
        name: formState.name,
        description: formState.description,
        instructions: formState.instructions,
        capabilities: formState.capabilities,
        sharePointUrls: formState.sharePointUrls,
        starters: nonEmptyStarters,
        hasSharePoint,
      });

      await createAndDownload({
        zipInstance,
        manifestFilename,
        editedManifest,
        templateName: formState.name,
        iconDataUrl: formState.iconDataUrl,
      });

      setCurrentStep('download');
    } catch (err) {
      console.error('[DeclarativeAgentDialog] Create failed:', err);
    } finally {
      handleFormChange({ isDownloading: false });
    }
  }, [zipInstance, manifest, manifestFilename, formState, hasSharePoint, handleFormChange]);

  // Sibling-conditional fragment (not a single root Dialog) is intentional:
  // forces React to unmount the loading Dialog and mount a fresh one on
  // auto-advance, so Fluent's focus trap re-initializes against the edit
  // form's focusable elements. Without this, deep-linked dialogs trap-engage
  // against the empty loading view and inputs never receive focus.
  return (
    <>
      {currentStep === 'loading' && (
        <Dialog key="da-loading" open>
          <DialogSurface className={styles.surface}>
            <DeclarativeLoadingDialog
              template={item}
              zipError={zipError}
              onRetry={handleRetry}
            />
          </DialogSurface>
        </Dialog>
      )}
      {currentStep !== 'loading' && (
        <Dialog key="da-main" open>
          <DialogSurface className={styles.surface}>
            {currentStep === 'options' && (
              <DeclarativeBuildOptionDialog
                template={item}
                isZipLoading={isZipLoading}
                zipError={zipError}
                onEditTemplate={() => setCurrentStep('edit')}
                onAgentBuilder={() => {
                  // Open setup guide in new tab, noopener+noreferrer keeps focus in current tab
                  if (item.setupGuideUrl) {
                    window.open(item.setupGuideUrl, '_blank', 'noopener,noreferrer');
                  }
                  setCurrentStep('agent-builder');
                }}
                onVsCode={() => {
                  if (item.setupGuideUrl) {
                    window.open(item.setupGuideUrl, '_blank', 'noopener,noreferrer');
                  }
                  setCurrentStep('vs-code');
                }}
                onDismiss={onClose}
              />
            )}

            {currentStep === 'edit' && formState && (
              <DeclarativeEditForm
                template={item}
                hasSharePoint={hasSharePoint}
                formState={formState}
                onFormChange={handleFormChange}
                onBack={() => setCurrentStep('options')}
                onDownloadClick={() => void handleDownload()}
                onDismiss={onClose}
              />
            )}

            {currentStep === 'download' && (
              <DeclarativeDownloadComplete
                template={item}
                agentName={formState?.name ?? item.name}
                onBack={() => setCurrentStep('edit')}
                onDone={onClose}
                onDismiss={onClose}
              />
            )}

            {currentStep === 'agent-builder' && (
              <DeclarativeAgentBuilderView
                template={item}
                onBack={() => setCurrentStep('options')}
                onDismiss={onClose}
              />
            )}

            {currentStep === 'vs-code' && (
              <DeclarativeVsCodeView
                template={item}
                onBack={() => setCurrentStep('options')}
                onDismiss={onClose}
              />
            )}
          </DialogSurface>
        </Dialog>
      )}
    </>
  );
}
