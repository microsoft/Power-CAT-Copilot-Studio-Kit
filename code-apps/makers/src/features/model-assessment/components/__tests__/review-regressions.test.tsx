// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckModelPanel } from '../CheckModelPanel';
import { CompareDialog } from '../CompareDialog';
import { AgentsGrid } from '../AgentsGrid';
import { AgentDrawer } from '../AgentDrawer';
import ModelAssessmentPage from '../../ModelAssessmentPage';
import { LOCK_RELEASED_MESSAGE, type EvaluationRunVM, type TrackedAgentVM } from '../../contracts/model-assessment';
import { copilotStudioReviewLightTheme } from '../../../agent-review-tool/agents-experience/components/copilotStudioReviewTheme';
import { modelAssessmentTheme } from '../../theme/modelAssessmentTheme';
import { AgentModelPublishError } from '../../services/model-update-service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), poll: vi.fn(), active: vi.fn(), query: vi.fn(), agents: vi.fn(), refetch: vi.fn(), assessment: vi.fn(), cancel: vi.fn(),
  mutationState: vi.fn(), mutating: vi.fn(), flowsOff: vi.fn(),
  live: vi.fn(), telemetry: vi.fn(),
}));
vi.mock('../../../../shared/services/featureTelemetry', () => ({ logFeatureOpen: mocks.telemetry }));
vi.mock('../../services/model-assessment-service', () => ({
  createEvaluationRun: mocks.create, getRunByRequestKey: mocks.poll, getActiveRunForAgent: mocks.active,
  cancelEvaluationRun: mocks.cancel, getFlowsTurnedOff: mocks.flowsOff,
}));
vi.mock('../../services/agent-discovery-service', () => ({ getLiveAgentModel: mocks.live }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({ MicrosoftDataverseService: {} }));
vi.mock('../../services/agent-eligibility-service', () => ({ syncEligibleAgents: vi.fn() }));
vi.mock('../../services/evaluation-links', () => ({ getAssessmentEvaluationLinks: vi.fn() }));
vi.mock('../../services/agent-links', () => ({ getAssessmentAgentUrl: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useIsMutating: mocks.mutating,
  useMutationState: mocks.mutationState,
}));
vi.mock('../KitTestsSection', () => ({ AssessmentEngineSection: () => null }));
// Fluent's TeachingPopover takes about a minute to mount in jsdom; the stub keeps the page wiring under test.
vi.mock('../WelcomeTour', () => ({
  WelcomeTour: ({ steps, currentStep, onNext, onDismiss }: import('../WelcomeTour').WelcomeTourProps) => {
    const step = steps[currentStep - 1];
    if (!step?.target.current) return null;
    return (
      <div role="dialog">
        {step.title}<p>{step.body}</p>
        {currentStep < steps.length && <button onClick={onNext}>Next tour step</button>}
        <button onClick={onDismiss}>Skip Tour</button>
      </div>
    );
  },
}));
vi.mock('../../hooks/useModelAssessment', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useModelAssessment')>(),
  useAssessmentData: mocks.assessment,
}));

let root: Root;
let container: HTMLDivElement;
let nextId = 0;
let agent: TrackedAgentVM;
const run: EvaluationRunVM = {
  id: 'run', name: 'Run', status: 'Completed', analysisStatus: 'Completed',
  regression: 'Critical', pass: 1, fail: 1, error: 0, excluded: 0,
};

// Node.js 25 and later has its own global localStorage. It hides the jsdom storage,
// and it is undefined without --localstorage-file, so each test gets a fresh copy.
class MemoryStorage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('localStorage', new MemoryStorage());
  mocks.query.mockReturnValue({ data: undefined, isError: false, isFetching: false });
  mocks.mutating.mockReturnValue(0);
  mocks.mutationState.mockReturnValue([]);
  mocks.create.mockResolvedValue({ success: true, requestKey: 'same-request' });
  mocks.poll.mockResolvedValue(run);
  mocks.flowsOff.mockResolvedValue([]);
  agent = {
    id: `agent-${nextId++}`, name: 'Support agent', schema: 'support', sourceStatus: 'Active',
    regression: 'Not Assessed', lastRunStatus: 'None', pass: 0, fail: 0, error: 0, excluded: 0,
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () => root.render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>));
}

function button(name: string) {
  const result = [...document.querySelectorAll('button')].find(node =>
    (node.getAttribute('aria-label') ?? node.querySelector('.fui-Tab__content')?.textContent ?? node.textContent)?.trim() === name);
  expect(result, `Button ${name}`).toBeDefined();
  return result!;
}

async function click(node: HTMLElement) {
  await act(async () => node.click());
}

describe('review interaction regressions', () => {
  it('logs Model Assessment usage even when there are no eligible agents and shows name-only guidance', async () => {
    mocks.assessment.mockReturnValue({
      agents: [], runs: [], history: [], results: [], refetch: mocks.refetch,
    });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    expect(mocks.telemetry).toHaveBeenCalledExactlyOnceWith('model-assessment', 'Model Assessment');
    expect(container.textContent).toContain('Add MODELCHECK to the name of an evaluation test set in Copilot Studio');
    expect(container.textContent).not.toContain('name or description');
  });

  it('keeps caption-sized credits and dates at the end of the clickable history record', async () => {
    const history = {
      id: 'history', agentId: agent.id, changeType: 'Baseline', currentModel: 'GPT41',
      on: '2026-10-23T12:00:00Z',
    };
    const onCompare = vi.fn();
    await render(<AgentDrawer
      agent={agent}
      open
      detail={{ runs: [{ ...run, historyId: history.id }], history: [history], resultsFor: () => [] }}
      onClose={vi.fn()}
      onCompare={onCompare}
      canCompare={() => true}
      historyCredits={() => ({ conversation: 12, evaluators: 3 })}
    />);
    const row = [...document.querySelectorAll('button')].find(node => node.textContent?.includes('15.00 credits'));
    expect(row).toBeDefined();
    const date = row!.querySelector('time')!;
    const credits = date.previousElementSibling!;
    expect(credits.textContent).toContain('15.00 credits');
    expect(credits.classList.contains('fui-Caption1')).toBe(true);
    expect(date.firstElementChild?.classList.contains('fui-Caption1')).toBe(true);
    expect(date.nextElementSibling).toBeNull();
    expect(row!.textContent).not.toContain('Compare');
    expect(row!.getAttribute('aria-label')).toMatch(/^Compare model run from /);
    await click(row!);
    expect(onCompare).toHaveBeenCalledWith(history, row);
  });

  it.each([true, false])('blocks failed model publication only for Kit evaluations (Kit: %s)', async (kitMode) => {
    agent.kit = { enabled: kitMode, configurationId: 'configuration', testSetId: 'test-set' };
    mocks.mutationState.mockReturnValue([
      new AgentModelPublishError({ code: 'GPT5Chat' }, new Error('Publishing failed.')),
    ]);
    mocks.assessment.mockReturnValue({ agents: [agent], runs: [], history: [], results: [], refetch: mocks.refetch });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await click(button(agent.name));
    expect(button(kitMode ? 'Run' : 'Run baseline assessment').disabled).toBe(kitMode);
    expect(document.body.textContent?.includes('Retry publishing the agent before running Kit tests.')).toBe(kitMode);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([true, false])('does not offer a drawer-level test-run comparison (persisted results: %s)', async persisted => {
    vi.useFakeTimers();
    const orphan = { ...run, agentId: agent.id, status: 'Completed With Errors' };
    mocks.assessment.mockReturnValue({
      agents: [agent], runs: [orphan],
      history: [{ id: 'capture-only', agentId: agent.id, changeType: 'Baseline', currentModel: 'gpt-4.1' }],
      results: persisted ? [{ id: 'result', runId: run.id, name: 'Case', status: 'Pass', question: 'Saved orphan question' }] : [],
      refetch: mocks.refetch,
    });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await click(button(agent.name));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect([...document.querySelectorAll('button')].some(node => node.textContent?.includes('Compare'))).toBe(false);
    expect([...document.querySelectorAll('button')].some(node => node.textContent === 'Compare test runs')).toBe(false);
  });

  it('pages the sorted agents', async () => {
    const agents = ['Charlie', 'Alpha', 'Bravo'].map((name, i) => ({ ...agent, id: `paged-${i}`, name }));
    await render(<AgentsGrid agents={agents} onSelect={vi.fn()} pageIndex={1} pageSize={2} />);
    const names = [...document.querySelectorAll('button[data-agent-details]')].map(node => node.textContent);
    expect(names).toEqual(['Charlie']);
  });

  it('shows Preview beside the title and scopes the reference font and Agent Review search styling to Model Assessment', async () => {
    mocks.assessment.mockReturnValue({
      agents: [{ ...agent, pass: 8, fail: 2 }], runs: [], history: [], results: [], refetch: mocks.refetch,
    });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    const preview = container.querySelector('.fui-Badge');
    expect(preview?.textContent).toBe('PREVIEW');
    expect(preview?.previousElementSibling?.textContent).toBe('Model Assessment');
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search agents"]')!;
    expect(search.placeholder).toBe('Search agents...');
    const searchScope = search.closest('.fui-FluentProvider')!;
    expect(getComputedStyle(searchScope).getPropertyValue('--borderRadiusMedium')).toBe(copilotStudioReviewLightTheme.borderRadiusMedium);
    const pageScope = container.querySelector('[data-screen-id="model-assessment"]')!.closest('.fui-FluentProvider')!;
    expect(getComputedStyle(pageScope).getPropertyValue('--borderRadiusMedium')).toBe('12px');
    expect(getComputedStyle(pageScope).getPropertyValue('--fontFamilyBase')).toBe(modelAssessmentTheme.fontFamilyBase);
    expect(getComputedStyle(searchScope).getPropertyValue('--fontFamilyBase')).toBe(modelAssessmentTheme.fontFamilyBase);
    expect(getComputedStyle(container.firstElementChild!).getPropertyValue('--fontFamilyBase')).toBe(webLightTheme.fontFamilyBase);
    expect(container.querySelector('.fui-CardHeader')?.contains(search)).toBe(true);
    expect(container.querySelector('.fui-CardHeader')?.textContent).toMatch(/^Agents/);
    const headings = [...container.querySelectorAll('thead th')].map((cell) => cell.textContent);
    expect(headings[0]).toBe('Agent Name');
    expect(headings.at(-1)).toBe('Latest results');
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('8 pass, 2 fail, 0 error, 0 excluded');
    expect(container.textContent).toContain('8/10');
    await click(button('Refresh agents'));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it('uses the updated guidance in all four tour steps', async () => {
    vi.useFakeTimers();
    localStorage.clear();
    mocks.assessment.mockReturnValue({ agents: [agent], runs: [], history: [], results: [], refetch: mocks.refetch });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await act(async () => vi.advanceTimersByTimeAsync(600));
    const titles = [
      'Choose an agent to assess',
      'Capture a baseline, then change the model',
      'Read the outcome',
      'Need guidance?',
    ];
    const descriptions = [
      'Your eligible agents are listed here. An agent appears once it has MODELCHECK in an evaluation test set name, or a pipeline-enabled Kit configuration. Use the search box or the regression status filter to find the one you need.',
      'Select an agent to capture a baseline. Then change its model, assess the new model, and compare the runs.',
      'Regression shows whether the new model performed better or worse than the previous one. Latest results shows how many test cases passed, failed, or ended in an error.',
      'Open Help to read the Model Assessment documentation or to take this tour again.',
    ];
    for (let index = 0; index < descriptions.length; index++) {
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.firstChild?.textContent).toBe(titles[index]);
      expect(dialog?.querySelector('p')?.textContent).toBe(descriptions[index]);
      if (index < descriptions.length - 1) await click(button('Next tour step'));
    }
    await click(button('Skip Tour'));
  });

  it('starts the welcome tour once and remembers when it is skipped', async () => {
    vi.useFakeTimers();
    localStorage.clear();
    mocks.assessment.mockReturnValue({ agents: [agent], runs: [], history: [], results: [], refetch: mocks.refetch });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(document.body.textContent).toContain('Choose an agent to assess');
    await click(button('Skip Tour'));
    expect(document.body.textContent).not.toContain('Choose an agent to assess');
    expect(localStorage.getItem('modelAssessment.tourCompleted')).toBe('true');

    await render(null);
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(document.body.textContent).not.toContain('Choose an agent to assess');
    localStorage.clear();
  });

  it.each([false, true])('observes creation after reopening before it resolves (reject: %s)', async reject => {
    vi.useFakeTimers();
    let finish!: (value: { success: boolean; requestKey: string }) => void;
    let fail!: (error: Error) => void;
    mocks.create.mockReturnValue(new Promise((resolve, rejectPromise) => { finish = resolve; fail = rejectPromise; }));
    const panel = <StrictMode><CheckModelPanel agent={agent} /></StrictMode>;
    await render(panel);
    await click(button('Run'));
    await render(null);
    await render(panel);
    expect(button('Run').disabled).toBe(true);
    await act(async () => {
      if (reject) fail(new Error('Creation unavailable'));
      else finish({ success: true, requestKey: 'pending-on-reopen' });
    });
    if (reject) {
      expect(container.textContent).toContain('Creation unavailable');
      expect(button('Run').disabled).toBe(false);
      expect(mocks.poll).not.toHaveBeenCalled();
    } else {
      await act(async () => vi.advanceTimersByTimeAsync(4000));
      expect(mocks.poll).toHaveBeenCalledExactlyOnceWith('pending-on-reopen');
      expect(container.textContent).toContain('Finished');
    }
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('announces completion through the same persistent polite live region and names progress', async () => {
    vi.useFakeTimers();
    await render(<CheckModelPanel agent={agent} />);
    const live = container.querySelector('[role="status"][aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe('');
    await click(button('Run'));
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('Model assessment progress');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.querySelector('[role="status"][aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toContain('Finished');
  });

  it('shows progress like the review dialog: title, percentage and a vertical step list', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Evaluation Running' });
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    const steps = () => [...container.querySelectorAll('ol > li')].map(node => node.textContent);
    expect(container.textContent).toContain('Assessing Support agent…');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe('5%');
    expect(steps()).toEqual([
      'Initializingcompleted',
      'Running evaluationsin progressDiscovering MODELCHECK test sets and executing test cases',
      'Scoring resultsnot started',
      'Generating AI analysisnot started',
      'Completenot started',
    ]);

    mocks.poll.mockResolvedValue({ ...run, status: 'Failed', errorMessage: 'Evaluation failed' });
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Assessment stopped');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe('5%');
    expect(steps()).toEqual([
      'Initializingcompleted',
      'Running evaluationsfailed',
      'Scoring resultsskipped',
      'Generating AI analysisskipped',
      'Completeskipped',
    ]);
  });

  it('moves the progress bar by test sets and test cases while Copilot Studio evaluations run', async () => {
    vi.useFakeTimers();
    const progress = { setCases: [10, 10], setsDone: 1, setStartedOn: new Date().toISOString() };
    mocks.poll.mockResolvedValue({ ...run, status: 'Evaluation Running', progress });
    await render(<CheckModelPanel agent={agent} msPerTestCase={5000} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    const bar = () => container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext');
    expect(container.textContent).toContain('Test set 2 of 2 · Evaluating 10 test cases');
    expect(bar()).toBe('50%');
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(bar()).toBe('59%');
    // The set runs past its 50-second estimate: the bar keeps moving instead of stopping.
    await act(async () => vi.advanceTimersByTimeAsync(50_000));
    expect(bar()).toBe('92%');
    await act(async () => vi.advanceTimersByTimeAsync(40_000));
    expect(bar()).toBe('94%');
  });

  it('exposes a polling failure and resumes the same request without creating another run', async () => {
    vi.useFakeTimers();
    mocks.poll.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(run);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Connection interrupted');
    expect(button('Run').disabled).toBe(true);
    await click(button('Retry'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Finished');
    expect(mocks.poll.mock.calls).toEqual([['same-request'], ['same-request']]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale in-flight poll after remount and resumes with one new poll', async () => {
    vi.useFakeTimers();
    let finishOldPoll!: (value: EvaluationRunVM) => void;
    mocks.poll.mockReturnValueOnce(new Promise(resolve => { finishOldPoll = resolve; }))
      .mockResolvedValueOnce({ ...run, pass: 7 });
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await render(null);
    await render(<CheckModelPanel agent={agent} />);
    await act(async () => finishOldPoll({ ...run, pass: 99 }));
    expect(container.textContent).not.toContain('99 pass');
    expect(container.textContent).not.toContain('Finished');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Finished');
    expect(container.textContent).not.toMatch(/\d+ pass · \d+ fail/);
    expect(mocks.poll.mock.calls).toEqual([['same-request'], ['same-request']]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('stops after 90 polls when a picked-up run never starts evaluating, and resumes on reopening (Kit: %s)', async kitMode => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Detecting' });
    await render(<CheckModelPanel agent={agent} kitMode={kitMode} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(90 * 4000));
    expect(mocks.poll).toHaveBeenCalledTimes(90);
    expect(container.textContent).toContain('taking longer than expected');
    expect(container.textContent).not.toContain('Finished');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.poll).toHaveBeenCalledTimes(90);
    await render(null);
    mocks.poll.mockResolvedValue(run);
    await render(<CheckModelPanel agent={agent} kitMode={kitMode} />);
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Finished');
    expect(mocks.poll).toHaveBeenCalledTimes(91);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('reports a request the flow never picked up after two minutes and replaces it on Start again', async () => {
    vi.useFakeTimers();
    const stuck = { ...run, id: 'stuck', status: 'Requested' };
    mocks.poll.mockResolvedValue(stuck);
    mocks.cancel.mockResolvedValue(undefined);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(29 * 4000));
    expect(container.textContent).not.toContain("Assessment didn't start");
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain("Assessment didn't start");
    expect(container.textContent).toContain("Request wasn't picked up");
    expect(container.textContent).toContain("flow didn't pick it up");
    expect(container.textContent).toContain("Turning the flow on doesn't start this request");
    expect(button('Run').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(false);
    const polls = mocks.poll.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(mocks.poll).toHaveBeenCalledTimes(polls);

    mocks.create.mockResolvedValue({ success: true, requestKey: 'replacement' });
    mocks.poll.mockResolvedValue(run);
    await click(button('Start again'));
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(stuck);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.poll).toHaveBeenLastCalledWith('replacement');
    expect(container.textContent).toContain('Finished');
  });

  it('says the flow is off when a request was not picked up and the flow is still off', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Requested' });
    mocks.flowsOff.mockResolvedValueOnce([]).mockResolvedValue(['Model Assessment | Run Copilot Studio Evaluations']);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(30 * 4000));
    expect(container.textContent).toContain('Assessment flow is turned off');
    expect(container.textContent).toContain('Model Assessment | Run Copilot Studio Evaluations flow is turned off.');
  });

  it('reports Kit tests the Kit test flow never picked up after two minutes and replaces the run on Start again', async () => {
    vi.useFakeTimers();
    const handedOff = {
      ...run, id: 'handed-off', status: 'Evaluation Running', analysisStatus: 'Pending', regression: 'Not Assessed',
      pass: 0, fail: 0, startedOn: new Date().toISOString(),
    };
    mocks.poll.mockResolvedValue(handedOff);
    mocks.cancel.mockResolvedValue(undefined);
    await render(<CheckModelPanel agent={agent} kitMode />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(29 * 4000));
    expect(container.textContent).not.toContain("Assessment didn't start");
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain("Assessment didn't start");
    expect(container.textContent).toContain("Kit tests weren't picked up");
    expect(container.textContent).toContain("Model Assessment | Run Copilot Agent Kit Tests flow didn't pick up the Kit tests");
    expect(mocks.flowsOff).toHaveBeenLastCalledWith(true);
    const polls = mocks.poll.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(mocks.poll).toHaveBeenCalledTimes(polls);

    mocks.create.mockResolvedValue({ success: true, requestKey: 'replacement' });
    mocks.poll.mockResolvedValue(run);
    await click(button('Start again'));
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(handedOff);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('says the Kit test flow is off when the Kit tests were not picked up', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({
      ...run, status: 'Evaluation Running', pass: 0, fail: 0, startedOn: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    mocks.flowsOff.mockResolvedValueOnce([]).mockResolvedValue(['Model Assessment | Run Copilot Agent Kit Tests']);
    await render(<CheckModelPanel agent={agent} kitMode />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Kit test flow is turned off');
    expect(container.textContent).toContain('The Model Assessment | Run Copilot Agent Kit Tests flow is turned off.');
  });

  it('keeps following Kit tests once the Kit test flow has started them', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({
      ...run, status: 'Evaluation Running', pass: 0, fail: 0, startedOn: new Date(Date.now() - 5 * 60_000).toISOString(),
      kit: { status: 'Running', pass: 1, fail: 0, total: 4, regressed: 0, improved: 0 },
    });
    await render(<CheckModelPanel agent={agent} kitMode />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(container.textContent).not.toContain("Assessment didn't start");
    expect(container.textContent).not.toContain('taking longer than expected');
  });

  it('does not request an assessment while the evaluation flow is turned off', async () => {
    mocks.flowsOff.mockResolvedValue(['Model Assessment | Run Copilot Studio Evaluations']);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    expect(container.textContent).toContain("Assessment didn't start");
    expect(container.textContent).toContain('0%');
    const text = container.textContent ?? '';
    expect(text.lastIndexOf('Assessment flow is turned off')).toBeGreaterThan(text.indexOf('Generating AI analysis'));
    expect(container.textContent).toContain('Assessment flow is turned off');
    expect(container.textContent).toContain(
      "The Model Assessment | Run Copilot Studio Evaluations flow is turned off, so the assessment can't start.",
    );
    expect(mocks.flowsOff).toHaveBeenCalledWith(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(button('Run').disabled).toBe(false);
  });

  it('replaces an earlier request the flow never picked up instead of joining it', async () => {
    vi.useFakeTimers();
    const stuck = {
      ...run, id: 'earlier', status: 'Requested', createdOn: new Date(Date.now() - 10 * 60_000).toISOString(),
    };
    mocks.active.mockResolvedValue({ run: stuck, requestKey: 'earlier-request' });
    mocks.cancel.mockResolvedValue(undefined);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(stuck);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('already assessing this agent');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.poll).toHaveBeenCalledWith('same-request');
  });

  it('keeps following a started evaluation past six minutes, polling less often', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Evaluation Running' });
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(30 * 60_000));
    expect(container.textContent).not.toContain('taking longer than expected');
    expect(mocks.poll).toHaveBeenCalledTimes(90 + (30 * 60 - 6 * 60) / 10);
    mocks.poll.mockResolvedValue(run);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain('Finished');
  });

  it('reports a started evaluation as stalled after an hour', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Evaluation Running' });
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(59 * 60_000));
    expect(container.textContent).not.toContain('taking longer than expected');
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(container.textContent).toContain('taking longer than expected');
    expect(container.textContent).not.toContain('Finished');
  }, 30_000); // Simulates an hour of polling, which is slow when the machine is busy.

  it.each(['Metadata Unavailable', 'Rejected', 'Failed', 'No Evaluations Configured'])(
    'does not claim a model change or a new history entry for %s', async status => {
      vi.useFakeTimers();
      mocks.poll.mockResolvedValue({ ...run, status, historyId: undefined, pass: 0, fail: 0 });
      await render(<CheckModelPanel agent={agent} />);
      await click(button('Run'));
      await act(async () => vi.advanceTimersByTimeAsync(4000));
      expect(container.textContent).toContain('Finished');
      expect(container.textContent).not.toContain('Model changed');
      expect(container.textContent).not.toContain('A new entry was added');
    },
  );

  it('surfaces a rejected creation request and allows a new attempt', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Cannot create assessment'));
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    expect(container.textContent).toContain('Cannot create assessment');
    expect(button('Run').disabled).toBe(false);
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('keeps the request created while the drawer was closed and resumes on reopen', async () => {
    vi.useFakeTimers();
    let finish!: (result: { success: boolean; requestKey: string }) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await render(null);
    await act(async () => finish({ success: true, requestKey: 'created-while-closed' }));
    await render(<CheckModelPanel agent={agent} />);
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.poll).toHaveBeenCalledWith('created-while-closed');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Finished');
  });

  it('resumes after a polling error across drawer remounts without duplicating the request', async () => {
    vi.useFakeTimers();
    mocks.poll.mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValue(run);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await render(null);
    await render(<CheckModelPanel agent={agent} />);
    expect(container.textContent).toContain('Disconnected');
    await click(button('Retry'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Finished');
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved question label when its populated metric is filtered out', async () => {
    await render(<CompareDialog open onClose={() => {}} runs={[run]} history={[]} results={[
      { id: 'f', name: '', runId: 'run', testCaseId: 'case', testSet: 'Set', metric: 'Quality', status: 'Fail', question: '' },
      { id: 'p', name: '', runId: 'run', testCaseId: 'case', testSet: 'Set', metric: 'Keyword', status: 'Pass', question: 'Known saved question' },
    ]} />);
    await click(button('Test runs'));
    await click(button('Needs attention 1'));
    const panel = document.querySelector('[role="tabpanel"][aria-labelledby$="-cases-tab"]');
    expect(panel?.textContent).toContain('Known saved question');
    expect(panel?.textContent).not.toContain('Keyword');
    expect(panel?.querySelector('th[scope="rowgroup"]')?.getAttribute('rowspan')).toBe('1');
  });

  it('shows why a test set could not run in its compare row', async () => {
    const reason = "Copilot Studio could not run this test set: 'intentMatch' is not supported for set 'multiTurn'.";
    await render(<CompareDialog open onClose={() => {}} runs={[run]} history={[]} results={[
      { id: 'e', name: '', runId: 'run', testCaseId: 'run-unknown', testSet: 'Conversations', metric: 'external', status: 'Error', reason },
    ]} />);
    await click(button('Test runs'));
    const panel = document.querySelector('[role="tabpanel"][aria-labelledby$="-cases-tab"]');
    expect(panel?.querySelector('th[scope="rowgroup"]')?.textContent).toBe(reason);
    expect(panel?.textContent).toContain('Test set not scored');
  });

  it('opens agent details from a focusable name control', async () => {
    const select = vi.fn();
    await render(<AgentsGrid agents={[agent]} onSelect={select} />);
    const trigger = button(agent.name);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    expect(select).toHaveBeenCalledExactlyOnceWith(agent, trigger);
  });

  it('labels a model change whose assessment completed with errors', async () => {
    const changed = { ...agent, currentModel: 'GPT41', modelChangePending: true };
    await render(<AgentsGrid agents={[
      { ...changed, lastRunStatus: 'Completed With Errors', lastRunModel: 'gpt-41' },
      { ...changed, id: 'other', name: 'Other agent', lastRunStatus: 'Completed With Errors', lastRunModel: 'Opus47' },
    ]} onSelect={vi.fn()} />);
    expect(container.textContent).toContain('Changed · assessed with errors');
    expect(container.textContent).toContain('Changed · not yet assessed');
  });

  describe('assessment that completed with errors', () => {
    const reason = "Copilot Studio could not run this test set: evaluatorType 'intentMatch' is not supported.";
    const open = async (over: Partial<TrackedAgentVM>, history: Array<Record<string, string>>, setReason = reason, sets = ['Conversations'], runOver: Partial<EvaluationRunVM> = {}) => {
      vi.useFakeTimers();
      const current = { ...agent, lastRunStatus: 'Completed With Errors', ...over };
      mocks.assessment.mockReturnValue({
        agents: [current],
        runs: [{ ...run, id: 'cwe', agentId: agent.id, status: 'Completed With Errors', historyId: history[0].id, ...runOver }],
        history: history.map(entry => ({ ...entry, agentId: agent.id })),
        results: sets.map((testSet, i) => (
          { id: `err-${i}`, runId: 'cwe', name: 'Case', status: 'Error', metric: 'external', testSet, reason: setReason })),
        refetch: mocks.refetch,
      });
      await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
      await click(button(current.name));
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    };

    it('lists the test sets that could not run and runs the same model again', async () => {
      await open({ currentModel: 'GPT41' }, [{ id: 'h-base', changeType: 'Baseline', currentModel: 'GPT41' }]);
      expect(document.body.textContent).toContain('Last assessment completed with errors');
      expect(document.body.textContent).toContain(`Conversations — ${reason}`);
      expect(document.body.textContent).toContain('Fix the test set in Copilot Studio, then select Run.');
      expect(document.body.textContent).toContain('With errors');
      expect(button('Run the assessment again').textContent).toBe('Run');
      expect(document.querySelector('[aria-label^="Compare model run from"]')).not.toBeNull();
      await click(button('Run the assessment again'));
      expect(mocks.create).toHaveBeenCalledOnce();
    });

    it('explains that a model change is recorded only after a clean assessment', async () => {
      await open({ currentModel: 'Opus47', liveModel: 'GPT41', lastRunModel: 'GPT41' }, [
        { id: 'h-change', changeType: 'Model Changed', previousModel: 'Opus47', currentModel: 'GPT41' },
        { id: 'h-base', changeType: 'Baseline', currentModel: 'Opus47' },
      ]);
      expect(document.body.textContent).toContain(
        'The model change is recorded only after an assessment completes without errors. Fix the test set in Copilot Studio, then select Run.');
      const action = button('Run new model assessment');
      expect(action.textContent).toBe('Run');
      expect(action.querySelector('.fui-Button__icon, svg')).toBeNull();
    });

    it('only asks to fix a test set whose test methods need nothing specific in each test case', async () => {
      await open({ currentModel: 'Opus47', liveModel: 'GPT41', lastRunModel: 'GPT41' }, [
        { id: 'h-change', changeType: 'Model Changed', previousModel: 'Opus47', currentModel: 'GPT41' },
        { id: 'h-base', changeType: 'Baseline', currentModel: 'Opus47' },
      ], 'No test case in this test set could be scored. Test methods: GeneralQuality, CustomLabels.');
      const text = document.body.textContent ?? '';
      expect(text).toContain('No test cases were scored in this test set:Conversations');
      expect(text).not.toContain('Conversations —');
      expect(text).toContain('Fix the test set in Copilot Studio, then select Run.');
    });

    it('asks only for another run when Copilot Studio ran out of time', async () => {
      await open({ currentModel: 'GPT41' }, [{ id: 'h-base', changeType: 'Baseline', currentModel: 'GPT41' }],
        "Copilot Studio didn't finish evaluating this test set in time.");
      expect(document.body.textContent).toContain("Conversations — Copilot Studio didn't finish evaluating this test set in time.");
      expect(document.body.textContent).not.toContain('External evaluation ended');
      expect(document.body.textContent).not.toContain('Fix the test set');
      expect(document.body.textContent).toContain('Select Run to try again.');
    });

    it('shows the Copilot Studio evaluation limit once, without the test set names, and asks to wait', async () => {
      const limit = 'The agent has been evaluated more than 20 times in the last 24 hours. Please wait before trying again.';
      await open({ currentModel: 'GPT41' }, [{ id: 'h-base', changeType: 'Baseline', currentModel: 'GPT41' }],
        `Copilot Studio could not run this test set: ${limit}`, ['Conversations', 'Policies', 'Chat'],
        { pass: 0, fail: 0, error: 3 });
      const text = document.body.textContent ?? '';
      expect(text).toContain(`Last assessment completed with errors:${limit} Select Run to try again.`);
      expect(text.split(limit)).toHaveLength(2);
      expect(text).not.toContain('No test cases were scored');
      expect(text).not.toContain('Policies');
      expect(text).not.toContain('could not run this test set');
      expect(text).not.toContain('Fix the test');
      expect(text).toContain('Select Run to try again.');
      // Nothing was scored, so the history entry is labelled but cannot be compared.
      expect(text).toContain('With errors');
      expect(document.querySelector('[aria-label^="Compare model run from"]')).toBeNull();
    });

    it('explains the evaluation limit in one line for a model change', async () => {
      const limit = 'The agent has been evaluated more than 20 times in the last 24 hours. Please wait before trying again.';
      await open({ currentModel: 'Opus47', liveModel: 'GPT41', lastRunModel: 'GPT41' }, [
        { id: 'h-change', changeType: 'Model Changed', previousModel: 'Opus47', currentModel: 'GPT41' },
        { id: 'h-base', changeType: 'Baseline', currentModel: 'Opus47' },
      ], `Copilot Studio could not run this test set: ${limit}`, ['Conversations', 'Policies']);
      expect(document.body.textContent).toContain(`Last assessment completed with errors:${limit} `
        + 'The model change is recorded only after an assessment completes without errors. Select Run to try again.');
    });
  });

  describe('run that stopped before it finished', () => {
    const open = async (currentModel: string) => {
      vi.useFakeTimers();
      const current = { ...agent, currentModel, lastRunStatus: 'Failed' };
      mocks.assessment.mockReturnValue({
        agents: [current],
        runs: [
          { ...run, id: 'failed', agentId: agent.id, status: 'Failed', historyId: 'h-change', errorMessage: 'No response received from agent', pass: 0, fail: 0 },
          { ...run, id: 'base', agentId: agent.id, historyId: 'h-base' },
        ],
        history: [
          { id: 'h-change', agentId: agent.id, changeType: 'Model Changed', previousModel: 'GPT5Chat', currentModel: 'Opus48' },
          { id: 'h-base', agentId: agent.id, changeType: 'Baseline', currentModel: 'GPT5Chat' },
        ],
        results: [],
        refetch: mocks.refetch,
      });
      await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
      await click(button(current.name));
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    };

    it('runs the model it stopped on again without asking for another model', async () => {
      await open('Opus48');
      expect(document.body.textContent).toContain("The last assessment of Claude Opus 4.8 didn't finish. Select Run to assess it again");
      expect(button('Run the assessment again').textContent).toBe('Run');
      await click(button('Run the assessment again'));
      expect(document.body.textContent).not.toContain('still uses');
      expect(mocks.create).toHaveBeenCalledOnce();
    });

    it('still asks for another model when the agent has since moved off the model it stopped on', async () => {
      await open('GPT5Chat');
      expect(document.body.textContent).not.toContain("didn't finish");
      expect(button('Run')).toBeDefined();
    });
  });

  it('shows why it did not start when the model has not changed yet', async () => {
    const message = 'Model unchanged since the last run. Update the model, then select Run.';
    const beforeStart = vi.fn().mockResolvedValue(message);
    await render(<CheckModelPanel agent={agent} beforeStart={beforeStart} />);
    await click(button('Run'));
    expect(container.textContent).toContain(message);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('shows model-independent unchanged model guidance from the drawer', async () => {
    vi.useFakeTimers();
    const current = { ...agent, currentModel: 'Opus47' };
    mocks.live.mockResolvedValue('Opus47');
    mocks.assessment.mockReturnValue({
      agents: [current],
      runs: [{ ...run, agentId: agent.id, historyId: 'baseline' }],
      history: [{ id: 'baseline', agentId: agent.id, changeType: 'Baseline', currentModel: 'Opus47' }],
      results: [],
      refetch: mocks.refetch,
    });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await click(button(current.name));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await click(button('Run'));
    expect(document.body.textContent).toContain('Model unchanged since the last run. Update the model, then select Run.');
    expect(document.body.textContent).not.toContain('The agent still uses');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('starts the assessment once the model change is confirmed', async () => {
    const beforeStart = vi.fn().mockResolvedValue(undefined);
    await render(<CheckModelPanel agent={agent} beforeStart={beforeStart} />);
    await click(button('Run'));
    expect(beforeStart).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'a clean run', poll: run, hidden: true },
    { label: 'a run with an error', poll: { ...run, status: 'Failed', errorMessage: 'Evaluation failed' }, hidden: false },
  ])('keeps the finished card until the panel closes, then hides $label only when it is clean', async ({ poll, hidden }) => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue(poll);
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    await render(null);
    await render(<CheckModelPanel agent={agent} />);
    expect(container.querySelector('[role="progressbar"]') === null).toBe(hidden);
  });

  it('shows the progress of an assessment that was already running when the panel opens', async () => {
    vi.useFakeTimers();
    const running = { ...run, status: 'Evaluation Running' };
    mocks.active.mockResolvedValue({ run: running, requestKey: 'earlier-request' });
    mocks.poll.mockResolvedValue(running);
    await render(<CheckModelPanel agent={agent} lastRun={running} />);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(button('Run').disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(mocks.poll).toHaveBeenCalledWith('earlier-request');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('hides the no-baseline hint as soon as Run is selected', async () => {
    vi.useFakeTimers();
    mocks.create.mockReturnValue(new Promise(() => {}));
    mocks.assessment.mockReturnValue({ agents: [agent], runs: [], history: [], results: [], refetch: mocks.refetch });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await click(button(agent.name));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(document.body.textContent).toContain('No baseline captured yet');
    expect(button('Run baseline assessment').textContent).toBe('Run');
    await click(button('Run baseline assessment'));
    expect(document.body.textContent).not.toContain('No baseline captured yet');
  });

  it('shows the model switch guide under the finished card', async () => {
    vi.useFakeTimers();
    mocks.assessment.mockReturnValue({
      agents: [agent], runs: [{ ...run, agentId: agent.id }],
      history: [{ id: 'baseline', agentId: agent.id, changeType: 'Baseline', currentModel: 'gpt-4.1' }],
      results: [], refetch: mocks.refetch,
    });
    await render(<MemoryRouter><ModelAssessmentPage /></MemoryRouter>);
    await click(button(agent.name));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(document.body.textContent).toContain('Want to try a different model?');
    await click(button('Run'));
    expect(document.body.textContent).not.toContain('Want to try a different model?');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Want to try a different model?');
  });

  it('shows why the assessment failed when the flow reports a failure', async () => {
    vi.useFakeTimers();
    const message = 'The assessment stopped while running the evaluations. Step "Run Evaluation" failed: Bad request';
    mocks.poll.mockResolvedValue({ ...run, status: 'Failed', errorMessage: message, errorCategory: 'Connector' });
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(container.textContent).toContain('Assessment failed');
    expect(container.textContent).toContain(message);
  });

  it('shows the latest failed run until a new assessment starts', async () => {
    const failed = { ...run, status: 'Failed', errorMessage: LOCK_RELEASED_MESSAGE, startedOn: '2026-10-19T05:54:29Z' };
    await render(<CheckModelPanel agent={agent} lastRun={failed} />);
    expect(container.textContent).toContain('Last assessment failed');
    expect(container.textContent).toContain('closed automatically');
    await click(button('Run'));
    expect(container.textContent).not.toContain('Last assessment failed');
  });

  it('cancels a running assessment after confirmation and stops polling', async () => {
    vi.useFakeTimers();
    const running = { ...run, status: 'Evaluation Running' };
    mocks.poll.mockResolvedValue(running);
    mocks.cancel.mockResolvedValue(undefined);
    await render(<CheckModelPanel agent={agent} onCancel={vi.fn()} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await click(button('Cancel'));
    expect(document.body.textContent).toContain('Cancel this assessment?');
    mocks.poll.mockResolvedValue({ ...running, status: 'Cancelled' });
    const dialogButton = [...document.querySelectorAll('[role="dialog"] button')]
      .find(node => node.textContent === 'Cancel assessment') as HTMLElement;
    await click(dialogButton);
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(running);
    expect(container.textContent).toContain('Cancelled');
    const polls = mocks.poll.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(mocks.poll.mock.calls.length).toBe(polls);
    expect(button('Cancel').textContent).toBe('Cancel');
  });

  it('keeps following the run and explains when it could not be cancelled', async () => {
    vi.useFakeTimers();
    mocks.poll.mockResolvedValue({ ...run, status: 'Evaluation Running' });
    mocks.cancel.mockRejectedValue(new Error('No permission to update this run.'));
    await render(<CheckModelPanel agent={agent} />);
    await click(button('Run'));
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await click(button('Cancel'));
    const dialogButton = [...document.querySelectorAll('[role="dialog"] button')]
      .find(node => node.textContent === 'Cancel assessment') as HTMLElement;
    await click(dialogButton);
    expect(container.textContent).toContain('No permission to update this run.');
    expect(button('Run').disabled).toBe(true);
  });
});
