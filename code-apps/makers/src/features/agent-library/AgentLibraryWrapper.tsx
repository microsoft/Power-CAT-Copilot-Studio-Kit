/**
 * AgentLibraryWrapper — provides the AgentLibraryProvider context to the
 * Agent Library source in ./library for the Makers app.
 *
 * Fetches PUBLISHED custom agent templates from the `cat_agenttemplate`
 * Dataverse table and merges them with the package's system catalog. Read-only:
 * no userRole is passed (defaults to 'maker'), so no authoring affordances show.
 */

import { useState, useEffect } from 'react';
import { Spinner, MessageBar, MessageBarBody } from '@fluentui/react-components';
import { getClient } from '@microsoft/power-apps/data';
import { getContext } from '@microsoft/power-apps/app';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { AgentLibraryProvider, AgentLibraryPage } from './library';
import type { CloudType } from './library';
import { getPowerAutomateEndpointValue } from '../../shared/services/copilotStudioUrl';
import { useAgentTemplates } from './hooks/useAgentTemplates';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

const client = getClient(dataSourcesInfo);

const VALID_CLOUD_TYPES: ReadonlySet<CloudType> = new Set<CloudType>([
  'commercial',
  'gcc',
  'gcchigh',
  'gcc(high)',
  'dod',
]);

/** Normalizes a Power Automate endpoint value (e.g. "GCC High") to a CloudType. */
function normalizeCloudType(endpointValue?: string | null): CloudType {
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
      <AgentLibraryProvider
        config={{
          client,
          environmentId: appCtx.environmentId,
          userEmail: appCtx.userEmail,
          templateId: appCtx.templateId,
          cloudType: appCtx.cloudType,
          host: 'csk',
          agentTemplates: agentTemplates ?? [],
        }}
      >
        <AgentLibraryPage />
      </AgentLibraryProvider>
    </>
  );
}
