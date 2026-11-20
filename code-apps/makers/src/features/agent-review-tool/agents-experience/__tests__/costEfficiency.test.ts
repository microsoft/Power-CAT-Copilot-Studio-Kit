import { describe, expect, it } from 'vitest';
import type {
  AeConnectedAgent,
  AeKnowledgeSource,
  AeTestCase,
  AeTool,
  AeTrigger,
  AgentsExperienceModel,
} from '../contracts/AgentsExperienceModel';
import {
  MAX_MONTHLY_TASKS,
  PUBLISHED_CREDIT_RANGES,
  PUBLISHED_SCENARIO_DESCRIPTORS,
  SCENARIO_ORDER,
  buildCostEfficiencyReview,
  buildScenarioExposure,
  estimateMonthlyCost,
  parseMonthlyTaskInput,
} from '../services/cost-efficiency/buildCostEfficiencyReview';

function createModel(overrides: Partial<AgentsExperienceModel> = {}): AgentsExperienceModel {
  return {
    agentSettings: {
      instructions: 'Help the user complete a business task.',
      modelSeries: 'Sonnet46',
      enableWebSearch: false,
      enableMemory: false,
      raw: {},
    },
    tools: [],
    skills: [],
    connectedAgents: [],
    knowledge: [],
    evaluationSets: [{
      name: 'Cost baseline',
      graders: ['GeneralQualityGrader'],
      schemaname: 'cost.baseline',
    }],
    testCases: [{
      name: 'Representative task',
      input: 'Complete the task.',
      expected: 'The task is complete.',
      schemaname: 'cost.case',
      expectedTools: [],
    }],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [],
    ...overrides,
  };
}

function tool(overrides: Partial<AeTool> = {}): AeTool {
  return {
    name: 'Create record',
    displayName: 'Create record',
    description: 'Create the requested business record.',
    kind: 'ConnectorTool',
    authMode: 'Invoker',
    connectionReference: 'shared_connector_ref',
    connectorId: 'shared_connector',
    operationId: 'CreateRecord',
    schemaname: 'cost.tool.create',
    ...overrides,
  };
}

function opportunityText(model: AgentsExperienceModel): string {
  return buildCostEfficiencyReview(model, {
    monthlyTasks: 1_000,
    scenario: 'medium',
  }).opportunities
    .flatMap(item => [
      item.title,
      ...item.evidence,
      item.recommendation,
      item.qualityRisk,
      item.validationPlan,
    ])
    .join(' ');
}

describe('published Microsoft Copilot harness ranges', () => {
  it('keeps the exact August 2026 scenario boundaries', () => {
    expect(PUBLISHED_CREDIT_RANGES).toEqual({
      light: {
        lowerBound: 100,
        lowerBoundInclusive: true,
        upperBound: 300,
      },
      medium: {
        lowerBound: 300,
        lowerBoundInclusive: true,
        upperBound: 500,
      },
      heavy: {
        lowerBound: 500,
        lowerBoundInclusive: false,
      },
    });
  });

  it.each([
    ['light' as const, 100_000, 300_000, true],
    ['medium' as const, 300_000, 500_000, true],
  ])(
    'calculates the %s monthly credit and public PAYG range',
    (scenario, lowerBound, upperBound, lowerBoundInclusive) => {
      const estimate = estimateMonthlyCost({
        monthlyTasks: 1_000,
        scenario,
      });

      expect(estimate.monthlyCredits).toEqual({
        lowerBound,
        lowerBoundInclusive,
        upperBound,
      });
      expect(estimate.publicPaygCostCents).toEqual(estimate.monthlyCredits);
      expect(estimate.publicPricePerCreditUsd).toBe(0.01);
      expect(estimate.priceBasis).toBe('public-payg-list-price');
    },
  );

  it('keeps Heavy open-ended and exclusive at 500 credits per task', () => {
    const estimate = estimateMonthlyCost({
      monthlyTasks: 1_000,
      scenario: 'heavy',
    });

    expect(estimate.creditsPerTask).toEqual({
      lowerBound: 500,
      lowerBoundInclusive: false,
    });
    expect(estimate.monthlyCredits).toEqual({
      lowerBound: 500_000,
      lowerBoundInclusive: false,
    });
    expect(estimate.publicPaygCostCents).toEqual({
      lowerBound: 500_000,
      lowerBoundInclusive: false,
    });
  });

  it('returns a fixed zero range when monthly tasks are zero', () => {
    const estimate = estimateMonthlyCost({
      monthlyTasks: 0,
      scenario: 'heavy',
    });

    expect(estimate.monthlyCredits).toEqual({
      lowerBound: 0,
      lowerBoundInclusive: true,
      upperBound: 0,
    });
    expect(estimate.publicPaygCostCents).toEqual(estimate.monthlyCredits);
  });
});

describe('published scenario exposure', () => {
  it('evaluates every published band in published order at one task volume', () => {
    const exposure = buildScenarioExposure(1_000, 'medium');

    expect(exposure.map(row => row.scenario)).toEqual([...SCENARIO_ORDER]);
    for (const row of exposure) {
      expect(row.creditsPerTask).toEqual(PUBLISHED_CREDIT_RANGES[row.scenario]);
    }
  });

  it('multiplies only the published boundaries', () => {
    const exposure = buildScenarioExposure(1_000, 'light');
    const light = exposure[0];
    const medium = exposure[1];

    expect(light.monthlyCredits).toEqual({
      lowerBound: 100_000,
      lowerBoundInclusive: true,
      upperBound: 300_000,
    });
    expect(medium.monthlyCredits).toEqual({
      lowerBound: 300_000,
      lowerBoundInclusive: true,
      upperBound: 500_000,
    });
    // One credit maps to one US cent at the published $0.01 PAYG price.
    expect(light.publicPaygCostCents).toEqual(light.monthlyCredits);
  });

  it('keeps Heavy open-ended and exclusive', () => {
    const heavy = buildScenarioExposure(1_000, 'heavy')[2];

    expect(heavy.scenario).toBe('heavy');
    expect(heavy.monthlyCredits.lowerBoundInclusive).toBe(false);
    expect(heavy.monthlyCredits.upperBound).toBeUndefined();
    expect(heavy.monthlyCredits.lowerBound).toBe(500_000);
  });

  it('marks exactly the selected scenario', () => {
    const exposure = buildScenarioExposure(10, 'heavy');

    expect(exposure.filter(row => row.selected)).toHaveLength(1);
    expect(exposure.find(row => row.selected)?.scenario).toBe('heavy');
  });

  it('returns fixed zero ranges when monthly tasks are zero', () => {
    for (const row of buildScenarioExposure(0, 'medium')) {
      expect(row.monthlyCredits).toEqual({
        lowerBound: 0,
        lowerBoundInclusive: true,
        upperBound: 0,
      });
    }
  });

  it('rejects a task volume that cannot be multiplied safely', () => {
    expect(() => buildScenarioExposure(MAX_MONTHLY_TASKS + 1, 'medium')).toThrow();
    expect(() => buildScenarioExposure(-1, 'medium')).toThrow();
  });

  it('depends only on the published bands and the task volume', () => {
    // The guide ties consumption to task complexity, which configuration cannot
    // observe. Nothing about an agent may reach this calculation.
    expect(buildScenarioExposure.length).toBe(2);
    expect(buildScenarioExposure(250, 'light')).toEqual(
      buildScenarioExposure(250, 'light'),
    );
  });
});

describe('monthly task input validation', () => {  it.each(['', ' ', ' 12 ', '-1', '1.5', '1e3', '+1', 'abc', 'NaN'])(
    'rejects %j without silently changing it',
    input => {
      expect(parseMonthlyTaskInput(input).valid).toBe(false);
    },
  );

  it('accepts zero and decimal digit whole numbers', () => {
    expect(parseMonthlyTaskInput('0')).toEqual({ valid: true, value: 0 });
    expect(parseMonthlyTaskInput('0012')).toEqual({ valid: true, value: 12 });
    expect(parseMonthlyTaskInput(String(MAX_MONTHLY_TASKS))).toEqual({
      valid: true,
      value: MAX_MONTHLY_TASKS,
    });
  });

  it('rejects a value that cannot be multiplied safely', () => {
    const result = parseMonthlyTaskInput(String(MAX_MONTHLY_TASKS + 1));
    expect(result).toEqual({
      valid: false,
      message: 'This value is too large to estimate safely.',
    });
  });

  it('rejects invalid typed domain input instead of producing a misleading range', () => {
    expect(() => estimateMonthlyCost({
      monthlyTasks: -1,
      scenario: 'medium',
    })).toThrow('Monthly tasks must be a finite, safe, non-negative whole number.');
  });
});

describe('configuration facts and optimization opportunities', () => {
  const duplicateTools: AeTool[] = [
    tool({
      name: 'Create order',
      description: '',
      schemaname: 'cost.tool.order-a',
    }),
    tool({
      name: 'Open order',
      description: 'Order',
      connectorId: 'SHARED_CONNECTOR',
      operationId: 'createrecord',
      schemaname: 'cost.tool.order-b',
    }),
    tool({
      name: 'MCP lookup',
      kind: 'McpTool',
      connectorId: 'mcp_inventory',
      operationId: 'InvokeServer',
      schemaname: 'cost.tool.mcp',
    }),
  ];
  const connectedAgents: AeConnectedAgent[] = [{
    name: 'Fulfilment specialist',
    description: 'Handles fulfilment exceptions.',
    botSchemaName: 'cost_fulfilment',
    historyTypeKind: 'ConversationHistory',
    schemaname: 'cost.agent.fulfilment',
  }];
  const knowledge: AeKnowledgeSource[] = [{
    name: 'Order policy',
    sourceKind: 'SharePointSearchSource',
    schemaname: 'cost.knowledge.order',
  }];
  const triggers: AeTrigger[] = [{
    name: 'Nightly order review',
    kind: 'ScheduledTrigger',
    schemaname: 'cost.trigger.nightly',
  }];

  const model = createModel({
    agentSettings: {
      instructions: 'Help with orders.',
      modelSeries: 'Sonnet46',
      enableWebSearch: true,
      enableMemory: false,
      raw: {},
    },
    tools: duplicateTools,
    connectedAgents,
    knowledge,
    triggers,
    evaluationSets: [],
    testCases: [],
  });

  it('collects direct saved-configuration facts', () => {
    const review = buildCostEfficiencyReview(model, {
      monthlyTasks: 1_000,
      scenario: 'medium',
    });

    expect(review.facts).toEqual({
      modelSeries: 'Sonnet46',
      connectorTools: 2,
      mcpTools: 1,
      skills: 0,
      knowledgeSources: 1,
      connectedAgents: 1,
      triggers: 1,
      webSearchEnabled: true,
      evaluationSets: 0,
      testCases: 0,
      toolAssertionCases: 0,
    });
  });

  it('creates each applicable recommendation with the required safety fields', () => {
    const opportunities = buildCostEfficiencyReview(model, {
      monthlyTasks: 1_000,
      scenario: 'medium',
    }).opportunities;

    expect(opportunities.map(item => item.id)).toEqual([
      'account-for-trigger-volume',
      'establish-evaluation-baseline',
      'remove-duplicate-tool-operations',
      'clarify-tool-selection',
      'bound-connected-agent-delegation',
      'scope-grounding-paths',
    ]);

    for (const item of opportunities) {
      expect(item.evidenceLabel).toBe('configured');
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.recommendation).toBeTruthy();
      expect(item.qualityRisk).toBeTruthy();
      expect(item.validationPlan).toBeTruthy();
    }
  });

  it('is deterministic when configuration arrays arrive in another order', () => {
    const first = buildCostEfficiencyReview(model, {
      monthlyTasks: 1_000,
      scenario: 'medium',
    }).opportunities;
    const reordered = buildCostEfficiencyReview({
      ...model,
      tools: [...model.tools].reverse(),
      connectedAgents: [...model.connectedAgents].reverse(),
      knowledge: [...model.knowledge].reverse(),
      triggers: [...model.triggers].reverse(),
    }, {
      monthlyTasks: 1_000,
      scenario: 'medium',
    }).opportunities;

    expect(reordered).toEqual(first);
  });

  it('does not turn capability counts into recommendations by themselves', () => {
    const manyConfiguredItems = createModel({
      tools: Array.from({ length: 20 }, (_, index) => tool({
        name: `Distinct tool ${index}`,
        description: `Use for distinct operation ${index}.`,
        connectorId: `connector_${index}`,
        operationId: `operation_${index}`,
        schemaname: `cost.tool.${index}`,
      })),
      knowledge: Array.from({ length: 20 }, (_, index) => ({
        name: `Knowledge ${index}`,
        sourceKind: 'SharePointSearchSource',
        schemaname: `cost.knowledge.${index}`,
      })),
      testCases: [{
        name: 'Distinct tool task',
        input: 'Use the first distinct tool.',
        expected: 'The task is complete.',
        expectedTools: [{
          kind: 'ExpectedToolCallStep',
          schemaName: 'cost.tool.0',
        }],
        schemaname: 'cost.case.distinct',
      }],
    });

    expect(buildCostEfficiencyReview(manyConfiguredItems, {
      monthlyTasks: 1_000,
      scenario: 'medium',
    }).opportunities).toEqual([]);
  });

  it('recommends tool-use assertions when tests exist but none declare tool use', () => {
    const testCase: AeTestCase = {
      name: 'Create a record',
      input: 'Create the record.',
      expected: 'The record is created.',
      expectedTools: [],
      schemaname: 'cost.case.create',
    };
    const review = buildCostEfficiencyReview(createModel({
      tools: [tool()],
      testCases: [testCase],
    }), {
      monthlyTasks: 1_000,
      scenario: 'medium',
    });

    expect(review.opportunities.map(item => item.id)).toContain(
      'add-tool-assertion-baseline',
    );
    expect(review.opportunities.map(item => item.id)).not.toContain(
      'establish-evaluation-baseline',
    );
  });

  it('contains no runtime, waste, or guaranteed-saving claim', () => {
    const text = opportunityText(model);
    expect(text).not.toMatch(
      /\b(observed|unused|actual usage|repeated calls?|guaranteed|will save|percent savings)\b|%/i,
    );
  });
});

describe('per-agent differentiation boundary', () => {
  // Two agents at the same volume and scenario. The credit estimate is
  // deliberately identical, because the published band tracks the complexity of
  // the work performed, which saved configuration cannot observe. All per-agent
  // value therefore has to appear in the facts and the opportunities. This test
  // proves that it does.
  const planning = { monthlyTasks: 1_000, scenario: 'medium' } as const;

  const leanAgent = createModel({
    agentSettings: {
      instructions: 'Answer compliance questions from policy documents.',
      modelSeries: 'Sonnet46',
      enableWebSearch: false,
      enableMemory: false,
      raw: {},
    },
    tools: [tool({ schemaname: 'diff.tool.single' })],
  });

  const complexAgent = createModel({
    agentSettings: {
      instructions: 'Plan store displays.',
      modelSeries: 'Sonnet46',
      enableWebSearch: true,
      enableMemory: false,
      raw: {},
    },
    tools: [
      tool({ name: 'Create plan', description: '', schemaname: 'diff.tool.a' }),
      tool({
        name: 'Open plan',
        description: 'Plan',
        connectorId: 'shared_connector',
        operationId: 'CreateRecord',
        schemaname: 'diff.tool.b',
      }),
    ],
    connectedAgents: [{
      name: 'Inventory specialist',
      description: 'Checks stock levels.',
      botSchemaName: 'diff_inventory',
      historyTypeKind: 'ConversationHistory',
      schemaname: 'diff.agent.inventory',
    }],
    knowledge: [{
      name: 'Merchandising guide',
      sourceKind: 'SharePointSearchSource',
      schemaname: 'diff.knowledge.guide',
    }],
    triggers: [{
      name: 'Weekly refresh',
      kind: 'ScheduledTrigger',
      schemaname: 'diff.trigger.weekly',
    }],
  });

  it('gives both agents the same estimate, because the band is not observable', () => {
    const lean = buildCostEfficiencyReview(leanAgent, planning);
    const complex = buildCostEfficiencyReview(complexAgent, planning);

    expect(complex.estimate).toEqual(lean.estimate);
  });

  it('still separates the two agents by saved configuration facts', () => {
    const lean = buildCostEfficiencyReview(leanAgent, planning);
    const complex = buildCostEfficiencyReview(complexAgent, planning);

    expect(complex.facts).not.toEqual(lean.facts);
    expect(complex.facts.connectorTools).toBeGreaterThan(lean.facts.connectorTools);
    expect(complex.facts.triggers).toBeGreaterThan(lean.facts.triggers);
    expect(complex.facts.knowledgeSources).toBeGreaterThan(lean.facts.knowledgeSources);
    expect(complex.facts.connectedAgents).toBeGreaterThan(lean.facts.connectedAgents);
    expect(complex.facts.webSearchEnabled).not.toBe(lean.facts.webSearchEnabled);
  });

  it('still separates the two agents by opportunities', () => {
    const leanIds = buildCostEfficiencyReview(leanAgent, planning)
      .opportunities.map(item => item.id);
    const complexIds = buildCostEfficiencyReview(complexAgent, planning)
      .opportunities.map(item => item.id);

    expect(complexIds).not.toEqual(leanIds);
    expect(complexIds.filter(id => !leanIds.includes(id)).length).toBeGreaterThan(0);
  });
});

describe('evaluation guidance', () => {
  function caseFor(name: string): AeTestCase {
    return {
      name,
      input: 'Complete the task.',
      expected: 'The task is complete.',
      schemaname: `eval.case.${name}`,
      expectedTools: [],
    };
  }

  it('does not derive an evaluation-pass price from saved test-case count', () => {
    const review = buildCostEfficiencyReview(
      createModel({ testCases: [caseFor('a'), caseFor('b'), caseFor('c')] }),
      { monthlyTasks: 1_000, scenario: 'medium' },
    );

    expect(review).not.toHaveProperty('evaluationRun');
  });
});

describe('published scenario descriptors', () => {
  it('quotes the guide definition and criteria for every band', () => {
    // Verbatim from the August 2026 guide table "GitHub Copilot harness in
    // Copilot Studio". A drift here means the tab is quoting text the guide
    // does not contain.
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.light.criteria).toEqual([
      'Few sources',
      'Light reasoning',
      '1 or fewer outputs',
    ]);
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.medium.criteria).toEqual([
      'Many sources',
      'Structured reasoning',
      '2+ outputs',
    ]);
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.heavy.criteria).toEqual([
      'Broad aggregation',
      'Deep reasoning',
      'Many outputs',
    ]);
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.light.definition).toContain(
      'handful of knowledge sources',
    );
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.medium.definition).toContain(
      'multiple deliverables',
    );
    expect(PUBLISHED_SCENARIO_DESCRIPTORS.heavy.definition).toContain(
      'broad source aggregation',
    );
  });

  it('covers every published scenario with exactly three criteria', () => {
    for (const scenario of SCENARIO_ORDER) {
      const descriptor = PUBLISHED_SCENARIO_DESCRIPTORS[scenario];
      expect(descriptor.criteria).toHaveLength(3);
      expect(descriptor.definition.length).toBeGreaterThan(40);
    }
  });

  it('carries the published descriptors onto every exposure row', () => {
    const rows = buildScenarioExposure(1000, 'medium');
    expect(rows).toHaveLength(SCENARIO_ORDER.length);
    for (const row of rows) {
      const descriptor = PUBLISHED_SCENARIO_DESCRIPTORS[row.scenario];
      expect(row.definition).toBe(descriptor.definition);
      expect(row.criteria).toEqual(descriptor.criteria);
    }
  });
});
