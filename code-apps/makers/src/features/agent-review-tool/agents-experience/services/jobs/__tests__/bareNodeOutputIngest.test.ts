import { describe, it, expect, vi } from 'vitest';
import {
  arc2ExceptionToFinding,
  arc2RuleResults,
  parseArc2NodeOutput,
  parseBareArc2Result,
} from '../aiWorkflowNodeOutput';
import { mapReviewJobItems } from '../reviewJobMapping';
import { ReviewJobItemStatus, type ReviewJobItemRow } from '../../../contracts/ReviewJob';
import { aiRulesForNode } from '../../../../review-core/registry';

/**
 * Pins the ingest of the bare node payload the AI workflow writes today.
 *
 * Every agent node's `CreateRecord` action composes `cat_resultjson` from the
 * node's structured output directly, with no `arc2-node-output-v4` envelope
 * around it, so the arrays arrive at the top level. Nothing downstream raises on
 * an unrecognised payload -- every field is read behind `?? []` -- so the only
 * symptom of a broken ingest is a review that completes with its AI findings
 * silently missing. These tests are the detector that failure mode lacks.
 *
 * The D-01 and D-05 cases are the load-bearing ones. The declarative-agent and
 * Standard branches are frozen on their own contracts and their own readers, so
 * a new shape detector that matched either of them would route a working branch
 * through the wrong parser.
 */
describe('bare node payload ingest', () => {
  const exception = {
    ruleId: 'SKL-AI-CLARITY',
    findingTitle: 'Steps omit the approval path',
    fact: 'The body lists three steps and none covers rejection.',
    whyItMatters: 'A user whose request is denied gets no response.',
    makerAction: 'Add a step describing the rejection path.',
    acceptanceCheck: 'The body names what happens when approval fails.',
    evidence: [{ componentId: 'skill-1', fieldPath: 'body', quote: 'Step 3: notify.' }],
  };

  it('reads a bare skill-bundle payload that carries no v4 envelope', () => {
    const parsed = parseBareArc2Result({
      skillName: 'laptop-request',
      exceptions: [exception],
      notAssessed: [],
      dimensions: [{ key: 'Clarity', score: 60, rationale: 'Partly specific.' }],
    }, 'copilot-skill');

    expect(parsed).not.toBeNull();
    expect(parsed!.node).toBe('copilot-skill');
    expect(parsed!.result.exceptions).toHaveLength(1);
    expect(parsed!.result.exceptions[0].ruleId).toBe('SKL-AI-CLARITY');
    expect(parsed!.result.dimensions).toHaveLength(1);
  });

  it('derives complete when nothing went unassessed and partial when something did', () => {
    const clean = parseBareArc2Result(
      { exceptions: [exception], notAssessed: [] }, 'copilot-skill');
    const partial = parseBareArc2Result({
      exceptions: [],
      notAssessed: [{ ruleId: 'SKL-04', reason: 'No resources were supplied.', scopeStatus: 'unavailable' }],
    }, 'copilot-skill');

    expect(clean!.status).toBe('complete');
    expect(partial!.status).toBe('partial');
  });

  it('accepts a coverage payload whose notAssessed entries omit scopeStatus', () => {
    // The flow's coverage fallback writes `reason` only, while its cross-skill
    // twin writes `scopeStatus` as well. A reader that required the field would
    // drop every rule the coverage node declined to judge.
    const parsed = parseBareArc2Result({
      exceptions: [],
      notAssessed: [{ ruleId: 'INS-02', reason: 'The reviewer did not return a result.' }],
    }, 'copilot-instructions');

    expect(parsed!.result.notAssessed).toHaveLength(1);
    expect(parsed!.result.notAssessed[0].scopeStatus).toBeUndefined();
    expect(parsed!.status).toBe('partial');
  });

  it('routes through the v4 parser, so an unusable rule id is filtered once', () => {
    const parsed = parseBareArc2Result({
      exceptions: [exception, { ...exception, ruleId: '' }],
      notAssessed: [{ ruleId: '', reason: 'No id.' }],
    }, 'copilot-skill');

    expect(parsed!.result.exceptions).toHaveLength(1);
    expect(parsed!.result.notAssessed).toHaveLength(0);
  });

  describe('frozen contracts must never match', () => {
    it('rejects a declarative-agent payload from BOTH parsers (D-01)', () => {
      // DA keeps its own reader and its own cat_itemstatus gate. Matching it
      // here would hand a working branch to a parser that cannot read `outcome`.
      const da = {
        contractVersion: 'da-review-1',
        correlationId: '8daaaaaa-aaaa-4aaa-aaaa-00000000000d',
        outcome: { ruleId: 'DA-01', status: 'fail', findings: [] },
      };

      expect(parseArc2NodeOutput(da)).toBeNull();
      expect(parseBareArc2Result(da, 'copilot-skill')).toBeNull();
    });

    it('rejects a Standard Review unit payload from BOTH parsers (D-05)', () => {
      // Standard stays on the legacy ART contract, which names its failures
      // `findings` and carries a unit-level `status` the host keys on.
      const standard = { status: 'partial', findings: [], notAssessed: [] };

      expect(parseArc2NodeOutput(standard)).toBeNull();
      expect(parseBareArc2Result(standard, 'standard')).toBeNull();
    });

    it('rejects a payload that already declares a contract', () => {
      // A mismatched contract string belongs to the v4 reader's rejection path,
      // not to this one; re-labelling it would hide the drift it signals.
      expect(parseBareArc2Result(
        { contract: 'arc2-node-output-v3', exceptions: [], notAssessed: [] },
        'copilot-skill',
      )).toBeNull();
    });
  });

  it('rejects shapes that are not a node result at all', () => {
    expect(parseBareArc2Result(null, 'copilot-skill')).toBeNull();
    expect(parseBareArc2Result('{}', 'copilot-skill')).toBeNull();
    expect(parseBareArc2Result([], 'copilot-skill')).toBeNull();
    expect(parseBareArc2Result({ exceptions: [] }, 'copilot-skill')).toBeNull();
    expect(parseBareArc2Result({ notAssessed: [] }, 'copilot-skill')).toBeNull();
  });
});

/**
 * Pins what a component row reports when its reviewer could not be read.
 *
 * The workflow writes `cat_itemstatus = 2` alongside a placeholder result naming
 * no rules, so the payload itself is indistinguishable from a component that was
 * reviewed and found clean. Nothing throws on it, nothing logs, and the review
 * completes -- a component nobody examined renders exactly like one that passed.
 *
 * Naming every rule the node was meant to run withholds them from both sides of
 * the score, which is what an unassessed rule means everywhere else. The Standard
 * reader already refuses a failed row outright, so this is the component branch
 * being given the guard the other branch has always had.
 */
describe('a failed component row', () => {
  const FAILED_STUB = JSON.stringify({
    skillName: '', exceptions: [], notAssessed: [], dimensions: [],
  });

  const failedRow = (over: Partial<ReviewJobItemRow> = {}): ReviewJobItemRow => ({
    cat_agentreviewjobitemid: 'item-1',
    cat_componentindex: 0,
    cat_skillname: 'laptop-request',
    cat_itemstatus: ReviewJobItemStatus.Failed,
    cat_resultjson: FAILED_STUB,
    cat_errormessage: 'The reviewer returned an unreadable response.',
    ...over,
  });

  it('is reported once, as partial, naming every rule the node runs', () => {
    const [component] = mapReviewJobItems([failedRow()], 'copilot-skill');

    expect(component.skillName).toBe('laptop-request');
    expect(component.status).toBe('partial');
    expect(component.findings).toHaveLength(0);
    // Every rule, not a sample: a short list would silently credit the rest.
    expect(component.notAssessed?.map((r) => r.ruleId).sort())
      .toEqual(aiRulesForNode('copilot-skill').map((r) => r.id).sort());
    expect(component.notAssessed?.every((r) => r.scopeStatus === 'unavailable')).toBe(true);
  });

  it('carries the failure reason so the maker is told why', () => {
    const [component] = mapReviewJobItems([failedRow()], 'copilot-skill');

    expect(component.errorMessage).toBe('The reviewer returned an unreadable response.');
    expect(component.notAssessed?.[0].reason).toBe('The reviewer returned an unreadable response.');
  });

  it('falls back to a stated reason when the error column is an empty string', () => {
    // The workflow writes `cat_errormessage` as `string('')` on the success path,
    // so the column is empty rather than absent and a nullish default never fires.
    const [component] = mapReviewJobItems([failedRow({ cat_errormessage: '' })], 'copilot-skill');

    expect(component.errorMessage).toBe('The reviewer did not return a result.');
  });

  it('names the standalone-skill rules when that is the harness that ran', () => {
    // The two skill harnesses map the shared rules onto different pillars, so a
    // row read under the wrong one withholds the wrong set.
    const [component] = mapReviewJobItems([failedRow()], 'standalone-skill');

    expect(component.notAssessed?.map((r) => r.ruleId).sort())
      .toEqual(aiRulesForNode('standalone-skill').map((r) => r.id).sort());
  });

  it('keeps the rules the workflow enumerated itself', () => {
    // An agent-level node writes its own notAssessed list on failure. Where one
    // is present it is the better answer, because it is what actually ran.
    const [component] = mapReviewJobItems([failedRow({
      cat_resultjson: JSON.stringify({
        exceptions: [],
        notAssessed: [{ ruleId: 'XSK-01', reason: 'No result.', scopeStatus: 'unavailable' }],
      }),
    })], 'cross-skill');

    expect(component.notAssessed).toHaveLength(1);
    expect(component.notAssessed?.[0].ruleId).toBe('XSK-01');
    expect(component.status).toBe('partial');
  });

  it('leaves a succeeded row exactly as the reviewer reported it', () => {
    const [component] = mapReviewJobItems([failedRow({
      cat_itemstatus: ReviewJobItemStatus.Succeeded,
      cat_errormessage: '',
      cat_resultjson: JSON.stringify({ exceptions: [], notAssessed: [], dimensions: [] }),
    })], 'copilot-skill');

    expect(component.status).toBe('complete');
    expect(component.notAssessed ?? []).toHaveLength(0);
    expect(component.errorMessage).toBeUndefined();
  });

  it('keeps the row name when the placeholder blanks its own', () => {
    // The placeholder writes `"skillName": ""`, which is falsy but not nullish,
    // so a `??` here would key the component on an empty name and lose it.
    const [component] = mapReviewJobItems([failedRow()], 'copilot-skill');

    expect(component.skillName).toBe('laptop-request');
  });
});

/**
 * Pins the rejection of a v4 payload whose lists arrive with the wrong type.
 *
 * Passes are inferred from *absence* on this path, which makes a lenient read
 * the one failure mode that cannot be seen. Coercing a supplied string or object
 * to `[]` turns "this payload was never understood" into "the node found nothing
 * wrong", and every rule the node was asked to assess is stamped passed. The job
 * still succeeds and the score still computes, so the review renders fully green.
 */
describe('a v4 payload whose lists are not arrays', () => {
  const v4 = (result: Record<string, unknown>): unknown => ({
    contract: 'arc2-node-output-v4',
    schemaVersion: 4,
    node: 'copilot-instructions',
    unitId: 'unit-9001',
    subjectId: 'agent-1',
    status: 'complete',
    result,
  });

  it('rejects a string where exceptions belongs', () => {
    expect(parseArc2NodeOutput(v4({ exceptions: 'INS-01 failed', notAssessed: [] }))).toBeNull();
  });

  it('rejects an object where notAssessed belongs', () => {
    expect(parseArc2NodeOutput(v4({ exceptions: [], notAssessed: { ruleId: 'INS-02' } }))).toBeNull();
  });

  it('rejects a list the contract requires but the payload omits', () => {
    expect(parseArc2NodeOutput(v4({ exceptions: [] }))).toBeNull();
    expect(parseArc2NodeOutput(v4({ notAssessed: [] }))).toBeNull();
  });

  it('still accepts the valid shape, so the guard is not a blanket refusal', () => {
    expect(parseArc2NodeOutput(v4({ exceptions: [], notAssessed: [] }))).not.toBeNull();
  });

  it('infers no passing check, which is the defect this exists to stop', () => {
    const expected = aiRulesForNode('copilot-instructions').map((r) => r.id);
    // A sample would prove nothing; the denominator has to be real for the
    // contrast below to mean anything.
    expect(expected.length).toBeGreaterThan(0);

    // A well-formed empty payload legitimately sweeps clean...
    const clean = parseArc2NodeOutput(v4({ exceptions: [], notAssessed: [] }));
    const swept = arc2RuleResults(clean!, expected);
    expect(swept).toHaveLength(expected.length);
    expect(swept.every((r) => r.status === 'passed')).toBe(true);

    // ...and a malformed one must never reach that function at all, because the
    // reader declines to produce the payload it takes.
    expect(parseArc2NodeOutput(v4({ exceptions: '[]', notAssessed: [] }))).toBeNull();
  });

  it('is not re-read as a legacy candidate, which would publish it as clean', () => {
    // `mapReviewJobItems` falls through to the legacy branch when both readers
    // decline, and that branch reads `findings` behind `Array.isArray`. A v4
    // payload landing there becomes a component with zero findings -- the same
    // green result by a different route.
    const row: ReviewJobItemRow = {
      cat_agentreviewjobitemid: 'item-1',
      cat_componentindex: 0,
      cat_skillname: 'laptop-request',
      cat_itemstatus: ReviewJobItemStatus.Succeeded,
      cat_resultjson: JSON.stringify(v4({ exceptions: 'INS-01 failed', notAssessed: [] })),
      cat_errormessage: '',
    };

    expect(mapReviewJobItems([row], 'copilot-skill')).toHaveLength(0);
  });
});

describe('an unregistered rule id', () => {
  const unknown = {
    ruleId: 'SKL-AI-INVENTED',
    findingTitle: 'A rule the registry has never heard of',
    fact: 'The model named an id outside the corpus.',
    whyItMatters: 'Nothing resolves its severity or pillar.',
    makerAction: 'None — this finding cannot be rendered.',
    acceptanceCheck: 'n/a',
    evidence: [{ componentId: 'skill-1', fieldPath: 'body', quote: 'Step 1.' }],
  };

  it('is dropped, and says so, because the count alone cannot show it', () => {
    // Silence here is the hazard: the job still succeeds and the score still
    // computes, so a discarded finding is indistinguishable from a clean pass.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(arc2ExceptionToFinding(unknown)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('SKL-AI-INVENTED');
      expect(warn.mock.calls[0][0]).toContain('not in the rule registry');
    } finally {
      warn.mockRestore();
    }
  });

  it('stays silent for a rule the registry does know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(arc2ExceptionToFinding({ ...unknown, ruleId: 'SKL-AI-CLARITY' })).not.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
