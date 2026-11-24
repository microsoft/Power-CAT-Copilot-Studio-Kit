import type { AnalysisOutcomeTone } from '../../../utils/analysisOutcome';

export interface AnalysisChipData {
  key: string;
  promptLabel: string;
  outcomeLabel: string;
  tone: AnalysisOutcomeTone;
}

/** Row shape rendered by the shared conversation grid (Conversations, New analysis, Analysis results). */
export interface ConversationGridRow {
  id: string;
  /** Dataverse `conversationtranscriptid`; retained for transcript loading and analysis joins. */
  transcriptId: string;
  /** Transcript `name` (stored as `cat_name` on analysis results); shown and copied in the grid. */
  conversationId: string;
  topic?: string;
  agentName?: string;
  startTime?: string;
  durationSeconds?: number;
  messageCount?: number;
  analyses?: AnalysisChipData[];
  runStatus?: 'queued' | 'analyzing';
  summary?: string;
}

export type ConversationGridColumnId =
  | 'conversation'
  | 'agent'
  | 'startTime'
  | 'duration'
  | 'messages'
  | 'analysis'
  | 'summary'
  | 'actions';

export interface ConversationGridSortState {
  sortColumn: ConversationGridColumnId;
  sortDirection: 'ascending' | 'descending';
}

/** Class the grid uses to reveal the copy-ID button on row hover or focus. */
export const COPY_ID_CLASS = 'cak-conversation-copy-id';
