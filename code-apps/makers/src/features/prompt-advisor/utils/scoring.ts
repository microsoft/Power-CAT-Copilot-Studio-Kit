import type { CriteriaItem } from '../contracts/types';

/**
 * Build criteria items array from a prompt evaluation's scores.
 * Used to populate the CriteriaBarChart in the Evaluation pane.
 */
export function buildCriteriaItems(evaluation: {
  accuracy: number;
  clarity: number;
  creativity: number;
  relevance: number;
  coherence: number;
}): CriteriaItem[] {
  return [
    { name: 'Accuracy', value: evaluation.accuracy, maxValue: 10 },
    { name: 'Clarity', value: evaluation.clarity, maxValue: 10 },
    { name: 'Creativity', value: evaluation.creativity, maxValue: 10 },
    { name: 'Relevance', value: evaluation.relevance, maxValue: 10 },
    { name: 'Coherence', value: evaluation.coherence, maxValue: 10 },
  ];
}
