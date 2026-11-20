/**
 * The harness label policy — the one place a pillar is spelled differently per harness.
 *
 * A Standard agent's Skills pillar is filled entirely by rules over topic metadata and topic
 * references, so it reads "Topics". Every other harness keeps the shared label, because a
 * Copilot agent's Skills pillar really does score skills.
 *
 * The risk worth guarding is drift from a copy change into a data change: a relabel that
 * reached the id, the weight or the legacy spelling would move persisted rows and saved
 * scores rather than words on a page.
 */
import { describe, expect, it } from 'vitest';
import {
  HARNESS_PILLAR_LABELS, HARNESSES, pillarLabelFor, pillarNameLabelFor,
} from '../harness';
import {
  AGENT_PILLARS, AGENT_PILLAR_WEIGHTS, LEGACY_PILLAR_NAME, PILLAR_LABELS,
} from '../pillars';

describe('harness pillar labels', () => {
  it('spells the Standard harness Skills pillar "Topics", in either casing', () => {
    expect(pillarLabelFor('standard', 'skills')).toBe('Topics');
    expect(pillarNameLabelFor('standard', 'skills')).toBe('Topics');
    expect(pillarNameLabelFor('standard', 'Skills')).toBe('Topics');
  });

  it('keeps the shared label wherever the pillar genuinely scores skills', () => {
    for (const harness of HARNESSES.filter(h => h !== 'standard')) {
      expect(pillarLabelFor(harness, 'skills')).toBe('Skills');
      expect(pillarNameLabelFor(harness, 'Skills')).toBe('Skills');
    }
    expect(pillarLabelFor(undefined, 'skills')).toBe('Skills');
    expect(pillarNameLabelFor(undefined, 'Skills')).toBe('Skills');
  });

  it('overrides nothing else, under any harness', () => {
    for (const harness of HARNESSES) {
      for (const pillar of AGENT_PILLARS) {
        if (harness === 'standard' && pillar === 'skills') continue;
        expect(pillarLabelFor(harness, pillar)).toBe(PILLAR_LABELS[pillar]);
      }
    }
  });

  it('returns a name that is not a pillar unchanged, rather than dropping it', () => {
    // Reviews saved before the composite carry the blend labels, which name no pillar.
    expect(pillarNameLabelFor('standard', 'Pattern score')).toBe('Pattern score');
    expect(pillarNameLabelFor('standard', 'Instructions score')).toBe('Instructions score');
  });

  it('is copy only: it moves no id, no weight and no persisted spelling', () => {
    expect(Object.keys(HARNESS_PILLAR_LABELS.standard ?? {})).toEqual(['skills']);
    expect(AGENT_PILLAR_WEIGHTS.skills).toBe(15);
    expect(LEGACY_PILLAR_NAME.skills).toBe('Skills');
    expect(PILLAR_LABELS.skills).toBe('Skills');
  });
});
