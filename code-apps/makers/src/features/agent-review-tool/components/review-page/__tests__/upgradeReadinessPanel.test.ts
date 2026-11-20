import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput } from '../../../contracts/StageOutputs';
import { UpgradeReadinessPanel } from '../UpgradeReadinessPanel';

function render<Props extends object>(component: ComponentType<Props>, props: Props): string {
  return renderToStaticMarkup(
    createElement(FluentProvider, { theme: webLightTheme }, createElement(component, props)),
  );
}

function textOf(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOf(html: string, part: string): number {
  return html.split(part).length - 1;
}

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

describe('UpgradeReadinessPanel', () => {
  it('shows the reminder and each part of the saved evidence', () => {
    const html = render(UpgradeReadinessPanel, {
      isLoading: false,
      stageA: stageA({
        upgradeReadinessEvidence: {
          knowledgeSources: [
            { name: 'Policy index', kind: 'AzureAISearchSource' },
            { name: 'Policy site', kind: 'SharePointSearchSource' },
          ],
          powerFx: [
            { name: 'Workshop Booking', kind: 'topic', expressionCount: 2 },
            { name: 'Book workshop', kind: 'tool', expressionCount: 1 },
          ],
          powerFxComponentCount: 57,
        },
        childAgents: [{ name: 'Billing helper' }],
        topicComponents: [
          { TopicName: 'Workshop Booking', TriggerKind: 'OnRecognizedIntent', triggerQueries: ['Book a workshop'] },
          { TopicName: 'Conversation Start', TriggerKind: 'OnConversationStart' },
        ],
      }),
    });
    const text = textOf(html);

    expect(text).toContain('Confirm the business benefit before you upgrade');
    expect(text).toContain('The upgrade is a preview feature. It creates a copy of the agent and uses credits.');
    expect(text).toContain('This review does not change the agent and does not start an upgrade.');
    expect(text).toContain(
      "A functioning standard harness agent doesn't need to move simply because another harness is available.",
    );
    expect(text).toContain('A migration should be driven by a clear benefit');
    expect(text).toContain('Treat migration as re-architecture rather than component conversion.');
    expect(text).toContain('The upgrade creates a copy of the agent onto the Microsoft Copilot harness.');
    expect(text).toContain('Knowledge sources (2)');
    expect(text).toContain('Policy index: AzureAISearchSource (Azure AI Search)');
    expect(text).toContain('Policy site: SharePointSearchSource');
    expect(text).toContain('The Microsoft Copilot harness does not support Azure AI Search as a knowledge source.');
    expect(text).toContain('Connect to Foundry IQ as a tool');
    expect(text).toContain('Add the Azure AI Search connector as a tool');
    expect(text).toContain('Topics and tools that use Power Fx (57)');
    expect(text).toContain('Workshop Booking (topic): 2 expressions');
    expect(text).toContain('Book workshop (tool): 1 expression');
    expect(text).toContain('The list shows 2 of 57.');
    expect(text).toContain('Child agents (1)');
    expect(text).toContain('Billing helper');
    expect(text).toContain('Custom topics (1)');
    expect(text).not.toContain('Conversation Start');
    expect(text).not.toContain('Run the review again');
    expect(text).not.toContain('None found.');

    expect(html).toContain('href="https://learn.microsoft.com/microsoft-copilot-studio/guidance/choose-harness"');
    expect(html).toContain(
      'href="https://learn.microsoft.com/microsoft-copilot-studio/upgrade-to-microsoft-copilot-from-standard-harness"',
    );
    expect(html).toContain(
      'href="https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/foundry-iq-connect"',
    );
    expect(html).toContain('href="https://learn.microsoft.com/connectors/azureaisearch/"');
    expect(countOf(html, 'target="_blank"')).toBe(6);
    expect(countOf(html, 'rel="noopener noreferrer"')).toBe(6);
    expect(countOf(html, '<h3')).toBe(4);
  });

  it('shows the run-again messages for a review that was saved before the evidence existed', () => {
    const text = textOf(render(UpgradeReadinessPanel, {
      isLoading: false,
      stageA: stageA({
        knowledgeSources: ['Policy site'],
        knowledgeDetails: [{ name: 'Policy site', sourceType: 'SharePoint' }],
      }),
    }));

    expect(text).toContain('Confirm the business benefit before you upgrade');
    expect(text).toContain('Knowledge sources (1)');
    expect(text).toContain('Run the review again to see the kind of each knowledge source.');
    expect(text).toContain('Policy site');
    expect(text).not.toContain('Policy site:');
    expect(text).not.toContain('Connect to Foundry IQ as a tool');
    expect(text).toContain('Run the review again to see Power Fx usage.');
    expect(text).not.toContain('Topics and tools that use Power Fx (');
    expect(text).toContain('Run the review again to see the child agents.');
    expect(text).not.toContain('Child agents (');
    expect(text).toContain('Custom topics (0)');
    expect(text).toContain('None found.');
  });

  it('shows a spinner while the saved review loads', () => {
    const text = textOf(render(UpgradeReadinessPanel, { isLoading: true, stageA: null }));

    expect(text).toContain('Loading saved upgrade readiness...');
    expect(text).not.toContain('Knowledge sources');
  });

  it('shows a message when the review has no readable source snapshot', () => {
    for (const snapshot of [null, stageA({ configurationAvailable: false })]) {
      const text = textOf(render(UpgradeReadinessPanel, { isLoading: false, stageA: snapshot }));

      expect(text).toContain(
        'Upgrade readiness is unavailable because this review does not contain a readable source snapshot.',
      );
      expect(text).not.toContain('Knowledge sources');
    }
  });
});
