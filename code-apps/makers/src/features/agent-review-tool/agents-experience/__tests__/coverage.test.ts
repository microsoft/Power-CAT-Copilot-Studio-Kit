import { describe, expect, it } from 'vitest';
import { computeCoverage } from '../services/EvaluationCoverageService';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { FX } from './fixtures';

describe('computeCoverage', () => {
  it('marks a capability covered when a test case input names it; Work IQ uncovered', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot,
      [FX.connectorTool, FX.mcpTool, FX.evaluationData]);
    const cov = computeCoverage(model);
    const chat = cov.rows.find(r => r.name === 'Create a chat')!;
    expect(chat.cases).toBe(1); // "Create a chat with Megan"
    const workIq = cov.rows.find(r => r.name.startsWith('Work IQ'))!;
    expect(workIq.cases).toBe(0);
    expect(cov.uncoveredNames).toContain('Work IQ User (Preview)');
  });

  it('emits EVL-02 when uncovered capabilities and cases exist', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.mcpTool, FX.evaluationData]);
    const cov = computeCoverage(model);
    expect(cov.finding?.id).toBe('EVL-02');
    expect(cov.finding?.severity).toBe('warning');
  });

  it('no EVL-02 when there are no test cases', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.mcpTool]);
    expect(computeCoverage(model).finding).toBeNull();
  });

  describe('per-capability outcomes', () => {
    it('gives every capability its own row, keyed so it can be set aside alone', () => {
      const model = parseAgentsExperience(FX.botConfigurationCopilot,
        [FX.connectorTool, FX.mcpTool, FX.evaluationData]);
      const cov = computeCoverage(model);

      expect(cov.ruleResults).toHaveLength(cov.rows.length);
      expect(cov.ruleResults.every(r => r.ruleId === 'EVL-02')).toBe(true);
      expect(cov.ruleResults.map(r => r.key)).toContain('EVL-02:Work IQ User (Preview)');

      const workIq = cov.ruleResults.find(r => r.subject === 'Work IQ User (Preview)')!;
      expect(workIq.status).toBe('warning');
      const chat = cov.ruleResults.find(r => r.subject === 'Create a chat')!;
      expect(chat.status).toBe('passed');
    });

    it('stays silent when there is nothing to measure coverage against', () => {
      // EVL-01 already reports the missing test set. A warning per capability here would restate
      // that once for each one while implying coverage had been measured and found missing.
      const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.mcpTool]);
      expect(computeCoverage(model).ruleResults).toEqual([]);
    });
  });

  describe('declared basis', () => {
    // A schema name like fx.tool.CreateAChat never appears in a natural question,
    // so name matching reported 0 covered on agents that were in fact fully covered.
    const declaredModel = () => parseAgentsExperience(FX.botConfigurationCopilot, [
      FX.connectorTool, FX.mcpTool,
      FX.evaluationSetDeclared, FX.multiTurnCaseDeclaring, FX.multiTurnCaseDeclaringSecond,
    ]);

    it('matches on expectedExecutionSteps schemaName, not on case wording', () => {
      const cov = computeCoverage(declaredModel());
      expect(cov.basis).toBe('declared');
      const chat = cov.rows.find(r => r.name === 'Create a chat')!;
      expect(chat.cases).toBe(2);
      expect(chat.caseNames).toEqual(['fx.testcase.declaring', 'fx.testcase.declaring2']);
    });

    it('ignores wording matches once any case declares steps', () => {
      // "Create a chat with Megan" would match by name, but it declares nothing,
      // so under the declared basis it must not be credited.
      const cov = computeCoverage(parseAgentsExperience(FX.botConfigurationCopilot, [
        FX.connectorTool, FX.evaluationSetDeclared, FX.multiTurnCaseDeclaring, FX.evaluationData,
      ]));
      expect(cov.basis).toBe('declared');
      expect(cov.rows.find(r => r.name === 'Create a chat')!.caseNames)
        .toEqual(['fx.testcase.declaring']);
    });

    it('falls back to inferred when no case declares anything', () => {
      const cov = computeCoverage(parseAgentsExperience(FX.botConfigurationCopilot,
        [FX.connectorTool, FX.evaluationData]));
      expect(cov.basis).toBe('inferred');
      expect(cov.declaringCases).toBe(0);
      expect(cov.rows.find(r => r.name === 'Create a chat')!.cases).toBe(1);
    });

    it('worded EVL-02 differs by basis', () => {
      const declared = computeCoverage(declaredModel()).finding;
      expect(declared?.title).toContain('no test coverage');
      const inferred = computeCoverage(parseAgentsExperience(FX.botConfigurationCopilot,
        [FX.connectorTool, FX.mcpTool, FX.evaluationData])).finding;
      expect(inferred?.title).toContain('no declared test coverage');
    });
  });

  describe('unverified Microsoft Copilot conversation basis', () => {
    const unverifiedModel = () => parseAgentsExperience(FX.botConfigurationCopilot, [
      FX.connectorTool,
      FX.mcpTool,
      FX.evaluationSet,
      FX.ghcpGeneralQualityCase,
    ]);

    it('does not infer capability coverage from prompt wording', () => {
      const cov = computeCoverage(unverifiedModel());
      expect(cov.basis).toBe('unverified');
      expect(cov.rows.find(r => r.name === 'Create a chat')!.cases).toBe(0);
      expect(cov.uncoveredNames).toEqual([]);
      expect(cov.finding).toBeNull();
    });

    it('retains capability inventory while marking each set undeclarable', () => {
      const cov = computeCoverage(unverifiedModel());
      expect(cov.rows).toHaveLength(2);
      expect(cov.sets).toEqual([{
        name: 'Evaluate My First Agent',
        caseCount: 1,
        declaringCases: 0,
        canDeclare: false,
        covered: 0,
        total: 2,
      }]);
    });
  });

  describe('per-set rollup', () => {
    it('reports coverage per set, since a run targets one set', () => {
      const cov = computeCoverage(parseAgentsExperience(FX.botConfigurationCopilot, [
        FX.connectorTool, FX.mcpTool,
        FX.evaluationSetDeclared, FX.multiTurnCaseDeclaring, FX.multiTurnCaseDeclaringSecond,
        FX.evaluationSetSingleResponse, FX.evaluationDataInSet,
      ]));
      const declared = cov.sets.find(s => s.name === 'Evaluate ZAVA Retail Account Growth')!;
      expect(declared).toMatchObject({ caseCount: 2, declaringCases: 2, canDeclare: true, covered: 1, total: 2 });
      // Single-response cases have no expectedExecutionSteps field, so this set
      // is out of scope for coverage rather than a coverage failure.
      const single = cov.sets.find(s => s.name === 'Evaluate ZAVA quality')!;
      expect(single).toMatchObject({ caseCount: 1, declaringCases: 0, canDeclare: false, covered: 0 });
    });

    it('yields no rollup when cases carry no parent link (persisted legacy reviews)', () => {
      const cov = computeCoverage(parseAgentsExperience(FX.botConfigurationCopilot,
        [FX.connectorTool, FX.evaluationSetMisconfigured, FX.evaluationData]));
      expect(cov.sets).toEqual([]);
    });
  });
});
