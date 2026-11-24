/**
 * Parser for `cat_conversationanalyzer.cat_promptresult`.
 *
 * The AI Builder prompts (PII Analysis / Sentiment Analysis / Custom) return
 * structured JSON. This parser detects the type from the JSON shape and
 * extracts sentiment labels, scores, and PII exposure levels.
 */

import type { PiiExposure, SentimentLabel } from '../contracts/types';

export interface ParsedPromptResult {
  raw: string;
  parsed?: Record<string, unknown>;
  summary?: string;
  sentiment?: SentimentLabel;
  sentimentScore?: number;
  pii?: PiiExposure;
  piiCount?: number;
  accuracy?: number;
  flagged?: boolean;
}

export function parsePromptResult(promptResult: string | undefined, summary?: string): ParsedPromptResult {
  const raw = promptResult ?? '';
  let parsed: Record<string, unknown> | undefined;
  if (raw.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = undefined;
    }
  }

  const extractedSummary = summary ?? extractNestedString(parsed, ['summary', 'convSummary']) ?? undefined;

  // Detect PII result: has "pii" array or summary.containsPII
  const piiResult = extractPii(parsed);

  // Detect Sentiment result: has "sentiments" array or summary.overallSentiment
  const sentimentResult = extractSentiment(parsed);

  return {
    raw,
    parsed,
    summary: extractedSummary,
    sentiment: sentimentResult?.label,
    sentimentScore: sentimentResult?.score,
    pii: piiResult?.exposure,
    piiCount: piiResult?.count,
    accuracy: undefined,
    flagged: undefined,
  };
}

interface PiiExtraction {
  exposure: PiiExposure;
  count: number;
}

function extractPii(obj: Record<string, unknown> | undefined): PiiExtraction | undefined {
  if (!obj) return undefined;

  // Check for "pii" array at top level
  const piiArray = obj['pii'];
  const summaryObj = obj['summary'] as Record<string, unknown> | undefined;

  if (Array.isArray(piiArray)) {
    const count = piiArray.length;
    if (count === 0) return { exposure: 'none', count: 0 };
    // Determine exposure level from highest severity
    const highestSeverity = summaryObj?.['highestSeverity']
      ? Number(summaryObj['highestSeverity'])
      : Math.max(...piiArray.map((item: Record<string, unknown>) => Number(item?.severity ?? 0)));
    return { exposure: severityToExposure(highestSeverity), count };
  }

  // Check summary.containsPII
  if (summaryObj && 'containsPII' in summaryObj) {
    const containsPII = summaryObj['containsPII'];
    const totalItems = Number(summaryObj['totalPIIItems'] ?? 0);
    if (!containsPII || totalItems === 0) return { exposure: 'none', count: 0 };
    const severity = Number(summaryObj['highestSeverity'] ?? 1);
    return { exposure: severityToExposure(severity), count: totalItems };
  }

  return undefined;
}

function severityToExposure(severity: number): PiiExposure {
  if (severity >= 3) return 'high';
  if (severity >= 2) return 'medium';
  if (severity >= 1) return 'low';
  return 'none';
}

interface SentimentExtraction {
  label: SentimentLabel;
  score: number;
}

function extractSentiment(obj: Record<string, unknown> | undefined): SentimentExtraction | undefined {
  if (!obj) return undefined;

  const summaryObj = obj['summary'] as Record<string, unknown> | undefined;

  // Check for summary.overallSentiment or summary.averageSentimentScore
  if (summaryObj && ('overallSentiment' in summaryObj || 'averageSentimentScore' in summaryObj)) {
    const overallLabel = String(summaryObj['overallSentiment'] ?? '').toLowerCase();
    const score = parseFloat(String(summaryObj['averageSentimentScore'] ?? '0'));
    const label = mapSentimentLabel(overallLabel, score);
    return { label, score };
  }

  // Check for "sentiments" array
  if (Array.isArray(obj['sentiments']) && (obj['sentiments'] as unknown[]).length > 0) {
    const sentiments = obj['sentiments'] as Record<string, unknown>[];
    const avgScore =
      sentiments.reduce((sum, s) => sum + parseFloat(String(s['sentimentScore'] ?? '0')), 0) /
      sentiments.length;
    const label = scoreToSentimentLabel(avgScore);
    return { label, score: avgScore };
  }

  return undefined;
}

function mapSentimentLabel(raw: string, score: number): SentimentLabel {
  // Check negative labels first to avoid substring match ("dissatisfied" contains "satisfied")
  if (raw.includes('dissatisfied') || raw.includes('negative') || raw.includes('poor')) return 'negative';
  if (raw.includes('satisfied') || raw.includes('positive')) return 'positive';
  if (raw.includes('neutral')) return 'neutral';
  if (raw.includes('mixed')) return 'mixed';
  // Fallback to score
  return scoreToSentimentLabel(score);
}

function scoreToSentimentLabel(score: number): SentimentLabel {
  if (score >= 0.25) return 'positive';
  if (score <= -0.25) return 'negative';
  if (score === 0) return 'neutral';
  return 'mixed';
}

function extractNestedString(obj: Record<string, unknown> | undefined, candidates: string[]): string | undefined {
  if (!obj) return undefined;
  // Check top level
  for (const key of candidates) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  // Check inside "summary" sub-object
  const summaryObj = obj['summary'] as Record<string, unknown> | undefined;
  if (summaryObj) {
    for (const key of candidates) {
      const v = summaryObj[key];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
  }
  return undefined;
}
