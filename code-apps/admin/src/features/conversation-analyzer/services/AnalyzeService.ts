/**
 * AnalyzeService - analyzes one transcript inline (no cloud flow).
 *
 * Replaces the Power Automate flow "ConversationAnalyzer | Analyze Conversation Based On Prompt".
 * Invokes the AI Builder prompt (PII / Sentiment / Custom) and saves the result as a
 * cat_conversationanalyzers record. Batching, retries and replacement of previous results are
 * handled by {@link ConversationBatchAnalysisService}.
 */

import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import { parseTranscriptContent } from '../utils/parseTranscriptContent';
import type { PromptRow } from '../contracts/types';
import { ConversationPredictionService } from './ConversationPredictionService';

/** Minimal transcript shape needed to analyze and persist a conversation. */
export interface TranscriptLite {
  id: string;
  name?: string;
  content: string;
}

export class AnalyzeService {
  /**
   * Predicts and saves one transcript. Batch callers disable fallback persistence
   * so failed predictions cannot replace previous successful analyses.
   */
  static async analyzeTranscript(
    transcript: TranscriptLite,
    agentId: string,
    environmentUrl: string,
    prompt: PromptRow,
    saveFallback = true,
  ): Promise<{ rowId: string; success: boolean; summary: string; resultText: string }> {
    const promptName = prompt.displayName ?? prompt.name;

    // Parse raw content → formatted messages for AI Builder + metadata for record
    const parsed = parseTranscriptContent(transcript.content);
    if (!saveFallback && !parsed.formattedMessages.trim()) {
      throw new Error('The transcript has no supported messages to analyze.');
    }

    let resultText: string;
    let summary: string;
    let aiSucceeded = true;

    try {
      const prediction = await ConversationPredictionService.predict(prompt, parsed.formattedMessages);
      resultText = prediction.resultText;
      summary = prediction.summary;
    } catch (error) {
      console.error('[AnalyzeService] AI Builder prediction failed:', error);
      if (!saveFallback) throw error;
      // On failure, use fallback result (matches flow's error handling)
      const fallback = AnalyzeService.getFallbackResult(promptName);
      resultText = JSON.stringify(fallback);
      summary = 'Unable to evaluate due to sensitive or unsupported content.';
      aiSucceeded = false;
    }

    // Save result to Dataverse (single-step create with result already populated)
    const createRes = await Cat_conversationanalyzersService.create({
      cat_name: transcript.name ?? transcript.id,
      cat_agentid: agentId,
      cat_conversationid: transcript.id,
      cat_environmenturl: environmentUrl,
      cat_content: transcript.content,
      cat_messages: parsed.messageCount,
      cat_conversationdurationseconds: parsed.durationSeconds,
      cat_summary: summary,
      cat_promptresult: resultText,
      'cat_Prompt@odata.bind': `/cat_conversationanalyzerprompts(${prompt.id})`,
    } as Parameters<typeof Cat_conversationanalyzersService.create>[0]);

    const rowId = createRes.data?.cat_conversationanalyzerid;
    if (!createRes.success || !rowId) {
      throw new Error(createRes.error?.message ?? 'Unable to save the conversation analysis.');
    }
    return { rowId, success: aiSucceeded, summary, resultText };
  }

  /** Get fallback result when AI call fails (matches flow's error handling). */
  private static getFallbackResult(promptName: string): Record<string, unknown> {
    if (/pii/i.test(promptName)) {
      return {
        summary: {
          totalPIIItems: 'NA',
          containsPII: false,
          highestSeverity: '0',
          convSummary: 'Unable to evaluate due to sensitive or unsupported content.',
        },
        pii: [],
      };
    }
    if (/sentiment/i.test(promptName)) {
      return {
        summary: {
          overallSentiment: 'NA',
          dominantEmotion: 'Mixed',
          averageSentimentScore: '0',
          convSummary: 'Unable to evaluate due to sensitive or unsupported content.',
        },
        sentiments: [],
      };
    }
    return {
      result: 'NA',
      convSummary: 'Unable to evaluate due to sensitive or unsupported content.',
    };
  }
}
