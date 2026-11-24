/**
 * TASK 7 capability-edge mapping.
 *
 * These edges become lines on the Agent Map, so the bar is higher than for a
 * finding in a list: a drawn edge reads as fact. The mapper therefore drops
 * anything it cannot justify rather than rendering it, and degrades toward
 * caution when the model returns something outside its declared enum — which it
 * demonstrably does (observed: `riskLevel: "low"`, not a declared value).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../generated/services/Cat_agentreviewjobsService', () => ({
  Cat_agentreviewjobsService: { create: vi.fn(), update: vi.fn(), get: vi.fn(), upload: vi.fn() },
}));

vi.mock('../../../../generated/services/Cat_agentreviewjobitemsService', () => ({
  Cat_agentreviewjobitemsService: { getAll: vi.fn() },
}));

import { toStandardEvaluation } from '../services/ai-providers/WorkflowReviewAiProvider';
import type { AgentComponentResult } from '../contracts/ReviewJob';

const mapped = (over: Record<string, unknown>) =>
  toStandardEvaluation({
    skillName: 's',
    status: 'complete',
    dimensions: [],
    findings: [],
    summary: '',
    ...over,
  } as unknown as AgentComponentResult);

describe('capability edges', () => {
  it('maps a well-formed edge', () => {
    const r = mapped({
      capabilityEdges: [{
        capabilityName: 'Planogram Archive',
        usage: 'read',
        evidence: 'Retrieve the approved layout from the planogram archive.',
        confidence: 'high',
      }],
    });
    expect(r.capabilityEdges).toEqual([{
      capabilityName: 'Planogram Archive',
      usage: 'read',
      evidence: 'Retrieve the approved layout from the planogram archive.',
      confidence: 'high',
    }]);
  });

  it('drops an edge with no evidence', () => {
    // An edge a reviewer cannot check is worse than no edge: the map would
    // assert a dependency nobody can verify.
    const r = mapped({ capabilityEdges: [{ capabilityName: 'Planogram Archive', usage: 'read', confidence: 'high' }] });
    expect(r.capabilityEdges).toEqual([]);
  });

  it('drops an edge with no capability name', () => {
    const r = mapped({ capabilityEdges: [{ usage: 'read', evidence: 'x', confidence: 'high' }] });
    expect(r.capabilityEdges).toEqual([]);
  });

  it('degrades an unknown confidence to low, never high', () => {
    const r = mapped({
      capabilityEdges: [{ capabilityName: 'T', usage: 'read', evidence: 'e', confidence: 'certain' }],
    });
    expect(r.capabilityEdges?.[0].confidence).toBe('low');
  });

  it('degrades an unknown usage to reference', () => {
    const r = mapped({
      capabilityEdges: [{ capabilityName: 'T', usage: 'obliterate', evidence: 'e', confidence: 'high' }],
    });
    expect(r.capabilityEdges?.[0].usage).toBe('reference');
  });

  it('keeps only the first edge per capability', () => {
    // The instruction asks for one entry per capability but cannot enforce it;
    // duplicates would draw the same line twice.
    const r = mapped({
      capabilityEdges: [
        { capabilityName: 'T', usage: 'read', evidence: 'first', confidence: 'high' },
        { capabilityName: 'T', usage: 'write', evidence: 'second', confidence: 'low' },
      ],
    });
    expect(r.capabilityEdges).toHaveLength(1);
    expect(r.capabilityEdges?.[0].evidence).toBe('first');
  });

  it('is undefined when the backend omits the field', () => {
    // Distinguishes "no edges found" (empty array) from "this backend does not
    // produce edges" (undefined) — the AI Builder path and pre-TASK-7 reviews.
    expect(mapped({}).capabilityEdges).toBeUndefined();
  });

  it('is an empty array when the skill genuinely uses nothing', () => {
    expect(mapped({ capabilityEdges: [] }).capabilityEdges).toEqual([]);
  });
});

describe('evidence must name the capability', () => {
  it('rejects the measured substitution false positive', () => {
    // Verbatim from the ZAVA Visual Merchandiser run on 2026-08-06: the model
    // claimed a configured tool while citing text that names a capability the
    // agent does not have. A second run 10s later returned no edge, so retrying
    // does not resolve it — the citation is what exposes the error.
    const r = mapped({
      capabilityEdges: [{
        capabilityName: 'Display Photo Library',
        usage: 'read',
        evidence: 'Pull the build photograph from the store camera feed.',
        confidence: 'medium',
      }],
    });
    expect(r.capabilityEdges).toEqual([]);
  });

  it('keeps a paraphrase that still shares a content word', () => {
    // Also from the same run, and correct: the skill says "ZAVA visual
    // standards" for a document titled "ZAVA-Visual-Merchandising-Standards".
    const r = mapped({
      capabilityEdges: [{
        capabilityName: 'ZAVA-Visual-Merchandising-Standards-v4.2.docx',
        usage: 'reference',
        evidence: 'Check the layout against the ZAVA visual standards.',
        confidence: 'medium',
      }],
    });
    expect(r.capabilityEdges).toHaveLength(1);
  });

  it('keeps a plain prose reference to a real tool', () => {
    const r = mapped({
      capabilityEdges: [{
        capabilityName: 'Planogram Archive',
        usage: 'read',
        evidence: 'Retrieve the approved layout from the planogram archive.',
        confidence: 'high',
      }],
    });
    expect(r.capabilityEdges).toHaveLength(1);
  });

  it('does not let a shared stop word carry an edge on its own', () => {
    const r = mapped({
      capabilityEdges: [{
        capabilityName: 'Fixture Register',
        usage: 'read',
        evidence: 'Use the data from the tool as an input.',
        confidence: 'high',
      }],
    });
    expect(r.capabilityEdges).toEqual([]);
  });
});
