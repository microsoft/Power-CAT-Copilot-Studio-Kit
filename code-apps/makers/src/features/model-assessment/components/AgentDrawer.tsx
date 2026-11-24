import {
  Button,
  Caption1,
  OverlayDrawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Subtitle2,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { CoinStackRegular, Dismiss20Regular, Open20Regular } from '@fluentui/react-icons';
import { Fragment, useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAssessmentAgentUrl } from '../services/agent-links';
import { getLiveAgentModel } from '../services/agent-discovery-service';
import {
  changeAssessedWithErrors,
  formatWhen,
  friendlySetError,
  isEvaluationLimit,
  isRunInProgress,
  sameModel,
  SET_UNSCORED_REASON,
  setNeedsFix,
  unfinishedRunModel,
  type CreditsVM,
  type EvaluationResultVM,
  type ModelHistoryVM,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { creditsTotal, formatCredits } from '../contracts/credits';
import { estimateMsPerCase } from '../contracts/evaluation-progress';
import type { AgentDetail } from '../hooks/useModelAssessment';
import { useModelPublishFailure, useModelUpdating } from '../hooks/useModelUpdate';
import { useKitSettingsSaving } from '../hooks/useKitTests';
import { CheckModelPanel } from './CheckModelPanel';
import { AssessmentEngineSection } from './KitTestsSection';
import { ModelPicker } from './ModelPicker';
import { ModelTransition } from './ModelTransition';
import { ModelSwitchGuide } from './ModelSwitchGuide';

const useStyles = makeStyles({
  // Size through Fluent's variable so the close motion slides the whole drawer off-screen;
  // a plain width leaves part of the closed (mounted) drawer over the page, blocking clicks.
  drawer: { '--fui-Drawer--size': 'min(600px, 94vw)' },
  header: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
  },
  closeButton: { minWidth: '44px', minHeight: '44px' },
  body: { minHeight: 0 },
  footer: {
    display: 'block',
    flexShrink: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL} ${tokens.spacingVerticalXXL}`,
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: tokens.spacingHorizontalXXL,
      right: tokens.spacingHorizontalXXL,
      height: tokens.strokeWidthThin,
      opacity: 1,
      backgroundColor: tokens.colorNeutralStroke2,
    },
  },
  title: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  name: { minWidth: 0, overflowWrap: 'anywhere' },
  openLink: { flexShrink: 0, display: 'inline-flex', alignItems: 'center' },
  sectionH: {
    display: 'block',
    margin: `${tokens.spacingVerticalL} 0 ${tokens.spacingVerticalS}`,
  },
  histRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralBackground4}`,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    textAlign: 'left',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  histButton: {
    width: '100%',
    borderRadius: 0,
    justifyContent: 'space-between',
    color: tokens.colorNeutralForeground2,
    ':hover': { color: tokens.colorBrandForeground1 },
    ':focus-visible': { color: tokens.colorBrandForeground1 },
    '&:hover > :first-child': { textDecorationLine: 'underline' },
    '&:focus-visible > :first-child': { textDecorationLine: 'underline' },
  },
  histMeta: {
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  histDate: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  historyToggle: { marginTop: tokens.spacingVerticalS, minHeight: '44px' },
  credits: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS, whiteSpace: 'nowrap' },
  withErrors: { color: tokens.colorStatusWarningForeground1, whiteSpace: 'nowrap' },
  notice: { marginTop: tokens.spacingVerticalL, marginBottom: tokens.spacingVerticalL },
  noticeList: { margin: `${tokens.spacingVerticalXS} 0`, paddingLeft: tokens.spacingHorizontalXL },
  muted: { color: tokens.colorNeutralForeground3 },
});

const BASELINE_DONE = new Set(['completed', 'completedwitherrors']);
const COLLAPSED_HISTORY_COUNT = 10;
const statusKey = (status: string | undefined) => (status ?? '').toLowerCase().replace(/[^a-z]/g, '');
const withErrors = (status: string | undefined) => statusKey(status) === 'completedwitherrors';

/** Test sets Copilot Studio could not run, one entry per set. */
function setErrors(results: EvaluationResultVM[]): Array<{ key: string; name: string; reason?: string; needsFix: boolean; agentWide: boolean }> {
  const sets = new Map<string, { key: string; name: string; reason?: string; needsFix: boolean; agentWide: boolean }>();
  for (const result of results) {
    if (statusKey(result.metric) !== 'external') continue;
    const key = (result.testSetId ?? result.testSet ?? result.id).toLowerCase();
    if (!sets.has(key)) {
      const reason = friendlySetError(result.reason);
      // The notice already says nothing was scored; its fix hint covers the rest.
      sets.set(key, {
        key,
        name: result.testSet || 'Test set',
        reason: reason === SET_UNSCORED_REASON ? undefined : reason,
        needsFix: setNeedsFix(result.reason),
        agentWide: isEvaluationLimit(result.reason),
      });
    }
  }
  return [...sets.values()];
}

/** Sets that failed for the same reason, so each reason shows once. */
function groupByReason(sets: ReturnType<typeof setErrors>): Array<{ key: string; names: string[]; reason?: string }> {
  const groups = new Map<string, { key: string; names: string[]; reason?: string }>();
  for (const set of sets) {
    const group = groups.get(set.reason ?? '');
    if (group) group.names.push(set.name);
    else groups.set(set.reason ?? '', { key: set.key, names: [set.name], reason: set.reason });
  }
  return [...groups.values()];
}

export interface AgentDrawerProps {
  agent: TrackedAgentVM | undefined;
  detail: AgentDetail;
  open: boolean;
  onClose: () => void;
  onCompare: (history: ModelHistoryVM, trigger: HTMLButtonElement) => void;
  canCompare: (history: ModelHistoryVM) => boolean;
  /** Copilot Credits of the run behind a history entry (Microsoft Copilot harness agents only). */
  historyCredits?: (history: ModelHistoryVM) => CreditsVM | undefined;
  /** Status of the run behind a history entry. */
  historyStatus?: (history: ModelHistoryVM) => string | undefined;
  /** Reloads the page data when a check starts or finishes. */
  onRunChanged?: () => void;
  onAfterOpen?: () => void;
  onAfterClose?: () => void;
}

export function AgentDrawer({
  agent,
  detail,
  open,
  onClose,
  onCompare,
  canCompare,
  historyCredits,
  historyStatus,
  onRunChanged,
  onAfterOpen,
  onAfterClose,
}: AgentDrawerProps) {
  const styles = useStyles();
  const historyId = useId();
  const [historyView, setHistoryView] = useState({ agentId: agent?.id, open, expanded: false });
  if (historyView.agentId !== agent?.id || historyView.open !== open) {
    setHistoryView({ agentId: agent?.id, open, expanded: false });
  }
  const visibleHistory = historyView.expanded ? detail.history : detail.history.slice(0, COLLAPSED_HISTORY_COUNT);
  const botId = agent?.copilotAgentId?.trim() ?? '';
  const kitMode = agent?.kit?.enabled ?? false;
  const running = isRunInProgress(detail.latestRun?.status);
  // Once a baseline exists, a model is picked first and then assessed against it.
  const hasBaseline = detail.runs.some((run) => BASELINE_DONE.has(statusKey(run.status)));
  const kitIncomplete = kitMode && (!agent?.kit?.configurationId || !agent?.kit?.testSetId);
  const updating = useModelUpdating(botId);
  const publishFailure = useModelPublishFailure(botId);
  const settingsSaving = useKitSettingsSaving(agent?.id ?? '');
  const blockedReason = settingsSaving
    ? 'Wait until the evaluation settings are saved.'
    : kitIncomplete
    ? 'Select an Agent Configuration and a test set for the Kit tests first.'
    : updating
      ? kitMode ? 'Wait until the new model is saved and the agent is published.' : 'Wait until the new model is saved to the agent.'
      : kitMode && publishFailure ? 'Retry publishing the agent before running Kit tests.' : undefined;
  // The model list depends on the harness, so it is offered once that is known.
  const harness = agent?.engines?.harness;
  const pending = Boolean(agent?.modelChangePending);
  // A baseline entry shows once its run has completed; before that it is only a capture.
  const showHistory = detail.history.length > 0
    && (hasBaseline || detail.history.some((h) => h.changeType.toLowerCase() !== 'baseline'));
  // While a change is pending, the live model is shown as current and the
  // assessed one as previous.
  const assessedModel = pending ? agent?.previousModel : agent?.currentModel;
  // The latest assessment had test sets Copilot Studio could not run.
  const latestRun = detail.latestRun;
  const lastRunWithErrors = !running && withErrors(latestRun?.status);
  const failedSets = lastRunWithErrors && latestRun ? setErrors(detail.resultsFor(latestRun.id)) : [];
  const fixHint = failedSets.length === 1 ? 'Fix the test set in Copilot Studio' : 'Fix the test sets in Copilot Studio';
  // Sets that only stopped early need another run, not a fix.
  const setsNeedFix = failedSets.some((set) => set.needsFix);
  // An agent-wide limit stopped every set, so naming the sets adds nothing.
  const agentWideReason = failedSets.length > 0 && failedSets.every((set) => set.agentWide)
    ? failedSets[0].reason
    : undefined;
  // The latest run on the assessed model stopped before it finished, so that model is assessed again.
  const stoppedModel = running ? undefined : unfinishedRunModel(detail.runs, detail.history);
  const rerunStopped = Boolean(stoppedModel) && sameModel(stoppedModel, assessedModel);
  // Once its test sets are fixed, or after a run that stopped early, the same model is assessed again.
  const runAgain = hasBaseline && !pending && (lastRunWithErrors || rerunStopped);
  const queryClient = useQueryClient();
  // The model may have just been switched in Copilot Studio; re-read it on open.
  useEffect(() => {
    if (botId) void queryClient.invalidateQueries({ queryKey: ['mat', 'live-models'] });
  }, [botId, queryClient]);
  const confirmModelChange = async (): Promise<string | undefined> => {
    let live: string | undefined;
    try {
      live = await getLiveAgentModel(botId);
    } catch {
      live = undefined;
    }
    void queryClient.invalidateQueries({ queryKey: ['mat', 'live-models'] });
    // When the model cannot be read, the assessment still detects it server-side.
    if (live && assessedModel && sameModel(live, assessedModel)) {
      return 'Model unchanged since the last run. Update the model, then select Run.';
    }
    return undefined;
  };
  const studio = useQuery({
    queryKey: ['mat', 'agent-studio-url', botId],
    queryFn: () => getAssessmentAgentUrl(botId),
    enabled: open && Boolean(botId),
    staleTime: 30 * 60_000,
  });

  return (
    <OverlayDrawer
      className={styles.drawer}
      position="end"
      open={open}
      unmountOnClose={false}
      surfaceMotion={{
        onMotionFinish: (_, { direction }) => {
          if (direction === 'enter') onAfterOpen?.();
          else onAfterClose?.();
        },
      }}
      onOpenChange={(_, data) => !data.open && onClose()}
    >
      <DrawerHeader className={styles.header}>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              className={styles.closeButton}
              icon={<Dismiss20Regular />}
              aria-label="Close"
              onClick={onClose}
            />
          }
        >
          <span className={styles.title}>
            <span className={styles.name}>{agent?.name ?? 'Agent'}</span>
            {studio.data && botId && (
              <Tooltip content="Open agent in Copilot Studio" relationship="label" withArrow>
                <Link
                  href={studio.data}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open agent in Copilot Studio"
                  className={styles.openLink}
                >
                  <Open20Regular aria-hidden />
                </Link>
              </Tooltip>
            )}
          </span>
        </DrawerHeaderTitle>
      </DrawerHeader>

        {agent ? (
          <CheckModelPanel
            key={agent.id}
            agent={agent}
            lastRun={detail.latestRun}
            onRunChanged={onRunChanged}
            kitMode={kitMode}
            blockedReason={blockedReason}
            actionTooltip={!hasBaseline
              ? 'Run baseline assessment'
              : pending ? 'Run new model assessment' : runAgain ? 'Run the assessment again' : undefined}
            beforeStart={hasBaseline && !runAgain ? confirmModelChange : undefined}
            onCancel={onClose}
            msPerTestCase={estimateMsPerCase(detail.runs)}
            renderLayout={(content, actions) => (
              <>
                <DrawerBody className={styles.body}>
                  {studio.isError && botId && (
                    <MessageBar intent="warning">
                      <MessageBarBody>Could not load the Copilot Studio link.</MessageBarBody>
                      <MessageBarActions>
                        <Button onClick={() => void studio.refetch()}>Retry</Button>
                      </MessageBarActions>
                    </MessageBar>
                  )}
                  {content}
                </DrawerBody>
                <DrawerFooter className={styles.footer}>{actions}</DrawerFooter>
              </>
            )}
            settings={(busy) => (
              <AssessmentEngineSection key={`engine-${agent.id}`} agent={agent} locked={running || busy || updating || settingsSaving} />
            )}
          >
            {(busy, progressShown, finished) => {
              // A shown progress card covers the run until it finishes; the next step follows it.
              const nextStepShown = !busy && (!progressShown || finished);
              return (
                <>
                  {lastRunWithErrors && nextStepShown && (
                    <MessageBar intent="warning" layout="multiline" className={styles.notice}>
                      <MessageBarBody>
                        <MessageBarTitle>
                          {agentWideReason ? 'Last assessment completed with errors:' : 'Last assessment completed with errors'}
                        </MessageBarTitle>
                        {agentWideReason ? `${agentWideReason} ` : failedSets.length > 0 ? (
                          <>
                            {failedSets.length === 1
                              ? 'No test cases were scored in this test set:'
                              : 'No test cases were scored in these test sets:'}
                            <ul className={styles.noticeList}>
                              {groupByReason(failedSets).map((group) => (
                                <li key={group.key}>
                                  {group.names.map((name, i) => (
                                    <Fragment key={`${name}-${i}`}>
                                      {i === 0 ? '' : i === group.names.length - 1 ? ' and ' : ', '}
                                      <strong>{name}</strong>
                                    </Fragment>
                                  ))}
                                  {group.reason ? ` — ${group.reason}` : ''}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : 'Some test cases could not be scored. '}
                        {pending
                          ? changeAssessedWithErrors(agent) && (setsNeedFix
                            ? `The model change is recorded only after an assessment completes without errors. ${fixHint}, then select Run.`
                            : 'The model change is recorded only after an assessment completes without errors. Select Run to try again.')
                          : setsNeedFix
                            ? `${fixHint}, then select Run.`
                            : 'Select Run to try again.'}
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {hasBaseline && !running && nextStepShown && (
                    <ModelSwitchGuide
                      assessedModel={assessedModel}
                      unfinished={!pending && rerunStopped}
                      newModel={pending ? agent.currentModel : undefined}
                      studioUrl={studio.data}
                      picker={botId && harness !== undefined
                        ? <ModelPicker botId={botId} harness={harness} kitMode={kitMode} disabled={settingsSaving} liveModel={agent.currentModel} studioUrl={studio.data} />
                        : undefined}
                    />
                  )}
                  {!showHistory && !hasBaseline && !running && !busy && !progressShown && (
                    <Text block className={mergeClasses(styles.sectionH, styles.muted)}>
                      No baseline captured yet. Select Run to capture one.
                    </Text>
                  )}
                  {showHistory && (
                    <Subtitle2 as="h3" className={styles.sectionH}>Model history</Subtitle2>
                  )}
                  {showHistory && <div id={historyId}>{visibleHistory.map((h) => {
                      const compareEnabled = canCompare(h);
                      const credits = historyCredits?.(h);
                      const historyWithErrors = withErrors(historyStatus?.(h));
                      const content = (
                        <>
                          <ModelTransition
                            changeType={h.changeType}
                            previousModel={h.previousModel}
                            currentModel={h.currentModel}
                          />
                          <span className={styles.histMeta}>
                            {historyWithErrors && <span className={styles.withErrors}>With errors</span>}
                            {credits && (
                              <Caption1 className={styles.credits}>
                                <CoinStackRegular aria-hidden />
                                {`${formatCredits(creditsTotal(credits))} credits`}
                              </Caption1>
                            )}
                            <time dateTime={h.on} className={styles.histDate}>
                              <Caption1>{formatWhen(h.on)}</Caption1>
                            </time>
                          </span>
                        </>
                      );
                      return compareEnabled ? (
                        <Tooltip key={h.id} content="Compare this run with up to two other model runs" relationship="description" withArrow>
                        <Button
                          appearance="transparent"
                          className={mergeClasses(styles.histRow, styles.histButton)}
                          aria-label={`Compare model run from ${formatWhen(h.on)}`}
                          aria-haspopup="dialog"
                          onClick={(event) => onCompare(h, event.currentTarget)}
                        >
                          {content}
                        </Button>
                        </Tooltip>
                      ) : (
                        <div
                          key={h.id}
                          className={styles.histRow}
                        >
                          {content}
                        </div>
                      );
                    })}</div>}
                  {showHistory && detail.history.length > COLLAPSED_HISTORY_COUNT && (
                    <Button
                      appearance="subtle"
                      className={styles.historyToggle}
                      aria-expanded={historyView.expanded}
                      aria-controls={historyId}
                      onClick={() => setHistoryView((view) => ({ ...view, expanded: !view.expanded }))}
                    >
                      {historyView.expanded ? 'Show less' : 'Show more'}
                    </Button>
                  )}
                </>
              );
            }}
          </CheckModelPanel>
        ) : <DrawerBody />}
    </OverlayDrawer>
  );
}
