import { describe, expect, it } from 'vitest';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { runRules } from '../services/GroundedRuleEngine';
import { evaluateUnifiedRules } from '../services/UnifiedRuleEngine';
import { buildReviewViewModel } from '../components/viewModel';
import { collectCostArchitectureFacts } from '../services/cost-efficiency/costOpportunityBuilders';
import { missingCapabilityReferences } from '../../review-core/rules/capability-references';
import { computePillarBreakdown, scoreLegacyDeterministicRules, summarizeRuleResults } from '../services/scoring';
import { computeCoverage } from '../services/EvaluationCoverageService';
import { copilotPayloadWithRawResourceContent } from './skillTestFixtures';
import { FX } from './fixtures';

describe('captured web-search configuration', () => {
  it.each([true, false])('reads nested web.enableWebSearch=%s before the older flat setting', enabled => {
    const model = parseAgentsExperience(JSON.stringify({
      agentSettings: { web: { enableWebSearch: enabled }, enableWebSearch: !enabled },
    }), []);
    expect(model.agentSettings.enableWebSearch).toBe(enabled);
  });

  it.each([true, false])('retains the supported flat setting %s', enabled => {
    expect(parseAgentsExperience(JSON.stringify({
      agentSettings: { enableWebSearch: enabled },
    }), []).agentSettings.enableWebSearch).toBe(enabled);
  });

  it.each([undefined, null, 'false', 0])('keeps a non-boolean setting unknown: %s', value => {
    const model = parseAgentsExperience(JSON.stringify({
      agentSettings: { web: { enableWebSearch: value }, enableWebSearch: value },
    }), []);
    expect(model.agentSettings.enableWebSearch).toBeUndefined();
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.model = model;
    expect(buildReviewViewModel(payload, 'Reviewer', 0, 'Agent').summary.webSearchEnabled)
      .toBeUndefined();
    expect(collectCostArchitectureFacts(model).webSearchEnabled).toBeUndefined();
  });

  it('does not report an unknown web setting as false in knowledge evidence', () => {
    const model = parseAgentsExperience(JSON.stringify({
      agentSettings: { instructions: 'Answer from our documentation.' },
    }), [FX.knowledgeSource]);
    const result = runRules(model);
    expect(result.findings.find(f => f.id === 'KNW-01')?.fact).toContain('webSearch: unknown');
  });

  it('does not judge a knowledge promise against an unknown web-search setting', () => {
    const model = parseAgentsExperience(JSON.stringify({
      agentSettings: { instructions: 'Answer from our documentation.' },
    }), []);
    const result = runRules(model);
    expect(result.ruleResults.find(r => r.ruleId === 'KNW-02')?.status).toBe('failed');
    expect(result.findings.some(f => f.id === 'KNW-02')).toBe(false);
  });
});

describe('deterministic capability references', () => {
  it.each(['this', 'that', 'these', 'those', 'your', 'our', 'its'])(
    'does not treat the deictic word %s as a missing capability', word => {
      expect(missingCapabilityReferences(`Use ${word} skill when a customer asks about rewards.`, []))
        .toEqual([]);
    },
  );

  it('retains quoted proper names that happen to be generic words', () => {
    expect(missingCapabilityReferences('Use the "this" tool and call the `available` skill.', []))
      .toEqual(['this', 'available']);
  });

  it('still detects a named missing capability beside generic self-reference', () => {
    expect(missingCapabilityReferences('Use this skill, then use the "Member Account" tool.', []))
      .toEqual(['member account']);
  });
});

describe('explicit rule outcomes at the grounded-engine boundary', () => {
  it('retains N/A for known-empty optional populations and real failures for no evaluation coverage', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, []);
    const result = runRules(model);
    for (const id of ['TOL-02', 'SKL-08', 'SKL-15', 'CON-03']) {
      expect(result.ruleResults.find(r => r.ruleId === id)?.status).toBe('not-applicable');
      expect(result.passedRuleIds).not.toContain(id);
    }
    expect(result.ruleResults.find(r => r.ruleId === 'EVL-01')?.status).toBe('warning');
    expect(result.findings.some(f => f.id === 'EVL-01')).toBe(true);
  });

  it('retains could-not-run rather than passing unreadable populations', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.brokenYaml]);
    const result = runRules(model);
    for (const id of ['TOL-02', 'SKL-08', 'CON-03']) {
      expect(result.ruleResults.find(r => r.ruleId === id)?.status).toBe('failed');
      expect(result.passedRuleIds).not.toContain(id);
    }
    expect(scoreLegacyDeterministicRules(result.ruleResults).complete).toBe(false);
  });

  it('keeps unavailable evaluation evidence out of credit rather than measuring an empty test set', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, []);
    const result = runRules(model, { evaluation: 'unavailable' });
    const coverage = computeCoverage(model, { evaluation: 'unavailable' });
    const pillars = computePillarBreakdown({
      model, findings: result.findings, ruleResults: [...result.ruleResults, ...coverage.ruleResults],
      coverage,
    });
    expect(pillars.find(pillar => pillar.pillar === 'Evaluation'))
      .toMatchObject({ applicable: true, score: null, complete: false });
  });

  it('still measures a complete empty evaluation population as zero coverage', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, []);
    const result = runRules(model);
    const pillars = computePillarBreakdown({
      model, findings: result.findings, ruleResults: result.ruleResults,
      coverage: { covered: 0, total: 0, basis: 'inferred' },
    });
    expect(pillars.find(pillar => pillar.pillar === 'Evaluation'))
      .toMatchObject({ applicable: true, score: 0, complete: true });
  });

  it('does not publish coverage passes from a partly captured capability population', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [
      FX.connectorTool, FX.multiTurnCase, FX.brokenYaml,
    ]);
    const coverage = computeCoverage(model);
    expect(coverage.basis).toBe('unverified');
    expect(coverage.finding).toBeNull();
    expect(coverage.ruleResults).toEqual([
      expect.objectContaining({ ruleId: 'EVL-02', status: 'failed', incomplete: true }),
    ]);
  });

  it('retains a verified failure and its incomplete-capture qualification', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool, FX.brokenYaml]);
    model.tools[0].description = '';
    const result = runRules(model);
    const row = result.ruleResults.find(r => r.ruleId === 'TOL-02')!;
    expect(row).toMatchObject({ status: 'warning', incomplete: true });
    expect(result.findings.some(f => f.id === 'TOL-02')).toBe(true);
    expect(scoreLegacyDeterministicRules([row])).toEqual({ score: 50, complete: false });
    expect(summarizeRuleResults([row]).hasFailed).toBe(true);
  });

  it('uses the same assessment outcomes as the existing unified engine', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean]);
    const unified = evaluateUnifiedRules({ harness: 'copilot', model });
    const grounded = runRules(model);
    for (const assessment of unified.assessments) {
      const status = grounded.ruleResults.find(r => r.ruleId === assessment.ruleId)?.status;
      if (assessment.outcome === 'not-applicable') expect(status).toBe('not-applicable');
      else if (assessment.outcome === 'could-not-run') expect(status).toBe('failed');
      else if (assessment.outcome === 'fail') expect(['error', 'warning', 'info']).toContain(status);
      else expect(['passed', 'info']).toContain(status);
    }
  });
});
