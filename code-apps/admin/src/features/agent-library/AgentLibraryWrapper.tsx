/**
 * AgentLibraryWrapper — provides the AgentLibraryProvider context to the
 * Agent Library source in ./library for the Admin app.
 *
 * Fetches custom agent templates from the `cat_agenttemplate` Dataverse table
 * (all publish statuses — admins manage drafts), merges them with the package's
 * system catalog, and wires the package's authoring dialog to Dataverse via the
 * onCreateTemplate / onUpdateTemplate config callbacks (userRole: 'admin').
 */

import { useState, useEffect } from 'react';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import {
  Spinner,
  MessageBar,
  MessageBarBody,
  Toaster,
  Toast,
  ToastTitle,
  useId,
  useToastController,
} from '@fluentui/react-components';
import { getClient } from '@microsoft/power-apps/data';
import { getContext } from '@microsoft/power-apps/app';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { AgentLibraryProvider, AgentLibraryPage } from './library';
import type { CloudType } from './library';
import { getPowerAutomateEndpointValue } from '../../shared/services/copilotStudioUrl';
import {
  useAgentTemplates,
  useCreateAgentTemplate,
  useUpdateAgentTemplate,
  useDeleteAgentTemplate,
} from './hooks/useAgentTemplates';

const client = getClient(dataSourcesInfo);

const VALID_CLOUD_TYPES: ReadonlySet<CloudType> = new Set<CloudType>([
  'commercial',
  'gcc',
  'gcchigh',
  'gcc(high)',
  'dod',
]);

/** Normalizes a Power Automate endpoint value (e.g. "GCC High") to a CloudType. */
function normalizeCloudType(endpointValue?: string | null): CloudType | undefined {
  const normalized = endpointValue?.replace(/[\s_-]/g, '').toLowerCase();
  return normalized && VALID_CLOUD_TYPES.has(normalized as CloudType)
    ? (normalized as CloudType)
    : 'commercial';
}

interface AppContext {
  environmentId: string;
  userEmail: string;
  /** Optional template GUID from the `?templateId=…` URL param for deep links. */
  templateId?: string;
  cloudType?: CloudType;
}

export default function AgentLibraryWrapper() {
  useFeatureTelemetry('agent-library', 'Agent Library');
  const [appCtx, setAppCtx] = useState<AppContext | null>(null);

  const { data: agentTemplates, isLoading, error } = useAgentTemplates();
  const createTemplate = useCreateAgentTemplate();
  const updateTemplate = useUpdateAgentTemplate();
  const deleteTemplate = useDeleteAgentTemplate();

  // Global Toaster for delete confirmation feedback (admin-app notification
  // pattern — Fluent useToastController + a mounted <Toaster/>, mirroring
  // power-shield's useNotify).
  const toasterId = useId('agent-library-toaster');
  const { dispatchToast } = useToastController(toasterId);

  useEffect(() => {
    Promise.all([getContext(), getPowerAutomateEndpointValue()])
      .then(([ctx, endpointValue]) => {
        const templateId =
          new URLSearchParams(window.location.search).get('templateId') ?? undefined;
        setAppCtx({
          environmentId: ctx.app.environmentId,
          userEmail: ctx.user.userPrincipalName ?? '',
          templateId,
          cloudType: normalizeCloudType(endpointValue),
        });
      })
      .catch((err) => {
        console.error('[AgentLibraryWrapper] Failed to get app context:', err);
      });
  }, []);

  if (!appCtx || isLoading) {
    return <Spinner size="medium" label="Loading Agent Library..." />;
  }

  return (
    <>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            Couldn't load custom templates. Showing the built-in catalog only.
          </MessageBarBody>
        </MessageBar>
      )}
      <Toaster toasterId={toasterId} />
      <AgentLibraryProvider
        config={{
          client,
          environmentId: appCtx.environmentId,
          userEmail: appCtx.userEmail,
          templateId: appCtx.templateId,
          cloudType: appCtx.cloudType,
          host: 'csk',
          userRole: 'admin',
          agentTemplates: agentTemplates ?? [],
          onCreateTemplate: async (values, file) => {
            try {
              await createTemplate.mutateAsync({ values, file });
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {values.name ? `${values.name} template created.` : 'Template created.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'success', timeout: 4000 },
              );
            } catch (err) {
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {err instanceof Error ? err.message : 'Failed to create the template.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'error', timeout: 6000 },
              );
              throw err;
            }
          },
          onUpdateTemplate: async (id, values, file) => {
            try {
              await updateTemplate.mutateAsync({ id, values, file });
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {values.name ? `${values.name} template updated.` : 'Template updated.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'success', timeout: 4000 },
              );
            } catch (err) {
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {err instanceof Error ? err.message : 'Failed to update the template.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'error', timeout: 6000 },
              );
              throw err;
            }
          },
          onDeleteTemplate: async (id, name) => {
            try {
              await deleteTemplate.mutateAsync({ id, name });
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {name ? `${name} template deleted.` : 'Template deleted.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'success', timeout: 4000 },
              );
            } catch (err) {
              // Surface failure as a toast, then re-throw so the dialog keeps the
              // template open and shows the inline error.
              dispatchToast(
                <Toast>
                  <ToastTitle>
                    {err instanceof Error ? err.message : 'Failed to delete the template.'}
                  </ToastTitle>
                </Toast>,
                { intent: 'error', timeout: 6000 },
              );
              throw err;
            }
          },
        }}
      >
        <AgentLibraryPage />
      </AgentLibraryProvider>
    </>
  );
}
