import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SSRProvider } from '@fluentui/react-components';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, type FetchQueryOptions } from '@tanstack/react-query';
import type { AeTool, AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { BotMetadata } from '../../contracts/ReviewResult';
import type { LocalStageAOutput, StageBTopicComponent } from '../../contracts/StageOutputs';

const { useQuery, useAllBots, loadOriginalStageA } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useAllBots: vi.fn(),
  loadOriginalStageA: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery,
}));
vi.mock('@fluentui/react-components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@fluentui/react-components')>(),
  // Portals have no server-rendered DOM; keep the actual dialog content visible to these checks.
  DialogSurface: ({ children }: PropsWithChildren) => createElement('section', null, children),
}));
vi.mock('../../hooks/useAllBots', () => ({ useAllBots }));
vi.mock('../services/upgradeOriginalReview', () => ({ loadOriginalStageA }));

import { UpgradeComparisonDialog } from '../components/UpgradeComparisonDialog';

const LEARN_URL = 'https://learn.microsoft.com/microsoft-copilot-studio/upgrade-to-microsoft-copilot-from-standard-harness';
const LEARN_QUOTE = 'The upgrade creates a copy of the agent onto the Microsoft Copilot harness. The upgrade carries over instructions, tools, and suggested prompts. Your custom topics can be rebuilt as skills of workflows. You get a report of what was migrated, what requires attention, and what was skipped. The upgrade consumes credits.';
const REVIEW_LOADING = 'Loading the saved review of the original agent...';
const SHORTER_NAME = 'The copy has a shorter name. Make sure that this is the correct agent.';
const PREFIX_HINT = 'The names of these standard agents start with the name of the copy.';

function bot(botId: string, name: string, extra: Partial<BotMetadata> = {}): BotMetadata {
  return { botId, name, statusCode: 0, componentIdUnique: `${botId}-component`, harness: 'standard', ...extra };
}

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

function tool(name: string): AeTool {
  return { name, kind: 'ConnectorTool', schemaname: `copy.tool.${name}` };
}

function topic(TopicName: string, extra: Partial<StageBTopicComponent> = {}): StageBTopicComponent {
  return { TopicName, TriggerKind: 'OnRecognizedIntent', ...extra };
}

const COPY = copyModel({
  agentSettings: { instructions: 'Help users file expenses.', raw: {} },
  tools: [tool('Send email')],
});

function render(): string {
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    null,
    createElement(
      SSRProvider,
      null,
      createElement(UpgradeComparisonDialog, {
        copyName: 'Expense helper (Upgraded)',
        copy: COPY,
        sourceEnvironment: 'source-env-1',
        onClose: () => undefined,
      }),
    ),
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAllBots.mockReturnValue({
    data: [
      bot('original-1', 'Expense helper', { modifiedOn: new Date(2026, 0, 15, 12) }),
      bot('copy-1', 'Expense helper (Upgraded)', { harness: 'copilot' }),
    ],
    isPending: false,
    isError: false,
  });
  useQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
});

describe('UpgradeComparisonDialog', () => {
  it('reads the saved review of the only original agent in the environment of the copy', async () => {
    loadOriginalStageA.mockResolvedValue({ status: 'not-reviewed' });

    const html = render();

    expect(html).toContain('Original agent: Expense helper.');
    expect(html).not.toContain(SHORTER_NAME);
    expect(html).toContain(REVIEW_LOADING);
    expect(useAllBots).toHaveBeenCalledWith('source-env-1');
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['agent-review-tool', 'upgrade-original-review', 'source-env-1', 'original-1'],
      enabled: true,
    }));
    const options = useQuery.mock.calls[0][0] as FetchQueryOptions;
    const client = new QueryClient();
    try {
      await expect(client.fetchQuery({ ...options, retryDelay: 0 })).resolves.toStrictEqual({ status: 'not-reviewed' });
      expect(loadOriginalStageA).toHaveBeenCalledWith('original-1', 'source-env-1');
    } finally {
      client.clear();
    }
  });

  it('shows the comparison and the date of the saved review', () => {
    useQuery.mockReturnValue({
      data: {
        status: 'found',
        reviewId: 'review-1',
        reviewedOn: new Date(2026, 0, 15, 12),
        stageA: stageA({
          agentInstructions: 'Help users file expenses.',
          tools: ['Send email'],
          knowledgeSources: ['Expense policy'],
          topicComponents: [topic('Conversation Start', { TriggerKind: 'OnConversationStart' }), topic('Book travel')],
        }),
      },
      isPending: false,
      isError: false,
    });

    const html = render();

    expect(html).toContain('The comparison uses the saved review of Jan 15, 2026.');
    expect(html).toContain('The original has 25 characters and the copy has 25 characters.');
    expect(html.match(/>Same</g)).toHaveLength(2);
    expect(html).toContain('Send email (Tool)');
    expect(html).toContain('The upgrade does not migrate knowledge sources.');
    expect(html.match(/>Missing in copy</g)).toHaveLength(2);
    expect(html).toContain('Book travel');
    expect(html).toContain('System topics that are not compared: Conversation Start.');
    expect(html).toMatch(/aria-label="Topics, skills, and workflows"[\s\S]*?<\/table><p[^>]*>The upgrade can give a new name to a skill or a workflow\. Compare each item that is &quot;Missing in copy&quot; with the items that are &quot;New in copy&quot;\.<\/p>/);
    expect(html).not.toContain(REVIEW_LOADING);
  });

  it('asks the maker to review the original agent first when it has no saved standard review', () => {
    useQuery.mockReturnValue({ data: { status: 'not-reviewed' }, isPending: false, isError: false });

    const html = render();

    expect(html).toContain('The original agent has no saved standard review. Review the original agent first.');
    expect(html).not.toContain('The comparison uses the saved review of');
    expect(html).not.toContain(REVIEW_LOADING);
  });

  it('reports a read error of the saved review', () => {
    useQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    const html = render();

    expect(html).toContain('The saved review of the original agent could not be loaded.');
    expect(html).not.toContain(REVIEW_LOADING);
  });

  it('lets the maker select the original agent when 2 or more standard agents have its name', () => {
    useAllBots.mockReturnValue({
      data: [
        bot('original-1', 'Expense helper', { modifiedOn: new Date(2026, 0, 15, 12) }),
        bot('original-2', ' Expense helper ', { modifiedOn: new Date(2026, 1, 3, 12) }),
      ],
      isPending: false,
      isError: false,
    });

    const html = render();

    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('Select the original agent');
    expect(html).toContain('Two or more standard agents have this name.');
    expect(html).not.toContain(PREFIX_HINT);
    expect(html).toContain('Expense helper (last modified Jan 15, 2026)');
    expect(html).toContain('Expense helper (last modified Feb 3, 2026)');
    expect(html).not.toContain('Original agent:');
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(html).not.toContain(REVIEW_LOADING);
  });

  it('asks the maker to make sure when the only original agent has a longer name than the copy', () => {
    useAllBots.mockReturnValue({
      data: [
        bot('original-1', 'Expense helper - Finance'),
        bot('copy-1', 'Expense helper (Upgraded)', { harness: 'copilot' }),
      ],
      isPending: false,
      isError: false,
    });

    const html = render();

    expect(html).toContain(`Original agent: Expense helper - Finance. ${SHORTER_NAME}`);
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['agent-review-tool', 'upgrade-original-review', 'source-env-1', 'original-1'],
      enabled: true,
    }));
  });

  it('lets the maker select the original agent when 2 or more standard agent names start with the name of the copy', () => {
    useAllBots.mockReturnValue({
      data: [
        bot('original-1', 'Expense helper - Finance', { modifiedOn: new Date(2026, 0, 15, 12) }),
        bot('original-2', 'Expense helper EU', { modifiedOn: new Date(2026, 1, 3, 12) }),
        bot('other-1', 'Expense helpers'),
      ],
      isPending: false,
      isError: false,
    });

    const html = render();

    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('Select the original agent');
    expect(html).toContain(PREFIX_HINT);
    expect(html).not.toContain('Two or more standard agents have this name.');
    expect(html).toContain('Expense helper - Finance (last modified Jan 15, 2026)');
    expect(html).toContain('Expense helper EU (last modified Feb 3, 2026)');
    expect(html).not.toContain('Original agent:');
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('reports that no original agent is found and reads no review', () => {
    useAllBots.mockReturnValue({
      data: [
        bot('other-1', 'Travel helper'),
        bot('copilot-1', 'Expense helper', { harness: 'copilot' }),
        bot('copy-1', 'Expense helper (Upgraded)', { harness: 'copilot' }),
      ],
      isPending: false,
      isError: false,
    });

    const html = render();

    expect(html).toContain('No original agent found. The copy or the original possibly has a new name.');
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(html).not.toContain(REVIEW_LOADING);
  });

  it('shows a spinner while the agent list loads', () => {
    useAllBots.mockReturnValue({ data: undefined, isPending: true, isError: false });

    const html = render();

    expect(html).toContain('Loading the agent list...');
    expect(html).not.toContain('No original agent found.');
    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('reports a read error of the agent list', () => {
    useAllBots.mockReturnValue({ data: undefined, isPending: false, isError: true });

    const html = render();

    expect(html).toContain('The agent list could not be loaded.');
    expect(html).not.toContain('No original agent found.');
    expect(html).not.toContain('Loading the agent list...');
  });

  it('offers the test sets and quotes the Learn source in all states', () => {
    useAllBots.mockReturnValue({ data: undefined, isPending: false, isError: true });

    const html = render();

    expect(html).toContain('Compare with original');
    expect(html).toContain('aria-label="Close the comparison"');
    expect(html).toContain('Copy: Expense helper (Upgraded).');
    expect(html).toContain('This comparison uses only saved data. It does not start a review.');
    expect(html).toContain('Use the test sets of the original agent to test the copy.');
    expect(html).toMatch(/<button(?=[^>]*\btype="button")[^>]*>Open Test sets in the Copilot Studio Kit<\/button>/);
    expect(html).toContain(`href="${LEARN_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Upgrade to the Microsoft Copilot harness (preview), opens in a new tab"');
    expect(html).toContain(`cite="${LEARN_URL}"`);
    expect(html).toContain(LEARN_QUOTE);
  });
});
