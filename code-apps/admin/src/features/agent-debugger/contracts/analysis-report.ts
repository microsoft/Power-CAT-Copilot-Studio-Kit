import type { ConversationData } from "./conversation";
import type { ConnectedAgentInfo } from "./connected-agent";
import type { ProcessedTranscript } from "./transcript";
import type { SessionSummary } from "./workspace";
import type { ComponentInfo } from "../services/botcomponents-service";
import type { OfflineConversationSnapshot } from "./offline-viewer";

/** Full analysis inputs. Deliberately excludes UI tab and session selections. */
export interface AnalysisReportInput {
  agentName: string;
  conversationId: string;
  environmentUrl?: string;
  source: "snapshot" | "transcript";
  conversation: ConversationData;
  transcript: ProcessedTranscript;
  sessions: readonly SessionSummary[];
  componentNames: Record<string, ComponentInfo>;
  connectedAgents: ConnectedAgentInfo[];
  warnings: string[];
}

/** Captured strings with presentation semantics, never mutable analysis references. */
export type AnalysisReportContentBlock = (
  | { kind: "text" | "markdown" | "code"; text: string }
  | { kind: "heading"; text: string; category?: "group" | "tool" | "recommendation" }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "fields"; fields: Array<{ label: string; value: string }> }
) & { exportProvenance?: "step" | "events" | "message" };

export interface AnalysisReportStep {
  heading: string;
  category: "prompt" | "tool" | "skill" | "reasoning" | "response";
  blocks: AnalysisReportContentBlock[];
  observedEvidence?: ObservedToolEvidence;
  parentHeading?: string;
}

export type QueryAvailability = "recorded" | "not-recorded" | "ambiguous";
export type CorrelationQuality = "matched" | "completion-only" | "start-only" | "missing" | "ambiguous";

/** Explicit ToolCallTrace evidence only; absence is never interpreted as success. */
export interface ObservedToolEvidence {
  toolCallId?: string;
  toolCategory?: string;
  startedAt?: string;
  completedAt?: string;
  recordedDuration?: string;
  httpStatus?: string;
  errorCode?: string;
  toolCallStatus?: string;
  queryAvailability: QueryAvailability;
  correlationQuality: CorrelationQuality;
}

export type AnalysisReportBlock = AnalysisReportContentBlock | {
  kind: "exchange";
  heading: string;
  steps: AnalysisReportStep[];
  messages?: Array<{ role: "user" | "assistant"; text: string; timestamp: string; id: string }>;
  messageDetails?: AnalysisReportContentBlock[];
};

/** Structured capture with no references to mutable analysis state. */
export interface AnalysisReport {
  title: string;
  filename: string;
  sections: Array<{ heading: string; blocks: AnalysisReportBlock[] }>;
  offline?: OfflineConversationSnapshot;
}
