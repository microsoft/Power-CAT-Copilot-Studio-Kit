import { SENTIMENT_BADGE } from '../contracts/constants';
import { parsePromptResult } from './parsePromptResult';

export type AnalysisOutcomeTone = 'success' | 'danger' | 'warning' | 'informative' | 'subtle';

export interface AnalysisOutcome {
  label: string;
  tone: AnalysisOutcomeTone;
  /** Prompt-specific flag used by the Analysis results summary (AR-2). */
  flagged: boolean;
  kind: 'sentiment' | 'pii' | 'custom';
}

/** Maps a stored prompt result to the short outcome shown in analysis chips (CV-10, AR-3). */
export function getAnalysisOutcome(promptResult?: string | null, summary?: string | null): AnalysisOutcome {
  const parsed = parsePromptResult(promptResult ?? undefined, summary ?? undefined);
  if (parsed.sentiment) {
    const badge = SENTIMENT_BADGE[parsed.sentiment];
    return {
      label: badge.label,
      tone: badge.color as AnalysisOutcomeTone,
      flagged: parsed.sentiment === 'negative',
      kind: 'sentiment',
    };
  }
  if (parsed.pii !== undefined) {
    const found = parsed.pii !== 'none' && parsed.pii !== 'unknown';
    return {
      label: found ? 'PII found' : 'No PII',
      tone: found ? (parsed.pii === 'high' ? 'danger' : 'warning') : 'success',
      flagged: found,
      kind: 'pii',
    };
  }
  return { label: 'Completed', tone: 'success', flagged: false, kind: 'custom' };
}

/** Label of the prompt-specific flag tile for a result kind (AR-2). */
export function getFlagLabel(kind: AnalysisOutcome['kind'] | undefined): string | undefined {
  if (kind === 'sentiment') return 'Negative';
  if (kind === 'pii') return 'PII detected';
  return undefined;
}
