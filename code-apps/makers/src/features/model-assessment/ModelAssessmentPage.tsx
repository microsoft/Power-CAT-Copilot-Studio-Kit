import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Card,
  CardHeader,
  CardPreview,
  Body1Strong,
  FluentProvider,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  SearchBox,
  Spinner,
  Subtitle2,
  Title2,
  ToggleButton,
  Tooltip,
  Body1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowSync20Regular, BookOpenRegular, ChatHelpRegular, QuestionCircleRegular } from '@fluentui/react-icons';
import {
  isRegression,
  previousModelsByAgent,
  withModelState,
  type EvaluationRunVM,
  type ModelHistoryVM,
  type TrackedAgentVM,
} from './contracts/model-assessment';
import { isComparableRun, isScoredRun } from './contracts/comparison-utils';
import { useAgentDetail, useAssessmentData } from './hooks/useModelAssessment';
import { AgentsGrid } from './components/AgentsGrid';
import { AgentDrawer } from './components/AgentDrawer';
import { CompareDialog } from './components/CompareDialog';
import { WelcomeTour, type TourStep } from './components/WelcomeTour';
import { useFirstRunTour } from './hooks/useFirstRunTour';
import { modelAssessmentTheme } from './theme/modelAssessmentTheme';
import { copilotStudioReviewLightTheme } from '../agent-review-tool/agents-experience/components/copilotStudioReviewTheme';
import { MeteredActionChip } from '../../shared/components/MeteredActionChip';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import { AssessmentPagination } from './components/AssessmentPagination';
import noResultsImage from '../../shared/assets/no-results.png?inline';

const DOCUMENTATION_URL = 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/MODEL_ASSESSMENT.md';
const DEFAULT_PAGE_SIZE = 10;

const useStyles = makeStyles({
  provider: {
    width: '100%',
    minHeight: '100vh',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    // Same spacing as the Share evaluations page.
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    gap: tokens.spacingVerticalL,
    boxSizing: 'border-box',
  },
  breadcrumbs: {
    marginBottom: tokens.spacingVerticalS,
    '& .fui-BreadcrumbButton': { border: 'none', backgroundColor: 'transparent' },
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    width: '100%',
  },
  backButton: { minWidth: 'auto' },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginLeft: 'auto',
  },
  gridHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: tokens.spacingHorizontalM,
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
  },
  chips: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    minWidth: 0,
    maxWidth: '100%',
  },
  searchScope: { width: '300px', minWidth: 0, maxWidth: '100%' },
  search: { width: '100%', minWidth: 0, maxWidth: '400px', boxSizing: 'border-box' },
  gridCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
    minWidth: 0,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
  },
  emptyImg: { width: '120px', height: '120px' },
  emptySub: { color: tokens.colorNeutralForeground3, maxWidth: '440px' },
  screenReaderOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

const CHIPS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'Critical', label: 'Critical' },
  { id: 'Warning', label: 'Warning' },
  { id: 'Healthy', label: 'Healthy' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

interface CompareState {
  open: boolean;
  run?: EvaluationRunVM;
  trigger?: HTMLButtonElement;
}

export default function ModelAssessmentPage() {
  useFeatureTelemetry('model-assessment', 'Model Assessment');
  const styles = useStyles();
  const navigate = useNavigate();
  const data = useAssessmentData();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [compare, setCompare] = useState<CompareState>({ open: false });
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const comparisonReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const firstAgentRef = useRef<HTMLButtonElement | null>(null);
  const regressionHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const helpRef = useRef<HTMLButtonElement | null>(null);

  const hasAgents = !data.isLoading && !data.isError && data.agents.length > 0;
  const tour = useFirstRunTour(hasAgents);
  const tourSteps: TourStep[] = [
    {
      title: 'Choose an agent to assess',
      body: 'Your eligible agents are listed here. An agent appears once it has MODELCHECK in an evaluation test set name, or a pipeline-enabled Kit configuration. Use the search box or the regression status filter to find the one you need.',
      target: filtersRef,
      position: 'below',
    },
    {
      title: 'Capture a baseline, then change the model',
      body: 'Select an agent to capture a baseline. Then change its model, assess the new model, and compare the runs.',
      target: firstAgentRef,
      position: 'after',
    },
    {
      title: 'Read the outcome',
      body: 'Regression shows whether the new model performed better or worse than the previous one. Latest results shows how many test cases passed, failed, or ended in an error.',
      target: regressionHeaderRef,
      position: 'below',
    },
    {
      title: 'Need guidance?',
      body: 'Open Help to read the Model Assessment documentation or to take this tour again.',
      target: helpRef,
      position: 'below',
      align: 'end',
    },
  ];

  const detail = useAgentDetail(data, selectedId);
  // Model in use before each agent's assessed model, from its model history.
  const prevByAgent = useMemo(
    () => previousModelsByAgent(data.agents, data.history),
    [data.agents, data.history],
  );
  const selectedAgent = useMemo(() => {
    const agent = data.agents.find((a) => a.id === selectedId);
    return agent ? withModelState(agent, prevByAgent.get(agent.id)) : undefined;
  }, [data.agents, selectedId, prevByAgent]);

  const matchesFilter = (agent: TrackedAgentVM): boolean => {
    switch (filter) {
      case 'all':
        return true;
      case 'attention':
        return isRegression(agent.regression) || norm(agent.sourceStatus) === 'accessdenied';
      case 'Critical':
      case 'Warning':
      case 'Healthy':
        return norm(agent.regression) === norm(filter);
      case 'AccessDenied':
        return norm(agent.sourceStatus) === 'accessdenied';
      default:
        return true;
    }
  };

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.agents
      .filter(
        (a) =>
          matchesFilter(a) &&
          (q === '' ||
            a.name.toLowerCase().includes(q) ||
            a.schema.toLowerCase().includes(q)),
      )
      .map((a) => withModelState(a, prevByAgent.get(a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.agents, prevByAgent, query, filter]);

  // Keep the page in range when filters or refreshes shrink the list.
  const pageCount = Math.max(1, Math.ceil(filteredAgents.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);

  const resultRunIds = useMemo(
    () => new Set(data.results.flatMap(result => result.runId ? [result.runId.toLowerCase()] : [])),
    [data.results],
  );
  // The run that assessed a history entry; only one that scored a test case can be compared.
  const assessedRunForHistory = (history: ModelHistoryVM) =>
    data.runs.find((r) => r.historyId === history.id && isComparableRun(r, resultRunIds));
  const runForHistory = (history: ModelHistoryVM) =>
    data.runs.find((r) => r.historyId === history.id && isScoredRun(r, resultRunIds));

  const canCompare = (history: ModelHistoryVM): boolean =>
    ['modelchanged', 'baseline', 'baselinecreated'].includes(norm(history.changeType)) &&
    Boolean(runForHistory(history));

  const openRunCompare = (run: EvaluationRunVM, trigger: HTMLButtonElement) =>
    setCompare({ open: false, run, trigger });
  const openCompare = (history: ModelHistoryVM, trigger: HTMLButtonElement) => {
    const run = runForHistory(history);
    if (run) openRunCompare(run, trigger);
  };
  const closeCompare = () => {
    comparisonReturnFocusRef.current = compare.trigger ?? null;
    setCompare({ open: false });
  };
  const afterDrawerCloses = () => {
    setCompare((current) => current.run ? { ...current, open: true } : current);
    if (!compare.run && drawerTriggerRef.current?.isConnected) drawerTriggerRef.current.focus();
  };
  const afterDrawerOpens = () => {
    const trigger = comparisonReturnFocusRef.current;
    comparisonReturnFocusRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  };
  const openAgentDetails = (agent: TrackedAgentVM, trigger: HTMLButtonElement) => {
    drawerTriggerRef.current = trigger;
    setSelectedId(agent.id);
  };
  const closeAgentDetails = () => {
    comparisonReturnFocusRef.current = null;
    setSelectedId(undefined);
  };

  const compareData = useMemo(() => {
    if (!compare.run) return undefined;
    const initialRun = compare.run;
    const agentId = initialRun.agentId;
    const runs = agentId ? data.runs.filter((run) => run.agentId === agentId) : [];
    const runIds = new Set(runs.map((run) => run.id));
    const history = agentId
      ? data.history.filter((item) => item.agentId === agentId)
      : [];
    const results = data.results.filter((result) => result.runId && runIds.has(result.runId));
    const agent = data.agents.find((item) => item.id === agentId);
    return {
      initialRunId: initialRun?.id, runs, history, results,
      botId: agent?.copilotAgentId, agentName: agent?.name, harness: agent?.engines?.harness,
    };
  }, [compare.run, data.runs, data.results, data.history, data.agents]);

  return (
    <FluentProvider theme={modelAssessmentTheme} style={{ backgroundColor: 'transparent' }}>
      <div
        className={styles.provider}
        style={{
          // Match the Agent Review Tool background exactly. Both features use a
          // Copilot Studio indigo theme, but this feature's lighter brand ramp
          // resolves colorBrandBackground2 to near-white, so the gradient endpoint
          // is pinned to the review theme's value — only the background matches,
          // the rest of this feature's theme is unchanged.
          background: `linear-gradient(160deg, ${tokens.colorNeutralBackground2} 0%, ${copilotStudioReviewLightTheme.colorBrandBackground2} 100%)`,
        }}
      >
      <div
        className={styles.page}
        data-screen-id="model-assessment"
        data-ui-state={
          data.isLoading ? 'loading' : data.isError ? 'error' : data.agents.length === 0 ? 'empty' : 'ready'
        }
      >
      <Breadcrumb className={styles.breadcrumbs} aria-label="Breadcrumb">
        <BreadcrumbItem>
          <BreadcrumbButton onClick={() => navigate('/advanced-testing')}>Advanced Testing</BreadcrumbButton>
        </BreadcrumbItem>
        <BreadcrumbDivider />
        <BreadcrumbItem>
          <BreadcrumbButton current>Model Assessment</BreadcrumbButton>
        </BreadcrumbItem>
      </Breadcrumb>
      <div className={styles.headerRow}>
        <Button
          appearance="subtle"
          icon={<ArrowLeft20Regular />}
          aria-label="Back to Advanced Testing"
          onClick={() => navigate('/advanced-testing')}
          className={styles.backButton}
        />
        <Title2>Model Assessment</Title2>
        <Badge appearance="tint" color="brand" shape="rounded" size="large">PREVIEW</Badge>
        <MeteredActionChip
          meter="credits"
          description="Running an assessment spends Copilot Credits: the agent answers each test question, and an AI prompt summarizes the results."
        />
        <div className={styles.headerActions}>
          <Menu positioning="below-end">
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="Help" relationship="label" withArrow>
                <Button ref={helpRef} appearance="subtle" icon={<QuestionCircleRegular />} aria-label="Help" />
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<ChatHelpRegular />} disabled={!hasAgents} onClick={tour.start}>
                  Take the tour
                </MenuItem>
                <MenuItem icon={<BookOpenRegular />} onClick={() => window.open(DOCUMENTATION_URL, '_blank', 'noopener,noreferrer')}>
                  Documentation
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      {data.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            Couldn&apos;t load assessment data from Dataverse. Confirm the app is connected to the
            environment that hosts the Model Assessment tables, then retry.
          </MessageBarBody>
          <MessageBarActions>
            <Button onClick={() => void data.refetch()}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <Card className={styles.gridCard}>
        <CardHeader header={{
          className: styles.gridHeader,
          children: (
            <>
              <Body1Strong>Agents</Body1Strong>
              <div className={styles.filters} ref={filtersRef}>
                <Tooltip content="Refresh agents" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    icon={<ArrowSync20Regular />}
                    aria-label="Refresh agents"
                    disabled={data.isFetching || data.isLoading}
                    onClick={() => void data.refetch()}
                  />
                </Tooltip>
                <div className={styles.chips} role="group" aria-label="Agent status filter">
                  {CHIPS.map((chip) => (
                    <ToggleButton
                      key={chip.id}
                      size="medium"
                      shape="circular"
                      appearance={filter === chip.id ? 'primary' : 'outline'}
                      isAccessible
                      checked={filter === chip.id}
                      onClick={() => {
                        setFilter(chip.id);
                        setPageIndex(0);
                      }}
                    >
                      {chip.label}
                    </ToggleButton>
                  ))}
                </div>
                <FluentProvider
                  theme={{ ...copilotStudioReviewLightTheme, fontFamilyBase: modelAssessmentTheme.fontFamilyBase }}
                  applyStylesToPortals={false}
                  className={styles.searchScope}
                  style={{ backgroundColor: 'transparent' }}
                >
                  <SearchBox
                    className={styles.search}
                    aria-label="Search agents"
                    placeholder="Search agents..."
                    value={query}
                    onChange={(_, d) => {
                      setQuery(d.value);
                      setPageIndex(0);
                    }}
                    disabled={data.agents.length === 0}
                  />
                </FluentProvider>
              </div>
            </>
          ),
        }} />
      <CardPreview style={{ margin: 0 }}>
        {data.isLoading ? (
          <div className={styles.center}>
            <Spinner label="Loading" />
          </div>
        ) : data.isError ? (
          <div className={styles.emptyWrap}>
            <Subtitle2>Agents couldn&apos;t be loaded</Subtitle2>
            <Button appearance="primary" onClick={() => void data.refetch()}>Retry</Button>
          </div>
        ) : data.agents.length === 0 ? (
          <div className={styles.emptyWrap}>
            <img src={noResultsImage} alt="" className={styles.emptyImg} />
            <Subtitle2>No agents to assess</Subtitle2>
            <Body1 className={styles.emptySub}>
              Add MODELCHECK to the name of an evaluation test set in Copilot Studio, or
              enable the pipeline on a Kit Agent Configuration.
            </Body1>
            <Button appearance="primary" onClick={() => void data.refetch()}>Refresh</Button>
          </div>
        ) : (
          <AgentsGrid
            agents={filteredAgents}
            onSelect={openAgentDetails}
            pageIndex={currentPage}
            pageSize={pageSize}
            firstAgentRef={firstAgentRef}
            regressionHeaderRef={regressionHeaderRef}
          />
        )}
      </CardPreview>
      {hasAgents && (
        <AssessmentPagination
          totalRecords={filteredAgents.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setPageIndex}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPageIndex(0);
          }}
        />
      )}
      </Card>
      <Body1 className={styles.screenReaderOnly} role="status" aria-live="polite">
        {filteredAgents.length === 0
          ? 'No agents match the current search and filters.'
          : `${filteredAgents.length} agent${filteredAgents.length === 1 ? '' : 's'} shown.`}
      </Body1>
      </div>
      </div>

      <AgentDrawer
        agent={selectedAgent}
        detail={detail}
        open={Boolean(selectedId) && !compare.run}
        onClose={() => {
          if (!compare.run) closeAgentDetails();
        }}
        onAfterClose={afterDrawerCloses}
        onAfterOpen={afterDrawerOpens}
        onCompare={openCompare}
        canCompare={canCompare}
        historyCredits={(history) => assessedRunForHistory(history)?.credits}
        historyStatus={(history) => assessedRunForHistory(history)?.status}
        onRunChanged={data.refetch}
      />

      <CompareDialog
        open={compare.open}
        onClose={closeCompare}
        initialRunId={compareData?.initialRunId}
        botId={compareData?.botId}
        agentName={compareData?.agentName}
        harness={compareData?.harness}
        runs={compareData?.runs ?? []}
        history={compareData?.history ?? []}
        results={compareData?.results ?? []}
      />

      {tour.step > 0 && hasAgents && !selectedId && !compare.run && (
        <WelcomeTour
          steps={tourSteps}
          currentStep={tour.step}
          onNext={tour.next}
          onPrevious={tour.previous}
          onDismiss={tour.finish}
        />
      )}
    </FluentProvider>
  );
}
