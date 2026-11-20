import { describe, expect, it } from 'vitest';
import { gateFindings, gateSkillEval } from '../services/CitationGate';
import type { GroundedFinding } from '../contracts/Findings';
import type { SkillBundleEvaluation } from '../contracts/SkillEvaluation';

const finding = (referenceId: string): GroundedFinding => ({
  id: 'X', family: 'F', severity: 'warning', title: 't', fact: 'f', why: 'w', fix: 'x',
  referenceId: referenceId as GroundedFinding['referenceId'], ai: true,
});

const baseEval = (overrides: Partial<SkillBundleEvaluation>): SkillBundleEvaluation => ({
  name: 's', descriptionPresent: true, descriptionStatesWhen: true, descriptionRationale: '',
  dimensions: [], overallScorePercent: 80, band: 'Strong', sizeLabel: '1 KB', structureOk: true,
  safety: { flagged: false, severity: 'none', findings: [] }, resources: [],
  bundleIntegrity: { referencedButMissing: [], presentButUnreferenced: [], progressiveDisclosureOk: true, rationale: '' },
  crossSkillConflicts: [], citations: [], summary: '', ...overrides,
});

describe('CitationGate', () => {
  it('keeps findings with on-list references, drops off-list', () => {
    const out = gateFindings([finding('ms-tools-skills'), finding('made-up-ref')]);
    expect(out).toHaveLength(1);
    expect(out[0].referenceId).toBe('ms-tools-skills');
  });

  it('keeps a skill eval with a valid citation and strips off-list safety refs', () => {
    const e = baseEval({
      citations: [{ id: 'owasp-llm01', title: 'x', url: 'https://genai.owasp.org/llmrisk/llm01-prompt-injection/', source: 'OWASP' }],
      safety: { flagged: true, severity: 'high', findings: [
        { id: 'INJ-01', target: 'markdown', category: 'role-override', severity: 'high', evidence: 'e', rationale: 'r', recommendation: 'x', reference: 'owasp-llm01' },
        { id: 'FAKE', target: 'markdown', category: 'x', severity: 'high', evidence: 'e', rationale: 'r', recommendation: 'x', reference: 'not-a-ref' },
      ] },
    });
    const gated = gateSkillEval(e);
    expect(gated).not.toBeNull();
    expect(gated!.safety.findings).toHaveLength(1);
  });

  it('drops a skill eval whose citations are all off-list', () => {
    const e = baseEval({ citations: [{ id: 'nope', title: 'x', url: 'https://evil.example', source: 'OWASP' }] });
    expect(gateSkillEval(e)).toBeNull();
  });
});
