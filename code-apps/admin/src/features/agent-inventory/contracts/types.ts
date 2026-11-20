export type InventoryChoice = 'yes' | 'no' | 'na' | 'unknown';
export type AgentStatus = 'Available' | 'Blocked' | 'Draft' | 'NA' | 'Unknown';
export type AgentPoweredBy = 'Copilot Chat' | 'GitHub Copilot' | 'Standard' | 'Unknown';
export type AgentInventoryView =
  | 'no-authentication'
  | 'draft'
  | 'autonomous'
  | 'connector-maker-auth'
  | 'dormant'
  | 'test-not-configured'
  | 'unmanaged'
  | 'missing-owner'
  | 'web-search-enabled'
  | 'capability-generative-ai'
  | 'capability-knowledge-sources'
  | 'capability-tools-actions'
  | 'capability-skills'
  | 'capability-evaluations'
  | 'capability-ai-builder-prompts'
  | 'capability-mcp';

export interface AgentCapabilities {
  usesGenAI: InventoryChoice;
  usesKnowledgeSources: InventoryChoice;
  usesTools: InventoryChoice;
  usesEvaluations: InventoryChoice;
  usesPrompts: InventoryChoice;
  usesMCP: InventoryChoice;
  usesEnhancedSearch: InventoryChoice;
  usesFileInput: InventoryChoice;
  usesCustomizedResponses: InventoryChoice;
  usesSkills: InventoryChoice;
  usesComputer: InventoryChoice;
  usesHttpRequests: InventoryChoice;
  usesCustomKnowledgeSource: InventoryChoice;
  usesAIKnowledge: InventoryChoice;
  usesDeepReasoning: InventoryChoice;
  webSearchEnabled: InventoryChoice;
  usesClassicGenerativeAnswerSources: InventoryChoice;
  usesCloudFlowAuthContext: InventoryChoice;
  usesConnectorMakerAuthContext: InventoryChoice;
}

export interface AgentComponentPayloads {
  knowledgeSources?: string;
  prompts?: string;
  triggers?: string;
  classicDataSources?: string;
  httpRequestActions?: string;
  connections?: string;
  skills?: string;
  evaluations?: string;
  mcp?: string;
  connectedAgents?: string;
  usageData?: string;
}

export interface AgentUsage {
  usageAgentActionBilled?: number;
  usageAgentActionNonBilled?: number;
  usageAgentFlowActionBilled?: number;
  usageAgentFlowActionNonBilled?: number;
  usageClassicAnswerBilled?: number;
  usageClassicAnswerNonBilled?: number;
  usageGenerativeAnswerBilled?: number;
  usageGenerativeAnswerNonBilled?: number;
  usageTextAndGenAIToolsBasicBilled?: number;
  usageTextAndGenAIToolsBasicNonBilled?: number;
  usageTextAndGenAIToolsStandardBilled?: number;
  usageTextAndGenAIToolsStandardNonBilled?: number;
  usageTextAndGenAIToolsPremiumBilled?: number;
  usageTextAndGenAIToolsPremiumNonBilled?: number;
}

export interface AgentInventoryRecord {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  instructions?: string;
  type: string;
  status: AgentStatus;
  environmentId?: string;
  environmentName?: string;
  environmentType?: string;
  environmentUrl?: string;
  location?: string;
  owner?: string;
  ownerEmail?: string;
  ownerAdId?: string;
  owningBusinessUnit?: string;
  createdBy?: string;
  createdByUpn?: string;
  createdByAdId?: string;
  createdDate?: string;
  modifiedBy?: string;
  modifiedDate?: string;
  published: InventoryChoice;
  publishedBy?: string;
  publishedDate?: string;
  firstUsageDate?: string;
  firstUsageFeature?: string;
  lastUsageDate?: string;
  lastUsageFeature?: string;
  authenticationType?: string;
  orchestrationType?: string;
  poweredBy?: AgentPoweredBy;
  model?: string;
  managedState?: string;
  createdIn?: string;
  schemaName?: string;
  defaultApplicationId?: string;
  template?: string;
  transcriptAvailable: InventoryChoice;
  hasSystemAdminAccess: InventoryChoice;
  hasPpacMismatch: InventoryChoice;
  autonomousAgent: InventoryChoice;
  testConfigured: InventoryChoice;
  numberOfEvaluations?: number;
  sharedWithEditorUserCount?: number;
  sharedWithEditorGroupCount?: number;
  sharedWithViewerUserCount?: number;
  sharedWithViewerGroupCount?: number;
  sharedWithEntireTenantAsViewer: InventoryChoice;
  capabilities: AgentCapabilities;
  aggregateCredits?: number;
  components: AgentComponentPayloads;
  agentUsage: AgentUsage;
}

export interface AgentUsageRecord {
  id: string;
  sourceName?: string;
  agentDetailsId?: string;
  agentId?: string;
  environmentId?: string;
  featureName?: string;
  usageDate?: string;
  fromDate?: string;
  toDate?: string;
  billedCredits: number;
  nonBilledCredits: number;
  users: number;
  toolInvoked?: string;
  knowledgeSources?: string;
  llmModel?: string;
  channelId?: string;
  refreshStatus?: string;
}

export interface MonthlyInventoryPoint {
  date: Date;
  inventory: number;
}

export interface DistributionItem {
  label: string;
  value: number;
  description?: string;
}

export interface GovernancePriorityItem {
  label: string;
  description: string;
  value: number;
  /** AgentInventoryView key used to deep-link into the filtered All agents list. */
  view: AgentInventoryView;
}

export interface CapabilityAdoptionItem {
  view: AgentInventoryView;
  label: string;
  value: number;
  eligible: number;
  percentage: number;
}

export interface EnvironmentRank {
  name: string;
  count: number;
}

export interface AgentWatchRow {
  id: string;
  name: string;
  status: AgentStatus;
  owner: string;
  environment: string;
  poweredBy: string;
  billedCredits: number;
  creditsPerUser?: number;
  lastUsage?: string;
  riskSignal: string;
}

export interface InventoryDashboardModel {
  totalAgents: number;
  environmentCount: number;
  enrichedCount: number;
  limitedDetailCount: number;
  customCount: number;
  agentTypes: DistributionItem[];
  unclassifiedAgentTypeCount: number;
  noAuthenticationCount: number;
  draftAgentsCount: number;
  autonomousCount: number;
  knowledgeAgentsCount: number;
  draftEligibleCount: number;
  autonomousEligibleCount: number;
  knowledgeEligibleCount: number;
  newAgentsLast30Days: number;
  publishedNewAgents: number;
  growth: MonthlyInventoryPoint[];
  authentication: DistributionItem[];
  priorities: GovernancePriorityItem[];
  statuses: DistributionItem[];
  capabilities: CapabilityAdoptionItem[];
  topEnvironments: EnvironmentRank[];
  agentsToWatch: AgentWatchRow[];
}

export interface GovernancePostureItem {
  label: string;
  description: string;
  state: 'healthy' | 'review' | 'informative';
  badge: string;
}

export interface AgentFeatureDetail {
  label: string;
  enabled: boolean;
  known: boolean;
}

export type AgentComponentSectionKey =
  | 'knowledge'
  | 'prompts'
  | 'triggers'
  | 'classic'
  | 'http'
  | 'connections'
  | 'skills'
  | 'evaluations'
  | 'mcp'
  | 'connectedAgents';

export interface AgentComponentItem {
  id: string;
  name: string;
  description?: string;
  detail?: string;
  badge: string;
  url?: string;
  properties?: Record<string, string>;
}

export interface AgentComponentSection {
  key: AgentComponentSectionKey;
  title: string;
  description: string;
  itemLabel: string;
  state: 'available' | 'empty' | 'malformed';
  items: AgentComponentItem[];
  rawJson?: string;
}

export interface AgentUsageFeature {
  label: string;
  billedCredits: number;
  nonBilledCredits: number;
}

export interface AgentUsageSummary {
  totalActions: number;
  billedCredits: number;
  nonBilledCredits: number;
  reportedUsers: number;
  creditsPerUser: number;
  totalActionsChange?: number;
  billedCreditsChange?: number;
  nonBilledCreditsChange?: number;
  usersChange?: number;
  creditsPerUserChange?: number;
  lastUsage?: string;
  trend: { date: Date; billed: number; total: number }[];
  byFeature: AgentUsageFeature[];
  topFeature?: string;
  peakActivity?: string;
  growth?: number;
  recent: AgentUsageRecord[];
}

export interface AgentMetadataRow {
  label: string;
  value: string;
  url?: string;
}

export interface AgentOverviewModel {
  agent: AgentInventoryRecord;
  governance: GovernancePostureItem[];
  billedCredits: number;
  nonBilledCredits: number;
  reportedUsers: number;
  lastUsage?: string;
  usageTrend: { date: Date; credits: number }[];
  enabledCapabilities: string[];
  unavailableCapabilities: string[];
  features: AgentFeatureDetail[];
  components: AgentComponentSection[];
  usage: AgentUsageSummary;
  metadata: AgentMetadataRow[];
}
