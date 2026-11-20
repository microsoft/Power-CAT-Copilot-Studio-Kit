import type { AnalysisResult, PromptEvaluation, PromptGroup, ResponseMetadata } from '../contracts/types';

interface QuickTestPredictionOutput {
  text?: string;
  finishReason?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  modelName?: string;
}

interface QuickTestRawResponse {
  responsev2?: {
    predictionOutput?: QuickTestPredictionOutput;
  };
}

interface RawPromptData {
  prompt?: string;
  response?: string;
  clarity?: number;
  relevance?: number;
  creativity?: number;
  accuracy?: number;
  coherence?: number;
  confidence_score?: string | number;
  confidence_score_reason?: string;
}

interface RawAnalysisOutput {
  input_prompt?: string;
  confidence_score?: string | number;
  confidence_score_reason?: string;
  clarity?: number;
  relevance?: number;
  creativity?: number;
  accuracy?: number;
  coherence?: number;
  suggested_prompt_groups?: Array<{
    group_label?: string;
    prompts?: RawPromptData[];
  }>;
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Remove % suffix if present, then parse
    const cleaned = val.replace('%', '').trim();
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

/**
 * Convert a confidence score to a display string and numeric value.
 *
 * The model returns scores inconsistently:
 * - Input prompt: often 0-10 scale (e.g. 8.7)
 * - Suggested prompts: often 0-100 or string with % (e.g. "96%" or 96)
 *
 * Detection: if the raw value is a string containing '%', treat as already percentage.
 * If numeric and <= 10, multiply by 10 to convert to percentage.
 */
function parseConfidenceScore(val: unknown): { display: string; value: number } {
  // If string contains %, parse the number part directly as percentage
  if (typeof val === 'string' && val.includes('%')) {
    const num = parseFloat(val.replace('%', '').trim()) || 0;
    return {
      display: `${Math.round(num)}%`,
      value: Math.round(num),
    };
  }

  let num = toNumber(val);

  // Values <= 10 are on a 0-10 scale, convert to percentage
  if (num > 0 && num <= 10) {
    num = num * 10;
  }

  return {
    display: `${Math.round(num)}%`,
    value: Math.round(num),
  };
}

function parsePromptEvaluation(raw: RawPromptData, inputPrompt?: string): PromptEvaluation {
  const score = parseConfidenceScore(raw.confidence_score);
  return {
    prompt: raw.prompt ?? inputPrompt ?? '',
    confidence_score: score.display,
    confidence_score_value: score.value,
    confidence_score_reason: raw.confidence_score_reason ?? '',
    clarity: toNumber(raw.clarity),
    relevance: toNumber(raw.relevance),
    creativity: toNumber(raw.creativity),
    accuracy: toNumber(raw.accuracy),
    coherence: toNumber(raw.coherence),
    response: raw.response ?? '',
  };
}

/**
 * Parse the raw Predict response into structured analysis results.
 *
 * The response from `Microsoft.Dynamics.CRM.Predict` contains:
 * `responsev2.predictionOutput.text` — a JSON string with analysis results.
 *
 * We defensively drill into the object since the nesting varies.
 */
export function parseQuickTestResponse(rawResponse: Record<string, unknown>): AnalysisResult {
  // Drill into response — may be at different nesting levels
  const response = rawResponse as unknown as QuickTestRawResponse;
  let predictionOutput = response?.responsev2?.predictionOutput;

  // Fallback: check if predictionOutput is directly on root
  if (!predictionOutput) {
    const resp2 = (rawResponse as Record<string, unknown>).responsev2 as Record<string, unknown> | undefined;
    if (resp2?.predictionOutput) {
      predictionOutput = resp2.predictionOutput as QuickTestPredictionOutput;
    }
  }

  // Fallback: maybe text is directly on responsev2
  if (!predictionOutput?.text) {
    const resp2 = (rawResponse as Record<string, unknown>).responsev2 as Record<string, unknown> | undefined;
    if (resp2?.text || (resp2?.predictionOutput as Record<string, unknown>)?.text) {
      const textVal = (resp2?.text ?? (resp2?.predictionOutput as Record<string, unknown>)?.text) as string;
      predictionOutput = { text: textVal };
    }
  }

  if (!predictionOutput?.text) {
    throw new Error('No text output received from AI model. The response format may have changed.');
  }

  // Parse the metadata
  const metadata: ResponseMetadata = {
    finishReason: predictionOutput.finishReason ?? 'unknown',
    totalTokens: toNumber(predictionOutput.totalTokens),
    promptTokens: toNumber(predictionOutput.promptTokens),
    completionTokens: toNumber(predictionOutput.completionTokens),
    modelName: predictionOutput.modelName ?? 'unknown',
  };

  // Parse the inner text JSON
  let parsed: RawAnalysisOutput;
  try {
    parsed = JSON.parse(predictionOutput.text) as RawAnalysisOutput;
  } catch {
    throw new Error('Failed to parse AI model response JSON. The model may have returned invalid output.');
  }

  const inputEvaluation = parsePromptEvaluation(
    {
      prompt: parsed.input_prompt ?? '',
      confidence_score: parsed.confidence_score,
      confidence_score_reason: parsed.confidence_score_reason,
      clarity: toNumber(parsed.clarity),
      relevance: toNumber(parsed.relevance),
      creativity: toNumber(parsed.creativity),
      accuracy: toNumber(parsed.accuracy),
      coherence: toNumber(parsed.coherence),
      response: '',
    },
    parsed.input_prompt
  );

  // Build prompt groups
  const promptGroups: PromptGroup[] = (parsed.suggested_prompt_groups ?? []).map((group) => ({
    group_label: group.group_label ?? 'Unknown Group',
    prompts: (group.prompts ?? []).map((p) => parsePromptEvaluation(p)),
  }));

  return { inputEvaluation, promptGroups, metadata };
}
