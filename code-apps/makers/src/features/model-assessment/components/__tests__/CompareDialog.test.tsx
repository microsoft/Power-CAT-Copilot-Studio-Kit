import type { ReactNode } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import {
  createDOMRenderer,
  RendererProvider,
  SSRProvider,
  renderToStyleElements,
  ToggleButton,
} from '@fluentui/react-components';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompareDialog, type CompareDialogProps } from '../CompareDialog';
import { formatWhen } from '../../contracts/model-assessment';
import { withUniqueTestSetNames } from '../../contracts/test-sets';

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), links: vi.fn(), recommendation: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('../../services/evaluation-links', () => ({ getAssessmentEvaluationLinks: mocks.links }));
vi.mock('../../services/model-assessment-service', () => ({ getKitTestResults: vi.fn() }));
vi.mock('../../services/model-recommendation-service', () => ({ requestModelRecommendation: vi.fn() }));
vi.mock('../../hooks/useModelRecommendation', () => ({ useModelRecommendation: mocks.recommendation }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useQuery.mockReturnValue({ data: undefined, isError: false, isFetching: false });
  mocks.recommendation.mockReturnValue({ data: undefined, isError: false, isFetching: false });
});

vi.mock('@fluentui/react-components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fluentui/react-components')>();
  return {
    ...actual,
    DialogSurface: ({ children, className }: { children: ReactNode; className?: string }) =>
      <div data-testid="comparison-surface" className={className}>{children}</div>,
  };
});

const props: CompareDialogProps = {
  open: true,
  onClose: () => {},
  initialRunId: 'current',
  runs: [
    {
      id: 'current', name: 'Current', historyId: 'h-current', comparedToRunId: 'previous',
      status: 'Completed', analysisStatus: 'Completed', regression: 'Critical',
      pass: 0, fail: 1, error: 0, excluded: 0, completedOn: '2026-09-11T12:00:00Z',
      ai: 'One question regressed. Review the project site permissions.',
    },
    {
      id: 'previous', name: 'Previous', historyId: 'h-previous',
      status: 'Completed', analysisStatus: 'Pending', regression: 'Healthy',
      pass: 1, fail: 0, error: 0, excluded: 0, completedOn: '2026-09-10T12:00:00Z',
    },
  ],
  history: [
    { id: 'h-current', changeType: 'Model Changed', currentModel: 'GPT56Chat' },
    { id: 'h-previous', changeType: 'Model Changed', currentModel: 'GPT5Reasoning' },
  ],
  results: [
    { id: 'r-current', name: '', runId: 'current', testCaseId: 'case-1', testSet: 'MODELCHECK',
      question: 'How do I access the project site?', metric: 'GeneralQuality', status: 'Fail' },
    { id: 'r-previous', name: '', runId: 'previous', testCaseId: 'case-1', testSet: 'MODELCHECK',
      question: 'How do I access the project site?', metric: 'GeneralQuality', status: 'Pass' },
  ],
};

function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(<SSRProvider>{node}</SSRProvider>);
}

function panels(html: string) {
  return html.split(/(?=<div id="[^"]+-(?:summary|cases)-panel")/).slice(1);
}

function styledComparison(overrides: Partial<CompareDialogProps> = {}) {
  const renderer = createDOMRenderer();
  const html = renderToStaticMarkup(
    <RendererProvider renderer={renderer}><CompareDialog {...props} {...overrides} /></RendererProvider>,
  );
  const css = renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>).replace(/\s+/g, '');
  return { html, css };
}

describe('CompareDialog sections', () => {
  it('keeps the original comparison layout without overhaul paging or table cards', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(cases).not.toContain('Comparison test case pages');
    expect(cases).not.toContain('Test cases per page');
    expect(cases).not.toContain('fui-CardPreview');
  });

  it('identifies the agent in the dialog heading', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} agentName="  Contoso Support Agent  " />);
    const title = html.match(/<h2\b[^>]*>.*?<\/h2>/)?.[0] ?? '';
    expect(title).toContain('Compare model runs: Contoso Support Agent');
  });

  it.each([undefined, '', '   '])('keeps the generic title when the agent name is absent (%s)', agentName => {
    const html = renderToStaticMarkup(<CompareDialog {...props} agentName={agentName} />);
    const title = html.match(/<h2\b[^>]*>.*?<\/h2>/)?.[0] ?? '';
    expect(title).toContain('Compare model runs');
    expect(title).not.toContain('Compare model runs:');
  });

  it('bounds long named headings to two lines while retaining their full text and keyboard tooltip target', () => {
    const agentName = 'A very long customer support agent name with international escalation workflows';
    const { html, css } = styledComparison({ agentName });
    const title = html.match(/<h2\b[^>]*>.*?<\/h2>/)?.[0] ?? '';
    expect(title).toContain(`Compare model runs: ${agentName}`);
    const target = title.match(/<span\b[^>]*tabindex="0"[^>]*>/)?.[0] ?? '';
    expect(target).toContain('aria-describedby=');
    const classes = target.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some(name => css.includes(`.${name}{-webkit-line-clamp:2;}`))).toBe(true);
    expect(classes.some(name => css.includes(`.${name}{overflow-wrap:anywhere;}`))).toBe(true);
    expect(css).toContain('@media(max-height:480px)');
    expect(css).toContain('-webkit-line-clamp:1;');
  });

  it('provides an accessible close icon in the title action as well as the footer button', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} />);
    const titleAction = html.slice(html.indexOf('fui-DialogTitle__action'), html.indexOf('fui-DialogContent'));
    expect(titleAction).toMatch(/<button\b[^>]*aria-label="Close"/);
    expect(titleAction).toContain('<svg');
    expect(html.slice(html.indexOf('fui-DialogActions'))).toMatch(/<button\b[^>]*>Close<\/button>/);
  });

  it('matches the side-pane primary and secondary footer actions', () => {
    const { html, css } = styledComparison();
    const footer = html.slice(html.lastIndexOf('<', html.indexOf('fui-DialogActions')));
    const buttons = footer.match(/<button\b[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    const classes = buttons.map(button => button.match(/class="([^"]+)"/)![1].split(' '));
    expect(buttons[0]).toContain('Export to PDF');
    expect(buttons[0]).not.toContain('fui-Button__icon');
    expect(buttons[1]).toContain('Close');
    expect(classes.every(names => names.some(name => css.includes(`.${name}{min-height:44px;}`)))).toBe(true);
    expect(classes[0].some(name => css.includes(`.${name}{background-color:var(--colorBrandBackground);}`))).toBe(true);
    expect(classes[1].some(name =>
      css.match(new RegExp(`\\.${name}\\{([^}]+)\\}`))?.[1].includes('background-color:var(--colorNeutralBackground1);'),
    )).toBe(true);
    const footerClasses = footer.match(/class="([^"]+)"/)![1].split(' ');
    expect(footerClasses.some(name => css.includes(`.${name}{column-gap:var(--spacingHorizontalM);}`))).toBe(true);
    expect(footerClasses.some(name => css.includes(`.${name}{flex-wrap:wrap;}`))).toBe(true);
  });

  it('highlights every metric row when its question group is hovered', () => {
    const { html, css } = styledComparison();
    const classes = html.match(/<tbody\b[^>]*data-question-group[^>]*class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) =>
      css.includes(`.${name}:hover>tr{background-color:var(--colorSubtleBackgroundHover);}`),
    )).toBe(true);
  });

  it('vertically centers the question across its metric rows', () => {
    const { html, css } = styledComparison();
    const cell = html.match(/<th\b[^>]*scope="rowgroup"[^>]*>/)?.[0] ?? '';
    const classes = cell.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{vertical-align:middle;}`))).toBe(true);
  });

  it('balances the test-case column without letting it consume all spare table width', () => {
    const { html, css } = styledComparison();
    const caseHeader = html.match(/<th\b[^>]*>/)?.[0] ?? '';
    const classes = caseHeader.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{width:40%;}`))).toBe(true);
    expect(classes.some((name) => css.includes(`.${name}{min-width:240px;}`))).toBe(true);
    expect(classes.some((name) => css.includes(`.${name}{box-sizing:border-box;}`))).toBe(true);
  });

  it('keeps the metric column wide enough for "Required Information Coverage" on one line', () => {
    const { html, css } = styledComparison();
    const metricHeader = html.match(/<th\b[^>]*>/g)?.[1] ?? '';
    const classes = metricHeader.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{min-width:220px;}`))).toBe(true);
  });

  it('preserves room for prompts and result columns when the comparison scrolls on mobile', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} />);
    expect(html.match(/<table\b[^>]*>/)?.[0]).toContain('min-width:740px');
  });

  it('keeps the column headers sticky within the comparison scroll region', () => {
    const { html, css } = styledComparison();
    const classes = html.match(/<thead\b[^>]*class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{position:sticky;}`))).toBe(true);
    expect(classes.some((name) => css.includes(`.${name}{top:0;}`))).toBe(true);
  });

  it('contains sticky header stacking below the Fluent card outline', () => {
    const { html, css } = styledComparison();
    const region = html.match(/<div\b[^>]*aria-label="Scrollable multi-run comparison table"[^>]*>/)?.[0] ?? '';
    const classes = region.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{isolation:isolate;}`))).toBe(true);
  });

  it('groups the test-set name once above full-width questions', () => {
    const results = ['case-1', 'case-2'].flatMap((testCaseId) =>
      props.results.map((result) => ({ ...result, id: `${result.id}-${testCaseId}`, testCaseId })),
    );
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.match(/data-test-set-heading/g)).toHaveLength(1);
    expect(cases.split('>MODELCHECK<')).toHaveLength(2);
    expect(cases.match(/data-question-group/g)).toHaveLength(2);
    const questions = cases.match(/<th\b[^>]*scope="rowgroup"[^>]*>.*?<\/th>/g) ?? [];
    expect(questions).toHaveLength(2);
    expect(questions.every((question) => !question.includes('MODELCHECK'))).toBe(true);
  });

  it('shows each turn of a multi-turn case as its own row under one shared result', () => {
    const results = props.results.map((result) => ({ ...result, questions: ['First', 'Second', 'Third'] }));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    const group = cases.match(/<tbody\b[^>]*data-question-group[^>]*>.*?<\/tbody>/)?.[0] ?? '';
    expect(group.match(/<tr\b/g)).toHaveLength(3);
    expect(group.match(/<th\b[^>]*scope="row"/g)).toHaveLength(3);
    expect(group).toMatch(/<td\b[^>]*rowspan="3"[^>]*>Response Quality/i);
    expect(group).toContain('>Multi-turn<');
    expect(group).not.toContain('3 turns');
    expect(group).not.toMatch(/>\d+\.<\/span>/);
  });

  it('shows same-named test sets with different ids as separate groups', () => {
    const results = withUniqueTestSetNames([
      ...props.results.map((result) => ({ ...result, testSetId: 'set-a', multiTurn: false })),
      ...props.results.map((result) => ({
        ...result, id: `${result.id}-conv`, testCaseId: 'case-conv', testSetId: 'set-b', multiTurn: true,
      })),
    ], new Map([['current', 'agent'], ['previous', 'agent']]));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.match(/data-test-set-heading/g)).toHaveLength(2);
    expect(cases).toContain('>MODELCHECK<');
    expect(cases).toContain('>MODELCHECK (Conversation)<');
  });

  it('identifies native multi-turn cases even when only one question is available', () => {
    const results = props.results.map((result) => ({ ...result, multiTurn: true, questions: ['Only recorded turn'] }));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    const group = cases.match(/<tbody\b[^>]*data-question-group[^>]*>.*?<\/tbody>/)?.[0] ?? '';
    expect(group).toContain('>Multi-turn<');
    expect(group).not.toContain('1 turn');
    expect(group).toContain('Only recorded turn');
    expect(group.match(/<tr\b/g)).toHaveLength(1);
  });

  it('puts native conversation sets and cases before single-turn tests', () => {
    const results = [
      { testCaseId: 'plain', testSet: 'A single-only', question: 'Alpha plain' },
      { testCaseId: 'mixed-single', testSet: 'B mixed', question: 'A mixed single' },
      { testCaseId: 'mixed-conversation', testSet: 'B mixed', question: 'Z conversation',
        multiTurn: true, questions: ['Hello conversation', 'Next prompt'] },
      { testCaseId: 'conversation', testSet: 'Z conversations', question: 'Zulu multi',
        multiTurn: true, questions: ['Other conversation', 'Follow-up'] },
    ].flatMap((test) => props.results.map((r) => ({ ...r, ...test, id: `${r.id}-${test.testCaseId}` })));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.indexOf('>B mixed<')).toBeLessThan(cases.indexOf('>Z conversations<'));
    expect(cases.indexOf('>Z conversations<')).toBeLessThan(cases.indexOf('>A single-only<'));
    expect(cases.indexOf('Hello conversation')).toBeLessThan(cases.indexOf('A mixed single'));
    expect(cases).not.toMatch(/>\d+\.<\/span>/);
  });

  it('removes the redundant table title and check count while retaining filter help', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(cases).toContain('aria-label="Needs attention includes failed or error results.');
    expect(cases).not.toContain('Test results');
    expect(cases).not.toContain('1 of 1');
  });

  it('keeps the cases panel and dialog content from adding nested scrollbars', () => {
    const { html, css } = styledComparison();
    const content = html.match(/<div\b[^>]*class="[^"]*fui-DialogContent[^"]*"[^>]*>/)?.[0] ?? '';
    const cases = html.match(/<div id="[^"]+-cases-panel"[^>]*>/)?.[0] ?? '';
    for (const element of [content, cases]) {
      const classes = element.match(/class="([^"]+)"/)?.[1].split(' ') ?? [];
      expect(classes.some((name) => css.includes(`.${name}{overflow-y:hidden;}`))).toBe(true);
      expect(classes.some((name) => css.includes(`.${name}{min-height:0;}`))).toBe(true);
    }
  });

  it('keeps an accessible name without a visible run selector label', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} />);
    expect(html).not.toMatch(/>Runs to compare</);
    const dropdown = html.match(/<button\b[^>]*role="combobox"[^>]*>/)?.[0];
    expect(dropdown).toContain('aria-label="Runs to compare"');
  });

  it('uses the Test Runs tab as the table accessible name', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    const headingId = cases.match(/aria-labelledby="([^"]+-cases-tab)"/)?.[1];
    expect(headingId).toBeDefined();
    expect(cases).toContain(`<table aria-labelledby="${headingId}"`);
    expect(cases).not.toContain('aria-label="Multi-run model comparison"');
  });

  it('uses Fluent accessible selected styling for comparison filters', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    const reference = renderToStaticMarkup(
      <ToggleButton size="small" shape="circular" isAccessible checked>All 1</ToggleButton>,
    );
    const classes = reference.match(/<button[^>]+class="([^"]+)"/)?.[1];
    expect(classes).toBeDefined();
    const selectedButton = cases.match(/<button[^>]*aria-pressed="true"[^>]*>/)?.[0];
    expect(selectedButton).toContain(`class="${classes}"`);
  });

  it('shows a question once when it has multiple test methods, retaining each method status', () => {
    const results = [
      ...props.results,
      { ...props.results[0], id: 'r-current-keyword', metric: 'AnyKeywordMatch', status: 'Error' },
      { ...props.results[1], id: 'r-previous-keyword', metric: 'AnyKeywordMatch', status: 'Error' },
    ];
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.split('How do I access the project site?')).toHaveLength(2);
    expect(cases).toContain('rowSpan="2"');
    expect(cases).toContain('Required Information Coverage');
    expect(cases).toContain('Response Quality');
    expect(cases).not.toContain('>AnyKeywordMatch<');
    expect(cases).toContain('Error');
    expect(cases).toContain('Pass');
    expect(cases).toContain('Fail');
  });

  it('keeps different test cases separate even when their question text is identical', () => {
    const results = ['case-1', 'case-2'].flatMap((testCaseId) =>
      ['GeneralQuality', 'AnyKeywordMatch'].flatMap((metric) =>
        props.results.map((result) => ({ ...result, id: `${result.id}-${testCaseId}-${metric}`, testCaseId, metric })),
      ),
    );
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.split('How do I access the project site?')).toHaveLength(3);
    expect(cases.match(/data-question-group/g)).toHaveLength(2);
    expect(cases.match(/rowSpan="2"/g)).toHaveLength(2);
    expect(cases.match(/scope="rowgroup"/g)).toHaveLength(2);
    expect(cases).toContain('All 4');
  });

  it.each([undefined, '', '   '])('does not show a case ID when question text is %j', (question) => {
    const ids = ['05ccd0ab-f81e-4d0c-8e25-5b39a1a1db30', '069d2103-9f3b-432f-95d4-c6c612fc9fe4'];
    const results = ids.flatMap((id) => props.results.map((result) => ({
      ...result, id: `${result.id}-${id}`, testCase: id, testCaseId: id, question,
    })));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    for (const id of ids) expect(cases).not.toContain(id);
    expect(cases).not.toContain('Question text unavailable');
    const questionCells = cases.match(/<th\b[^>]*scope="rowgroup"[^>]*>.*?<\/th>/g) ?? [];
    expect(questionCells).toHaveLength(2);
    expect(questionCells.every((cell) => /^(?:<[^>]*>)*$/.test(cell))).toBe(true);
    expect(cases.match(/data-question-group/g)).toHaveLength(2);
    expect(cases).toContain('Needs attention 2');
    expect(cases).toContain('Regressed: Pass → Fail');
  });

  it('uses available question text from another selected run instead of an empty first result', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props}
      results={[{ ...props.results[0], question: '' }, props.results[1]]}
    />));
    expect(cases).toContain('How do I access the project site?');
    expect(cases).not.toContain('Question text unavailable');
  });

  it('uses available question text from another metric in the same question group', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={[
      ...props.results.map((result) => ({ ...result, question: '' })),
      { ...props.results[0], id: 'keyword', metric: 'AnyKeywordMatch' },
    ]} />));
    expect(cases.split('How do I access the project site?')).toHaveLength(2);
    expect(cases).not.toContain('Question text unavailable');
    expect(cases).toContain('rowSpan="2"');
  });

  it('preserves missing-run statuses without an unused expected-response column', () => {
    const results = [
      ...props.results,
      { ...props.results[0], id: 'keyword', metric: 'AnyKeywordMatch' },
    ];
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.split('How do I access the project site?')).toHaveLength(2);
    expect(cases).not.toContain('Expected response');
    expect(cases).toContain('Not run');
    expect(cases).toContain('rowSpan="2"');
    const setHeading = cases.match(/<tbody\b[^>]*data-test-set-heading[^>]*>.*?<\/tbody>/)?.[0];
    expect(setHeading).toContain('colSpan="4"');
  });

  it('uses the same modal sizing for empty, single-run, and multi-run comparisons', () => {
    const variants = [
      { ...props, results: [] },
      { ...props, runs: props.runs.slice(0, 1) },
      props,
    ];
    const surfaces = variants.map((variant) =>
      renderToStaticMarkup(<CompareDialog {...variant} />)
        .match(/<div data-testid="comparison-surface" class="([^"]+)"/)?.[1],
    );
    expect(surfaces.every(Boolean)).toBe(true);
    expect(new Set(surfaces).size).toBe(1);
  });

  it('opens on Summary and combines attention findings with comparison in a single Test Runs tab', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} />);
    const [summary, cases] = panels(html);
    expect(summary).toBeDefined();
    expect(summary.slice(0, summary.indexOf('>'))).not.toContain('hidden');
    expect(summary).toContain('AI summary');
    expect(summary).not.toContain('next steps');
    expect(summary).not.toContain('Next step');
    expect(summary).not.toContain('Review the project site permissions.');
    expect(summary).toContain('One question regressed.');
    expect(summary).toContain('Analysis pending.');
    expect(summary).not.toContain('Questions needing attention');
    expect(summary).not.toContain('Test results');
    expect(cases.slice(0, cases.indexOf('>'))).toContain('hidden');
    expect(cases).toContain('Needs attention 1');
    expect(cases).toContain('Regressed: Pass → Fail');
    expect(cases).not.toContain('One question regressed.');
    expect(cases.split('How do I access the project site?')).toHaveLength(2);
    expect(cases).not.toContain('Test results');
    expect(cases).not.toContain('comparison rows shown');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html.match(/aria-controls="[^"]+-panel"/g)).toHaveLength(2);
    expect(html).toContain('>Test runs<');
    expect(html).not.toContain('questions-panel');
  });

  it('shows Kit test results per run in the Test Runs tab', () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => queryKey[1] === 'kit-results'
      ? {
          data: [
            { id: 'k1', testRunId: 'KIT-CURRENT', testId: 't1', utterance: 'hi', expected: 'How',
              operator: 3, code: 2, reason: 'Expected text not found', testSetName: 'Demo' },
            { id: 'k2', testRunId: 'kit-previous', testId: 't1', utterance: 'hi', code: 1, testSetName: 'Demo' },
          ],
          isError: false, isLoading: false, isFetching: false,
        }
      : { data: undefined, isError: false, isFetching: false });
    const kit = (testRunId: string, pass: number) =>
      ({ status: 'Completed', testRunId, pass, fail: 1 - pass, total: 1, regressed: 0, improved: 0 });
    const html = renderToStaticMarkup(<CompareDialog {...props} runs={[
      { ...props.runs[0], kit: kit('kit-current', 0) },
      { ...props.runs[1], kit: kit('kit-previous', 1) },
    ]} />);
    const [, cases] = panels(html);
    expect(cases).toContain('>Demo (1)<');
    expect(cases).not.toContain('Copilot Agent Kit tests');
    expect(cases).not.toContain('Kit 0/1 passed');
    expect(cases).not.toContain('Expected: How');
    expect(cases).toContain('>Required Information Included<');
    expect(cases).toContain('>Failed<');
    expect(cases).not.toContain('Expected text not found');
    expect(cases).toContain('>Passed<');
    expect(cases.split('>hi<')).toHaveLength(2);
    expect(cases).toContain('aria-label="Collapse Demo"');
    expect(cases).not.toContain('aria-expanded="false"');
    expect(cases).not.toMatch(/<tbody[^>]*hidden=""[^>]*data-kit-rows/);
    const count = (markup: string, label: string) => Number(markup.match(new RegExp(`${label} (\\d+)`))?.[1] ?? 0);
    const [, withoutKit] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    for (const label of ['All', 'Needs attention', 'Regressed']) {
      expect(count(cases, label)).toBe(count(withoutKit, label) + 1);
    }
  });

  it('omits the Kit section when no selected run has Kit tests', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(cases).not.toContain('Copilot Agent Kit tests');
  });

  it('groups recorded Kit conversation turns under one metric and aggregate result per run', () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => queryKey[1] === 'kit-results'
      ? {
          data: ['kit-current', 'kit-previous'].map((testRunId) => ({
            id: testRunId, testRunId, testId: 'conversation', testType: 5,
            utterance: 'Conversation', questions: ['First Kit turn', 'Second Kit turn', 'Third Kit turn'],
            code: testRunId === 'kit-current' ? 2 : 1, testSetName: 'Kit conversations',
          })),
          isError: false, isLoading: false, isFetching: false,
        }
      : { data: undefined, isError: false, isFetching: false });
    const runs = props.runs.map((run) => ({
      ...run,
      kit: { status: 'Completed', testRunId: `kit-${run.id}`, pass: 0, fail: 1, total: 1, regressed: 0, improved: 0 },
    }));
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} runs={runs} />));
    const group = cases.match(/<tbody\b[^>]*data-kit-rows[^>]*>.*?<\/tbody>/)?.[0] ?? '';
    expect(cases).toContain('>Kit conversations (1)<');
    expect(group.match(/data-kit-test="conversation"/g)).toHaveLength(1);
    expect(group.match(/data-kit-turn="conversation"/g)).toHaveLength(3);
    expect(group.match(/<th\b[^>]*scope="row"/g)).toHaveLength(4);
    expect(group).toContain('Conversation Flow');
    expect(group).toContain('>Multi-turn<');
    expect(group).toContain('aria-expanded="false"');
    expect(group.match(/<tr\b[^>]*hidden=""[^>]*data-kit-turn="conversation"/g)).toHaveLength(3);
    expect(group).not.toMatch(/>\d+ turns?</);
    const heading = group.match(/<tr\b[^>]*data-kit-test="conversation"[^>]*>.*?<\/tr>/)?.[0] ?? '';
    expect(heading.match(/<svg\b/g)).toHaveLength(1);
    expect(heading.indexOf('>Conversation<')).toBeLessThan(heading.indexOf('>Multi-turn<'));
    expect(group.match(/>Passed</g)).toHaveLength(1);
    expect(group.match(/>Failed</g)).toHaveLength(1);
    expect(group).not.toMatch(/>\d+\.<\/span>/);
    expect(group.indexOf('First Kit turn')).toBeLessThan(group.indexOf('Second Kit turn'));
    expect(group.indexOf('Second Kit turn')).toBeLessThan(group.indexOf('Third Kit turn'));
  });

  it('left-aligns comparison card bodies and keeps their children at the start', () => {
    const { html, css } = styledComparison();
    const classes = html.match(/<div class="([^"]+)"><div class="[^"]+"><(?:div|span)\b[^>]*fui-Badge/)?.[1].split(' ') ?? [];
    expect(classes.some((name) => css.includes(`.${name}{text-align:left;}`))).toBe(true);
    expect(classes.some((name) => css.includes(`.${name}{align-items:flex-start;}`))).toBe(true);
    expect(classes.some((name) => css.includes(`.${name}{padding:0;}`))).toBe(true);
  });

  it('labels one-recorded-turn Kit conversations and shows remaining turns as unrecorded', () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => queryKey[1] === 'kit-results'
      ? {
          data: [{
            id: 'kit-parent', testRunId: 'kit-current', testId: 'conversation', testType: 5, code: 2,
            testName: 'Greeting and card', turns: [
              { id: 'one', testId: 'one', utterance: 'Hi', testType: 1, operator: 1, code: 2 },
              { id: 'two', testId: 'two', utterance: 'Show a card', testType: 3, fromDefinition: true },
            ],
          }],
          isError: false, isLoading: false, isFetching: false,
        }
      : { data: undefined, isError: false, isFetching: false });
    const html = renderToStaticMarkup(<CompareDialog {...props} runs={[{
      ...props.runs[0],
      kit: { status: 'Completed', testRunId: 'kit-current', pass: 0, fail: 1, total: 1, regressed: 0, improved: 0 },
    }]} />);
    expect(html).toContain('Greeting and card');
    expect(html).toContain('>Multi-turn<');
    expect(html).not.toContain('2 turns');
    expect(html).toContain('Not recorded');
    expect(html).not.toContain('Unrecorded turns use the current test definition.');
    expect(html).toContain('>Exact Response Match<');
    expect(html).toContain('>Card and Attachment Check<');
  });

  it('shows Copilot Credits only for Microsoft Copilot harness agents', () => {
    const runs = props.runs.map((run) => run.id === 'current'
      ? { ...run, credits: { conversation: 0.16019, evaluators: 1.2426, partial: true } }
      : run);
    const [harness] = panels(renderToStaticMarkup(<CompareDialog {...props} runs={runs} harness />));
    expect(harness).toContain('Est. 1.40 Copilot Credits (partial)');
    expect(harness).toContain('0.16 to answer · 1.24 to score');
    // The older run predates credit tracking.
    expect(harness.split('Copilot Credits not reported')).toHaveLength(2);

    const [standard] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    // Only the recommendation caption (which spends credits for any agent) may mention them.
    expect(standard.slice(standard.indexOf('aria-live="polite"'))).not.toContain('Copilot Credits');
  });

  it('shows each test case credits once with a subtotal per test set', () => {
    const result = (id: string, testCaseId: string, metric: string, testSet: string, conversation: number) => ({
      id, name: '', runId: 'current', testCaseId, testSet, question: `Question ${testCaseId}`, metric, status: 'Pass',
      credits: { conversation, evaluators: 0.5 },
    });
    const results = [
      ...props.results,
      // Credits repeat on every metric row of a case; the case counts once.
      result('a1', 'a', 'GeneralQuality', 'Set A', 0.1),
      result('a2', 'a', 'CompareMeaning', 'Set A', 0.1),
      result('b1', 'b', 'GeneralQuality', 'Set A', 0.2),
      result('c1', 'c', 'GeneralQuality', 'Set B', 0.3),
    ];
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.split('>Copilot Credits<')).toHaveLength(4);
    expect(cases).toContain('0.60');
    expect(cases).toContain('0.70');
    expect(cases).toContain('0.80');
    const setA = cases.slice(cases.indexOf('Set A'), cases.indexOf('Set B'));
    expect(setA).toContain('Subtotal');
    expect(setA).toContain('1.30');

    const [, standard] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(standard).not.toContain('Copilot Credits');
    expect(standard).not.toContain('Subtotal');
  });

  it('keeps friendly model names and chronological ordering in the summary', () => {
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(summary).toContain('GPT Chat Latest');
    expect(summary.indexOf('GPT-5 Reasoning')).toBeLessThan(summary.indexOf('GPT Chat Latest'));
  });

  it('places summary run timestamps beside model names without repeating them inside AI cards', () => {
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    const aiSection = summary.slice(summary.indexOf('AI summary'));
    for (const run of props.runs) {
      const timestamp = formatWhen(run.completedOn ?? run.startedOn);
      expect(summary.split(timestamp)).toHaveLength(2);
      expect(summary).toContain(`dateTime="${run.completedOn}"`);
      expect(aiSection).not.toContain(timestamp);
    }
    expect(summary).toMatch(/GPT Chat Latest<\/span><time\b/);
    expect(summary).toMatch(/GPT-5 Reasoning<\/span><time\b/);
  });

  it('lays AI summaries out in responsive columns with shared header and body rows', () => {
    const { html, css } = styledComparison();
    const [summary] = panels(html);
    const afterHeading = summary.slice(summary.indexOf('AI summary'));
    const grid = [...afterHeading.matchAll(/<div class="([^"]+)"/g)].find(match => match[1].split(' ').some(name =>
      css.includes(`.${name}{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));}`),
    ));
    expect(grid).toBeDefined();
    // The model recommendation sits under the AI summary heading, above the per-model grid.
    expect(afterHeading.slice(0, grid!.index)).toContain('Getting a model recommendation');
    const aiSection = afterHeading.slice(grid!.index);
    const cards = [...aiSection.matchAll(/<div\b[^>]*class="(fui-Card [^"]+)"/g)];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const classes = card[1].split(' ');
      expect(classes.some(name => css.includes(`.${name}{grid-template-rows:subgrid;}`))).toBe(true);
      expect(classes.some(name => css.includes(`.${name}{grid-row:span2;}`))).toBe(true);
    }
  });

  it('explains missing persisted results rather than showing empty panels', () => {
    const html = renderToStaticMarkup(<CompareDialog {...props} results={[]} />);
    expect(html).toContain('No completed runs with saved results are available for comparison.');
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain('Test results');
  });

  it('retains attention findings against an unselected saved baseline', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog
      {...props}
      runs={[props.runs[0]]}
    />));
    expect(cases.match(/<th\b/g)).toHaveLength(4);
    expect(cases).toContain('Regressed: Pass → Fail');
    expect(cases).toContain('Needs attention 1');
    expect(cases).not.toContain('GPT-5 Reasoning');
  });

  it('compares against the latest earlier scored run when the saved baseline link is missing', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog
      {...props}
      runs={[
        { ...props.runs[0], comparedToRunId: undefined },
        { ...props.runs[1], status: 'Completed With Errors', error: 1 },
        { ...props.runs[1], id: 'older', historyId: 'h-older', completedOn: '2026-09-09T12:00:00Z' },
      ]}
      history={[...props.history, { id: 'h-older', changeType: 'Model Changed', currentModel: 'Sonnet46' }]}
      results={[...props.results, { ...props.results[1], id: 'r-older', runId: 'older' }]}
    />));
    expect(cases).toContain('GPT Chat Latest');
    expect(cases).toContain('GPT-5 Reasoning');
    expect(cases).not.toContain('Claude Sonnet 4.6');
  });

  it('falls back past an all-errored baseline and runs without the same kind of results', () => {
    const kit = (testRunId: string) =>
      ({ status: 'Completed', testRunId, pass: 1, fail: 0, total: 1, regressed: 0, improved: 0 });
    const runs = [
      { ...props.runs[0], comparedToRunId: 'errored' },
      { ...props.runs[1], id: 'errored', historyId: 'h-errored', status: 'Completed With Errors',
        pass: 0, fail: 0, error: 1, completedOn: '2026-09-11T06:00:00Z' },
      { ...props.runs[1], id: 'kit-only', historyId: 'h-kit', kit: kit('kit-only'), completedOn: '2026-09-10T18:00:00Z' },
      props.runs[1],
    ];
    const history = [
      ...props.history,
      { id: 'h-errored', changeType: 'Model Changed', currentModel: 'Opus48' },
      { id: 'h-kit', changeType: 'Model Changed', currentModel: 'Sonnet46' },
    ];
    const results = [...props.results, { ...props.results[1], id: 'r-errored', runId: 'errored', status: 'Error' }];
    const [, cases] = panels(renderToStaticMarkup(
      <CompareDialog {...props} runs={runs} history={history} results={results} />,
    ));
    expect(cases).toContain('GPT-5 Reasoning');
    expect(cases).not.toContain('Claude Opus 4.8');
    expect(cases).not.toContain('Claude Sonnet 4.6');

    const kitRuns = [
      { ...props.runs[0], id: 'kit-current', kit: kit('kit-current'), comparedToRunId: undefined },
      { ...runs[2], status: 'Completed With Errors' },
      props.runs[1],
    ];
    const [, kitCases] = panels(renderToStaticMarkup(
      <CompareDialog {...props} initialRunId="kit-current" runs={kitRuns} history={history} />,
    ));
    expect(kitCases).toContain('Claude Sonnet 4.6');
    expect(kitCases).not.toContain('GPT-5 Reasoning');
  });

  it('explains when the previous model has only Kit test results to compare', () => {
    const kit = { status: 'Completed', testRunId: 'kit-run', pass: 1, fail: 0, total: 1, regressed: 0, improved: 0 };
    const history = [
      { id: 'h-current', changeType: 'Model Changed', previousModel: 'opus4-1', currentModel: 'Opus48' },
      { id: 'h-kit', changeType: 'Model Changed', currentModel: 'opus4-1' },
      props.history[1],
    ];
    const runs = [
      { ...props.runs[0], comparedToRunId: undefined },
      { ...props.runs[1], id: 'kit-only', historyId: 'h-kit', pass: 0, fail: 0, kit, completedOn: '2026-09-10T18:00:00Z' },
      props.runs[1],
    ];
    const html = renderToStaticMarkup(<CompareDialog {...props} runs={runs} history={history} />);
    expect(html).toContain('The previous model, Claude Opus 4.6, was assessed with Copilot Agent Kit tests, so its results can');
    expect(html).toContain('Comparing with GPT-5 Reasoning instead, as it has the latest run with Copilot Studio evaluations.');
    expect(panels(html)[1]).toContain('GPT-5 Reasoning');

    const linked = renderToStaticMarkup(<CompareDialog
      {...props}
      history={[{ ...props.history[0], previousModel: 'opus4-1' }, props.history[1]]}
    />);
    expect(linked).not.toContain('was assessed with');
  });

  it('distinguishes persistent failures, evaluation errors, and missing baseline results', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog
      {...props}
      results={[
        { ...props.results[0], previousStatus: 'Pass' },
        { ...props.results[1], status: 'Fail' },
        { ...props.results[0], id: 'error', testCaseId: 'error', status: 'Error' },
      ]}
    />));
    expect(cases).toContain('Still failing: Fail → Fail');
    expect(cases).toContain('>No prior result<');
    expect(cases).not.toContain('Evaluation error: No prior result');
    expect(cases).not.toContain('No prior result → Error');
    expect(cases).toMatch(/>Error<\/(span|div)>/);
    expect(cases).toContain('Needs attention 2');
  });

  it('keeps identical case IDs in different test sets separate', () => {
    const results = ['MODELCHECK', 'Other set'].flatMap((testSet) =>
      props.results.map((result) => ({ ...result, id: `${testSet}-${result.id}`, testSet })),
    );
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={results} />));
    expect(cases.match(/data-question-group/g)).toHaveLength(2);
    expect(cases.match(/data-test-set-heading/g)).toHaveLength(2);
    expect(cases.split('How do I access the project site?')).toHaveLength(3);
    expect(cases).toContain('MODELCHECK');
    expect(cases).toContain('Other set');
    expect(cases).toContain('Needs attention 2');
  });

  it('shows only model names in the comparison table headings', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(cases).toContain('GPT Chat Latest');
    expect(cases).toContain('GPT-5 Reasoning');
    for (const run of props.runs) {
      expect(cases).not.toContain(formatWhen(run.completedOn));
    }
  });

  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(<CompareDialog {...props} open={false} />)).toBe('');
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it('does not request evaluation links when the dialog opens', () => {
    renderToStaticMarkup(<CompareDialog {...props} botId="BOT-ID" />);
    expect(mocks.useQuery.mock.calls.some(([query]) => query.queryKey[1] === 'evaluation-links')).toBe(false);
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it('renders test-set headings as plain text without a link, external icon, or navigation tooltip', () => {
    mocks.useQuery.mockReturnValue({ data: { modelcheck: 'https://copilotstudio.microsoft.com/evaluation' } });
    const [summary, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} botId="bot-id" />));
    expect(summary).not.toContain('https://copilotstudio.microsoft.com/evaluation');
    expect(summary).not.toContain('>Test sets<');
    const heading = cases.match(/<tbody\b[^>]*data-test-set-heading[^>]*>.*?<\/tbody>/)?.[0] ?? '';
    expect(heading).toMatch(/<span\b[^>]*id="[^"]+-set-modelcheck"[^>]*>MODELCHECK<\/span>/);
    expect(heading).not.toContain('<a');
    expect(heading.match(/<svg\b/g)).toHaveLength(1);
    expect(cases).not.toContain('Open evaluation in Copilot Studio');
    expect(cases).not.toContain('Evaluation links are unavailable');
  });

  it('starts groups expanded with independent accessible collapse controls even without a link', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    const toggle = cases.match(/<button\b[^>]*aria-label="Collapse MODELCHECK"[^>]*>/)?.[0] ?? '';
    expect(toggle).toContain('aria-expanded="true"');
    const controlled = toggle.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controlled).toBeDefined();
    expect(cases).toContain(`id="${controlled}"`);
    expect(cases).not.toMatch(/<tbody\b[^>]*hidden=""/);
    expect(cases).not.toContain('<a');
  });

  it('keeps test-set names and results visible without link availability warnings for agents without an ID', () => {
    mocks.useQuery.mockReturnValue({ isFetching: true });
    const [summary, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(summary).not.toContain('Loading evaluation links...');
    expect(cases).not.toContain('Loading evaluation links...');
    expect(cases).toContain('MODELCHECK');
    expect(cases).toContain('How do I access the project site?');
    expect(cases).not.toContain('Evaluation links are unavailable');
  });

  it('does not request evaluation links while the dialog is closed', () => {
    expect(renderToStaticMarkup(<CompareDialog {...props} open={false} botId="bot-id" />)).toBe('');
    expect(mocks.useQuery).not.toHaveBeenCalled();
  });

  it('does not render obsolete link errors or stale evaluation links', () => {
    mocks.useQuery.mockReturnValue({
      isError: true, error: new Error('Access denied'),
      data: { modelcheck: 'https://copilotstudio.microsoft.com/stale' },
    });
    const [summary, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} botId="bot-id" />));
    expect(summary).not.toContain('Evaluation links are unavailable.');
    expect(cases).not.toContain('Evaluation links are unavailable.');
    expect(cases).not.toContain('Access denied');
    expect(cases).not.toContain('>Retry<');
    expect(cases).toContain('MODELCHECK');
    expect(cases).toContain('How do I access the project site?');
    expect(cases).not.toContain('https://copilotstudio.microsoft.com/stale');
  });

  it('deduplicates test sets from all selected results, including passing cases', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} results={[
      ...props.results,
      { ...props.results[1], id: 'passing', testCaseId: 'passing', testSet: 'Passing set' },
      { ...props.results[1], id: 'duplicate', testCaseId: 'duplicate', testSet: ' modelcheck ' },
    ]} />));
    expect(cases.match(/>modelcheck</gi)).toHaveLength(1);
    expect(cases).toContain('Passing set');
    expect(cases.match(/data-test-set-heading/g)).toHaveLength(2);
  });

  it('retains the fallback heading when the selected results have no test-set names', () => {
    const [, cases] = panels(renderToStaticMarkup(<CompareDialog {...props} botId="bot-id"
      results={props.results.map((result) => ({ ...result, testSet: undefined }))}
    />));
    expect(mocks.links).not.toHaveBeenCalled();
    expect(cases).toContain('Test set unavailable');
  });
});

describe('CompareDialog model recommendation', () => {
  const lastRequest = () => mocks.recommendation.mock.calls.at(-1)![0];

  it('asks for a recommendation for the selected pair and shows it above the run cards', () => {
    mocks.recommendation.mockReturnValue({
      isError: false,
      isFetching: false,
      data: {
        verdict: 'A', confidence: 'medium', headline: 'GPT-5 Reasoning passed the shared check.',
        reasons: ['It passed the project site question.'], tradeoffs: [], caveats: ['Only one check was compared.'],
      },
    });
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    const request = lastRequest();
    expect(request.state).toBe('ready');
    expect(request.payload.kind).toBe('Copilot Studio evaluations');
    expect(request.payload.runA.model).toBe('GPT-5 Reasoning');
    expect(request.payload.evidence.onlyAPass[0].question).toBe('How do I access the project site?');
    expect(summary).toContain('Model recommendation');
    expect(summary).toContain('>GPT-5 Reasoning<');
    expect(summary).toContain('>Recommended<');
    expect(summary).toContain('Medium confidence');
    expect(summary).toContain('GPT-5 Reasoning: 1 result, 100% shared pass · GPT Chat Latest: 1 result, 0% shared pass · 1 shared');
    expect(summary).toContain('Keep in mind');
    expect(summary).toContain('Check the results before you change models.');
    expect(summary).not.toContain('Uses Copilot Credits');
    expect(summary.indexOf('Model recommendation')).toBeLessThan(summary.indexOf('Analysis pending.'));
  });

  it('offers a retry when the prompt fails', () => {
    mocks.recommendation.mockReturnValue({
      isError: true, isFetching: false, error: new Error('No capacity is available to run AI prompts in this environment.'),
    });
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} />));
    expect(summary).toContain('Couldn&#x27;t get a recommendation');
    expect(summary).toContain('No capacity is available');
    expect(summary).toMatch(/<button\b[^>]*>.*Try again<\/button>/);
  });

  it('does not compare a Copilot Studio evaluation run with a Kit run', () => {
    const runs = props.runs.map((run) => run.id === 'previous'
      ? { ...run, kit: { status: 'Completed', testRunId: 'kit-previous', pass: 1, fail: 0, total: 1, regressed: 0, improved: 0 } }
      : run);
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} runs={runs}
      results={props.results.filter((result) => result.runId === 'current')} />));
    expect(lastRequest().state).toBe('mixed-kinds');
    expect(summary).toContain('score different things');
  });

  it('asks for two runs when only one is selected', () => {
    const [summary] = panels(renderToStaticMarkup(<CompareDialog {...props} runs={[props.runs[0]]} />));
    expect(lastRequest()).toEqual({ state: 'select-two', selected: 1 });
    expect(summary).toContain('Select two completed runs to get a recommendation.');
  });
});