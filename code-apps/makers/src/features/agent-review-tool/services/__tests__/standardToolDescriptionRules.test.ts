/**
 * The two Standard Tools description rules — `local-pattern-12` (missing tool
 * description) and `local-pattern-13` (duplicate tool descriptions).
 *
 * These go through `buildLocalPatterns` rather than calling the pattern builders
 * directly, because registration is what the Tools pillar actually depends on: a
 * rule that builds a correct pattern but never reaches the builder contributes
 * nothing to the score, and that failure is silent.
 *
 * The last case is the one that justifies two rules instead of one. A tool with a
 * blank description is a single authoring mistake, so it must be charged once —
 * against 12 — and not a second time against 13 for "sharing" emptiness with the
 * next blank tool.
 */
import { describe, expect, it } from 'vitest';
import type { MissingFields, ParsedBotData } from '../../contracts/ServiceContracts';
import type { ToolDetail } from '../../contracts/StageOutputs';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';
import { evaluateUnifiedRules } from '../../agents-experience/services/UnifiedRuleEngine';

const NO_MISSING_FIELDS: MissingFields = {
  missingModelNames: [],
  missingModelDescriptions: [],
  missingInputVariableNames: [],
  missingInputVariableDescriptions: [],
  missingOutputVariableNames: [],
  missingOutputVariableDescriptions: [],
};

function tool(name: string, description?: string): ToolDetail {
  // `componentId`/`schemaName` mirror what `stageAParser` always populates. They matter because the
  // rules declare `evidenceKind: 'configuration-fact'`, and `assessStandard` demotes such a failure
  // to "could not run" unless an affected item carries verified evidence — so a fixture without them
  // would exercise a shape production never produces, and hide that demotion.
  return {
    name, description, toolType: 'connector',
    componentId: `component-${name.replace(/\s+/g, '-').toLowerCase()}`,
    schemaName: `cr123_${name.replace(/\s+/g, '').toLowerCase()}`,
  };
}

function agentWith(tools: ToolDetail[], overrides: Partial<ParsedBotData> = {}): ParsedBotData {
  return {
    botId: 'fixture-bot',
    botName: 'Fixture agent',
    topics: [],
    tools: tools.map(detail => detail.name),
    knowledgeSources: [],
    testCases: [],
    topicCount: 0,
    toolCount: tools.length,
    knowledgeCount: 0,
    testCaseCount: 0,
    toolDetails: tools,
    configurationAvailable: true,
    unknownComponents: [],
    missingFields: { ...NO_MISSING_FIELDS },
    ...overrides,
  };
}

function statusOf(data: ParsedBotData, patternId: string) {
  const pattern = buildLocalPatterns(data).find(candidate => candidate.patternId === patternId);
  expect(pattern, `${patternId} is not registered on the standard path`).toBeDefined();
  return pattern!;
}

describe('local-pattern-12 — missing tool description', () => {
  it('does not apply when the agent configures no tools', () => {
    expect(statusOf(agentWith([]), 'local-pattern-12').assessmentStatus).toBe('not-applicable');
  });

  it('reports not assessed when tools are counted but their details were never captured', () => {
    const data = agentWith([], { toolCount: 3, tools: ['a', 'b', 'c'], toolDetails: [] });
    expect(statusOf(data, 'local-pattern-12').assessmentStatus).toBe('not-assessed');
  });

  it('fails when a tool carries fewer than two words of description', () => {
    const pattern = statusOf(
      agentWith([tool('Create ticket', 'Creates a support ticket in ServiceNow'), tool('Lookup', 'lookup')]),
      'local-pattern-12',
    );
    expect(pattern.assessmentStatus).toBe('fail');
    expect(pattern.status).toBe(false);
    expect(pattern.description).toContain('Lookup');
  });

  it('fails a blank description the same way it fails a one-word one', () => {
    expect(statusOf(agentWith([tool('Create ticket', '   ')]), 'local-pattern-12').assessmentStatus).toBe('fail');
  });

  it('passes when every captured tool is described and the population is complete', () => {
    const pattern = statusOf(
      agentWith([
        tool('Create ticket', 'Creates a support ticket in ServiceNow'),
        tool('Close ticket', 'Closes an existing ServiceNow ticket'),
      ]),
      'local-pattern-12',
    );
    expect(pattern.assessmentStatus).toBe('pass');
    expect(pattern.status).toBe(true);
  });

  it('withholds the pass when the captured population is incomplete', () => {
    const data = agentWith(
      [tool('Create ticket', 'Creates a support ticket in ServiceNow')],
      { unknownComponents: [{ name: 'unreadable component' }] },
    );
    expect(statusOf(data, 'local-pattern-12').assessmentStatus).toBe('not-assessed');
  });

  it('never claims the agent has no tools about a population it could not read', () => {
    // The dangerous shape: nothing classified as a tool, but something was unreadable. Saying
    // "this agent has no tools" here contradicts `local-pattern-7`, which reports on the very same
    // population that a complete count is unavailable — two rows apart in one grid.
    const data = agentWith([], { unknownComponents: [{ name: 'unreadable component' }] });
    const pattern = statusOf(data, 'local-pattern-12');
    expect(pattern.assessmentStatus).toBe('not-assessed');
    expect(pattern.description).not.toContain('no tools');
  });

  it('reports a real finding even when the population is incomplete', () => {
    const data = agentWith(
      [tool('Lookup', 'lookup')],
      { unknownComponents: [{ name: 'unreadable component' }] },
    );
    expect(statusOf(data, 'local-pattern-12').assessmentStatus).toBe('fail');
  });
});

describe('local-pattern-13 — duplicate tool descriptions', () => {
  it('does not apply when the agent configures no tools', () => {
    expect(statusOf(agentWith([]), 'local-pattern-13').assessmentStatus).toBe('not-applicable');
  });

  it('reports not assessed when tools are counted but their details were never captured', () => {
    const data = agentWith([], { toolCount: 2, tools: ['a', 'b'], toolDetails: [] });
    expect(statusOf(data, 'local-pattern-13').assessmentStatus).toBe('not-assessed');
  });

  it('does not apply when only one tool carries a usable description', () => {
    const data = agentWith([
      tool('Create ticket', 'Creates a support ticket in ServiceNow'),
      tool('Lookup', 'lookup'),
    ]);
    expect(statusOf(data, 'local-pattern-13').assessmentStatus).toBe('not-applicable');
  });

  it('fails when two tools share a description the model cannot route between', () => {
    const pattern = statusOf(
      agentWith([
        tool('Create ticket', 'Works with ServiceNow tickets'),
        tool('Close ticket', 'works with   SERVICENOW tickets'),
      ]),
      'local-pattern-13',
    );
    expect(pattern.assessmentStatus).toBe('fail');
    expect(pattern.status).toBe(false);
  });

  it('passes when every described tool is distinct', () => {
    const pattern = statusOf(
      agentWith([
        tool('Create ticket', 'Creates a support ticket in ServiceNow'),
        tool('Close ticket', 'Closes an existing ServiceNow ticket'),
      ]),
      'local-pattern-13',
    );
    expect(pattern.assessmentStatus).toBe('pass');
  });

  it('charges two blank descriptions to rule 12 only, never a second time as a duplicate', () => {
    const data = agentWith([tool('Create ticket', ''), tool('Close ticket', '  ')]);
    expect(statusOf(data, 'local-pattern-12').assessmentStatus).toBe('fail');
    expect(statusOf(data, 'local-pattern-13').assessmentStatus).toBe('not-applicable');
  });

  it('never declares the collision check moot when the missing tool could be the colliding one', () => {
    // One captured well-described tool plus something unreadable. "Fewer than two tools carry a
    // description" is a claim about a population this review does not have, and it contradicts
    // rule 12, which reports not-assessed on the identical snapshot.
    const data = agentWith(
      [tool('Create ticket', 'Creates a support ticket in ServiceNow')],
      { unknownComponents: [{ name: 'unreadable component' }] },
    );
    const pattern = statusOf(data, 'local-pattern-13');
    expect(pattern.assessmentStatus).toBe('not-assessed');
    expect(statusOf(data, 'local-pattern-12').assessmentStatus).toBe('not-assessed');
  });

  it('reports a real collision even when the population is incomplete', () => {
    const data = agentWith(
      [tool('Create ticket', 'Works with ServiceNow tickets'), tool('Close ticket', 'works with SERVICENOW tickets')],
      { unknownComponents: [{ name: 'unreadable component' }] },
    );
    expect(statusOf(data, 'local-pattern-13').assessmentStatus).toBe('fail');
  });
});

/**
 * The pattern grid and the score read two different projections of one assessment, and only the
 * second one carries the `evidenceKind: 'configuration-fact'` rule that can demote a failure to
 * "could not run". A rule can therefore render as a red row and still score as unmeasured, so the
 * grid alone is not evidence that the Tools pillar moved.
 */
describe('the unified projection the score reads', () => {
  function assessment(data: ParsedBotData, ruleId: string) {
    const found = evaluateUnifiedRules({ harness: 'standard', model: data })
      .assessments.find(candidate => candidate.ruleId === ruleId);
    expect(found, `${ruleId} produced no unified assessment`).toBeDefined();
    return found!;
  }

  it('keeps a failure a failure in both projections, so the Tools pillar actually scores it', () => {
    const data = agentWith([
      tool('Create ticket', 'Creates a support ticket in ServiceNow'),
      tool('Lookup', 'lookup'),
    ]);
    expect(assessment(data, 'local-pattern-12')).toMatchObject({ outcome: 'fail', family: 'Tools' });
  });

  it('agrees with the grid on a duplicate collision', () => {
    const data = agentWith([
      tool('Create ticket', 'Works with ServiceNow tickets'),
      tool('Close ticket', 'works with   SERVICENOW tickets'),
    ]);
    expect(assessment(data, 'local-pattern-13')).toMatchObject({ outcome: 'fail', family: 'Tools' });
  });

  it('carries both rules on every Standard agent, including one with no tools at all', () => {
    const ids = evaluateUnifiedRules({ harness: 'standard', model: agentWith([]) })
      .assessments.map(candidate => candidate.ruleId);
    expect(ids).toContain('local-pattern-12');
    expect(ids).toContain('local-pattern-13');
  });
});
