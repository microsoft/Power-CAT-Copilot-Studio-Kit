import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import { CopilotHarnessFitBlock } from '../components/cost-efficiency/CopilotHarnessFitBlock';
import { HARNESS_FIT_OVERWORK_QUOTE } from '../../utils/harnessFit';

const TITLE = 'Simple agent on the Microsoft Copilot harness';
const LEAD =
  'This agent already uses the Microsoft Copilot harness. The agent is simple, so this harness is possibly more than it needs. Make sure that this harness gives a business benefit.';

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

function tools(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Tool ${i + 1}`,
    kind: 'ConnectorTool',
    schemaname: `workshop.tool${i + 1}`,
  }));
}

function renderInProvider(element: ReactElement): string {
  return renderToStaticMarkup(createElement(FluentProvider, { theme: webLightTheme }, element));
}

function render(model: AgentsExperienceModel): string {
  return renderInProvider(createElement(CopilotHarnessFitBlock, { model, headingLevel: 'h4' }));
}

function textOf(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('CopilotHarnessFitBlock', () => {
  it('shows the advice for a simple agent as a titled section, not as a message bar', () => {
    const html = render(copilotModel());
    const text = textOf(html);

    expect(html).toMatch(new RegExp(`<h4[^>]*id="cost-harness-fit-heading"[^>]*>${TITLE}</h4>`));
    expect(html).toMatch(/<section[^>]*aria-labelledby="cost-harness-fit-heading"/);
    expect(html).not.toContain('fui-MessageBar');
    expect(text).toContain(LEAD);
    expect(text).toContain('The review found these signs:');
    expect([...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(match => textOf(match[1]))).toEqual([
      'The agent has no tools.',
      'The agent has no skills.',
      'The agent has no connected agents.',
      'The instructions have 40 characters (1,500 or fewer).',
    ]);
    expect(html).toMatch(
      new RegExp(`<p[^>]*><q>${HARNESS_FIT_OVERWORK_QUOTE.text}</q> <a [^>]*>Microsoft Learn</a></p>`),
    );
    expect(html).toContain('href="https://learn.microsoft.com/microsoft-copilot-studio/guidance/choose-harness"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Microsoft Learn, opens in a new tab"');

    const order = [TITLE, LEAD, 'The review found these signs:', 'The agent has no tools.', HARNESS_FIT_OVERWORK_QUOTE.text];
    expect(order.map(part => text.indexOf(part))).toEqual(order.map(part => text.indexOf(part)).sort((a, b) => a - b));
    expect(text).not.toContain('Harness fit');
    expect(text).not.toContain('This agent is simple. It possibly does not need the Microsoft Copilot harness.');
  });

  it('renders nothing when the agent has 4 tools', () => {
    const html = render(copilotModel({ tools: tools(4) }));

    expect(html).not.toContain('<section');
    expect(textOf(html)).toBe('');
  });

  it('renders nothing when the tool list cannot be read', () => {
    const html = render(copilotModel({ tools: null }));

    expect(html).not.toContain('<section');
    expect(textOf(html)).toBe('');
  });
});
