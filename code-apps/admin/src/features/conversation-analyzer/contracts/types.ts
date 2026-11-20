/**
 * Conversation Analyzer - Domain types.
 *
 * The generated Dataverse types (`Cat_conversationanalyzers`,
 * `Cat_conversationanalyzerprompts`) describe the raw row shape. These
 * domain types describe the shapes used by the UI layer (cards, tables,
 * charts) after parsing `cat_promptresult` JSON and classifying health.
 */

import type { Cat_conversationanalyzerpromptscat_type } from '../../../generated/models/Cat_conversationanalyzerpromptsModel';

export type ActiveTab = 'overview' | 'agents' | 'prompt-insights' | 'conversations';

export type TimePeriod = 'last7' | 'last30' | 'last90' | 'custom';

export interface FilterState {
  activeTab: ActiveTab;
  timePeriod: TimePeriod;
  customStartDate: string;
  customEndDate: string;
}

export interface DateFilter {
  startDate: Date;
  endDate: Date;
}

export interface FilterContextType extends FilterState {
  setActiveTab: (tab: ActiveTab) => void;
  setTimePeriod: (period: TimePeriod) => void;
  setCustomStartDate: (date: string) => void;
  setCustomEndDate: (date: string) => void;
  getDateFilter: () => DateFilter;
}

export type HealthStatus = 'healthy' | 'attention' | 'critical' | 'unknown';

export type PromptType = Cat_conversationanalyzerpromptscat_type;
export const PROMPT_TYPE_SYSTEM: PromptType = 1;
export const PROMPT_TYPE_CUSTOM: PromptType = 2;

export type PromptScope = 'system' | 'custom';

export type SentimentLabel = 'positive' | 'neutral' | 'mixed' | 'negative' | 'unknown';

export type Outcome = 'resolved' | 'escalated' | 'abandoned' | 'unknown';

export type PiiExposure = 'none' | 'low' | 'medium' | 'high' | 'unknown';

export interface AnalyzerFilter {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  environmentUrl?: string;
  promptId?: string;
  promptType?: PromptType;
}

export interface AnalyzerRow {
  id: string;
  agentId?: string;
  conversationId?: string;
  promptId?: string;
  promptName?: string;
  promptType?: PromptType;
  summary?: string;
  durationSeconds?: number;
  messages?: number;
  createdOn?: string;
  content?: string;
  promptResultRaw?: string;
  sentiment?: SentimentLabel;
  pii?: PiiExposure;
  outcome?: Outcome;
  health?: HealthStatus;
}

export interface PromptRow {
  id: string;
  name: string;
  displayName?: string;
  type: PromptType;
  userPrompt?: string;
  scope: PromptScope;
  createdOn?: string;
  modifiedOn?: string;
  createdBy?: string;
  modifiedBy?: string;
  state: number;
}

// Conversations tab: transcripts browsed from any Dataverse-enabled environment.

export interface ConversationEnvironment {
  name: string;
  organizationUrl: string;
}

export interface ConversationAgentOption {
  id: string;
  name: string;
}

export interface ConversationTranscriptRow {
  id: string;
  conversationId: string;
  agentId?: string;
  agentName?: string;
  conversationStartTime?: string;
  createdOn?: string;
  /** Derived from the transcript content; undefined when the content is missing or unreadable. */
  durationSeconds?: number;
  messageCount?: number;
}

export interface ConversationTranscriptPage {
  rows: ConversationTranscriptRow[];
  nextPageToken?: string;
}

export type ConversationTranscriptSortColumn = 'conversationId' | 'conversationStart';

export type ConversationTranscriptSortDirection = 'ascending' | 'descending';

export interface ConversationTranscriptSortState {
  sortColumn: ConversationTranscriptSortColumn;
  sortDirection: ConversationTranscriptSortDirection;
}

export interface ConversationAnalysisOutcome {
  transcriptId: string;
  conversationId: string;
  agentId?: string;
  agentName?: string;
  status: 'succeeded' | 'failed' | 'warning';
  recordId?: string;
  summary: string;
}

export interface ConversationAnalysisRun {
  status: 'running' | 'completed' | 'failed';
  environmentUrl: string;
  environmentName: string;
  promptName: string;
  total: number;
  outcomes: ConversationAnalysisOutcome[];
  error?: string;
}
