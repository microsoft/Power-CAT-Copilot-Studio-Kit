import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssessmentData, type AssessmentData } from '../useModelAssessment';

const mocks = vi.hoisted(() => ({
  useQueries: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  ...mocks,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('../../services/model-assessment-service', () => ({
  getTrackedAgents: vi.fn(),
  getModelHistory: vi.fn(),
  getEvaluationRuns: vi.fn(),
  getEvaluationResults: vi.fn(),
  getTestCaseDetails: vi.fn(),
}));

vi.mock('../../services/agent-discovery-service', () => ({
  getLiveAgentModel: vi.fn(),
  getAgentIcons: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/agent-eligibility-service', () => ({
  syncEligibleAgents: vi.fn(),
}));

const BOT = '11111111-2222-3333-4444-555555555555';

const makeQuery = (data: unknown = []) => ({
  data,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
});

function readData() {
  let data: AssessmentData | undefined;
  function Probe() {
    data = useAssessmentData();
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (!data) throw new Error('Assessment data was not rendered');
  return data;
}

type Query = ReturnType<typeof makeQuery>;

describe('assessment refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  function setup(withCases = true, withAgents = true) {
    const queries = [
      makeQuery(withAgents ? [{ id: 'a1', copilotAgentId: BOT, currentModel: 'GPT41' }] : []),
      makeQuery(),
      makeQuery(),
      makeQuery(withCases ? [{ testCaseId: 'case-1', question: '' }] : []),
    ];
    const details: Query = makeQuery(undefined);
    const liveModels: Query = makeQuery(undefined);
    const eligibility: Query = makeQuery({ [BOT]: { copilot: true, kit: false, harness: false } });
    mocks.useQueries.mockReturnValue(queries);
    mocks.useQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey[1] === 'live-models' ? liveModels
        : options.queryKey[1] === 'eligibility' ? eligibility : details);
    return { queries, details, liveModels, eligibility };
  }

  const callFor = (key: string) =>
    mocks.useQuery.mock.calls.find(([options]) => options.queryKey[1] === key)?.[0];

  it('refreshes all four assessment reads, eligibility, the test-case details and the live models', () => {
    const { queries, details, liveModels, eligibility } = setup();
    readData().refetch();
    for (const query of [...queries, details, liveModels, eligibility]) {
      expect(query.refetch).toHaveBeenCalledTimes(1);
    }
  });

  it('does not request test-case details when there are no test cases', () => {
    const { queries, details } = setup(false);
    readData().refetch();
    expect(queries.every((query) => query.refetch.mock.calls.length === 1)).toBe(true);
    expect(details.refetch).not.toHaveBeenCalled();
  });

  it('does not read live models when no agent has a valid Copilot Studio id', () => {
    const { liveModels } = setup(true, false);
    readData().refetch();
    expect(callFor('live-models').enabled).toBe(false);
    expect(liveModels.refetch).not.toHaveBeenCalled();
  });

  it('keeps refresh busy until details and live models finish loading', () => {
    const { details, liveModels } = setup();
    details.isFetching = true;
    expect(readData().isFetching).toBe(true);
    details.isFetching = false;
    liveModels.isFetching = true;
    expect(readData().isFetching).toBe(true);
  });

  it('surfaces a failed details request when a question label is missing', () => {
    const { details } = setup();
    details.isError = true;
    expect(readData().isError).toBe(true);
  });

  it('does not fail the page when details fail but every result has a saved question', () => {
    const { queries, details } = setup();
    queries[3].data = [{ testCaseId: 'saved-case', question: 'Saved question' }];
    details.isError = true;
    expect(readData().isError).toBe(false);
  });

  it('looks up every test case, deduplicated case-insensitively', () => {
    const { queries } = setup();
    queries[3].data = [
      { testCaseId: 'saved-case', question: 'Saved historical question' },
      { testCaseId: 'MISSING-CASE', question: '' },
      { testCaseId: 'missing-case', question: ' ' },
    ];
    readData();
    expect(callFor('test-case-details').queryKey.at(-1)).toEqual(['missing-case', 'saved-case']);
  });

  it('preserves historical question snapshots when filling missing labels', () => {
    const { queries, details } = setup();
    queries[3].data = [
      { testCaseId: 'same-case', question: 'Saved historical question' },
      { testCaseId: 'SAME-CASE', question: ' ' },
    ];
    details.data = { 'same-case': { name: 'Case name', questions: ['Current question text'] } };
    expect(readData().results.map((result) => result.question))
      .toEqual(['Saved historical question', 'Current question text']);
  });

  it('attaches every multi-turn question when the conversation starts with the saved question', () => {
    const { queries, details } = setup();
    queries[3].data = [
      { testCaseId: 'multi', question: 'Add a ticket.' },
      { testCaseId: 'edited', question: 'Old first turn' },
    ];
    details.data = {
      multi: { questions: ['Add a ticket.', 'Environment: HelpDesk.'] },
      edited: { questions: ['New first turn', 'Second turn'] },
    };
    const [multi, edited] = readData().results;
    expect(multi.questions).toEqual(['Add a ticket.', 'Environment: HelpDesk.']);
    expect(edited.questions).toBeUndefined();
    expect(edited.question).toBe('Old first turn');
  });

  it('exposes the live Copilot Studio model on each agent', () => {
    const { liveModels } = setup();
    liveModels.data = { [BOT]: 'GPT5Auto' };
    expect(readData().agents[0]).toMatchObject({ currentModel: 'GPT41', liveModel: 'GPT5Auto' });
  });

  it('shows only eligible agents, with their evaluation engines', () => {
    const { queries, eligibility } = setup();
    queries[0].data = [
      { id: 'a1', copilotAgentId: BOT, currentModel: 'GPT41' },
      { id: 'a2', copilotAgentId: '99999999-2222-3333-4444-555555555555' },
    ];
    expect(readData().agents.map((agent) => [agent.id, agent.engines?.copilot])).toEqual([['a1', true]]);
    eligibility.data = undefined;
    expect(readData().agents).toEqual([]);
  });
});
