/**
 * Score-band presentation, kept free of React so it can be tested in this app's `node` test
 * environment — the same reason `format.ts` is a plain module.
 *
 * `MetricCard` deliberately does not colour its headline number: a rise in "conversations with
 * errors" is bad and a rise in "conversations analysed" is neutral, so only the caller knows what
 * colour is honest. A pillar score is the opposite case — 0-100 where higher is always better — so
 * it gets its own card rather than a flag on that one.
 */

import { toneForScore, type ScoreTone } from './format';

/** A weighted contributor to a rolled-up score, in the shape both apps already hold one. */
export interface ScoreContributor {
  /** Display name, e.g. "Instructions". */
  name: string;
  /** 0-100. Ignored when `applicable` is false. */
  score: number;
  /** Percentage of the rolled-up score this contributor carries. */
  weight: number;
  /** False when the agent has nothing of this kind, e.g. skills on an agent with none. */
  applicable: boolean;
  /** False when some evidence for this contributor is missing. */
  complete: boolean;
}

/** Everything a score card renders, already decided. */
export interface ScoreCardModel {
  label: string;
  /** Pre-formatted headline, or undefined when there is no score to show. */
  value?: string;
  tone: ScoreTone;
  /** Secondary line: the weight, plus a partial marker when evidence is missing. */
  footnote: string;
  /** Explains the weight in full. Weight is shown because a low score on a 30-weight pillar and on an 8-weight pillar are very different problems. */
  hint?: string;
  /** Dims the card when the contributor does not apply to this agent. */
  muted: boolean;
}

/**
 * Decide how one contributor should read.
 *
 * A contributor that does not apply is shown rather than hidden: an agent with no skills and an
 * agent whose skills were not assessed look identical if the card simply disappears.
 */
export function scoreCardModel(contributor: ScoreContributor): ScoreCardModel {
  if (!contributor.applicable) {
    return {
      label: contributor.name, tone: 'fair', muted: true,
      footnote: 'Not applicable to this agent',
    };
  }
  return {
    label: contributor.name,
    value: `${Math.round(contributor.score)}%`,
    tone: toneForScore(contributor.score),
    footnote: `Weight ${contributor.weight}%${contributor.complete ? '' : ' · partial'}`,
    hint: `This pillar contributes ${contributor.weight}% of the rolled-up score.`,
    muted: false,
  };
}

/**
 * Order contributors so the ones that can move the total most come first.
 *
 * Sorting by score alone would lead with a 0-scoring 5-weight pillar while a 40-scoring 30-weight
 * pillar — three times the lost points — sits below the fold. Inapplicable contributors sort last
 * because there is no action to take on them.
 */
export function byImpact(contributors: readonly ScoreContributor[]): ScoreContributor[] {
  const lostPoints = (item: ScoreContributor) =>
    item.applicable ? ((100 - item.score) / 100) * item.weight : -1;
  return [...contributors].sort((a, b) => lostPoints(b) - lostPoints(a) || a.name.localeCompare(b.name));
}
