import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapReviewJobItems, isComponentRow } from '../reviewJobMapping';
import {
  parseArc2NodeOutput,
  harnessForNode,
  arc2ToOrchestrationEvaluation,
  arc2ToInstructionCoverage,
} from '../aiWorkflowNodeOutput';
import { resolveStandardRuleId } from '../../standardRuleResults';
import { parseStandardReviewUnitResult } from '../../../../utils/standardReviewCandidateValidation';
import { ruleById } from '../../../../review-core/registry';
import type { ReviewJobItemRow } from '../../../contracts/ReviewJob';

/**
 * Replays `cat_agentreviewjobitem` payloads of the Agent Review Workflow
 * through the host that renders them.
 *
 * Unit tests elsewhere exercise each mapper against a hand-written exception.
 * This one exists for the failure they cannot see: the flow and the host are
 * deployed separately, so a node prompt or its `structuredOutputSchema` can
 * change shape without a single host test going red. The fixtures below have
 * the shape of the workflow output, with placeholder IDs, so a drift between
 * the two surfaces fails here first.
 *
 * It also pins the two deliberate silences, which otherwise look like bugs:
 * a rule id the model invents is dropped rather than rendered, and a standard
 * payload yields no component rows because standard lives outside the 0-999
 * component index namespace.
 */
const DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** The one live id no registry, AI catalog or node prompt holds - model-invented. */
const HALLUCINATED_RULE_ID = 'SKL-AI-OBSERVABILITY';

/**
 * Captured payloads arrive in three shapes, because they were saved by three
 * different probes. Normalising here keeps the shape incidental: a fixture that
 * silently yielded no rows would otherwise read as a clean pass.
 */
function rowsFrom(file: string): ReviewJobItemRow[] {
  const raw = JSON.parse(readFileSync(DIR + file, 'utf-8')) as Record<string, unknown>;

  // Shape 1 - one row saved on its own.
  if (typeof raw.cat_resultjson === 'string') return [raw as unknown as ReviewJobItemRow];

  return Object.entries(raw).flatMap(([key, value]) => {
    // Shape 2 - a map of full rows keyed by component index.
    if (value && typeof value === 'object' && typeof (value as ReviewJobItemRow).cat_resultjson === 'string') {
      return [value as ReviewJobItemRow];
    }
    // Shape 3 - a map of bare result strings; the key carries the index.
    if (typeof value === 'string') {
      return [{ cat_resultjson: value, cat_componentindex: Number(key) } as ReviewJobItemRow];
    }
    return [];
  });
}

function outputsOf(file: string) {
  return rowsFrom(file).map(row => ({
    row,
    output: parseArc2NodeOutput(JSON.parse(row.cat_resultjson as string)),
  }));
}

/**
 * Every captured fixture, with the shape the host must still produce from it.
 *
 * `componentRows` is deliberately 0 for standard and cross-skill: those nodes
 * report at agent level (9000/9001) or in the standard range (9500-9504), and
 * `isComponentRow` admits only 0-999. Pinning the 0 keeps a future widening of
 * that filter from quietly pulling agent-level rows into the component list.
 */
const FIXTURES = [
  { file: 'RESULT-ARTIFACT-AIWORKFLOW.json', nodes: ['standalone-skill'], componentRows: 1, findings: 1 },
  { file: 'RESULT-LIVE-UI-170ba196.json', nodes: ['copilot-skill', 'cross-skill', 'copilot-instructions'], componentRows: 3, findings: 2 },
  { file: 'RESULT-LIVE-UI-feead60d.json', nodes: ['copilot-skill', 'cross-skill', 'copilot-instructions'], componentRows: 3, findings: 4 },
  { file: 'RESULT-SKILLBUNDLE-AIWORKFLOW.json', nodes: ['copilot-skill', 'copilot-instructions'], componentRows: 1, findings: 2 },
  { file: 'RESULT-STANDARD-AIWORKFLOW-EVIDFIX.json', nodes: ['standard'], componentRows: 0, findings: 0 },
  { file: 'RESULT-XSKILL-AIWORKFLOW-postfix.json', nodes: ['copilot-skill', 'cross-skill', 'copilot-instructions'], componentRows: 3, findings: 4 },
] as const;

describe('ARC2 live payloads through the host that renders them', () => {
  it.each(FIXTURES)('$file parses as arc2-node-output-v4 on every row', ({ file, nodes }) => {
    const parsed = outputsOf(file);
    expect(parsed.length, `${file} yielded no rows - the fixture shape changed`).toBeGreaterThan(0);

    for (const { row, output } of parsed) {
      expect(output, `${file} idx=${row.cat_componentindex} is not v4`).not.toBeNull();
      expect(
        harnessForNode(output!.node),
        `${file} node="${output!.node}" resolves no harness`,
      ).toBeTruthy();
    }

    expect([...new Set(parsed.map(p => p.output!.node))].sort()).toEqual([...nodes].sort());
  });

  it.each(FIXTURES)('$file maps to the component shape the UI renders', ({ file, componentRows, findings }) => {
    const rows = rowsFrom(file);
    expect(rows.filter(isComponentRow).length).toBe(componentRows);

    const components = mapReviewJobItems(rows);
    expect(components.length).toBe(componentRows);

    const mapped = components.flatMap(c => c.findings);
    expect(mapped.length).toBe(findings);

    for (const finding of mapped) {
      expect(finding.ruleId, 'a rendered finding must name a registered rule').toBeTruthy();
      expect(ruleById(finding.ruleId), `${finding.ruleId} reached the UI unregistered`).toBeTruthy();
      expect(finding.severity).toBeTruthy();
    }
  });

  it('drops a model-invented rule id instead of rendering it', () => {
    const exceptions = outputsOf('RESULT-ARTIFACT-AIWORKFLOW.json').flatMap(
      p => p.output?.result.exceptions ?? [],
    );

    // The guard is only meaningful while the payload still carries the invented id.
    expect(exceptions.map(e => e.ruleId)).toContain(HALLUCINATED_RULE_ID);
    expect(ruleById(HALLUCINATED_RULE_ID)).toBeUndefined();

    const rendered = mapReviewJobItems(rowsFrom('RESULT-ARTIFACT-AIWORKFLOW.json')).flatMap(c => c.findings);
    expect(rendered.map(f => f.ruleId)).not.toContain(HALLUCINATED_RULE_ID);
  });

  it('resolves every standard rule id the flow emits, including the unsplit alias', () => {
    const ids = new Set(
      outputsOf('RESULT-STANDARD-AIWORKFLOW-EVIDFIX.json')
        .flatMap(p => p.output?.result.exceptions ?? [])
        .map(e => e.ruleId),
    );

    expect(ids.size).toBe(17);
    expect(ids).toContain('STD-PATTERN-TOOL-ROUTING-GAP');
    expect([...ids].filter(id => !ruleById(resolveStandardRuleId(id)))).toEqual([]);
  });

  it('names the cited skills on a cross-skill finding, and the whole set when none resolve', () => {
    const output = outputsOf('RESULT-XSKILL-AIWORKFLOW-postfix.json').find(
      p => p.output?.node === 'cross-skill',
    )?.output;
    expect(output, 'the cross-skill row is missing from the fixture').toBeTruthy();

    const cited = (output!.result.exceptions[0]?.evidence ?? []).map(e => e.componentId!);
    expect(cited.length).toBe(2);

    const named = arc2ToOrchestrationEvaluation(
      output!,
      new Map(cited.map((id, i) => [id, `Skill ${i + 1}`])),
      ['Skill 1', 'Skill 2', 'Skill 3'],
      '',
    );
    expect(named.findings.map(f => f.ruleId)).toEqual(['XSK-03']);
    expect(named.findings[0].skills).toEqual(['Skill 1', 'Skill 2']);

    // v4 cites component GUIDs, so a caller whose map misses must still produce a
    // finding naming a real subject rather than an empty skill list.
    const fallback = arc2ToOrchestrationEvaluation(output!, new Map(), ['Skill 1', 'Skill 2', 'Skill 3'], '');
    expect(fallback.findings[0].skills).toEqual(['Skill 1', 'Skill 2', 'Skill 3']);
  });

  it('reports instruction coverage, and silently drops the INS-07 notAssessed (known defect)', () => {
    const output = outputsOf('RESULT-XSKILL-AIWORKFLOW-postfix.json').find(
      p => p.output?.node === 'copilot-instructions',
    )?.output;
    expect(output, 'the instruction-coverage row is missing from the fixture').toBeTruthy();
    expect(output!.result.exceptions.map(e => e.ruleId)).toContain('INS-06');
    expect(output!.result.notAssessed.map(n => n.ruleId)).toContain('INS-07');

    const coverage = arc2ToInstructionCoverage(output!);

    // INS-06 is the `escalation` element, and it renders as absent - that half works.
    expect(coverage.elements.filter(e => !e.present).map(e => e.key)).toEqual(['escalation']);

    // The other half does not. `INSTRUCTION_RULE_IDS` holds only INS-02..INS-06,
    // so INS-07 matches no key, nothing is skipped, and all five elements are
    // emitted - the node's "could not assess" verdict is lost. The honest result
    // would be four elements, leaving the stage `partial`. Pinned as-is so the
    // queued fix (route unmapped coverage ids through the generic path) turns
    // this red rather than passing silently.
    expect(coverage.elements.length).toBe(5);
    expect(coverage.elements.filter(e => e.present && e.inferredPass).length).toBe(4);
  });

  it('refuses a payload that is not v4', () => {
    expect(parseArc2NodeOutput({ contract: 'arc2-node-output-v3', node: 'standard' })).toBeNull();
    expect(parseArc2NodeOutput({})).toBeNull();
  });
});

/**
 * The standard harness reaches the UI through its own parser, not through
 * `mapReviewJobItems`, and that is how a real defect shipped: ARC2 routing was
 * turned on for every harness while this parser still only knew the ART
 * envelope, so a healthy five-unit review threw "unreadable result envelope"
 * the moment a maker ran it. Every earlier check compared raw payloads and
 * never called this function, which is precisely why nothing went red.
 */
describe('the standard envelope both flows can produce', () => {
  const STANDARD = 'RESULT-STANDARD-AIWORKFLOW-EVIDFIX.json';

  function unitsOf(file: string) {
    return rowsFrom(file).map(row => ({
      raw: JSON.parse(row.cat_resultjson as string) as Record<string, unknown>,
      output: parseArc2NodeOutput(JSON.parse(row.cat_resultjson as string)),
    }));
  }

  it('reads a v4 unit the legacy envelope read would have thrown on', () => {
    const units = unitsOf(STANDARD);
    expect(units.length, 'the fixture yielded no rows').toBeGreaterThan(0);

    for (const { raw, output } of units) {
      // The two shape differences that made the legacy read throw.
      expect(raw.findings, 'v4 carries no top-level findings').toBeUndefined();
      expect(raw.notAssessed, 'v4 carries no top-level notAssessed').toBeUndefined();

      const unit = parseStandardReviewUnitResult(raw);
      expect(['complete', 'partial']).toContain(unit.status);
      expect(unit.findings.length).toBe(output!.result.exceptions.length);
      expect(unit.notAssessed.length).toBe(output!.result.notAssessed.length);
    }
  });

  it('derives affectedComponentIds from the evidence, which v4 does not carry', () => {
    const findings = unitsOf(STANDARD).flatMap(({ raw }) => parseStandardReviewUnitResult(raw).findings);
    expect(findings.length, 'the fixture produced no findings to check').toBeGreaterThan(0);

    for (const finding of findings) {
      const evidenced = [...new Set(
        finding.evidence
          .map(item => item.componentId)
          .filter(id => typeof id === 'string' && id.trim().length > 0),
      )];
      // `validateCandidate` rejects the whole candidate when an affected
      // component is not evidenced, so this must be exactly the evidenced set -
      // never a superset, and never empty while evidence exists.
      expect([...finding.affectedComponentIds].sort()).toEqual(evidenced.sort());
      expect(finding.ruleId).toBeTruthy();
    }
  });

  it('carries the narrative fields the finding UI requires', () => {
    const findings = unitsOf(STANDARD).flatMap(({ raw }) => parseStandardReviewUnitResult(raw).findings);

    for (const finding of findings) {
      expect(finding.findingTitle, `${finding.ruleId} lost its title`).toBeTruthy();
      expect(finding.whyItMatters, `${finding.ruleId} lost whyItMatters`).toBeTruthy();
      expect(finding.makerAction, `${finding.ruleId} lost makerAction`).toBeTruthy();
      expect(finding.acceptanceCheck, `${finding.ruleId} lost acceptanceCheck`).toBeTruthy();
    }
  });

  it('still reads the ART envelope byte-for-byte', () => {
    const art = {
      status: 'complete' as const,
      findings: [{
        ruleId: 'STD-PATTERN-MODEL-NAME',
        affectedComponentIds: ['topic-1'],
        evidence: [{ componentId: 'topic-1', fieldPath: 'displayName', quote: 'Gen AI' }],
      }],
      notAssessed: [{ ruleId: 'STD-ROUTE-TOPIC-OVERLAP', reason: 'no routable topics' }],
    };
    expect(parseStandardReviewUnitResult(art)).toEqual(art);
  });

  it('still throws on an envelope that is neither shape', () => {
    expect(() => parseStandardReviewUnitResult({ nope: true }))
      .toThrow(/unreadable result envelope/);
  });
});
