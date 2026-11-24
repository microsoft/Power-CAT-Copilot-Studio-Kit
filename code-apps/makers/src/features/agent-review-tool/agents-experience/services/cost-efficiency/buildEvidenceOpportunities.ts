import type { CostOpportunity } from '../../contracts/CostEfficiency';
import type { EvidenceState, ToolCoverage } from '../../contracts/TranscriptEvidence';

/**
 * Builds opportunities that are backed by observed transcript evidence.
 *
 * These outrank configuration-derived opportunities because they compare what
 * the maker configured with what actually ran, instead of inferring risk from
 * the saved model alone.
 *
 * Wording rule (spec 019 FR-5): a capability with no signal is "not observed in
 * this window". It is never called unused, dead, or wasted. No opportunity here
 * states a credit or currency saving, because transcripts carry no billing data.
 */
export function buildEvidenceOpportunities(evidence: EvidenceState | undefined): CostOpportunity[] {
  if (!evidence || evidence.status !== 'ready') return [];

  const ranked: Array<{ gap: number; opportunity: CostOpportunity }> = [];
  for (const coverage of evidence.coverage) {
    const opportunity = buildCoverageOpportunity(
      coverage,
      evidence.window.days,
      evidence.window.truncated,
    );
    if (opportunity) {
      ranked.push({ gap: notObservedCount(coverage), opportunity });
    }
  }
  // Largest gap first, so the reviewer sees the strongest evidence at the top.
  return ranked.sort((a, b) => b.gap - a.gap).map(entry => entry.opportunity);
}

/**
 * Counts only items the evidence can actually speak to.
 *
 * `configured - observed` is wrong once `not-attributable` exists: it sweeps in
 * every item whose class is only ever searched under a group name, which is how
 * a live agent reported 353 uploaded files as removable while the same
 * transcripts showed those files being searched.
 */
function notObservedCount(coverage: ToolCoverage): number {
  return coverage.items.filter(item => item.state === 'not-observed').length;
}

/** The denominator a finding may quote: items whose state the evidence can decide. */
function attributableCount(coverage: ToolCoverage): number {
  return coverage.configured - (coverage.notAttributable ?? 0);
}

function buildCoverageOpportunity(
  coverage: ToolCoverage,
  windowDays: number,
  truncated: boolean,
): CostOpportunity | undefined {
  const notObserved = notObservedCount(coverage);
  const attributable = attributableCount(coverage);
  if (attributable === 0 || notObserved <= 0) return undefined;

  const noun = coverage.kind === 'knowledge' ? 'knowledge source' : 'skill';
  const plural = notObserved === 1 ? noun : `${noun}s`;
  const names = coverage.items
    .filter(item => item.state === 'not-observed')
    .map(item => item.name);
  const id = `observed-gap-${coverage.kind}`;

  const evidence = [
    `${coverage.observed} of ${attributable} configured ${noun}s produced at least one call in the last ${windowDays} days.`,
    `Not observed: ${formatNameList(names)}.`,
    'Read from this agent\u2019s conversation transcripts, not from saved configuration.',
  ];
  if ((coverage.notAttributable ?? 0) > 0) {
    evidence.push(
      `${coverage.notAttributable} further configured ${noun}s are excluded from this finding. ` +
        `They belong to a class the transcript only ever searches under a group name` +
        `${formatAggregateNames(coverage)}, so no individual member can be confirmed either way.`,
    );
  }
  if (truncated) {
    evidence.push(
      'The transcript read stopped at the page limit, so this window is not complete.',
    );
  }

  return {
    id,
    title: `${notObserved} of ${attributable} configured ${plural} were not observed in the last ${windowDays} days`,
    potentialImpact: notObserved >= Math.ceil(attributable / 2) ? 'high' : 'medium',
    // Never "high": a bounded window cannot prove a capability is never used.
    confidence: truncated ? 'low' : 'medium',
    evidenceLabel: 'observed',
    evidence,
    recommendation:
      coverage.kind === 'knowledge'
        ? `Confirm each ${noun} is still needed. Removing one that is never searched reduces retrieval work on every task that searches knowledge.`
        : `Confirm each ${noun} is still needed. Removing one that is never invoked shortens the instruction context the model reads on every task.`,
    qualityRisk:
      `A ${noun} may serve a rare but important case that did not occur in this window. Removing it can silently degrade that case.`,
    validationPlan:
      `Widen the window or check a longer history before removing anything. Then run the agent\u2019s evaluation suite with and without the ${noun} and compare pass rate.`,
  };
}

/** Names the group the excluded items were searched under, when one is known. */
function formatAggregateNames(coverage: ToolCoverage): string {
  const names = (coverage.aggregateObservations ?? []).map(entry => entry.name);
  if (names.length === 0) return '';
  return ` (${formatNameList(names, 2)})`;
}

/** Renders names as a readable list, capped so the card stays scannable. */
function formatNameList(names: string[], max = 3): string {
  if (names.length === 0) return 'none';
  if (names.length <= max) {
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const remaining = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${remaining} more`;
}
