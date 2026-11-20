/**
 * The dismissal vocabulary had no test at all, despite being load-bearing in three places.
 *
 * `dismissedKeys` is called at three separate entry points into the scorer (`scoring.ts:361,519,637`),
 * `scorePillar` reads dismissal for both the gate-returns-100 and the full-credit paths
 * (`score.ts:59-77`), and the whole surface is re-exported across the ART/ARC2 seam at
 * `art-ports.ts:154-155`. A silent regression here does not throw — it quietly stops a reviewer's
 * recorded judgement from moving the score, which is indistinguishable from the feature working.
 *
 * These tests pin the three promises the module's own documentation makes, because those are the
 * ones whose failure is invisible: re-review must not reinstate what the reviewer already dealt
 * with, reading a corrupt stored value must not throw while opening a review, and an empty list
 * must serialise to `null` rather than `"[]"`.
 */

import { describe, expect, it } from 'vitest';
import type { RuleEvaluationResult } from '../contracts/Findings';
import {
  carryForwardDismissals,
  componentRuleKey,
  dismissedKeys,
  isDismissed,
  parseDismissals,
  ruleKey,
  serializeDismissals,
  withDismissal,
  withoutDismissal,
  type RuleDismissal,
} from './dismissals';
import { scoreLegacyDeterministicRules } from './scoring';

const dismissal = (key: string, over: Partial<RuleDismissal> = {}): RuleDismissal => ({
  key,
  ruleId: key.split(':')[0],
  dismissedOn: '2026-01-01T00:00:00.000Z',
  ...over,
});

const result = (
  key: string,
  status: RuleEvaluationResult['status'],
): RuleEvaluationResult => ({
  key,
  ruleId: key.split(':')[0],
  family: 'Instructions',
  status,
});

describe('instance keys', () => {
  it('keys an agent-level rule on the bare rule id', () => {
    expect(ruleKey('EVL-05')).toBe('EVL-05');
  });

  it('keys a per-component rule on rule and component together', () => {
    expect(componentRuleKey('SKL-13', 'agent.skill.audit')).toBe('SKL-13:agent.skill.audit');
  });

  it('keeps one component distinct from another for the same rule', () => {
    // The documented reason the key is the instance and not the rule: a reviewer who accepted
    // SKL-13 on one skill has said nothing about the other three.
    const a = componentRuleKey('SKL-13', 'skill.a');
    const b = componentRuleKey('SKL-13', 'skill.b');
    expect(a).not.toBe(b);
    const set = dismissedKeys([dismissal(a)]);
    expect(set.has(a)).toBe(true);
    expect(set.has(b)).toBe(false);
  });
});

describe('dismissedKeys normalisation', () => {
  it('reads nothing as an empty set, so the parameter can stay optional everywhere', () => {
    expect(dismissedKeys(undefined).size).toBe(0);
  });

  it('passes a Set through unchanged', () => {
    const set = new Set(['EVL-05']);
    expect(dismissedKeys(set)).toBe(set);
  });

  it('accepts a bare key list, which is what a saved review holds', () => {
    expect([...dismissedKeys(['EVL-05', 'SKL-13:a'])].sort()).toEqual(['EVL-05', 'SKL-13:a']);
  });

  it('accepts full records, which is what the editing surface holds', () => {
    expect([...dismissedKeys([dismissal('EVL-05'), dismissal('TOL-04')])].sort())
      .toEqual(['EVL-05', 'TOL-04']);
  });

  it('reads an empty list as an empty set rather than as "not set"', () => {
    expect(dismissedKeys([]).size).toBe(0);
  });
});

describe('isDismissed', () => {
  it('matches on the instance key, not the rule id', () => {
    const dismissed = dismissedKeys(['SKL-13:skill.a']);
    expect(isDismissed(result('SKL-13:skill.a', 'error'), dismissed)).toBe(true);
    expect(isDismissed(result('SKL-13:skill.b', 'error'), dismissed)).toBe(false);
  });
});

describe('carryForwardDismissals', () => {
  it('carries a dismissal whose rule still fires, so re-review is not the same triage session', () => {
    const kept = carryForwardDismissals([dismissal('EVL-05')], [{ key: 'EVL-05' }]);
    expect(kept.map(d => d.key)).toEqual(['EVL-05']);
  });

  it('drops a dismissal with nothing to attach to, so it cannot re-apply months later', () => {
    // The documented hazard: keeping it would quietly re-apply if a component of the same name
    // reappeared, silently crediting a rule nobody reviewed.
    const kept = carryForwardDismissals(
      [dismissal('SKL-13:deleted.skill'), dismissal('EVL-05')],
      [{ key: 'EVL-05' }],
    );
    expect(kept.map(d => d.key)).toEqual(['EVL-05']);
  });

  it('preserves the reviewer\u2019s reason and attribution when carrying forward', () => {
    const [carried] = carryForwardDismissals(
      [dismissal('EVL-05', { reason: 'single-skill harness', dismissedBy: 'nav' })],
      [{ key: 'EVL-05' }],
    );
    expect(carried.reason).toBe('single-skill harness');
    expect(carried.dismissedBy).toBe('nav');
  });

  it('drops everything when the new review produced no results', () => {
    expect(carryForwardDismissals([dismissal('EVL-05')], [])).toEqual([]);
  });
});

describe('withDismissal / withoutDismissal', () => {
  it('replaces rather than duplicates when a rule is ignored twice', () => {
    const first = withDismissal([], dismissal('EVL-05', { reason: 'first' }));
    const second = withDismissal(first, dismissal('EVL-05', { reason: 'second' }));
    expect(second).toHaveLength(1);
    expect(second[0].reason).toBe('second');
  });

  it('leaves other dismissals alone when one is replaced', () => {
    const existing = [dismissal('EVL-05'), dismissal('TOL-04')];
    const next = withDismissal(existing, dismissal('EVL-05', { reason: 'updated' }));
    expect(next.map(d => d.key).sort()).toEqual(['EVL-05', 'TOL-04']);
  });

  it('removes only the named key on the "include this rule" path', () => {
    const next = withoutDismissal([dismissal('EVL-05'), dismissal('TOL-04')], 'EVL-05');
    expect(next.map(d => d.key)).toEqual(['TOL-04']);
  });

  it('is a no-op when the key was never dismissed', () => {
    const existing = [dismissal('EVL-05')];
    expect(withoutDismissal(existing, 'KNW-02').map(d => d.key)).toEqual(['EVL-05']);
  });
});

describe('parseDismissals is forgiving by design', () => {
  // The promise: a stored value that cannot be understood reads as "none set aside", because the
  // alternative is throwing while opening a review and losing the whole review over an optional
  // feature. Every case below must return [] rather than raise.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['malformed JSON', '{not json'],
    ['a JSON object', '{"key":"EVL-05"}'],
    ['a JSON string', '"EVL-05"'],
    ['a JSON number', '7'],
    ['JSON null', 'null'],
  ])('reads %s as none set aside without throwing', (_label, raw) => {
    expect(() => parseDismissals(raw as string | null | undefined)).not.toThrow();
    expect(parseDismissals(raw as string | null | undefined)).toEqual([]);
  });

  it('drops entries with no key, which are meaningless, but keeps the rest', () => {
    const parsed = parseDismissals(JSON.stringify([
      { ruleId: 'EVL-05' },
      null,
      'not an object',
      { key: '', ruleId: 'TOL-04' },
      { key: 'KNW-02', ruleId: 'KNW-02', dismissedOn: '2026-01-01T00:00:00.000Z' },
    ]));
    expect(parsed.map(d => d.key)).toEqual(['KNW-02']);
  });

  it('derives ruleId from the key when a hand-edited record omits it', () => {
    const [parsed] = parseDismissals(JSON.stringify([{ key: 'SKL-13:agent.skill.audit' }]));
    expect(parsed.ruleId).toBe('SKL-13');
  });

  it('defaults a missing timestamp rather than dropping the dismissal', () => {
    const [parsed] = parseDismissals(JSON.stringify([{ key: 'EVL-05', ruleId: 'EVL-05' }]));
    expect(parsed.dismissedOn).toBe('');
  });

  it('omits an empty reason instead of storing a blank one', () => {
    const [parsed] = parseDismissals(JSON.stringify([{ key: 'EVL-05', reason: '' }]));
    expect(parsed).not.toHaveProperty('reason');
  });
});

describe('serializeDismissals', () => {
  it('writes null for an empty list so "never used" is distinguishable from "used and undone"', () => {
    expect(serializeDismissals([])).toBeNull();
  });

  it('round-trips a full record without loss', () => {
    const original = [dismissal('SKL-13:agent.skill.audit', {
      reason: 'only skill in the harness',
      dismissedBy: 'nav',
    })];
    const reread = parseDismissals(serializeDismissals(original));
    expect(reread).toEqual(original);
  });

  it('round-trips a minimal record without inventing fields', () => {
    const original = [dismissal('EVL-05')];
    const reread = parseDismissals(serializeDismissals(original));
    expect(reread).toEqual(original);
    expect(reread[0]).not.toHaveProperty('reason');
    expect(reread[0]).not.toHaveProperty('dismissedBy');
  });
});

describe('dismissal reaches the scorer', () => {
  // Ties this module to the arithmetic it exists to influence. Without this, every unit test above
  // could pass while `dismissedKeys` fed the scorer a shape it ignored.
  const failing = [result('INS-01', 'error'), result('TOL-04', 'passed')];

  it('scores an undismissed error at half the pillar', () => {
    expect(scoreLegacyDeterministicRules(failing).score).toBe(50);
  });

  it('returns full credit once the reviewer sets the failing rule aside', () => {
    const dismissed = dismissedKeys([dismissal('INS-01')]);
    expect(scoreLegacyDeterministicRules(failing, dismissed).score).toBe(100);
  });

  it('keeps the row in the denominator rather than deleting it', () => {
    // A dismissal is a recorded judgement, not a way to make something disappear. If the row were
    // dropped instead of credited, a single-rule pillar would go null rather than 100.
    const dismissed = dismissedKeys([dismissal('INS-01')]);
    const single = scoreLegacyDeterministicRules([result('INS-01', 'error')], dismissed);
    expect(single.score).toBe(100);
  });

  it('ignores a dismissal keyed on a different instance of the same rule', () => {
    const rows = [result('SKL-13:skill.a', 'error'), result('SKL-13:skill.b', 'passed')];
    const dismissed = dismissedKeys([dismissal('SKL-13:skill.b')]);
    expect(scoreLegacyDeterministicRules(rows, dismissed).score).toBe(50);
  });
});
