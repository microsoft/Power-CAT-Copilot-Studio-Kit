import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel, AeTool } from '../contracts/AgentsExperienceModel';
import type { UnifiedRuleAssessment } from '../contracts/UnifiedReview';
import {
  evaluateUnifiedRules, getUnifiedRuleCatalog, runUnifiedRegistry, UNIFIED_DETERMINISTIC_POLICY_VERSION,
} from '../services/UnifiedRuleEngine';
import { scoreUnifiedDeterministic } from '../services/unifiedScoring';
import { parseStandardComponents } from '../../utils/stageAParser';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';
import { makeTopic, makeResource } from '../../services/__tests__/stageAFixtures';
import { unifiedInstructionRules } from '../services/rules/instructionRules';

const copilot = (over: Partial<AgentsExperienceModel> = {}): AgentsExperienceModel => ({
  agentSettings: { instructions: 'Help users find workshops. Ask for missing information and stay within that scope.', raw: {} },
  tools: [], skills: [], knowledge: [], connectedAgents: [],
  evaluationSets: [], testCases: [], multiTurnCases: [], triggers: [], unknownKinds: [],
  ...over,
});
const tool = (over: Partial<AeTool> = {}): AeTool => ({
  name: 'Find workshops', schemaname: 'test.find', componentIdUnique: 'tool-1', kind: 'ConnectorTool',
  description: 'Find available workshops', authMode: 'Invoker', connectionReference: 'connection-1',
  connectorId: 'workshops', operationId: 'find', ...over,
});
const row = (key: string, over: Partial<UnifiedRuleAssessment> = {}): UnifiedRuleAssessment => ({
  key, ruleId: key, harness: 'standard', family: 'Skills', severity: 'high', kind: 'check',
  outcome: 'pass', title: 'Static check', fact: 'Captured configuration was assessed.',
  why: 'Clear configuration supports maintainability.', fix: 'Keep this configuration current.',
  tags: ['quality'], source: 'deterministic', incomplete: false, evidence: [], findings: [], referenceIds: [],
  ...over,
});

describe('unified deterministic preview arithmetic', () => {
  it('scores 1.5/2.5 = 60 without counting tags, findings or records', () => {
    const score = scoreUnifiedDeterministic([
      row('high-pass', { tags: ['quality', 'security'] }),
      row('high-fail', { outcome: 'fail' }),
      row('medium-pass', { severity: 'medium' }),
      row('record', { kind: 'record' }),
      row('info', { severity: 'info', outcome: 'fail' }),
    ]);
    expect(score).toMatchObject({ value: 60, earnedWeight: 1.5, possibleWeight: 2.5, completed: 3, coverage: 100 });
    expect(score.contributions.filter(c => c.possibleWeight > 0)).toHaveLength(3);
  });
  it('never gives a medium failure partial credit', () => {
    expect(scoreUnifiedDeterministic([row('m', { severity: 'medium', outcome: 'fail' })]))
      .toMatchObject({ value: 0, earnedWeight: 0, possibleWeight: 0.5 });
  });
  it('keeps null and quality-check coverage distinct from completeness', () => {
    expect(scoreUnifiedDeterministic([row('info', { severity: 'info' })]))
      .toMatchObject({ value: null, coverage: null, completed: 0 });
    expect(scoreUnifiedDeterministic([
      row('missing', { outcome: 'could-not-run' }), row('excluded', { outcome: 'not-applicable' }),
      row('info-missing', { severity: 'info', outcome: 'could-not-run' }),
    ])).toMatchObject({ value: null, coverage: 0, couldNotRun: 1, notApplicable: 1, incomplete: true });
    expect(scoreUnifiedDeterministic([row('partial-failure', { outcome: 'fail', incomplete: true })]))
      .toMatchObject({ incomplete: true, completed: 1, value: 0 });
  });
  it('deduplicates identical keys and rejects contradictory results, independent of order', () => {
    expect(scoreUnifiedDeterministic([row('same'), row('same')]).possibleWeight).toBe(1);
    for (const assessments of [
      [row('same'), row('same', { outcome: 'fail' })],
      [row('same', { outcome: 'fail' }), row('same')],
      [row('same'), row('same', { severity: 'medium' })],
    ]) expect(() => scoreUnifiedDeterministic(assessments)).toThrow(/conflict|contradict/i);
  });
});

describe('common rule catalog and runner', () => {
  // 29 = the 22 that remain after INS-07 and SKL-09 moved to `execution: 'ai'` (the AI catalog owns
  // them and the deterministic catalog carries no definition for either), plus the two deterministic
  // rules this branch adds: INS-09 (agent instructions) and SKL-15 (inline skill bodies), plus the
  // 4 Work IQ rules WIQ-01 to WIQ-04, plus TOL-06 (agent authentication for user tools).
  // 13 = the original 11 Standard rules plus `local-pattern-12`/`-13`, which give the Tools pillar
  // a deterministic floor; before them the pillar's whole 12% turned on one AI judgement.
  it('registers all 13 Standard and 29 Copilot base definitions with complete metadata', () => {
    for (const [harness, count] of [['standard', 13], ['copilot', 29]] as const) {
      const catalog = getUnifiedRuleCatalog(harness);
      expect(catalog).toHaveLength(count);
      expect(new Set(catalog.map(d => d.id)).size).toBe(count);
      for (const d of catalog) {
        expect(d.supportedHarnesses).toEqual([harness]);
        for (const value of [d.title, d.fact, d.why, d.fix]) expect(value.trim()).not.toBe('');
        expect(d.tags).toContain('quality');
        expect(d.referenceIds.length).toBeGreaterThan(0);
      }
    }
    expect(getUnifiedRuleCatalog('standard').find(d => d.id === 'local-pattern-7')?.family).toBe('Orchestration');
    expect(getUnifiedRuleCatalog('copilot').filter(d => d.kind === 'record')).toHaveLength(12);
  });
  it('filters unsupported rules and surfaces configuration errors, not false success', () => {
    const definition = unifiedInstructionRules[0];
    const context = { harness: 'copilot', model: copilot() } as const;
    expect(() => runUnifiedRegistry(context, [definition, definition])).toThrow(/duplicate/i);
    const broken = { ...definition, evaluate: () => { throw new Error('Fixture evaluator failed'); } };
    expect(runUnifiedRegistry(context, [broken]).assessments[0])
      .toMatchObject({ outcome: 'could-not-run', incomplete: true, reason: expect.stringContaining('Fixture evaluator failed') });
    const standard = parseStandardComponents([makeTopic()], 'a', 'Agent', 'generative', 'live');
    expect(runUnifiedRegistry({ harness: 'standard', model: standard }, [broken]).assessments).toEqual([]);
    const malformed = { ...definition, evaluate: () => row('wrong-identity') };
    expect(() => runUnifiedRegistry(context, [malformed])).toThrow(/contract/i);
  });
});

describe('Standard native assessments and unchanged local projection', () => {
  it('retains a single vote per rule, legacy order/omissions, variable guidance and blank overrides', () => {
    const model = parseStandardComponents([
      makeTopic({ modelDisplayName: '', modelDescription: '', inputs: undefined, inputType: undefined,
        inputVariables: [{ name: 'ticketNumber', displayName: 'Ticket number' }] }, 'First'),
      makeTopic({ modelDescription: '' }, 'Second'),
    ], 'a', 'Agent', 'generative', 'live');
    const legacy = buildLocalPatterns(model);
    // 12 and 13 sit next to 7 rather than at the end because `buildLocalPatterns` spreads the Tools
    // family in one block: a tool rule is reported beside the other tool rule. The pre-existing ids
    // keep their order relative to each other, which is what "legacy order" protects.
    expect(legacy.map(p => p.patternId)).toEqual([1, 2, 3, 4, 5, 6, 7, 12, 13, 8, 11].map(n => `local-pattern-${n}`));
    const report = evaluateUnifiedRules({ harness: 'standard', model });
    expect(UNIFIED_DETERMINISTIC_POLICY_VERSION).toBe('unified-deterministic-v1');
    expect(report.policyVersion).toBe(UNIFIED_DETERMINISTIC_POLICY_VERSION);
    expect(report.assessments).toHaveLength(13);
    const descriptions = report.assessments.find(a => a.ruleId === 'local-pattern-2')!;
    expect(descriptions).toMatchObject({ key: 'standard:local-pattern-2:agent', outcome: 'fail' });
    expect(descriptions.findings).toHaveLength(2);
    expect(new Set(descriptions.findings.map(f => f.instanceId)).size).toBe(2);
    expect(descriptions.findings.every(f => f.evidence.some(e => e.componentId && e.status === 'verified'))).toBe(true);
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-4')?.findings[0].fix).toContain('ticketNumber');
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-9')?.outcome).toBe('not-applicable');
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-10')?.outcome).toBe('not-applicable');
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-1')?.outcome).toBe('fail');
  });
  it('retains verified failures with partial evidence and does not call the ZIP limitation an exclusion', () => {
    const model = parseStandardComponents([
      makeTopic({ modelDescription: '' }),
      makeResource('Unreadable', 'kind: ['),
    ], 'a', 'Agent', 'generative', 'zip');
    const report = evaluateUnifiedRules({ harness: 'standard', model });
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-2'))
      .toMatchObject({ outcome: 'fail', incomplete: true });
    expect(report.assessments.find(a => a.ruleId === 'local-pattern-8'))
      .toMatchObject({ outcome: 'could-not-run', incomplete: true });
    expect(buildLocalPatterns(model).find(p => p.patternId === 'local-pattern-8')?.assessmentStatus).toBe('not-applicable');
  });
  it('does not turn a legacy payload without topic evidence into native successful checks', () => {
    const parsed = parseStandardComponents([makeTopic()], 'a', 'Agent', 'generative', 'live');
    const model = { ...parsed, topicComponents: undefined, ruleScopes: undefined, missingFieldEvidence: undefined };
    const result = evaluateUnifiedRules({ harness: 'standard', model });
    expect(result.assessments.find(a => a.ruleId === 'local-pattern-1')?.outcome).toBe('could-not-run');
    expect(result.assessments.find(a => a.ruleId === 'local-pattern-11')?.outcome).toBe('could-not-run');
  });
});

describe('Copilot explicit base assessment outcomes', () => {
  it('distinguishes known-empty optional inventory from unavailable, while required evaluation can fail', () => {
    const report = evaluateUnifiedRules({ harness: 'copilot', model: copilot() });
    // 29 after INS-07/SKL-09 left for the AI catalog and INS-09/SKL-15/WIQ-01–04/TOL-06 joined; see the count above.
    expect(report.assessments).toHaveLength(29);
    expect(report.assessments.every(a => !a.ruleId.startsWith('local-pattern-'))).toBe(true);
    for (const id of ['TOL-02', 'SKL-08', 'CON-03'])
      expect(report.assessments.find(a => a.ruleId === id)?.outcome).toBe('not-applicable');
    expect(report.assessments.find(a => a.ruleId === 'INS-01')?.outcome).toBe('pass');
    expect(report.assessments.find(a => a.ruleId === 'EVL-01')?.outcome).toBe('fail');
    expect(evaluateUnifiedRules({ harness: 'copilot', model: copilot(), availability: { tools: 'unavailable', evaluation: 'unavailable' } })
      .assessments.find(a => a.ruleId === 'TOL-02')?.outcome).toBe('could-not-run');
  });
  it('excludes a known-empty primary population without requiring unrelated unavailable inventories', () => {
    const result = evaluateUnifiedRules({
      harness: 'copilot', model: copilot(),
      availability: { skills: 'complete', tools: 'unavailable', knowledge: 'unavailable' },
    });
    // The SKL-09 half of this case moved to the AI node when SKL-09 became `execution: 'ai'`, so
    // the deterministic report no longer carries a row for it. TOL-02 still pins the part this
    // test is named for: an unrelated unavailable inventory must not be required.
    expect(result.assessments.find(a => a.ruleId === 'TOL-02')?.outcome).toBe('could-not-run');
  });
  it('retains positive tool counterexamples in partial inventory but cannot pass a partially captured inventory', () => {
    for (const [description, outcome] of [['', 'fail'], ['Find available workshops', 'could-not-run']] as const) {
      const report = evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [tool({ description })] }),
        availability: { tools: 'partial' } });
      const result = report.assessments.find(a => a.ruleId === 'TOL-02')!;
      expect(result).toMatchObject({ outcome, incomplete: true });
      if (outcome === 'fail') expect(result.findings[0]).toMatchObject({
        id: 'TOL-02', evidence: [expect.objectContaining({ componentId: 'tool-1', status: 'verified', fieldPath: expect.stringContaining('description') })],
      });
    }
  });
  it('does not assess bundle markers as markdown, and never infers success from a legacy null', () => {
    const model = copilot({
      agentSettings: { instructions: '', raw: {} },
      skills: [{ name: 'Bundle', schemaname: 'bundle', componentId: 'b', componentIdUnique: 'b',
        source: 'zip-bundle', bundleMarker: 'bic:bundle:x', resourceCount: 1, markdown: '', body: '' }],
    });
    const result = evaluateUnifiedRules({ harness: 'copilot', model });
    // INS-07 is an AI rule now, so only SKL-08 is asserted here; SKL-08 is what carries the
    // "never infers success from a legacy null" half of this test.
    expect(result.assessments.find(a => a.ruleId === 'SKL-08')?.outcome).toBe('could-not-run');
  });
  it('never passes missing operation metadata and keeps a confirmed duplicate in a partial operation inventory', () => {
    const missing = tool({ operationId: undefined });
    expect(evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [missing] }) })
      .assessments.find(a => a.ruleId === 'TOL-05'))
      .toMatchObject({ outcome: 'could-not-run', incomplete: true });
    expect(evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [
      missing, tool(), tool({ name: 'Other', componentIdUnique: 'tool-2', schemaname: 'test.other' }),
    ] }) }).assessments.find(a => a.ruleId === 'TOL-05'))
      .toMatchObject({ outcome: 'fail', incomplete: true });
  });
  it('does not establish missing/trivial instructions from a partial instruction capture', () => {
    expect(evaluateUnifiedRules({ harness: 'copilot', model: copilot({ agentSettings: { instructions: '', raw: {} } }),
      availability: { instructions: 'partial' } }).assessments.find(a => a.ruleId === 'INS-01'))
      .toMatchObject({ outcome: 'could-not-run', incomplete: true });
  });
  it('uses captured schema identity when unique component IDs are absent, never duplicate display names', () => {
    const result = evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [
      tool({ componentIdUnique: undefined, schemaname: 'first', description: '' }),
      tool({ componentIdUnique: undefined, schemaname: 'second', description: '' }),
    ] }) }).assessments.find(a => a.ruleId === 'TOL-02')!;
    expect(result.findings.map(f => f.subjectId)).toEqual(['first', 'second']);
    expect(new Set(result.findings.map(f => f.instanceId)).size).toBe(2);
    expect(result.findings.map(f => f.evidence[0].schemaName)).toEqual(['first', 'second']);
  });
  it('does not turn unbound subjects into verified failures, and retains independently verified counterexamples', () => {
    const unbound = tool({ componentIdUnique: undefined, schemaname: '', description: '' });
    const report = evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [unbound] }) });
    expect(report.assessments.find(a => a.ruleId === 'TOL-02'))
      .toMatchObject({ outcome: 'could-not-run', incomplete: true, findings: [] });
    const mixed = evaluateUnifiedRules({ harness: 'copilot', model: copilot({ tools: [unbound, tool({ description: '' })] }) })
      .assessments.find(a => a.ruleId === 'TOL-02')!;
    expect(mixed).toMatchObject({ outcome: 'fail', incomplete: true });
    expect(mixed.findings).toHaveLength(1);
    expect(mixed.findings[0].subjectId).toBe('tool-1');
  });
  it('retains a positive expected-response failure in partial evaluation evidence', () => {
    const model = copilot({
      evaluationSets: [{ name: 'Similarity set', schemaname: 'set', graders: ['CompareMeaningGrader'] }],
      testCases: [{ name: 'Case', schemaname: 'case', expected: '' }],
    });
    const assessment = evaluateUnifiedRules({ harness: 'copilot', model, availability: { evaluation: 'partial' } })
      .assessments.find(a => a.ruleId === 'EVL-04')!;
    expect(assessment).toMatchObject({ outcome: 'fail', incomplete: true });
    expect(assessment.evidence[0]).toMatchObject({ schemaName: 'case', fieldPath: 'testCases.expected', status: 'verified' });
  });
  it('reports a completely unavailable capture as unavailable, not a zero or a complete inventory', () => {
    const result = evaluateUnifiedRules({ harness: 'copilot', model: copilot(), availability: { configuration: 'unavailable' } });
    expect(result.score).toMatchObject({ value: null, coverage: 0, incomplete: true, completed: 0 });
    expect(result.assessments.every(a => a.outcome === 'could-not-run')).toBe(true);
  });
});
