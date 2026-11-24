/**
 * Agent Library — TypeScript Interfaces & Constants
 *
 * Source of truth for the Agent Library type contracts.
 */
import type React from 'react';

// ---------------------------------------------------------------------------
// PowerApps Client Interface (injected via AgentLibraryProvider)
// ---------------------------------------------------------------------------

/**
 * Interface for the CDS connector client.
 * The host app provides this via `getClient(dataSourcesInfo)` from `@microsoft/power-apps/data`.
 * We define our own interface so the package doesn't depend on `@microsoft/power-apps`.
 */
export interface PowerAppsClient {
  executeAsync<TParams = Record<string, unknown>, TResponse = unknown>(request: {
    connectorOperation: {
      tableName: string;
      operationName: string;
      parameters?: TParams;
    };
  }): Promise<{ data: TResponse; success?: boolean }>;
}

// ---------------------------------------------------------------------------
// Host Identification (April release — multi-host catalog visibility)
// ---------------------------------------------------------------------------

/** Host application consuming the Agent Library */
export type AgentLibraryHost = 'hpa' | 'csk';

/**
 * Power Platform cloud type. Determines base URLs for Copilot Studio and
 * make.powerapps.com deep links. Defaults to `'commercial'` when not supplied.
 * `'gcchigh'` and `'gcc(high)'` are equivalent.
 */
export type CloudType = 'commercial' | 'gcc' | 'gcchigh' | 'gcc(high)' | 'dod';

/**
 * Role of the current user within the host application.
 * Defaults to `'maker'` when not supplied.
 */
export type UserRole = 'admin' | 'maker';

/**
 * Origin of an agent template.
 * `'system'` — shipped with the library. `'custom'` — authored by an admin.
 * Defaults to `'system'` when not supplied.
 */
export type TemplateSource = 'system' | 'custom';

// ---------------------------------------------------------------------------
// Agent Template Types (Phase 2)
// ---------------------------------------------------------------------------

export interface ConnectionRequirement {
  /** Short connector name (e.g. "shared_wordonlinebusiness") */
  connectorName: string;
  /** Human-readable display name (e.g. "Word Online (Business)") */
  connectorDisplayName?: string;
  /** Optional icon image path for the connector */
  connectorIcon?: string;
}

/** Connection lifecycle status — Phase 2: static pending, Phase 3: real async */
export type ConnectionStatus = 'pending' | 'connected' | 'error';

/**
 * AgentTemplate — a pre-configured agent template for the Agent Library.
 * Phase 2: display-only with editable Description and Instructions.
 */
/** Editable knowledge source input field definition */
export interface KnowledgeSourceField {
  /** Display label (e.g. "Site Assets") */
  label: string;
  /** Whether this field is required */
  required: boolean;
  /** Placeholder text for the input */
  placeholder: string;
  /** Determines placeholder text behavior */
  kind: 'SharePointSearchSource' | 'PublicSiteSearchSource';
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  /** Short description for gallery card (if omitted, uses description) */
  cardDescription?: string;
  type: 'template';
  /**
   * Origin of the template — `'system'` (shipped) or `'custom'` (admin-authored).
   * Shown as a chip on the gallery card. Defaults to `'system'` when omitted.
   */
  source?: TemplateSource;
  /** Determines which dialog flow to use: custom (solution import) or declarative (edit & download ZIP) */
  agentType?: 'custom' | 'declarative';
  /**
   * Declarative agents only — static hint for pre-rendering.
   * If true, capabilities section shows SharePoint URL input instead of toggle switches.
   * Runtime detection from parsed ZIP is the source of truth.
   */
  hasSharePoint?: boolean;
  /** Fluent icon component name — optional for consumer-injected templates (a display default is applied) */
  icon?: string;
  /** Icon accent color — optional for consumer-injected templates (a display default is applied) */
  iconColor?: string;
  /**
   * CSS linear-gradient for the squircle icon background. When omitted *and*
   * iconSvg is set, the icon is rendered full-bleed (the PNG is itself a
   * self-contained squircle tile — see SquircleIcon).
   */
  iconGradient?: string;
  /** SVG asset for the squircle icon (takes precedence over Fluent icon) */
  iconSvg?: string;
  /** Technology badges shown in dialog (e.g. ["Prompt", "Topic"]) */
  technologyUsed?: string[];
  /** Editable knowledge source inputs shown above Environment dropdown */
  knowledgeSources?: KnowledgeSourceField[];
  connections?: ConnectionRequirement[];
  /**
   * aka.ms download URL for the solution ZIP. Optional for consumer-injected
   * templates that instead supply the ZIP bytes via `getZipBytes`.
   */
  zipUrl?: string;
  /**
   * Async callback returning the raw solution ZIP bytes. Used when `zipUrl` is
   * absent — e.g. a Dataverse file column on a consumer-injected custom template.
   */
  getZipBytes?: () => Promise<Uint8Array>;
  /** GitHub URL for Agent Builder setup guide (.docx) — opens in new tab + download */
  setupGuideUrl?: string;
  /** Download URL for Agent Builder / VS Code flows — opens in new tab */
  downloadUrl?: string;
  /** Learn more URL — GitHub folder link shown at end of description */
  learnMoreUrl?: string;
  /**
   * Host apps this template is visible in. Omit = visible in all hosts.
   * When the host filter is active, a template is rendered iff this array is
   * absent or includes the active host.
   */
  hosts?: AgentLibraryHost[];
  /**
   * Optional per-host display overrides. Fields present for the active host
   * replace the base values at render time. Use for host-specific names,
   * descriptions, or zip URLs without forking the catalog entry. The `id`
   * is never overridden — deep-link URLs stay stable across hosts.
   */
  hostOverrides?: Partial<Record<AgentLibraryHost, Partial<AgentTemplate>>>;
  /**
   * Publish status of a custom (Dataverse-sourced) template. Drives the edit
   * dialog's Active/Inactive toggle prefill. Omitted for built-in templates.
   */
  publishStatus?: 'active' | 'inactive';
  /**
   * Accent swatch key (see ACCENT_SWATCHES) chosen by the admin for a custom
   * template. Used to prefill the edit dialog's accent picker.
   */
  accent?: string;
  /** Display name of the attached solution package file (custom templates). */
  templateFileName?: string;
}

/**
 * TemplateSubmitValues — the form payload emitted by NewTemplateDialog and
 * handed to the host's `onCreateTemplate` / `onUpdateTemplate` callbacks. The
 * solution ZIP travels separately as a `File` (it cannot live in JSON).
 */
export interface TemplateSubmitValues {
  name: string;
  description: string;
  agentType: 'custom' | 'declarative';
  publishStatus: 'active' | 'inactive';
  /** Fluent icon key — one of the ICON_MAP keys. */
  icon: string;
  /** Accent swatch key — one of the ACCENT_SWATCHES keys. */
  accent: string;
  /**
   * Optional resource links. Always present in the payload as a trimmed string;
   * an **empty string means "clear"** (the field was left/made blank). Hosts
   * must persist the empty value rather than skipping it, otherwise an existing
   * URL cannot be removed on edit.
   */
  learnMoreUrl?: string;
  setupGuideUrl?: string;
}

// ---------------------------------------------------------------------------
// Connection Setup Types (Phase 2 — Import Flow)
// ---------------------------------------------------------------------------

/** Connection reference parsed from a solution ZIP's customizations.xml */
export interface SolutionConnectionReference {
  logicalName: string;
  displayName: string;
  connectorId: string;
  connectorName: string;
  connectorDisplayName: string;
}

/** An existing user connection from the `connections` Dataverse entity */
export interface UserConnection {
  connectionId: string;
  displayName: string;
  status: 'Connected' | 'Error' | 'Expired' | 'Unknown';
  createdTime: string;
  connectorName: string;
}

/** UI state for one row in ConnectionSetupView */
export interface ConnectionSetupItem {
  reference: SolutionConnectionReference;
  availableConnections: UserConnection[];
  selectedConnectionId: string | null;
  loading: boolean;
  error: string | null;
}

/** Entry in ComponentParameters for ImportSolutionAsync */
export interface ConnectionComponentParam {
  '@odata.type': 'Microsoft.Dynamics.CRM.connectionreference';
  connectionreferencelogicalname: string;
  connectionreferencedisplayname: string;
  connectorid: string;
  connectionid: string;
}

// ---------------------------------------------------------------------------
// Core Data Types
// ---------------------------------------------------------------------------

export interface InputParam {
  /** Parameter display name (e.g. "Document content") */
  name: string;
  /** Full parameter description */
  description: string;
  /**
   * If true, the description is prefixed with "(Required) " in the Variables table.
   * Maps to FR-010.
   */
  isRequired?: boolean;
}

export interface OutputParam {
  /** Parameter display name (e.g. "text") */
  name: string;
  /** Full parameter description */
  description: string;
}

/**
 * ComponentTemplate — the core domain entity for a single reusable component.
 *
 * Data sourced from componentCatalog.ts (static, bundled with the app).
 */
export interface ComponentTemplate {
  /** Unique slug identifier (e.g. "document-extraction") */
  id: string;
  /** Display name shown in gallery cards and dialog (e.g. "Document extraction") */
  name: string;
  /** Full description text shown in details dialog. May include a learnMoreUrl. */
  description: string;
  /** Optional "Learn more" URL appended to the description */
  learnMoreUrl?: string;
  /**
   * Archetype category tags (e.g. ["Connect", "Create"]).
   * Displayed as outlined neutral badge pills in the dialog.
   * Used for category filter in the gallery.
   */
  categories: string[];
  /**
   * Technology descriptor tags (e.g. ["AI Builder Prompt", "Topic"]).
   * Displayed as tinted informative badge pills with icon in the dialog.
   * Used for technology filter in the gallery.
   * Must be visually distinct from categories (FR-009).
   */
  technologyTags: string[];
  /** Array of input parameters for the Variables table (FR-010) */
  inputs: InputParam[];
  /** Optional label for the inputs section. Defaults to "Variables". */
  inputsLabel?: string;
  /** Array of output parameters for the Outputs table (FR-011) */
  outputs?: OutputParam[];
  /**
   * Dataverse solution unique name used for install detection (INS-3).
   * E.g. "CopilotStudioKit_Components" or "CopilotStudioKit_ServiceNow_Components"
   */
  solutionUniqueName: string;
  /** Version of the bundled solution zip. If installed version is older, show Install instead of View. */
  solutionVersion: string;
  /**
   * aka.ms URL for solution ZIP — used by ImportSolutionAsync via Custom API download.
   * This is the install source. E.g. "https://aka.ms/cskagentlib/comp/docextract"
   */
  zipUrl: string;
  /**
   * URL opened by the Download button (browser download).
   * Falls back to zipUrl if not set.
   */
  downloadUrl: string;
  /**
   * Path segment for Copilot Studio deep link, after /environments/{envId}/.
   * E.g. "component-collections" (opened as new tab on View click, FR-018).
   */
  copilotStudioPath: string;
  /**
   * Fluent UI icon name for the circular icon in the dialog header.
   * E.g. "DocumentText24Regular", "Search24Regular".
   * Used as fallback if iconImage is not provided.
   */
  icon: string;
  /**
   * Fluent UI palette color key for the circular icon background.
   * Maps to tokens.colorPalette{iconColor}Background2 (e.g. "Green", "Teal", "Orange", "Blue").
   * Do NOT hardcode hex values — always resolve to the appropriate palette token at render time.
   */
  iconColor: string;
  /** Static import path for the gallery card icon image (PNG). */
  iconImage?: string;
  /** Static import path for the hero card thumbnail image (PNG). */
  thumbnailImage?: string;
  /**
   * The exact name of this component in Copilot Studio's botcomponents entity.
   * Used for querying the bot component ID for deep linking.
   * E.g. "Document Extraction Component", "Research Component".
   */
  copilotStudioComponentName: string;
  /**
   * If true, the component requires external connection setup (e.g. ServiceNow).
   * Install button is hidden; dialog-connection-setup section is shown instead (FR-022).
   */
  requiresExternalConnection: boolean;
  /** Discriminant for CatalogItem union — REQUIRED (must be set on every catalog entry) */
  type: 'component';
  /** CSS linear-gradient string for the squircle icon background */
  iconGradient?: string;
  /** SVG asset for the squircle icon (takes precedence over Fluent icon) */
  iconSvg?: string;
  /** Phase 2: Tool/action names for purple badges in dialog */
  toolsAndActions?: string[];
}

// ---------------------------------------------------------------------------
// Install State
// ---------------------------------------------------------------------------

/**
 * Per-component installation lifecycle state.
 * Drives the action bar button states in ComponentDetailsDialog (FR-013–FR-021).
 */
export type InstallState = 'not-installed' | 'installing' | 'installed' | 'failed';

/**
 * ComponentTemplate extended with runtime install state.
 * Used throughout the gallery and dialog rendering.
 */
export interface ComponentWithInstallState extends ComponentTemplate {
  installState: InstallState;
}

// ---------------------------------------------------------------------------
// CatalogItem — Discriminated Union (Phase 2)
// ---------------------------------------------------------------------------

/**
 * McpApp — a downloadable MCP (Model Context Protocol) app for the Agent Library.
 *
 * Unlike templates and components, MCP apps are NOT installed into the
 * environment. The details dialog shows an "About this app" description, its
 * category tags, and two actions: Learn more (opens the source repo) and
 * Download (fetches a ZIP from GitHub) — both in a new tab. MCP apps appear on
 * their own "MCP Apps" tab and in a dedicated section of the "All" view.
 */
export interface McpApp {
  /** Discriminant for CatalogItem union — REQUIRED (must be set on every catalog entry) */
  type: 'mcp-app';
  id: string;
  name: string;
  /** Short description shown on the gallery card and as the dialog's lead paragraph */
  description: string;
  /** Short description for gallery card (if omitted, uses description) */
  cardDescription?: string;
  /** Long-form "About this app" copy rendered in the details dialog */
  aboutApp?: string;
  /**
   * Categories used by the "MCP Apps" tab category dropdown filter and rendered
   * as tags on the card and in the dialog. MCP apps use their own industry
   * taxonomy (independent of GALLERY_CATEGORY_FILTERS).
   */
  categories?: string[];
  /** GitHub URL for the downloadable .zip — opened in a new tab on Download */
  downloadUrl: string;
  /** Learn more URL — opens the source repo in a new tab from the dialog */
  learnMoreUrl?: string;
  /** Fluent icon component name */
  icon?: string;
  /** Icon accent color */
  iconColor?: string;
  /** CSS linear-gradient for the squircle icon background */
  iconGradient?: string;
  /** SVG asset for the squircle icon (takes precedence over Fluent icon) */
  iconSvg?: string;
}

/**
 * CatalogItem — union type for the mixed gallery grid.
 * Use item.type to narrow: 'template' → AgentTemplate, 'component' → ComponentTemplate,
 * 'mcp-app' → McpApp.
 * Runtime: every item in the catalog MUST have a `type` field set.
 */
export type CatalogItem = AgentTemplate | ComponentTemplate | McpApp;

// ---------------------------------------------------------------------------
// Phase 2 Component Props
// ---------------------------------------------------------------------------

export interface DialogSectionProps {
  icon: React.ReactElement;
  label: string;
  children: React.ReactNode;
  /** Optional action element rendered at the far right of the header row */
  action?: React.ReactNode;
  /** Omit bottom border (last section before footer) */
  isLast?: boolean;
}

export interface CopilotCardProps {
  item: CatalogItem;
  onClick: () => void;
  /** When provided, renders an edit button at the top-right of template cards. */
  onEdit?: () => void;
}

export interface AgentTemplateDialogProps {
  item: AgentTemplate;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  /** Called when user clicks Install — dialog closes, page tracks progress. */
  onInstallStart?: (info: {
    envName: string;
    solutionName: string;
    schemaName: string;
    orgUrl: string;
    targetEnvironmentId: string;
    importPromise: Promise<{ success: boolean; errorMessage?: string }>;
  }) => void;
  /** Called during install polling with progress percentage (0-100). */
  onInstallProgress?: (pct: number) => void;
}

export interface ComponentDialogProps {
  item: ComponentWithInstallState;
  onClose: () => void;
  /** Action bar element (Install/Download/View) — passed from page */
  actionBar: React.ReactNode;
  /** Called when a ServiceNow connection-aware install completes */
  onInstallComplete?: (result: { success: boolean; errorMessage?: string }) => void;
  /** Called when a ServiceNow connection-aware install starts (to update page-level state) */
  onInstallStart?: () => void;
}

export interface ConnectionSetupProps {
  connections: ConnectionRequirement[];
}

// ---------------------------------------------------------------------------
// Filter State
// ---------------------------------------------------------------------------

/**
 * Gallery filter state. Held in ComponentLibraryPage local state.
 * All filtering is client-side (useMemo over catalog data).
 *
 * NOTE: Use empty string "" as the "show all / no filter" sentinel for selectedCategory
 * and selectedTechnology. Do NOT use null — Fluent UI TabList.selectedValue does not
 * accept null and will emit runtime warnings.
 */
export interface GalleryFilterState {
  /** Case-insensitive search query applied to name and description (FR-006) */
  searchQuery: string;
  /**
   * Selected category filter value. "" = show all (FR-007).
   * Must match a value in ComponentTemplate.categories, or "" for "All".
   */
  selectedCategory: string;
  /**
   * Selected technology filter value. "" = show all (FR-007).
   * Must match a value in ComponentTemplate.technologyTags, or "" for "All".
   */
  selectedTechnology: string;
}

// ---------------------------------------------------------------------------
// Component Props Contracts
// ---------------------------------------------------------------------------

/**
 * ActionBar component props — narrow interface.
 *
 * Accepts only what ActionBar needs: current state + callbacks.
 * Do NOT pass the full ComponentWithInstallState — this keeps ActionBar
 * decoupled and testable in isolation. (react-code-reviewer recommendation)
 */
export interface ActionBarProps {
  installState: InstallState;
  hasInstallPrivilege: boolean;
  onInstall: () => void;
  onDownload: () => void;
  onView: () => void;
}

/**
 * GalleryFilters component props — single callback for all filter changes.
 *
 * Use onFilterChange(update: Partial<GalleryFilterState>) to avoid multiple
 * prop-drilling callbacks and keep GalleryFilters stateless.
 * (react-code-reviewer recommendation)
 */
export interface GalleryFiltersProps {
  filters: GalleryFilterState;
  onFilterChange: (update: Partial<GalleryFilterState>) => void;
}

// ---------------------------------------------------------------------------
// Service Layer Contracts
// ---------------------------------------------------------------------------

/**
 * Result shape from SolutionDetectionService.
 * Contains all solution unique names currently installed in the environment.
 */
export interface InstalledSolutionsResult {
  /** Set of installed solution unique names */
  installedNames: Set<string>;
  /** Map of solution unique name → installed version string */
  installedVersions: Map<string, string>;
  /** Map of component catalog name → botcomponentcollectionid for deep linking */
  componentIds: Map<string, string>;
}

/**
 * Parameters for SolutionInstallService.installSolution().
 */
export interface InstallSolutionParams {
  /** ComponentTemplate to install */
  component: ComponentTemplate;
  /** UUID for tracking the import job */
  importJobId: string;
}

/**
 * Result from SolutionInstallService.installSolution().
 */
export interface InstallSolutionResult {
  success: boolean;
  /** Populated on failure with a user-friendly message */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** React Query stale time for installed solutions query (1 minute) */
export const SOLUTIONS_STALE_TIME = 60 * 1000;

/**
 * Category values for the gallery filter.
 * Empty string "" is the "show all" sentinel — compatible with Fluent UI TabList.selectedValue.
 */
export const GALLERY_CATEGORY_FILTERS = [
  { value: '', label: 'All' },
  { value: 'Connect', label: 'Connect' },
  { value: 'Analyze', label: 'Analyze' },
  { value: 'Create', label: 'Create' },
  { value: 'Act', label: 'Act' },
  { value: 'Automate', label: 'Automate' },
  { value: 'Govern', label: 'Govern' },
  { value: 'Monitor', label: 'Monitor' },
] as const;
