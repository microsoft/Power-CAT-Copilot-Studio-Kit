/**
 * AgentLibraryProvider — Context provider for the Agent Library package.
 *
 * The host app wraps <AgentLibraryPage /> with this provider, passing in
 * the CDS connector client and app context. All services and hooks inside
 * the package access the client via useClient() and context via useAgentLibrary().
 *
 * Usage in host app:
 * ```tsx
 * import { getClient } from '@microsoft/power-apps/data';
 * import { getContext } from '@microsoft/power-apps/app';
 * import { dataSourcesInfo } from './.power/schemas/appschemas/dataSourcesInfo';
 * import { AgentLibraryProvider, AgentLibraryPage } from './library';
 *
 * const client = getClient(dataSourcesInfo);
 * const ctx = await getContext();
 *
 * <AgentLibraryProvider config={{
 *   client,
 *   environmentId: ctx.app.environmentId,
 *   userEmail: ctx.user.userPrincipalName ?? '',
 * }}>
 *   <AgentLibraryPage />
 * </AgentLibraryProvider>
 * ```
 */

import React, { createContext, useContext } from 'react';
import type { AgentLibraryHost, AgentTemplate, CloudType, PowerAppsClient, TemplateSubmitValues, UserRole } from '../contracts/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AgentLibraryConfig {
  /** CDS connector client from getClient(dataSourcesInfo) in the host app */
  client: PowerAppsClient;
  /** Current Power Platform environment ID (from getContext().app.environmentId) */
  environmentId: string;
  /** Current user email (from getContext().user.userPrincipalName) */
  userEmail: string;
  /**
   * Optional template ID to auto-open on load.
   * Must match an `id` field in agentTemplateCatalog or componentCatalog.
   * If the item is found, its dialog opens immediately without user interaction.
   * E.g. pass "planMyDay" to open the Plan My Day declarative agent dialog.
   */
  templateId?: string;
  /**
   * Power Platform cloud type for the tenant. Determines base URLs for
   * Copilot Studio and make.powerapps.com deep links.
   * Defaults to `'commercial'` when omitted.
   */
  cloudType?: CloudType;
  /**
   * Host application identifier. When set, templates with a `hosts` array
   * that does not include this value are filtered out of the gallery and
   * deep-link resolution. When omitted, no host filtering is applied
   * (backward compatible — consumers on older package versions still see
   * all templates).
   */
  host?: AgentLibraryHost;
  /**
   * Role of the current user within the host application.
   * Accepts `'admin'` or `'maker'`. Defaults to `'maker'` when omitted.
   */
  userRole?: UserRole;
  /**
   * Optional custom agent templates injected by the consumer app (e.g. fetched
   * from Dataverse). These are prepended to the built-in static
   * agentTemplateCatalog — both remain visible together — and are marked as
   * `source: 'custom'` so they render the Custom chip and admin edit affordance.
   */
  agentTemplates?: AgentTemplate[];
  /**
   * Persist a NEW custom template (admin authoring). The host creates the
   * Dataverse row, uploads the solution ZIP, then refetches so the new template
   * flows back in via `agentTemplates`. When omitted, the admin "New Template"
   * button is not rendered. Should reject on failure so the dialog can surface
   * the error and stay open.
   */
  onCreateTemplate?: (values: TemplateSubmitValues, file: File) => Promise<void>;
  /**
   * Persist edits to an existing custom template. `file` is undefined when the
   * admin did not replace the solution ZIP. When omitted, card edit pencils are
   * not rendered. Should reject on failure so the dialog can surface the error.
   */
  onUpdateTemplate?: (id: string, values: TemplateSubmitValues, file?: File) => Promise<void>;
  /**
   * Permanently delete a custom template (admin authoring). The host deletes the
   * Dataverse row, then refetches so the template drops out via `agentTemplates`.
   * `name` is the template's display name, passed through for host-side messaging
   * (e.g. a confirmation toast). When omitted, the edit dialog's "Delete
   * template" button is not rendered. Should reject on failure so the dialog can
   * surface the error and stay open.
   */
  onDeleteTemplate?: (id: string, name?: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AgentLibraryContext = createContext<AgentLibraryConfig | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AgentLibraryProvider({
  config,
  children,
}: {
  config: AgentLibraryConfig;
  children: React.ReactNode;
}) {
  // Default userRole to 'maker' when the host app does not supply one.
  const resolvedConfig = React.useMemo<AgentLibraryConfig>(
    () => ({ ...config, userRole: config.userRole ?? 'maker' }),
    [config],
  );
  return (
    <AgentLibraryContext.Provider value={resolvedConfig}>
      {children}
    </AgentLibraryContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Access the full AgentLibrary config (client, environmentId, userEmail). */
export function useAgentLibrary(): AgentLibraryConfig {
  const ctx = useContext(AgentLibraryContext);
  if (!ctx) {
    throw new Error(
      'useAgentLibrary must be used within <AgentLibraryProvider>. ' +
      'Wrap your <AgentLibraryPage /> with <AgentLibraryProvider config={...}>.',
    );
  }
  return ctx;
}

/** Access just the CDS connector client. */
export function useClient(): PowerAppsClient {
  return useAgentLibrary().client;
}

/** Access the tenant cloud type, defaulting to `'commercial'` when not supplied. */
export function useCloudType(): CloudType {
  return useAgentLibrary().cloudType ?? 'commercial';
}

/** Access the current user role, defaulting to `'maker'` when not supplied. */
export function useUserRole(): UserRole {
  return useAgentLibrary().userRole ?? 'maker';
}
