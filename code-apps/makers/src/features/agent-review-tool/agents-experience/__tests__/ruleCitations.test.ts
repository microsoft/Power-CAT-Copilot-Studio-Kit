/**
 * Citation invariants across the whole rule set.
 *
 * A review is only as trustworthy as the source it points at. One rule was found
 * citing OWASP LLM06 Excessive Agency for a step that *stalls* waiting for a
 * human — the opposite failure. A reader who followed that link would land on
 * something that did not describe their problem.
 *
 * These tests cannot judge whether a page carries a claim; only a human can do
 * that. What they can do is hold the mechanical half: every rule cites
 * something, every citation resolves, and no rule quietly loses its sources.
 */
import { describe, expect, it } from 'vitest';
import { RULE_REGISTRY } from '../services/skill/skillRuleRegistry';
import { REFERENCES } from '../contracts/references';

const rules = Object.entries(RULE_REGISTRY);

describe('rule citations', () => {
  it('registers the 53 audited rules plus the 7 projected AI skill rules', () => {
    // The audited inventory contained 64 rules. Eleven unsupported rules are
    // intentionally absent rather than being retained to satisfy a count.
    //
    // The registry is now fed from two places, so the halves are asserted
    // separately: a single total would say the number moved without saying
    // which source moved it.
    //
    // The AI half is projected from `skillAiRules` so that `getRule` can
    // resolve the ids the ARC2 nodes cite. Before that projection existed,
    // every per-skill AI finding was silently dropped when rebuilt through
    // `createRegisteredFinding`. SKL-10 is deliberately not in this half — it
    // is hand-authored in the registry and excluded from the projection.
    const projected = rules.filter(([ruleId]) => ruleId.startsWith('SKL-AI-'));
    const audited = rules.filter(([ruleId]) => !ruleId.startsWith('SKL-AI-'));

    expect(projected).toHaveLength(7);
    expect(audited).toHaveLength(53);
    expect(rules).toHaveLength(60);
  });

  it.each(rules)('%s cites at least one source', (_ruleId, rule) => {
    expect(rule.referenceIds.length).toBeGreaterThan(0);
  });

  it.each(rules)('%s cites only sources that resolve in the catalogue', (_ruleId, rule) => {
    for (const referenceId of rule.referenceIds) {
      expect(REFERENCES[referenceId as keyof typeof REFERENCES]).toBeDefined();
    }
  });

  it.each(rules)('%s does not cite the same source twice', (_ruleId, rule) => {
    expect(new Set(rule.referenceIds).size).toBe(rule.referenceIds.length);
  });

  it('keeps OWASP LLM06 only on rules about an agent acting too freely', () => {
    // Excessive Agency describes an agent that does too much on its own. A rule
    // about an agent that does too little — stalling, waiting, refusing — is a
    // different failure and must not borrow this citation.
    const citing = rules.filter(([, rule]) => rule.referenceIds.includes('owasp-llm06')).map(([id]) => id);
    expect(citing).not.toContain('AUTO-UNATTENDED');
    expect(citing).toContain('AUTO-DESTRUCTIVE');
  });

  it('does not use the Anthropic blog for new rule citations', () => {
    const citing = rules.filter(([, rule]) => rule.referenceIds.includes('anthropic-agents'));
    expect(citing).toEqual([]);
  });
});
