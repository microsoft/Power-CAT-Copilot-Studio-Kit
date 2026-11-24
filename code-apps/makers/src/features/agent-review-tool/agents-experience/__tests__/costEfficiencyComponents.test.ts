import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FluentProvider,
  webLightTheme,
} from '@fluentui/react-components';
import {
  RendererProvider,
  createDOMRenderer,
  renderToStyleElements,
} from '@griffel/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { CostEfficiencyTab } from '../components/cost-efficiency/CostEfficiencyTab';
import { ConfigurationSignalsRow } from '../components/cost-efficiency/ConfigurationSignalsRow';
import { CostEstimateHero } from '../components/cost-efficiency/CostEstimateHero';
import { CostMethodologyDisclosure } from '../components/cost-efficiency/CostMethodologyDisclosure';
import { CostOpportunitiesList } from '../components/cost-efficiency/CostOpportunitiesList';
import { EvaluationRunGuidance } from '../components/cost-efficiency/EvaluationRunGuidance';
import { ScenarioExposureTable } from '../components/cost-efficiency/ScenarioExposureTable';
import type { CostScenario } from '../contracts/CostEfficiency';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { CrossSkillOrchestrationEvaluation } from '../contracts/SkillEvaluation';
import {
  buildScenarioExposure,
  estimateMonthlyCost,
  parseMonthlyTaskInput,
} from '../services/cost-efficiency/buildCostEfficiencyReview';
import {
  buildCostOpportunities,
  collectCostArchitectureFacts,
} from '../services/cost-efficiency/costOpportunityBuilders';

function createModel(
  overrides: Partial<AgentsExperienceModel> = {},
): AgentsExperienceModel {
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
      expectedTools: [],
      schemaname: 'cost.case',
    }],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [],
    ...overrides,
  };
}

/**
 * Wraps content the way the app root does. The tab reads transcript evidence
 * through React Query, so a client must be present even though the query stays
 * disabled here (no bot id or environment is supplied).
 */
function withProviders(content: ReactNode): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(
    QueryClientProvider,
    { client },
    createElement(FluentProvider, { theme: webLightTheme }, content),
  );
}

function renderWithFluent(content: ReactNode): string {
  return renderToStaticMarkup(withProviders(content));
}

function tabElement(
  model: AgentsExperienceModel,
  monthlyTasksInput = '1000',
  scenario: CostScenario = 'medium',
  aiOrchestration?: CrossSkillOrchestrationEvaluation,
): ReactNode {
  return createElement(CostEfficiencyTab, {
    model,
    monthlyTasksInput,
    scenario,
    aiOrchestration,
    onMonthlyTasksInputChange: vi.fn(),
    onScenarioChange: vi.fn(),
  });
}

function renderTab(
  model: AgentsExperienceModel,
  monthlyTasksInput = '1000',
  scenario: CostScenario = 'medium',
  aiOrchestration?: CrossSkillOrchestrationEvaluation,
): string {
  return renderWithFluent(tabElement(model, monthlyTasksInput, scenario, aiOrchestration));
}

function budgetElement(
  model: AgentsExperienceModel,
  monthlyTasksInput = '1000',
  scenario: CostScenario = 'medium',
): ReactNode {
  const parseResult = parseMonthlyTaskInput(monthlyTasksInput);
  const estimate = parseResult.valid
    ? estimateMonthlyCost({ monthlyTasks: parseResult.value, scenario })
    : undefined;
  const exposure = parseResult.valid
    ? buildScenarioExposure(parseResult.value, scenario)
    : undefined;

  return createElement(
    Fragment,
    null,
    createElement(CostEstimateHero, {
      monthlyTasksInput,
      scenario,
      parseResult,
      estimate,
      onMonthlyTasksInputChange: vi.fn(),
      onScenarioChange: vi.fn(),
      headingLevel: 'h4',
    }),
    exposure
      ? createElement(ScenarioExposureTable, {
        exposure,
        headingLevel: 'h4',
      })
      : null,
    createElement(CostMethodologyDisclosure, { headingLevel: 'h4' }),
  );
}

function renderBudget(
  model: AgentsExperienceModel,
  monthlyTasksInput = '1000',
  scenario: CostScenario = 'medium',
): string {
  return renderWithFluent(budgetElement(model, monthlyTasksInput, scenario));
}

function validationElement(
  model: AgentsExperienceModel,
): ReactNode {
  return createElement(EvaluationRunGuidance, {
    testCases: model.testCases.length,
    headingLevel: 'h4',
  });
}

function renderValidation(
  model: AgentsExperienceModel,
): string {
  return renderWithFluent(validationElement(model));
}

function improvementElement(model: AgentsExperienceModel): ReactNode {
  return createElement(
    Fragment,
    null,
    createElement(ConfigurationSignalsRow, {
      facts: collectCostArchitectureFacts(model),
      headingLevel: 'h4',
    }),
    createElement(CostOpportunitiesList, {
      opportunities: buildCostOpportunities(model),
      headingLevel: 'h4',
    }),
  );
}

/** Renders content and returns both the markup and the CSS Griffel emitted. */
function renderWithStyles(content: ReactNode): { html: string; css: string } {
  const renderer = createDOMRenderer();
  const html = renderToStaticMarkup(
    createElement(
      RendererProvider,
      { renderer },
      withProviders(content),
    ),
  );
  const css = renderToStyleElements(renderer)
    .map(element => String(element.props.dangerouslySetInnerHTML?.__html ?? ''))
    .join('\n');
  return { html, css };
}

/** Renders the tab and returns the CSS Griffel actually emitted for it. */
function renderBudgetCss(model: AgentsExperienceModel): string {
  return renderWithStyles(budgetElement(model)).css;
}

/** Reads the classes on the element that directly wraps the given text. */
function classesWrapping(html: string, tag: string, text: string): string[] {
  const textIndex = html.indexOf(`>${text}<`);
  if (textIndex < 0) return [];
  const tagStart = html.lastIndexOf(`<${tag}`, textIndex);
  if (tagStart < 0) return [];
  const match = /class="([^"]*)"/.exec(html.slice(tagStart, textIndex + 1));
  return match ? match[1].split(/\s+/) : [];
}

const costEfficiencyTabSource = readFileSync(
  fileURLToPath(new URL('../components/cost-efficiency/CostEfficiencyTab.tsx', import.meta.url)),
  'utf8',
);

const configurationSignalsSource = readFileSync(
  fileURLToPath(new URL('../components/cost-efficiency/ConfigurationSignalsRow.tsx', import.meta.url)),
  'utf8',
);

const costMethodologyDisclosureSource = readFileSync(
  fileURLToPath(new URL('../components/cost-efficiency/CostMethodologyDisclosure.tsx', import.meta.url)),
  'utf8',
);

describe('CostEfficiencyTab', () => {
  it('organizes the tab around the four approved review questions', () => {
    const html = renderTab(createModel());
    const questions = [
      'What did we observe?',
      'What should I improve?',
      'How do I validate it?',
      'How do I plan a budget?',
    ];

    let previousIndex = -1;
    for (const question of questions) {
      const index = html.indexOf(question);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(html).toContain('Review summary');
    expect(html).not.toContain(
      'Review the evidence, choose a change, validate it, then plan a budget.',
    );
    expect(html).not.toContain(
      'Findings identify possible efficiency improvements. They do not prove savings.',
    );
    expect(html).toContain(
      'Evaluation runs consume Copilot Credits based on the runtime work performed.',
    );
    expect(html).toContain(
      'Use the same test set before and after one change, then compare recorded credit consumption and quality.',
    );
    expect(html).toContain('conversations reviewed');
    expect(html).toContain('changes to review');
    expect(html).toContain('saved validation cases');
    expect(costEfficiencyTabSource).toContain(
      '<Title3 as="h2" className={styles.pageHeading} id="cost-efficiency-heading">',
    );
    expect(costEfficiencyTabSource).toContain(
      '<Body1Strong as="h3" className={styles.summaryHeading}>',
    );
    expect(
      costEfficiencyTabSource.match(
        /<Divider aria-hidden className=\{styles\.summaryDivider\} vertical \/>/g,
      ),
    ).toHaveLength(2);
    expect(
      costEfficiencyTabSource.match(
        /<Divider aria-hidden className=\{styles\.summaryDividerMobile\} \/>/g,
      ),
    ).toHaveLength(2);
  });

  it('opens only What should I improve by default', () => {
    const html = renderTab(createModel());
    const isExpanded = (question: string) => {
      const textIndex = html.indexOf(question);
      const buttonStart = html.lastIndexOf('<button', textIndex);
      const buttonEnd = html.indexOf('>', buttonStart);
      return html.slice(buttonStart, buttonEnd).includes('aria-expanded="true"');
    };

    expect(isExpanded('What did we observe?')).toBe(false);
    expect(isExpanded('What should I improve?')).toBe(true);
    expect(isExpanded('How do I validate it?')).toBe(false);
    expect(isExpanded('How do I plan a budget?')).toBe(false);
  });

  it('uses native Fluent badges for the numbered steps', () => {
    expect(costEfficiencyTabSource).toContain(
      '<Badge appearance="filled" color="brand" shape="circular">',
    );
  });

  it('uses a clear hierarchy and polished configuration pills', () => {
    expect(costEfficiencyTabSource).toContain(
      '<Body1 className={styles.questionStatus}>{status}</Body1>',
    );
    expect(configurationSignalsSource).toContain(
      '<Caption1Strong>{entry.value}</Caption1Strong>',
    );
    expect(configurationSignalsSource).toContain(
      'borderRadius: tokens.borderRadiusCircular',
    );
    expect(configurationSignalsSource).toContain(
      'boxShadow: tokens.shadow2',
    );
    expect(configurationSignalsSource).toContain(
      '<BookOpenRegular fontSize={16} />',
    );
    expect(configurationSignalsSource).toContain(
      '<WrenchRegular fontSize={16} />',
    );
    expect(configurationSignalsSource).toContain(
      '<SkillGlyph size={16} />',
    );
  });

  it('centers each pill so its icon, label, value, and detail share one visual line', () => {
    const { html, css } = renderWithStyles(createElement(ConfigurationSignalsRow, {
      facts: collectCostArchitectureFacts(createModel()),
    }));
    const classes = classesWrapping(html, 'div', 'Model');

    expect(classes.length).toBeGreaterThan(0);
    expect(
      classes.some(name => css.includes(`.${name}{align-items:center`)),
    ).toBe(true);
    expect(
      classes.some(name => css.includes(`.${name}{align-items:baseline`)),
    ).toBe(false);
  });

  it('separates saved counts from observed transcript coverage', () => {
    const html = renderWithFluent(createElement(ConfigurationSignalsRow, {
      facts: {
        modelSeries: 'Sonnet46',
        connectorTools: 3,
        mcpTools: 3,
        skills: 2,
        knowledgeSources: 4,
        connectedAgents: 2,
        triggers: 0,
        webSearchEnabled: false,
        evaluationSets: 1,
        testCases: 1,
        toolAssertionCases: 0,
      },
      evidence: {
        status: 'ready',
        window: {
          startIso: '2026-07-12T00:00:00.000Z',
          endIso: '2026-08-11T00:00:00.000Z',
          days: 30,
          conversations: 12,
          truncated: false,
        },
        coverage: [
          {
            kind: 'knowledge',
            configured: 4,
            observed: 4,
            notAttributable: 0,
            items: [],
            aggregateObservations: [],
          },
          {
            kind: 'skill',
            configured: 2,
            observed: 2,
            notAttributable: 0,
            items: [],
            aggregateObservations: [],
          },
        ],
        observedTools: [],
        blockedConversations: 0,
      },
    }));

    expect(html).toContain('Seen in transcripts: 4/4');
    expect(html).toContain('Seen in transcripts: 2/2');
    expect(html).toContain(
      '&quot;Seen in transcripts&quot; shows how many configured items appeared at least once in the last 30 days.',
    );
    expect(html).toContain('It does not show how often they ran or what they cost.');
    expect(html).not.toContain('>4 observed<');
  });

  it('shows real AI overlap evidence as an AI-reviewed opportunity', () => {
    const aiOrchestration: CrossSkillOrchestrationEvaluation = {
      status: 'complete',
      summary: 'Two skills overlap.',
      referenceIds: ['ms-skills-overview'],
      findings: [{
        id: 'XSK-01:customer-search',
        ruleId: 'XSK-01',
        type: 'overlap',
        severity: 'medium',
        title: 'Narrow overlapping customer-search skills',
        skills: ['Customer search', 'Account search'],
        evidence: 'Both skills accept the same customer lookup request.',
        rationale: 'The orchestrator can select either skill for the same task.',
        recommendation: 'Give each skill a distinct purpose and routing description.',
        fixSteps: [],
        referenceIds: ['ms-skills-overview'],
        confidence: 'medium',
      }],
    };

    const html = renderTab(createModel(), '1000', 'medium', aiOrchestration);

    expect(html).toContain('AI-reviewed');
    expect(html).toContain('Narrow overlapping customer-search skills');
    expect(html).toContain('Affected skills');
    expect(html).toContain('Customer search');
    expect(html).toContain('Account search');
    expect(html).toContain('Both skills accept the same customer lookup request.');
    expect(html).not.toContain('guaranteed cost reduction');
  });

  it('does not invent AI feedback for an unrelated orchestration finding', () => {
    const aiOrchestration: CrossSkillOrchestrationEvaluation = {
      status: 'complete',
      summary: 'One coverage gap.',
      referenceIds: [],
      findings: [{
        id: 'XSK-04:coverage',
        ruleId: 'XSK-04',
        type: 'coverage-gap',
        severity: 'medium',
        title: 'Add a missing specialist skill',
        skills: ['Customer search'],
        evidence: 'No skill owns the escalation request.',
        rationale: 'The task is not covered.',
        recommendation: 'Add a specialist skill.',
        fixSteps: [],
        referenceIds: [],
        confidence: 'medium',
      }],
    };

    expect(renderTab(createModel(), '1000', 'medium', aiOrchestration))
      .not.toContain('AI-reviewed');
  });

  it('keeps the user agent forced-colors correction on the selected segment', () => {
    const css = renderBudgetCss(createModel());

    // Fluent colours this label through a higher-specificity sibling selector,
    // so an author colour here loses. Pairing `forced-color-adjust: none` with
    // a Highlight background would therefore strand unreadable text.
    expect(css).not.toContain('HighlightText');
    expect(css).toContain('outline:2px solid CanvasText');
  });

  it('gives the selected segment a non-text cue that survives colour loss', () => {
    // Hiding the radio indicator removed the only >=3:1 non-text cue (SC 1.4.11).
    expect(renderBudgetCss(createModel())).toContain('inset 0 -2px 0 0');
  });

  it('shows every published band so the estimate is not read as measured', () => {
    const html = renderBudget(createModel());

    expect(html).toMatch(/<h4[^>]*id="cost-exposure-heading"/);
    expect(html).toContain('Range across every published scenario');
    // All three published bands at 1,000 tasks, published arithmetic only.
    expect(html).toContain('100,000-300,000');
    expect(html).toContain('300,000-500,000');
    expect(html).toContain('$1,000-$3,000');
    expect(html).toContain('Selected');
  });

  it('states that configuration cannot select the band', () => {
    const html = renderBudget(createModel());

    expect(html).toContain('complexity of the work performed');
    expect(html).toContain('same task volume and');
    expect(html).toContain('billed separately');
    expect(html).toContain('consumes no credits');
  });

  it('renders the same exposure range for differently configured agents', () => {
    // The guide ties consumption to task complexity, so two agents planned with
    // the same volume must not be given different published numbers.
    const lean = renderBudget(createModel({ tools: [], knowledgeSources: [] }));
    const rich = renderBudget(createModel());

    for (const figure of ['100,000-300,000', '300,000-500,000', '$1,000-$3,000']) {
      expect(lean).toContain(figure);
      expect(rich).toContain(figure);
    }
  });

  it('does not equate saved test cases with runtime tasks', () => {
    function caseFor(name: string) {
      return {
        name,
        input: 'Complete the task.',
        expected: 'The task is complete.',
        expectedTools: [],
        schemaname: `eval.${name}`,
      };
    }

    const small = renderValidation(createModel({
      testCases: [caseFor('a'), caseFor('b')],
    }));

    expect(small).toMatch(/<h4[^>]*id="cost-evaluation-heading"/);
    expect(small).toContain('Plan one evaluation pass');
    expect(small).toContain('2');
    expect(small).toContain('saved test cases');
    expect(small).toContain(
      'Saved case count alone cannot determine the Copilot Credits consumed by a pass.',
    );
    expect(small).toContain(
      'A test case can contain multiple interactions and runtime tasks.',
    );
    expect(small).not.toContain('credits / pass');
    expect(small).not.toContain('600-1,000');
    expect(small).not.toContain('Public PAYG estimate');
  });

  it('asks for representative validation coverage when no test case is saved', () => {
    const html = renderValidation(createModel({ testCases: [] }));

    expect(html).toContain('no saved test cases');
    expect(html).toContain('Add representative cases before changing the configuration');
  });

  it('renders the approved sections and default Medium estimate', () => {
    const html = renderTab(createModel());
    const budgetHtml = renderBudget(createModel());

    expect(html).toContain('Cost &amp; efficiency');
    expect(html).toContain('What did we observe?');
    expect(html).toContain('What should I improve?');
    expect(html).toContain('How do I validate it?');
    expect(html).toContain('How do I plan a budget?');
    expect(html).toContain('Configuration signals');
    expect(html).not.toContain('Plan a monthly scenario');
    expect(budgetHtml).toContain('Plan a monthly scenario');
    expect(budgetHtml).toContain('How this estimate works');
    expect(budgetHtml).toContain('value="1000"');
    expect(budgetHtml).toContain('Medium = 300-500 credits per task.');
    expect(budgetHtml).toContain('300-500');
    expect(budgetHtml).toContain('300,000-500,000');
    expect(budgetHtml).toContain('$3,000-$5,000');
    expect(budgetHtml).toContain('role="status"');
    expect(budgetHtml).toContain(
      'medium scenario for 1,000 monthly tasks: 300,000-500,000 estimated monthly credits;',
    );
    expect(budgetHtml).toMatch(/<h4[^>]*id="cost-planning-heading"/);
    expect(html).toMatch(/<h4[^>]*id="cost-configuration-heading"/);
    expect(budgetHtml).toMatch(/<h4[^>]*id="cost-method-heading"/);
  });

  it('renders visible evidence limits and public price disclosures', () => {
    const html = renderBudget(createModel());

    expect(html).toContain('Planning estimate');
    // The tab now reads transcripts, so the old blanket "does not read
    // transcripts" claim would be false. The limit belongs to the figure: the
    // headline is not derived from transcripts even though the tab reads them.
    expect(html).toContain('not derived');
    expect(html).toContain("this agent&#x27;s transcripts");
    expect(html).toContain('actual billed usage');
    expect(html).toContain('models, runtime, context, and tools');
    expect(html).toContain('One conversation can contain several tasks');
    expect(html).toContain('$0.01 per credit');
    expect(html).toContain('Customer agreements');
    expect(html).toContain('Heavy has no published upper estimate');
    expect(html).toContain(
      'Microsoft Copilot Credits — Billing overview (opens in a new tab)',
    );
    expect(costMethodologyDisclosureSource).toContain(
      '<DocumentFilled',
    );
    expect(costMethodologyDisclosureSource).toContain(
      '<Open16Regular aria-hidden className={styles.openIcon} />',
    );
  });

  it('hedges the pay-as-you-go line only when the value is an estimate', () => {
    const heavy = renderBudget(createModel(), '1000', 'heavy');
    expect(heavy).toContain('More than $5,000 at public pay-as-you-go');
    expect(heavy).not.toContain('about More than');

    const zero = renderBudget(createModel(), '0');
    expect(zero).toContain('$0 at public pay-as-you-go');
    expect(zero).not.toContain('about $0');

    const medium = renderBudget(createModel());
    expect(medium).toContain('about $3,000-$5,000 at public pay-as-you-go');

    const invalid = renderBudget(createModel(), '1.5');
    expect(invalid).toContain(`${'\u2014'} at public pay-as-you-go`);
    expect(invalid).not.toContain('about \u2014');
  });

  it('shows inline validation and withholds calculated metrics for invalid input', () => {
    const html = renderBudget(createModel(), '1.5');

    expect(html).toContain('Enter a whole number of monthly tasks.');
    expect(html).toContain('aria-invalid="true"');
    expect(html.match(new RegExp(`>${'\u2014'}<`, 'g'))?.length).toBe(2);
  });

  it('collapses the hero and opportunity detail at the documented breakpoints', () => {
    const model = createModel({
      tools: [
        {
          name: 'Create order',
          description: '',
          kind: 'ConnectorTool',
          connectorId: 'shared_order',
          operationId: 'Create',
          schemaname: 'cost.order.a',
        },
        {
          name: 'Open order',
          description: 'Order',
          kind: 'ConnectorTool',
          connectorId: 'shared_order',
          operationId: 'Create',
          schemaname: 'cost.order.b',
        },
      ],
    });
    const css = renderWithStyles(createElement(
      Fragment,
      null,
      budgetElement(model),
      improvementElement(model),
    )).css;

    expect(css).toMatch(
      /@media \(max-width: 839px\)\{[^}]*grid-template-columns:minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 599px\)\{[^}]*grid-template-columns:minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 479px\)\{\.[a-z0-9]+ \.fui-Title1\{font-size:/,
    );
    expect(css).toMatch(/min-height:44px/);
  });

  it('stretches the radio label so the whole 44px segment is an activation target', () => {
    const { html, css } = renderWithStyles(budgetElement(createModel()));
    const classes = classesWrapping(html, 'label', 'Light');

    expect(classes.length).toBeGreaterThan(0);
    // Fluent's radio input is a fixed 32px, so the label is what has to fill
    // the row. Assert against the label's own atomic class, because Fluent
    // emits align-self:stretch elsewhere in the same stylesheet.
    expect(
      classes.some(name => css.includes(`.${name}{align-self:stretch`)),
    ).toBe(true);
  });

  it('renders configured evidence, risk, and validation for an opportunity', () => {
    const html = renderTab(createModel({
      tools: [
        {
          name: 'Create order',
          description: '',
          kind: 'ConnectorTool',
          connectorId: 'shared_order',
          operationId: 'Create',
          schemaname: 'cost.order.a',
        },
        {
          name: 'Open order',
          description: 'Order',
          kind: 'ConnectorTool',
          connectorId: 'shared_order',
          operationId: 'Create',
          schemaname: 'cost.order.b',
        },
      ],
    }));

    expect(html).toContain('Remove or differentiate duplicate tool operations');
    expect(html).toContain('High impact');
    expect(html).toContain('High confidence');
    expect(html).toMatch(/Configuration evidence[\s\S]{0,400}Configured/);
    expect(html).toContain('Configuration evidence');
    expect(html).toContain('Recommended change');
    expect(html).toContain('Quality or behavior risk');
    expect(html).toContain('Validation plan');
  });

  it('explains which opportunity results can change between reviews', () => {
    const html = renderTab(createModel({
      tools: [{
        name: 'Create order',
        description: '',
        kind: 'ConnectorTool',
        connectorId: 'shared_order',
        operationId: 'Create',
        schemaname: 'cost.order.a',
      }],
    }));

    expect(html).toContain(
      'Observed findings can change when the rolling 30-day transcript window changes.',
    );
    expect(html).toContain(
      'Configured findings change only when the saved agent configuration or test cases change.',
    );
    expect(html).toMatch(/Clarify when each tool should be selected[\s\S]{0,350}Configured/);
  });

  it('renders an explicit empty opportunity state', () => {
    const html = renderTab(createModel());

    expect(html).toContain(
      'No specific efficiency opportunity was identified in the saved review',
    );
  });

  it('shows the simple-agent harness advice in What should I improve? without a message bar', () => {
    const html = renderTab(createModel());
    const title = 'Simple agent on the Microsoft Copilot harness';
    const order = [
      'What should I improve?',
      'Configuration signals',
      title,
      'Potential optimization opportunities',
      'How do I validate it?',
    ];
    let from = 0;
    for (const part of order) {
      const index = html.indexOf(part, from);
      expect(index, part).toBeGreaterThan(-1);
      from = index + part.length;
    }

    expect(html).toMatch(
      /<h4[^>]*id="cost-harness-fit-heading"[^>]*>Simple agent on the Microsoft Copilot harness<\/h4>/,
    );
    const start = html.indexOf(title);
    const block = html.slice(start, html.indexOf('Potential optimization opportunities', start));
    expect(block).not.toContain('fui-MessageBar');
    expect(block).toContain(
      'This agent already uses the Microsoft Copilot harness. The agent is simple, so this harness is possibly more than it needs. Make sure that this harness gives a business benefit.',
    );
    expect(block).toContain('The review found these signs:');
  });

  it('keeps the review leads and status when the harness advice shows', () => {
    const html = renderTab(createModel());

    expect(html).toContain('0 review leads');
    expect(html).toContain('Ranked findings from observed use and saved configuration');
    expect(html).toContain('No specific efficiency opportunity was identified in the saved review');
    expect(html).toContain('Simple agent on the Microsoft Copilot harness');
  });

  it('shows no harness advice when the agent has 4 tools', () => {
    const html = renderTab(createModel({
      tools: Array.from({ length: 4 }, (_, index) => ({
        name: `Tool ${index + 1}`,
        description: `Runs step ${index + 1}.`,
        kind: 'ConnectorTool' as const,
        connectorId: 'shared_order',
        operationId: `Step${index + 1}`,
        schemaname: `cost.tool.${index + 1}`,
      })),
    }));

    expect(html).not.toContain('Simple agent on the Microsoft Copilot harness');
    expect(html).not.toContain('cost-harness-fit-heading');
  });
});

describe('CopilotReviewPage cost-tab integration', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../components/CopilotReviewPage.tsx', import.meta.url)),
    'utf8',
  );
  const navigationSource = readFileSync(
    fileURLToPath(new URL('../components/ReviewSectionNavigation.tsx', import.meta.url)),
    'utf8',
  );

  it('places Cost & efficiency after Architecture in the primary navigation', () => {
    const mapIndex = navigationSource.indexOf('value="map"');
    const costIndex = navigationSource.indexOf('value="cost"');

    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(costIndex).toBeGreaterThan(mapIndex);
  });

  it('links the cost section and panel for assistive technology', () => {
    expect(navigationSource).toContain('id="copilot-review-section-cost"');
    expect(navigationSource).toContain('aria-controls="copilot-review-section-panel-cost"');
    expect(source).toContain('id="copilot-review-section-panel-cost"');
    expect(source).toContain('aria-labelledby="copilot-review-section-cost"');
  });

  it('owns planning inputs outside the conditional tab panel and resets by review identity', () => {
    expect(source).toContain(
      'const [costPlanningState, setCostPlanningState] = useState<CostPlanningState>',
    );
    expect(source).toContain('const costPlanningIdentity =');
    expect(source).toContain(
      'if (costPlanningState.reviewIdentity !== costPlanningIdentity)',
    );
    expect(source).toContain('monthlyTasksInput: DEFAULT_COST_MONTHLY_TASKS_INPUT');
    expect(source).toContain('scenario: DEFAULT_COST_SCENARIO');
    expect(source).toContain('monthlyTasksInput={costPlanningState.monthlyTasksInput}');
    expect(source).toContain('scenario={costPlanningState.scenario}');
  });

  it('passes saved AI orchestration evidence into the cost tab', () => {
    expect(source).toContain(
      'aiOrchestration={activePayload.crossSkillOrchestration}',
    );
  });
});

describe('published scenario rubric in the UI', () => {
  it('shows the published definition and criteria for every band', () => {
    const html = renderBudget(createModel());
    // Without these words a reviewer cannot tell why one band applies, which
    // was the original complaint that the tab looked ungrounded.
    expect(html).toContain('What Microsoft counts as this scenario');
    expect(html).toContain('handful of knowledge sources');
    expect(html).toContain('Few sources');
    expect(html).toContain('Light reasoning');
    expect(html).toContain('Many sources');
    expect(html).toContain('Structured reasoning');
    expect(html).toContain('Broad aggregation');
    expect(html).toContain('Deep reasoning');
  });

  it('names the exact source table so provenance is visible without the disclosure', () => {
    const html = renderBudget(createModel());
    expect(html).toContain('Manage costs for agents powered by the');
    expect(html).toContain('Microsoft Copilot harness. Definitions and credit ranges');
    expect(html).toContain('quoted, not derived');
  });

  it('explains the selected band next to the picker', () => {
    const html = renderBudget(createModel(), '1000', 'medium');
    expect(html).toContain('Microsoft defines this band as');
    expect(html).toContain('Many sources, Structured reasoning, 2+ outputs');
  });

  it('states that no per-tool credit rate is published', () => {
    const html = renderBudget(createModel());
    expect(html).toContain('publishes no credit rate');
    expect(html).toContain('never claim a saving amount');
  });
});

describe('static-versus-per-agent honesty', () => {
  it('never claims the headline figure comes from saved configuration', () => {
    const html = renderBudget(createModel());
    // The hero receives no agent model. Claiming otherwise was the copy defect
    // that made the tab look like it measured something per agent.
    expect(html).not.toContain('Planning estimate from saved configuration');
    expect(html).toContain('same for any agent at the same settings');
  });

  it('points the reviewer to the sections that do vary by agent', () => {
    const html = renderBudget(createModel());
    expect(html).toContain('For figures specific');
    expect(html).toContain('evaluation run cost');
  });

  it('produces an identical headline for two differently configured agents', () => {
    // Locks the documented behaviour: the monthly figure is a planning number.
    const lean = renderBudget(createModel());
    const rich = renderBudget(createModel());
    const headline = (html: string) => /Estimated monthly credits[\s\S]{0,400}/.exec(html)?.[0];
    expect(headline(lean)).toBe(headline(rich));
  });
});
