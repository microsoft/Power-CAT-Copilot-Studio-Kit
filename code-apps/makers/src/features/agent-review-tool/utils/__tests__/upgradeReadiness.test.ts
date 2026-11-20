import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput, UpgradeReadinessEvidence } from '../../contracts/StageOutputs';
import { buildUpgradeReadiness } from '../upgradeReadiness';

function stageA(overrides: Partial<LocalStageAOutput> = {}): LocalStageAOutput {
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
  };
}

function evidence(overrides: Partial<UpgradeReadinessEvidence> = {}): UpgradeReadinessEvidence {
  return { knowledgeSources: [], powerFx: [], powerFxComponentCount: 0, ...overrides };
}

describe('buildUpgradeReadiness', () => {
  it('lists each knowledge source with its kind and marks Azure AI Search', () => {
    const report = buildUpgradeReadiness(stageA({
      upgradeReadinessEvidence: evidence({
        knowledgeSources: [
          { name: 'Policy index', kind: 'AzureAISearchSource' },
          { name: 'Archive index', kind: 'AzureCognitiveSearchSource' },
          { name: 'Policy site', kind: 'SharePointSearchSource' },
        ],
      }),
    }));

    expect(report.knowledge).toEqual({
      status: 'current',
      items: [
        { name: 'Policy index', kind: 'AzureAISearchSource', isAzureAiSearch: true },
        { name: 'Archive index', kind: 'AzureCognitiveSearchSource', isAzureAiSearch: true },
        { name: 'Policy site', kind: 'SharePointSearchSource', isAzureAiSearch: false },
      ],
      hasAzureAiSearch: true,
    });
    expect(report.powerFx).toEqual({ available: true, items: [], total: 0 });
  });

  it('lists the topics and tools with Power Fx and keeps the full count', () => {
    const report = buildUpgradeReadiness(stageA({
      upgradeReadinessEvidence: evidence({
        powerFx: [
          { name: 'Workshop Booking', kind: 'topic', expressionCount: 2 },
          { name: 'Book workshop', kind: 'tool', expressionCount: 1 },
        ],
        powerFxComponentCount: 57,
      }),
    }));

    expect(report.powerFx).toEqual({
      available: true,
      items: [
        { name: 'Workshop Booking', kind: 'topic', expressionCount: 2 },
        { name: 'Book workshop', kind: 'tool', expressionCount: 1 },
      ],
      total: 57,
    });
    expect(report.knowledge).toEqual({ status: 'current', items: [], hasAzureAiSearch: false });
  });

  it('lists the child agents and only the custom topics', () => {
    const report = buildUpgradeReadiness(stageA({
      childAgents: [{ name: 'Billing helper' }],
      topicComponents: [
        { TopicName: 'Workshop Booking', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Book a workshop', 'Reserve seats'] },
        { TopicName: 'Escalation path', TriggerKind: 'OnRedirect' },
        { TopicName: 'Conversation Start', TriggerKind: 'OnConversationStart' },
        { TopicName: 'Greeting', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Hello', 'Hi', 'Hey'] },
      ],
    }));

    expect(report.childAgents).toEqual(['Billing helper']);
    expect(report.customTopics).toEqual(['Workshop Booking', 'Escalation path']);
  });

  it('does not count the language copies of custom topics and system topics', () => {
    const report = buildUpgradeReadiness(stageA({
      topicComponents: [
        { TopicName: 'Gen AI', SchemaName: 'copilots_header_8ac77.topic.GenAI', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Ask Gen AI'] },
        { TopicName: 'Gen AI (hr-HR)', SchemaName: 'copilots_header_8ac77.topic.GenAI.hr-HR', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Pitaj Gen AI'] },
        { TopicName: 'Gen AI (zh-Hans-CN)', SchemaName: 'copilots_header_8ac77.topic.GenAI.zh-Hans-CN', TriggerKind: 'OnRecognizedIntent' },
        { TopicName: 'Greeting', SchemaName: 'copilots_header_8ac77.topic.Greeting', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Hello', 'Hi', 'Hey'] },
        { TopicName: 'Greeting (hr-HR)', SchemaName: 'copilots_header_8ac77.topic.Greeting.hr-HR', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Bok', 'Pozdrav'] },
        // A copy with no base item, as for the voice system topics in a saved multilingual review.
        { TopicName: 'Silence detection (hr-HR)', SchemaName: 'copilots_header_8ac77.topic.SilenceDetection.hr-HR' },
      ],
    }));

    expect(report.customTopics).toEqual(['Gen AI']);
  });

  it('does not count the language copies of child agents', () => {
    const report = buildUpgradeReadiness(stageA({
      childAgents: [
        { name: 'Agent - Child', schemaName: 'copilots_header_8ac77.agent.Agent_5v7' },
        { name: 'Agent - Child (hr-HR)', schemaName: 'copilots_header_8ac77.agent.Agent_5v7.hr-HR' },
        { name: 'Billing helper', schemaName: 'copilots_header_8ac77.agent.BillingHelper' },
        { name: 'Billing helper (hr-HR)', schemaName: 'copilots_header_8ac77.agent.BillingHelper.hr-HR' },
      ],
    }));

    expect(report.childAgents).toEqual(['Agent - Child', 'Billing helper']);
  });

  it('counts an item that has the language tag only in its name or only in its schema name', () => {
    const report = buildUpgradeReadiness(stageA({
      childAgents: [
        { name: 'Payroll helper (de-DE)', schemaName: 'copilots_header_8ac77.agent.PayrollHelper' },
        { name: 'Travel helper', schemaName: 'copilots_header_8ac77.agent.TravelHelper.de-DE' },
      ],
      topicComponents: [
        { TopicName: 'Holiday policy (hr-HR)', SchemaName: 'copilots_header_8ac77.topic.HolidayPolicy', TriggerKind: 'OnRecognizedIntent' },
        { TopicName: 'Expense policy', SchemaName: 'copilots_header_8ac77.topic.ExpensePolicy.hr-HR', TriggerKind: 'OnRecognizedIntent' },
        { TopicName: 'Travel policy (de-DE)', SchemaName: 'copilots_header_8ac77.topic.TravelPolicy.hr-HR', TriggerKind: 'OnRecognizedIntent' },
        { TopicName: 'Leave policy (hr-HR)', TriggerKind: 'OnRecognizedIntent' },
      ],
    }));

    expect(report.childAgents).toEqual(['Payroll helper (de-DE)', 'Travel helper']);
    expect(report.customTopics).toEqual([
      'Holiday policy (hr-HR)',
      'Expense policy',
      'Travel policy (de-DE)',
      'Leave policy (hr-HR)',
    ]);
  });

  it('uses the saved knowledge names for a review that was saved before the evidence existed', () => {
    const report = buildUpgradeReadiness(stageA({
      knowledgeSources: ['Policy site'],
      knowledgeDetails: [{ name: 'Policy site', sourceType: 'SharePoint' }],
    }));

    expect(report.knowledge).toEqual({
      status: 'legacy-names',
      items: [{ name: 'Policy site', isAzureAiSearch: false }],
      hasAzureAiSearch: false,
    });
    expect(report.powerFx).toEqual({ available: false, items: [], total: 0 });
    expect(report.childAgents).toBeUndefined();
  });

  it('marks the knowledge part as unavailable when the snapshot has no knowledge data', () => {
    const report = buildUpgradeReadiness(stageA({ knowledgeSources: undefined as unknown as string[] }));

    expect(report.knowledge).toEqual({ status: 'unavailable', items: [], hasAzureAiSearch: false });
  });

  it('ignores saved items that are not correct', () => {
    const report = buildUpgradeReadiness(stageA({
      upgradeReadinessEvidence: {
        knowledgeSources: [
          { name: 'Policy index', kind: 'AzureAISearchSource' },
          { name: 42, kind: 'SharePointSearchSource' },
          null,
          'Policy site',
        ],
        powerFx: [
          { name: 'Workshop Booking', kind: 'topic', expressionCount: 2 },
          { name: 'Book flow', kind: 'flow', expressionCount: 1 },
          { name: 'Book workshop', kind: 'tool' },
        ],
        powerFxComponentCount: 'many',
      } as unknown as UpgradeReadinessEvidence,
      topicComponents: [
        { TopicName: 'Greeting', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Hello', 7, 'Hi'] },
        { TopicName: '   ' },
        null,
        { TopicName: ' Workshop Booking ', TriggerKind: 'OnRecognizedIntent' },
      ] as unknown as LocalStageAOutput['topicComponents'],
    }));

    expect(report.knowledge.items).toEqual([
      { name: 'Policy index', kind: 'AzureAISearchSource', isAzureAiSearch: true },
    ]);
    expect(report.powerFx).toEqual({
      available: true,
      items: [{ name: 'Workshop Booking', kind: 'topic', expressionCount: 2 }],
      total: 1,
    });
    expect(report.customTopics).toEqual(['Workshop Booking']);
  });
});
