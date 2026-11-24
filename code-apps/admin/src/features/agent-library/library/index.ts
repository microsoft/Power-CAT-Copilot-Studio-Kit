/**
 * Agent Library — shared Agent Library source.
 *
 * Provides the Agent Library UI (template browse, install, connection setup)
 * as a drop-in page component for Power Apps code apps.
 *
 * Usage:
 * ```tsx
 * import { AgentLibraryProvider, AgentLibraryPage } from './library';
 *
 * <AgentLibraryProvider config={{ client, environmentId, userEmail }}>
 *   <AgentLibraryPage />
 * </AgentLibraryProvider>
 * ```
 */

// Provider
export { AgentLibraryProvider, useAgentLibrary, useClient, useCloudType, useUserRole } from './provider/AgentLibraryProvider';
export type { AgentLibraryConfig } from './provider/AgentLibraryProvider';

// Utilities
export { getCloudUrls, buildCopilotStudioUrl, buildCreateConnectionUrl } from './utils/cloudUrls';
export type { CloudUrls } from './utils/cloudUrls';

// Page
export { default as AgentLibraryPage } from './AgentLibraryPage';

// Components
export { TemplateBadge } from './components/TemplateBadge';

// Types (re-export everything consumers might need)
export type {
  PowerAppsClient,
  AgentLibraryHost,
  CloudType,
  UserRole,
  TemplateSource,
  AgentTemplate,
  TemplateSubmitValues,
  ComponentTemplate,
  McpApp,
  CatalogItem,
  ConnectionRequirement,
  KnowledgeSourceField,
  InstallState,
  ComponentWithInstallState,
  AgentTemplateDialogProps,
  ConnectionSetupItem,
  ConnectionComponentParam,
  SolutionConnectionReference,
  UserConnection,
  GalleryFilterState,
  ActionBarProps,
  InstalledSolutionsResult,
} from './contracts/types';

// Constants
export {
  GALLERY_CATEGORY_FILTERS,
  SOLUTIONS_STALE_TIME,
} from './contracts/types';

// Declarative agent types
export type {
  DeclarativeAgentManifest,
  DeclarativeCapability,
  ConversationStarter,
  DeclarativeEditFormState,
  DeclarativeDialogStep,
} from './contracts/declarative-agent';

export { KNOWN_CAPABILITIES } from './constants/declarativeCapabilities';

// Data (in case host apps want to extend the catalog)
export { agentTemplateCatalog } from './data/agentTemplateCatalog';
export { MCP_APP_CATALOG } from './data/mcpAppCatalog';

// Custom-template authoring helpers (host apps map Dataverse rows → AgentTemplate
// and need to resolve the stored accent key to the same gradient the admin picked)
export {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  resolveAccentGradient,
  TEMPLATE_ICON_CHOICES,
  DEFAULT_ICON,
} from './utils/templateAuthoring';
export type { AccentSwatch } from './utils/templateAuthoring';

// Hooks (in case host apps need direct access)
export { useBots } from './hooks/useBots';
export { useSolutions } from './hooks/useSolutions';
