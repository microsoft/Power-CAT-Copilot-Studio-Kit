import { describe, expect, it } from 'vitest';
import type {
  AeKnowledgeSource,
  AeSkill,
  AeTool,
  AeWorkflowTool,
  AgentsExperienceModel,
} from '../../agents-experience/contracts/AgentsExperienceModel';
import type {
  KnowledgeDetail,
  KnowledgeSourceType,
  LocalStageAOutput,
  StageBTopicComponent,
  ToolDetail,
  ToolType,
} from '../../contracts/StageOutputs';
import { compareUpgradePair } from '../upgradeComparison';

function stageA(overrides: Partial<LocalStageAOutput> = {}): LocalStageAOutput {
  return {
    botId: 'original-1',
    botName: 'Expense helper',
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
  };
}

function copyModel(overrides: Partial<AgentsExperienceModel> = {}): AgentsExperienceModel {
  return {
    agentSettings: { instructions: '', raw: {} },
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
  };
}

function tool(name: string, displayName?: string, kind: AeTool['kind'] = 'ConnectorTool'): AeTool {
  return { name, kind, schemaname: `copy.tool.${name}`, ...(displayName === undefined ? {} : { displayName }) };
}

function skill(name: string, frontmatterName?: string): AeSkill {
  return {
    name,
    schemaname: `copy.skill.${name}`,
    markdown: '',
    body: '',
    componentId: `${name}-id`,
    componentIdUnique: `${name}-unique`,
    source: 'inline-markdown',
    resourceCount: 0,
    ...(frontmatterName === undefined ? {} : { frontmatterName }),
  };
}

function workflow(name: string): AeWorkflowTool {
  return { name, schemaname: `copy.workflow.${name}` };
}

function knowledgeSource(name: string): AeKnowledgeSource {
  return { name, schemaname: `copy.knowledge.${name}` };
}

function toolDetail(name: string, toolType: ToolType, displayName?: string): ToolDetail {
  return { name, toolType, ...(displayName === undefined ? {} : { displayName }) };
}

function knowledgeDetail(name: string, sourceType: KnowledgeSourceType): KnowledgeDetail {
  return { name, sourceType };
}

function topic(TopicName: string, extra: Partial<StageBTopicComponent> = {}): StageBTopicComponent {
  return { TopicName, TriggerKind: 'OnRecognizedIntent', ...extra };
}

describe('compareUpgradePair', () => {
  it('matches the tools of the original with the tools and the workflows of the copy', () => {
    const original = stageA({
      tools: ['Ignored fallback'],
      toolDetails: [
        toolDetail('Send email', 'connector'),
        toolDetail('cr123_lookuporder', 'connector', 'Look up order'),
        toolDetail('Approve expense', 'flow'),
        toolDetail('Summarize receipt', 'prompt'),
      ],
    });
    const copy = copyModel({
      tools: [tool('send email'), tool('cr456_lookup', ' Look Up Order '), tool('Search the web', undefined, 'McpTool')],
      workflowTools: [workflow('Approve expense')],
    });

    const result = compareUpgradePair(original, copy);

    expect(result.tools).toStrictEqual([
      { original: 'Send email', copy: 'send email', copyKind: 'tool', state: 'same' },
      { original: 'Look up order', copy: 'Look Up Order', copyKind: 'tool', state: 'same' },
      { original: 'Approve expense', copy: 'Approve expense', copyKind: 'workflow', state: 'same' },
      { original: 'Summarize receipt', state: 'missing-in-copy' },
      { copy: 'Search the web', copyKind: 'tool', state: 'new-in-copy' },
    ]);
    expect(result.topics).toStrictEqual([]);
  });

  it('uses the tool names of the original when it has no tool details', () => {
    const result = compareUpgradePair(stageA({ tools: [' Send email '] }), copyModel({ tools: [tool('Send email')] }));

    expect(result.tools).toStrictEqual([
      { original: 'Send email', copy: 'Send email', copyKind: 'tool', state: 'same' },
    ]);
  });

  it('matches the knowledge sources by name', () => {
    const result = compareUpgradePair(
      stageA({
        knowledgeSources: ['Ignored fallback'],
        knowledgeDetails: [knowledgeDetail('Expense policy', 'SharePoint'), knowledgeDetail('Travel guide', 'Web')],
      }),
      copyModel({ knowledge: [knowledgeSource('expense policy'), knowledgeSource('Holiday calendar')] }),
    );

    expect(result.knowledge).toStrictEqual([
      { original: 'Expense policy', copy: 'expense policy', state: 'same' },
      { original: 'Travel guide', state: 'missing-in-copy' },
      { copy: 'Holiday calendar', state: 'new-in-copy' },
    ]);
  });

  it('uses the knowledge source names of the original when it has no knowledge details', () => {
    const result = compareUpgradePair(stageA({ knowledgeSources: ['Expense policy'] }), copyModel());

    expect(result.knowledge).toStrictEqual([{ original: 'Expense policy', state: 'missing-in-copy' }]);
  });

  it('matches the custom topics with the skills and the workflows and lists the system topics', () => {
    const original = stageA({
      topicComponents: [
        topic('Submit expense'),
        topic('Escalate', { TriggerKind: 'OnEscalate' }),
        topic('Check status', { ModelName: 'Check expense status' }),
        topic('Conversation Start', { TriggerKind: 'OnConversationStart' }),
        topic('Book travel'),
        topic('Goodbye', { triggerQueries: ['Goodbye', 'Bye', 'See you later'] }),
        topic('Refund request', { TriggerKind: 'OnRedirect' }),
      ],
    });
    const copy = copyModel({
      skills: [skill('submit-expense', 'Submit Expense'), skill('Check expense status'), skill('Translate text')],
      workflowTools: [workflow('Refund request'), workflow('Nightly export')],
    });

    const result = compareUpgradePair(original, copy);

    expect(result.topics).toStrictEqual([
      { original: 'Submit expense', copy: 'Submit Expense', copyKind: 'skill', state: 'same' },
      { original: 'Check status', copy: 'Check expense status', copyKind: 'skill', state: 'same' },
      { original: 'Book travel', state: 'missing-in-copy' },
      { original: 'Refund request', copy: 'Refund request', copyKind: 'workflow', state: 'same' },
      { copy: 'Translate text', copyKind: 'skill', state: 'new-in-copy' },
      { copy: 'Nightly export', copyKind: 'workflow', state: 'new-in-copy' },
    ]);
    expect(result.systemTopics).toStrictEqual(['Escalate', 'Conversation Start', 'Goodbye']);
    expect(result.tools).toStrictEqual([]);
  });

  it('gives a workflow of the copy to a tool of the original before a topic', () => {
    const result = compareUpgradePair(
      stageA({ toolDetails: [toolDetail('Approve expense', 'flow')], topicComponents: [topic('Approve expense')] }),
      copyModel({ workflowTools: [workflow('Approve expense')] }),
    );

    expect(result.tools).toStrictEqual([
      { original: 'Approve expense', copy: 'Approve expense', copyKind: 'workflow', state: 'same' },
    ]);
    expect(result.topics).toStrictEqual([{ original: 'Approve expense', state: 'missing-in-copy' }]);
  });

  it('ignores case, spaces, and punctuation when it matches names', () => {
    const result = compareUpgradePair(
      stageA({ toolDetails: [toolDetail('Order_Status', 'connector')], topicComponents: [topic('Book Appointment')] }),
      copyModel({ tools: [tool('Order Status')], skills: [skill('book-appointment')] }),
    );

    expect(result.tools).toStrictEqual([
      { original: 'Order_Status', copy: 'Order Status', copyKind: 'tool', state: 'same' },
    ]);
    expect(result.topics).toStrictEqual([
      { original: 'Book Appointment', copy: 'book-appointment', copyKind: 'skill', state: 'same' },
    ]);
  });

  it('gives no match key to a name that has only punctuation', () => {
    const result = compareUpgradePair(
      stageA({ toolDetails: [toolDetail('---', 'connector')] }),
      copyModel({ tools: [tool('***')] }),
    );

    expect(result.tools).toStrictEqual([
      { original: '---', state: 'missing-in-copy' },
      { copy: '***', copyKind: 'tool', state: 'new-in-copy' },
    ]);
  });

  it('keeps 2 different names apart', () => {
    const result = compareUpgradePair(
      stageA({ topicComponents: [topic('Book appointment')] }),
      copyModel({ skills: [skill('cancel-appointment')] }),
    );

    expect(result.topics).toStrictEqual([
      { original: 'Book appointment', state: 'missing-in-copy' },
      { copy: 'cancel-appointment', copyKind: 'skill', state: 'new-in-copy' },
    ]);
  });

  it('keeps 2 names apart when only a vowel sign is different', () => {
    const result = compareUpgradePair(
      stageA({ topicComponents: [topic('कर भुगतान')] }),
      copyModel({ workflowTools: [workflow('कार भुगतान')] }),
    );

    expect(result.topics).toStrictEqual([
      { original: 'कर भुगतान', state: 'missing-in-copy' },
      { copy: 'कार भुगतान', copyKind: 'workflow', state: 'new-in-copy' },
    ]);
  });

  it('matches the composed and the decomposed forms of a letter', () => {
    const result = compareUpgradePair(
      stageA({ toolDetails: [toolDetail('Cafe\u0301', 'connector')] }),
      copyModel({ tools: [tool('Caf\u00e9')] }),
    );

    expect(result.tools).toStrictEqual([
      { original: 'Cafe\u0301', copy: 'Caf\u00e9', copyKind: 'tool', state: 'same' },
    ]);
  });

  it('ignores white space differences in the instructions', () => {
    const result = compareUpgradePair(
      stageA({ agentInstructions: 'Help users file expenses. Ask for the receipt.' }),
      copyModel({ agentSettings: { instructions: 'Help users file expenses.\n   Ask for the receipt.  ', raw: {} } }),
    );

    expect(result.instructions).toStrictEqual({ state: 'same', originalLength: 46, copyLength: 46 });
  });

  it('reports changed instructions with the 2 lengths', () => {
    const result = compareUpgradePair(
      stageA({ agentInstructions: 'Help users file expenses.' }),
      copyModel({ agentSettings: { instructions: 'Help users file and approve expenses.', raw: {} } }),
    );

    expect(result.instructions).toStrictEqual({ state: 'changed', originalLength: 25, copyLength: 37 });
  });

  it.each([
    ['Help users.', '', 'missing-in-copy', 11, 0],
    ['', 'Help users.', 'new-in-copy', 0, 11],
    ['', '   ', 'same', 0, 0],
  ] as const)('compares the instructions "%s" with "%s" as %s', (originalText, copyText, state, originalLength, copyLength) => {
    const result = compareUpgradePair(
      stageA({ agentInstructions: originalText }),
      copyModel({ agentSettings: { instructions: copyText, raw: {} } }),
    );

    expect(result.instructions).toStrictEqual({ state, originalLength, copyLength });
  });

  it('masks secrets in the 2 instructions before the comparison', () => {
    const original = stageA({ agentInstructions: 'Sign in with password: example1 first.' });

    expect(compareUpgradePair(
      original,
      copyModel({ agentSettings: { instructions: 'Sign in with password: example2 first.', raw: {} } }),
    ).instructions).toStrictEqual({ state: 'same', originalLength: 40, copyLength: 40 });
    expect(compareUpgradePair(
      original,
      copyModel({ agentSettings: { instructions: 'Sign in with password: [REDACTED] first.', raw: {} } }),
    ).instructions).toStrictEqual({ state: 'same', originalLength: 40, copyLength: 40 });
  });
});
