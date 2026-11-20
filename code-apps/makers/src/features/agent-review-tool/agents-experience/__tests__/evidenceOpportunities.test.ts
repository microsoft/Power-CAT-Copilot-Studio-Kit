import { describe, expect, it } from 'vitest';
import { buildEvidenceOpportunities } from '../services/cost-efficiency/buildEvidenceOpportunities';
import type {
  EvidenceState,
  ObservationWindow,
  ToolCoverage,
} from '../contracts/TranscriptEvidence';

/**
 * Covers spec 019 FR-5. This builder writes the only text in the feature that
 * advises a maker to remove something, so it is the last place a false finding
 * can do real damage.
 *
 * It carries a live regression: on agent 8daaaaaa it produced "353 of 358
 * configured knowledge sources were not observed (99%)" with a recommendation
 * to remove them, while the same transcripts showed those files being searched
 * under the group name "Uploaded Files".
 */

const WINDOW: ObservationWindow = {
  startIso: '2026-07-11T00:00:00.000Z',
  endIso: '2026-08-10T00:00:00.000Z',
  days: 30,
  conversations: 113,
  truncated: false,
};

function ready(coverage: ToolCoverage[], window: Partial<ObservationWindow> = {}): EvidenceState {
  return {
    status: 'ready',
    window: { ...WINDOW, ...window },
    blockedConversations: 0,
    observedTools: [],
    coverage,
  };
}

/** Four websites (one searched) plus 353 files hidden behind one group name. */
function liveShapedCoverage(): ToolCoverage {
  return {
    kind: 'knowledge',
    configured: 357,
    observed: 1,
    notAttributable: 353,
    items: [
      { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 4 },
      { name: 'MDN Web Docs', sourceType: 'Website', state: 'not-observed', invocations: 0 },
      { name: 'Pricing FAQ', sourceType: 'Website', state: 'not-observed', invocations: 0 },
      { name: 'Release Notes', sourceType: 'Website', state: 'not-observed', invocations: 0 },
      ...Array.from({ length: 353 }, (_, index) => ({
        name: `file-${index}.docx`,
        sourceType: 'Uploaded file',
        state: 'not-attributable' as const,
        invocations: 0,
      })),
    ],
    aggregateObservations: [{ name: 'Uploaded Files', invocations: 4 }],
  };
}

describe('buildEvidenceOpportunities', () => {
  it('produces nothing until evidence is ready', () => {
    expect(buildEvidenceOpportunities(undefined)).toEqual([]);
    expect(buildEvidenceOpportunities({ status: 'loading' })).toEqual([]);
  });

  it('reports a genuine gap against the configured population', () => {
    const opportunity = buildEvidenceOpportunities(
      ready([
        {
          kind: 'knowledge',
          configured: 4,
          observed: 1,
          notAttributable: 0,
          items: [
            { name: 'React Reference', state: 'observed', invocations: 4 },
            { name: 'MDN Web Docs', state: 'not-observed', invocations: 0 },
            { name: 'Pricing FAQ', state: 'not-observed', invocations: 0 },
            { name: 'Release Notes', state: 'not-observed', invocations: 0 },
          ],
          aggregateObservations: [],
        },
      ]),
    )[0];
    expect(opportunity.title).toBe(
      '3 of 4 configured knowledge sources were not observed in the last 30 days',
    );
  });

  it('stays silent when every configured capability was observed', () => {
    expect(
      buildEvidenceOpportunities(
        ready([
          {
            kind: 'skill',
            configured: 1,
            observed: 1,
            notAttributable: 0,
            items: [{ name: 'summarise', state: 'observed', invocations: 3 }],
            aggregateObservations: [],
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('buildEvidenceOpportunities - not-attributable capabilities', () => {
  it('never counts an unjudgeable capability as a gap', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    // The defect read "353 of 358". Only the three unsearched websites qualify.
    expect(opportunity.title).toBe(
      '3 of 4 configured knowledge sources were not observed in the last 30 days',
    );
    expect(opportunity.title).not.toContain('353');
    expect(opportunity.title).not.toContain('357');
  });

  it('never names an unjudgeable capability among the not-observed items', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    const listed = opportunity.evidence.find(line => line.startsWith('Not observed:'));
    expect(listed).toBeDefined();
    expect(listed).not.toContain('file-0.docx');
  });

  it('discloses the excluded capabilities and the group that hid them', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    const disclosure = opportunity.evidence.find(line => line.includes('excluded'));
    expect(disclosure).toContain('353');
    expect(disclosure).toContain('Uploaded Files');
    expect(disclosure).toContain('can be confirmed either way');
  });

  it('suppresses the finding entirely when nothing can be judged', () => {
    // Every configured source hidden behind a group name. There is no evidence
    // for a finding, so the builder must say nothing rather than say 100%.
    expect(
      buildEvidenceOpportunities(
        ready([
          {
            kind: 'knowledge',
            configured: 3,
            observed: 0,
            notAttributable: 3,
            items: [
              { name: 'a.docx', state: 'not-attributable', invocations: 0 },
              { name: 'b.docx', state: 'not-attributable', invocations: 0 },
              { name: 'c.docx', state: 'not-attributable', invocations: 0 },
            ],
            aggregateObservations: [{ name: 'Uploaded Files', invocations: 7 }],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('grades impact against the judgeable population, not the whole catalogue', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    // 3 of 4 is a majority of what can be judged, so this stays high. Grading
    // 3 against 357 would have wrongly demoted a real finding to medium.
    expect(opportunity.potentialImpact).toBe('high');
  });

  it('never states a credit, token, or currency figure', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    const text = [
      opportunity.title,
      opportunity.recommendation,
      opportunity.qualityRisk,
      opportunity.validationPlan,
      ...opportunity.evidence,
    ].join(' ');
    expect(text).not.toMatch(/[$£€]|\bcredits?\b|\btokens?\b/i);
  });

  it('never calls a capability unused, dead, or wasted', () => {
    const opportunity = buildEvidenceOpportunities(ready([liveShapedCoverage()]))[0];
    const text = [
      opportunity.title,
      opportunity.recommendation,
      opportunity.qualityRisk,
      ...opportunity.evidence,
    ]
      .join(' ')
      .toLowerCase();
    ['unused', 'wasted', 'dead'].forEach(word => expect(text).not.toContain(word));
  });

  it('drops confidence and discloses an incomplete read', () => {
    const opportunity = buildEvidenceOpportunities(
      ready([liveShapedCoverage()], { truncated: true }),
    )[0];
    expect(opportunity.confidence).toBe('low');
    expect(opportunity.evidence.some(line => line.includes('not complete'))).toBe(true);
  });

  it('ranks the larger judgeable gap first', () => {
    const opportunities = buildEvidenceOpportunities(
      ready([
        {
          kind: 'skill',
          configured: 2,
          observed: 1,
          notAttributable: 0,
          items: [
            { name: 'summarise', state: 'observed', invocations: 2 },
            { name: 'escalate', state: 'not-observed', invocations: 0 },
          ],
          aggregateObservations: [],
        },
        liveShapedCoverage(),
      ]),
    );
    // Knowledge has 3 judgeable gaps against the skill block's 1. Ranking on
    // configured - observed would have put the 353-item block first on a count
    // it was never entitled to quote.
    expect(opportunities.map(entry => entry.id)).toEqual([
      'observed-gap-knowledge',
      'observed-gap-skill',
    ]);
  });
});
