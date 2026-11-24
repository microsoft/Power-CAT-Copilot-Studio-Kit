/**
 * The Source badge has to appear on a rule that passed.
 *
 * It used to appear only on rules that failed, because the citation was read off the finding and a
 * pass produces no finding. That is the case these tests pin: the citation now comes from the rule
 * id, so it survives a pass, and every check the list can name has one.
 */

import { describe, expect, it } from 'vitest';

import { REFERENCES } from '../../agents-experience/contracts/references';
import { ALL_RULES } from '../../agents-experience/services/GroundedRuleEngine';
import { RULE_DISPLAY_LABELS } from '../ruleDisplayLabels';
import { citationProvenance, resolveReference, ruleReferenceId } from '../ruleReferences';

describe('ruleReferenceId', () => {
  it('resolves a rule that declares its own citation', () => {
    const rule = ALL_RULES[0];
    expect(ruleReferenceId(rule.id)).toBe(rule.referenceId);
  });

  it('resolves a check that exists only as evaluator output', () => {
    // SKL-05 is raised by CopilotReviewService, not by ALL_RULES, and cites OWASP.
    expect(ruleReferenceId('SKL-05')).toBe('owasp-llm01');
    expect(ruleReferenceId('INS-04')).toBe('ms-authoring-instructions');
  });

  it('returns nothing for an unknown or absent rule id', () => {
    expect(ruleReferenceId('XYZ-99')).toBeUndefined();
    expect(ruleReferenceId(undefined)).toBeUndefined();
  });

  it('names a source for every check the list can label', () => {
    const unlinked = Object.keys(RULE_DISPLAY_LABELS).filter(id => !ruleReferenceId(id));
    expect(unlinked).toEqual([]);
  });

  it('only cites pages the registry actually holds', () => {
    const missing = [...Object.keys(RULE_DISPLAY_LABELS), ...ALL_RULES.map(r => r.id)]
      .map(id => ruleReferenceId(id))
      .filter(refId => refId && !(refId in REFERENCES));
    expect(missing).toEqual([]);
  });
});

describe('resolveReference', () => {
  it('gives the badge a publisher, a link, and a title', () => {
    expect(resolveReference('owasp-llm06')).toEqual({
      label: 'OWASP',
      url: REFERENCES['owasp-llm06'].url,
      title: REFERENCES['owasp-llm06'].title,
    });
  });

  it('a rule id alone is enough to reach the page', () => {
    // What a passing row now has: no finding, so no stored reference — only the rule id.
    const reference = resolveReference(ruleReferenceId('TOL-03'));
    expect(reference?.url).toMatch(/^https:\/\//);
    expect(reference?.label).toBe('Microsoft Learn');
  });

  it('names an unregistered id rather than dropping the badge', () => {
    expect(resolveReference('not-in-the-registry')).toEqual({ label: 'not-in-the-registry' });
  });

  it('has nothing to show without an id', () => {
    expect(resolveReference(undefined)).toBeUndefined();
  });
});

describe('citationProvenance', () => {
  it('counts distinct pages, not rows, and splits Microsoft Learn from the rest', () => {
    const parts = citationProvenance([
      { ruleId: 'INS-02' },
      { ruleId: 'INS-03' },
      { ruleId: 'INS-04' },
      { ruleId: 'SKL-05' },
      { ruleId: 'SKL-10' },
    ]);
    // INS-02..04 all cite ms-authoring-instructions, so the three rows are one source.
    expect(parts).toEqual(['3 references cited', '1 Microsoft Learn', '2 web']);
  });

  it('prefers a row own citation over the rule default', () => {
    const parts = citationProvenance([{ ruleId: 'INS-02', reference: 'owasp-llm01' }]);
    expect(parts).toEqual(['1 reference cited', '1 web']);
  });

  it('omits a bucket that has nothing in it', () => {
    expect(citationProvenance([{ ruleId: 'INS-02' }])).toEqual([
      '1 reference cited',
      '1 Microsoft Learn',
    ]);
  });

  it('ignores an id that names no page, and says nothing when none resolve', () => {
    expect(citationProvenance([{ ruleId: 'NOPE-99' }, { ruleId: 'X', reference: 'gone' }]))
      .toEqual([]);
  });
});
