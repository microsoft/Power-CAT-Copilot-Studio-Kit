import { formatCredits } from './credits';
import { formatWhen } from './model-assessment';
import type {
  ModelRecommendation,
  RecommendationConfidence,
  RecommendationRequest,
  RecommendationVerdict,
} from './model-recommendation';

export type ReadyRecommendationRequest = Extract<RecommendationRequest, { state: 'ready' }>;

export const VERDICT_LABEL: Record<RecommendationVerdict, string> = {
  A: 'Recommended',
  B: 'Recommended',
  equivalent: 'No clear winner',
  neither: 'Neither recommended',
  insufficient: 'Not enough data',
};

export const CONFIDENCE_LABEL: Record<RecommendationConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const percent = (value: number | null) => (value === null ? '-' : `${value}%`);

/** Display names of the two runs; the date tells two runs of one model apart. */
export function recommendationRunNames(request: ReadyRecommendationRequest): [string, string] {
  const { runA, runB } = request;
  if (runA.model !== runB.model) return [runA.model, runB.model];
  const when = (item: typeof runA) => formatWhen(item.run.completedOn ?? item.run.startedOn);
  return [`${runA.model} (${when(runA)})`, `${runB.model} (${when(runB)})`];
}

/** Deterministic counts, so the figures don't depend on the AI text. */
export function recommendationEvidence(request: ReadyRecommendationRequest, names: [string, string]): string {
  const { shared, runA, runB, credits } = request.payload;
  const withCredits = credits.bothReported && credits.perCheckA !== null && credits.perCheckB !== null;
  const run = (name: string, summary: typeof runA, passRate: number | null, perCheck: number | null) => {
    const total = summary.checks.total;
    let text = `${name}: ${total} ${total === 1 ? 'result' : 'results'}, ${percent(passRate)} shared pass`;
    // The decision compares credits per result, so runs with different coverage stay comparable.
    if (withCredits && summary.credits && perCheck !== null) {
      text += `, ${formatCredits(summary.credits.total)} credits (${formatCredits(perCheck)}/result)`;
    }
    return text;
  };
  return [
    run(names[0], runA, shared.passRateA, credits.perCheckA),
    run(names[1], runB, shared.passRateB, credits.perCheckB),
    `${shared.scored} shared`,
  ].join(' · ');
}

/** A generated recommendation, ready to print in the exported report. */
export interface RecommendationReport {
  /** Model of the recommended run, when one run is recommended. */
  winner?: string;
  verdictLabel: string;
  confidenceLabel?: string;
  headline: string;
  evidence: string;
  reasons: string[];
  tradeoffs: string[];
  caveats: string[];
}

/** Flatten a generated recommendation into the same wording the dialog shows. */
export function recommendationReport(request: ReadyRecommendationRequest, value: ModelRecommendation): RecommendationReport {
  const names = recommendationRunNames(request);
  return {
    winner: value.verdict === 'A' ? names[0] : value.verdict === 'B' ? names[1] : undefined,
    verdictLabel: VERDICT_LABEL[value.verdict],
    confidenceLabel: value.verdict === 'insufficient' ? undefined : CONFIDENCE_LABEL[value.confidence],
    headline: value.headline,
    evidence: recommendationEvidence(request, names),
    reasons: value.reasons,
    tradeoffs: value.tradeoffs,
    caveats: value.caveats,
  };
}
