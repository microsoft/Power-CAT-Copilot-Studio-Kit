import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import {
  HARNESS_FIT_CLEAR_BENEFIT_QUOTE,
  HARNESS_FIT_NO_MOVE_QUOTE,
  assessCopilotHarnessFit,
  assessStandardHarnessFit,
} from '../harnessFit';
import { UPGRADE_BENEFIT_QUOTES } from '../upgradeReadiness';

const NO_ADVICE = { verdict: 'no-advice', reasons: [] };

function copilotModel(overrides: Record<string, unknown> = {}): AgentsExperienceModel {
  return {
    agentSettings: { instructions: 'x'.repeat(40), raw: {} },
    tools: [],
    skills: [],
    connectedAgents: [],
    knowledge: [],
    evaluationSets: [],
    testCases: [],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [],
    ...overrides,
  } as unknown as AgentsExperienceModel;
}

function withInstructions(instructions: unknown): Record<string, unknown> {
  return { agentSettings: { instructions, raw: {} } };
}

function tools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Tool ${i + 1}`,
    kind: 'ConnectorTool',
    schemaname: `workshop.tool${i + 1}`,
  }));
}

function workflowTools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Flow ${i + 1}`,
    schemaname: `workshop.flow${i + 1}`,
  }));
}

function unknownKind(kind: string | undefined, index = 1) {
  return {
    schemaname: `workshop.component${index}`,
    kind,
    componenttype: '9',
    warning: 'Inventoried, not reviewed',
  };
}

/** Reviews saved before the parser read agent flows keep them in unknownKinds. */
function legacyAgentFlows(count: number) {
  return Array.from({ length: count }, (_, i) => unknownKind('WorkflowTool', i + 1));
}

function skills(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Skill ${i + 1}`,
    schemaname: `workshop.skill${i + 1}`,
    markdown: '# Skill',
    body: 'Skill body',
    componentId: `skill-${i + 1}`,
    componentIdUnique: `skill-${i + 1}`,
    source: 'inline-markdown',
    resourceCount: 0,
  }));
}

function agents(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    schemaname: `workshop.${prefix.toLowerCase()}${i + 1}`,
  }));
}

function stageA(overrides: Record<string, unknown> = {}): LocalStageAOutput {
  return {
    botId: 'workshop-agent',
    botName: 'Workshop Agent',
    topicCount: 0,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    localPatterns: [],
    topics: [],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    topicComponents: [],
    ...overrides,
  } as unknown as LocalStageAOutput;
}

function customTopics(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    TopicName: `Topic ${i + 1}`,
    TriggerKind: 'OnRecognizedIntent',
    triggerQueries: [`Question ${i + 1}`],
  }));
}

const conversationStart = { TopicName: 'Conversation Start', TriggerKind: 'OnConversationStart' };

describe('assessCopilotHarnessFit', () => {
  it('gives advice for a simple agent at each limit', () => {
    const model = copilotModel({
      tools: tools(2),
      workflowTools: workflowTools(1),
      ...withInstructions('x'.repeat(1500)),
    });
    expect(assessCopilotHarnessFit(model)).toEqual({
      verdict: 'copilot-possibly-not-needed',
      reasons: [
        'The agent has 3 tools (3 or fewer).',
        'The agent has no skills.',
        'The agent has no connected agents.',
        'The instructions have 1,500 characters (1,500 or fewer).',
      ],
    });
  });

  it('gives no advice when the agent has more than 3 tools, agent flows included', () => {
    expect(assessCopilotHarnessFit(copilotModel({ tools: tools(4) }))).toEqual(NO_ADVICE);
    expect(
      assessCopilotHarnessFit(copilotModel({ tools: tools(3), workflowTools: workflowTools(1) })),
    ).toEqual(NO_ADVICE);
    expect(
      assessCopilotHarnessFit(copilotModel({ tools: tools(3), workflowTools: null })).verdict,
    ).toBe('copilot-possibly-not-needed');
  });

  it('counts the agent flows that an old saved review keeps as unknown components', () => {
    expect(
      assessCopilotHarnessFit(copilotModel({ tools: tools(1), unknownKinds: legacyAgentFlows(1) }))
        .reasons[0],
    ).toBe('The agent has 2 tools (3 or fewer).');
    expect(
      assessCopilotHarnessFit(copilotModel({ tools: tools(1), unknownKinds: legacyAgentFlows(6) })),
    ).toEqual(NO_ADVICE);
  });

  it('gives no advice when a component did not match a known schema', () => {
    expect(
      assessCopilotHarnessFit(copilotModel({ unknownKinds: [unknownKind('NewToolKind')] })),
    ).toEqual(NO_ADVICE);
    expect(assessCopilotHarnessFit(copilotModel({ unknownKinds: [unknownKind(undefined)] }))).toEqual(
      NO_ADVICE,
    );
    const systemKinds = [
      unknownKind('DefaultFeedbackCollection', 1),
      unknownKind('IQCapability', 2),
      unknownKind('AgentHook', 3),
    ];
    expect(assessCopilotHarnessFit(copilotModel({ unknownKinds: systemKinds }))).toEqual({
      verdict: 'copilot-possibly-not-needed',
      reasons: [
        'The agent has no tools.',
        'The agent has no skills.',
        'The agent has no connected agents.',
        'The instructions have 40 characters (1,500 or fewer).',
      ],
    });
  });

  it('gives no advice when the agent has a skill', () => {
    expect(assessCopilotHarnessFit(copilotModel({ skills: skills(1) }))).toEqual(NO_ADVICE);
  });

  it('gives no advice when the agent has a connected agent', () => {
    expect(
      assessCopilotHarnessFit(copilotModel({ connectedAgents: agents(1, 'Connected') })),
    ).toEqual(NO_ADVICE);
  });

  it('gives no advice when the instructions have more than 1,500 characters', () => {
    expect(assessCopilotHarnessFit(copilotModel(withInstructions('x'.repeat(1501))))).toEqual(
      NO_ADVICE,
    );
  });

  it('writes short reasons for no tools, no instructions, and counts of 1', () => {
    expect(assessCopilotHarnessFit(copilotModel(withInstructions(''))).reasons).toEqual([
      'The agent has no tools.',
      'The agent has no skills.',
      'The agent has no connected agents.',
      'The agent has no instructions.',
    ]);
    expect(
      assessCopilotHarnessFit(copilotModel({ tools: tools(1), ...withInstructions('x') })).reasons,
    ).toEqual([
      'The agent has 1 tool (3 or fewer).',
      'The agent has no skills.',
      'The agent has no connected agents.',
      'The instructions have 1 character (1,500 or fewer).',
    ]);
  });

  it('gives no advice for damaged review data', () => {
    const damaged: Record<string, unknown>[] = [
      { tools: null },
      { skills: undefined },
      { connectedAgents: 'x' },
      { agentSettings: { raw: {} } },
      { agentSettings: null },
      { workflowTools: 'x' },
      { unknownKinds: null },
    ];
    for (const overrides of damaged) {
      expect(assessCopilotHarnessFit(copilotModel(overrides))).toEqual(NO_ADVICE);
    }
  });
});

describe('assessStandardHarnessFit', () => {
  it('gives no advice below each limit', () => {
    const snapshot = stageA({
      toolCount: 9,
      childAgents: agents(1, 'Child'),
      connectedAgents: agents(1, 'Connected'),
      topicComponents: [...customTopics(24), conversationStart],
    });
    expect(assessStandardHarnessFit(snapshot)).toEqual(NO_ADVICE);
  });

  it('gives advice for 10 or more tools', () => {
    expect(assessStandardHarnessFit(stageA({ toolCount: 10 }))).toEqual({
      verdict: 'copilot-can-fit',
      reasons: ['The agent has 10 tools (10 or more).'],
    });
  });

  it('counts child agents and connected agents together', () => {
    expect(
      assessStandardHarnessFit(
        stageA({ childAgents: agents(2, 'Child'), connectedAgents: agents(1, 'Connected') }),
      ),
    ).toEqual({
      verdict: 'copilot-can-fit',
      reasons: ['The agent has 2 child agents and 1 connected agent (3 or more in total).'],
    });
    expect(assessStandardHarnessFit(stageA({ childAgents: agents(3, 'Child') })).reasons).toEqual([
      'The agent has 3 child agents and no connected agents (3 or more in total).',
    ]);
    expect(
      assessStandardHarnessFit(stageA({ connectedAgents: agents(3, 'Connected') })).reasons,
    ).toEqual(['The agent has no child agents and 3 connected agents (3 or more in total).']);
  });

  it('counts custom topics and not system topics or topics with no name', () => {
    expect(assessStandardHarnessFit(stageA({ topicComponents: customTopics(25) }))).toEqual({
      verdict: 'copilot-can-fit',
      reasons: ['The agent has 25 custom topics (25 or more). System topics are not in this count.'],
    });
    expect(
      assessStandardHarnessFit(
        stageA({ topicComponents: [...customTopics(24), conversationStart] }),
      ),
    ).toEqual(NO_ADVICE);
    expect(
      assessStandardHarnessFit(
        stageA({
          topicComponents: [...customTopics(24), { TopicName: '   ', TriggerKind: 'OnRecognizedIntent' }],
        }),
      ),
    ).toEqual(NO_ADVICE);
  });

  it('does not count the language copies of custom topics', () => {
    const copies = customTopics(13).map((topic, i) => ({
      ...topic,
      TopicName: `${topic.TopicName} (hr-HR)`,
      SchemaName: `workshop.topic.Topic${i + 1}.hr-HR`,
    }));

    expect(
      assessStandardHarnessFit(stageA({ topicComponents: [...customTopics(13), ...copies] })),
    ).toEqual(NO_ADVICE);
  });

  it('writes the reasons in a fixed order', () => {
    const snapshot = stageA({
      toolCount: 12,
      childAgents: agents(2, 'Child'),
      connectedAgents: agents(2, 'Connected'),
      topicComponents: customTopics(30),
    });
    expect(assessStandardHarnessFit(snapshot).reasons).toEqual([
      'The agent has 12 tools (10 or more).',
      'The agent has 2 child agents and 2 connected agents (3 or more in total).',
      'The agent has 30 custom topics (25 or more). System topics are not in this count.',
    ]);
  });

  it('gives no advice for damaged snapshot data', () => {
    const damaged: Record<string, unknown>[] = [
      { toolCount: Number.NaN },
      { toolCount: Number.POSITIVE_INFINITY },
      { toolCount: -10 },
      { toolCount: '12' },
      { topicComponents: null },
      { childAgents: 'x', connectedAgents: {} },
    ];
    for (const overrides of damaged) {
      expect(assessStandardHarnessFit(stageA(overrides))).toEqual(NO_ADVICE);
    }
  });

  it('writes large counts with a thousands separator', () => {
    expect(assessStandardHarnessFit(stageA({ toolCount: 1200 })).reasons).toEqual([
      'The agent has 1,200 tools (10 or more).',
    ]);
  });
});

describe('harness fit quotes', () => {
  it('uses the same Microsoft Learn quotes as the Upgrade readiness tab', () => {
    expect(UPGRADE_BENEFIT_QUOTES).toContainEqual(HARNESS_FIT_CLEAR_BENEFIT_QUOTE);
    expect(UPGRADE_BENEFIT_QUOTES).toContainEqual(HARNESS_FIT_NO_MOVE_QUOTE);
  });
});
