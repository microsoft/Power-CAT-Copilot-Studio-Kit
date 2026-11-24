import type { AnalysisReportContentBlock } from "./analysis-report";
import type { ConnectedAgentInfo } from "./connected-agent";
import type { ProcessedTurn } from "./transcript";
import type { TranscriptData } from "../components/ui/types";
import type { ComponentInfo } from "../services/botcomponents-service";

/** Immutable presentation props for the real Conversation & activities tab. */
export interface OfflineConversationSnapshot {
  generalSections?: Array<{ heading: string; blocks: AnalysisReportContentBlock[] }>;
  identity?: { agentName: string; conversationId: string };
  transcriptData: TranscriptData;
  componentNames: Record<string, ComponentInfo>;
  messageLabels: Record<string, string>;
  turnDurationByMessageId: Record<string, number>;
  exchanges: Array<{
    label: string;
    messageId: string;
    turn: ProcessedTurn;
    connectedAgents: ConnectedAgentInfo[];
  }>;
}
