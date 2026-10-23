import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Badge, Button, Tooltip } from '@fluentui/react-components';
import {
  ArrowRight16Regular,
  Bot24Regular,
  CheckmarkCircle20Filled,
  Clock16Regular,
  Database20Regular,
  ErrorCircle20Filled,
  Info16Regular,
  Info20Regular,
  Lightbulb20Regular,
  Open16Regular,
  Sparkle16Regular,
  ThumbDislike20Regular,
  ThumbLike20Regular,
  Timer20Regular,
  Warning20Filled,
  Wrench20Regular,
} from '@fluentui/react-icons';

import type { ProcessedTranscript, ProcessedTurn, StepExecution } from '../../contracts/transcript';
import type { ConversationData } from '../../contracts/conversation';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { SessionSummary } from '../../contracts/workspace';
import type { Recommendation, RecommendationSeverity } from '../../utils/recommendations';
import type { AgentConfig } from '../../services/agent-config-service';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { resolveBestTitle } from '../../utils/build-flow-steps';
import { formatDateTime, formatSessionStart } from '../../utils/date-utils';
import { formatDuration } from '../../utils/format-duration';
import { dedupeOutcome } from '../../utils/outcome';
import { guessStepSubtitle } from '../../utils/step-classification';
import { stepDurationMs } from '../../utils/timeline-insights';
import { componentColor } from '../../theme/component-colors';
import { buildWorkflowModel } from '../flow/WorkflowCanvasModel';

export interface AgentInsightsTabProps {
  transcript: ProcessedTranscript;
  conversationData?: ConversationData | null;
  recommendations: Recommendation[];
  agentConfig?: AgentConfig;
  componentNameBySchemaName: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  agentName: string;
  agentUrl?: string;
  sessions?: readonly SessionSummary[];
  selectedSessionId?: string;
  onTurnSelect: (turnId: string) => void;
}

type TypeBreakdown = { type: string; count: number; ms: number };
type ToolUsage = { key: string; name: string; type: string; count: number; totalMs: number; taskDialogId: string };
type ConversationFeedback = {
  key: string;
  rating: "thumbsUp" | "thumbsDown";
  comment?: string;
  userMessage?: string;
  agentMessage: string;
};
type Metric = {
  key: string;
  label: string;
  value: ReactNode;
  tooltip: string;
  hint?: string;
  tone?: string;
};

const SEVERITY_RANK: Record<RecommendationSeverity, number> = { high: 0, medium: 1, low: 2 };

function WorkspaceBadge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge appearance="filled" className={['w-badge', tone, className].filter(Boolean).join(' ')}>
      {children}
    </Badge>
  );
}

function safeText(value: string | number | undefined | null, fallback = '—'): string {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Renders the session window as `start → end` in UTC, deriving the end from the
 * measured duration. Matches the design, which shows both bounds rather than a
 * dangling em dash.
 */
function utcRange(
  start: string | undefined,
  durationMs: number,
  end?: string,
): string {
  if (!start) return '—';
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return `${start} → —`;
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endMs = end ? Date.parse(end) : NaN;
  if (!Number.isNaN(endMs)) return `${iso(startMs)} → ${iso(endMs)}`;
  return durationMs > 0 ? `${iso(startMs)} → ${iso(startMs + durationMs)}` : `${iso(startMs)} → —`;
}

function stepType(step: StepExecution): string {
  return step.subtitle || guessStepSubtitle(step.taskDialogId, step.type, undefined, step.observation) || 'Step';
}

function stepName(
  step: StepExecution,
  componentNameBySchemaName?: Record<string, ComponentInfo>,
): string {
  return resolveBestTitle(step.taskDialogId, step.displayName, componentNameBySchemaName);
}

function allSteps(turns: ProcessedTurn[]): StepExecution[] {
  return turns.flatMap((turn) => turn.debugInfo?.stepExecutions ?? []);
}

function collectFeedback(turns: ProcessedTurn[]): ConversationFeedback[] {
  const feedback: ConversationFeedback[] = [];
  let latestUserMessage = "";

  turns.forEach((turn, index) => {
    if (turn.role === "user") {
      latestUserMessage = turn.content;
      return;
    }
    const turnFeedback = turn.feedbackEvents?.length
      ? turn.feedbackEvents
      : turn.feedback
        ? [turn.feedback]
        : [];

    turnFeedback.forEach((entry, feedbackIndex) => {
      feedback.push({
        key: `${turn.id || `feedback-${index}`}-${feedbackIndex}`,
        rating: entry.rating,
        comment: entry.comment,
        userMessage: latestUserMessage || undefined,
        agentMessage: turn.content,
      });
    });
  });

  return feedback;
}

function truncateFeedbackText(value: string): string {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}

export function uniqueRecommendations(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((rec) => {
    const signature = [rec.title, rec.description, rec.suggestion, rec.turnNumber]
      .map((value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase())
      .join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function collectKnowledge(
  turns: ProcessedTurn[],
  agentConfig: AgentConfig | undefined,
  componentNameBySchemaName: Record<string, ComponentInfo>,
): string[] {
  const names = new Set<string>();
  agentConfig?.knowledge.forEach((k) => names.add(k.name));
  for (const turn of turns) {
    const info = turn.debugInfo?.knowledgeSources;
    [...(info?.searched ?? []), ...(info?.output ?? []), ...(info?.cited ?? [])].forEach((rawName) => {
      const name = rawName.trim();
      const component = componentNameBySchemaName[name];
      names.add(component?.modelDisplayName?.trim() || component?.name?.trim() || name);
    });
  }
  return [...names].filter(Boolean);
}

function buildInsights(
  transcript: ProcessedTranscript,
  conversationData: ConversationData | null | undefined,
  agentConfig: AgentConfig | undefined,
  componentNameBySchemaName: Record<string, ComponentInfo>,
  connectedAgents: ConnectedAgentInfo[] | undefined,
) {
  const steps = allSteps(transcript.turns);
  const typeMap = new Map<string, TypeBreakdown>();
  const toolMap = new Map<string, ToolUsage>();

  for (const step of steps) {
    const ms = stepDurationMs(step);
    const type = stepType(step);

    const currentType = typeMap.get(type) ?? { type, count: 0, ms: 0 };
    currentType.count += 1;
    currentType.ms += ms;
    typeMap.set(type, currentType);

    const key = step.taskDialogId || step.stepId || stepName(step, componentNameBySchemaName);
    const currentTool = toolMap.get(key) ?? {
      key,
      name: stepName(step, componentNameBySchemaName),
      type,
      count: 0,
      totalMs: 0,
      taskDialogId: step.taskDialogId,
    };
    currentTool.count += 1;
    currentTool.totalMs += ms;
    toolMap.set(key, currentTool);
  }

  const failedSteps = buildWorkflowModel(
    transcript.turns,
    componentNameBySchemaName,
    connectedAgents,
  ).stats.failed;

  return {
    failedSteps,
    typeBreakdown: [...typeMap.values()].sort((a, b) => b.ms - a.ms),
    toolUsage: [...toolMap.values()].sort((a, b) => b.totalMs - a.totalMs),
    knowledge: collectKnowledge(transcript.turns, agentConfig, componentNameBySchemaName),
  };
}

function severityIcon(severity: RecommendationSeverity): ReactNode {
  if (severity === 'high') return <ErrorCircle20Filled className="w-ic" aria-hidden="true" />;
  if (severity === 'medium') return <Warning20Filled className="w-ic" aria-hidden="true" />;
  return <Info20Regular className="w-ic" aria-hidden="true" />;
}

function statusTone(value: string): string {
  if (/resolv|success/i.test(value)) return 'ok';
  if (/escalat|error|fail/i.test(value)) return 'err';
  return 'neutral';
}

/** Tab 4 — Agent insights, rebuilt to match the approved workspace prototype DOM exactly. */
export function AgentInsightsTab({
  transcript,
  conversationData,
  recommendations,
  agentConfig,
  componentNameBySchemaName,
  connectedAgents,
  agentName,
  agentUrl,
  sessions = [],
  selectedSessionId = 'all',
  onTurnSelect,
}: AgentInsightsTabProps) {
  const insights = useMemo(
    () => buildInsights(
      transcript,
      conversationData,
      agentConfig,
      componentNameBySchemaName,
      connectedAgents,
    ),
    [transcript, conversationData, agentConfig, componentNameBySchemaName, connectedAgents],
  );

  const sortedRecommendations = useMemo(
    () => uniqueRecommendations(recommendations).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [recommendations],
  );

  const recCounts = sortedRecommendations.reduce(
    (acc, rec) => ({ ...acc, [rec.severity]: acc[rec.severity] + 1 }),
    { high: 0, medium: 0, low: 0 } as Record<RecommendationSeverity, number>,
  );

  // Deduplicate the "Go to turn" link per turn number, same as the prototype's `linkedTurns` set.
  const linkedTurns = new Set<number>();

  const g = conversationData?.generalInfo;
  const displayName = agentConfig?.botName || agentName || 'Agent';
  const modelName = g?.modelName || g?.model;
  const orchestration = agentConfig?.settings?.orchestrationType
    || (agentConfig?.settings?.isGenerativeDesigner ? 'generative' : 'classic');
  const outcome = dedupeOutcome(safeText(g?.globalOutcome || transcript.generalInfo.outcome));
  const outcomeGood = /resolved|success/i.test(outcome);
  // `totalDuration` is already milliseconds everywhere it is produced
  // (`TranscriptAnalysisPage` assigns `processed.generalInfo.durationMs`, and
  // `deriveSnapshotGeneralInfo` passes the same value through), so it must not
  // be scaled again.
  const durationMs = g?.totalDuration || transcript.generalInfo.durationMs;
  const visibleSessions = useMemo(() => {
    if (!sessions.length) {
      return [{
        n: 1,
        startText: formatDate(g?.conversationStartTime),
        startTimeUtc: g?.conversationStartTime,
        durationMs,
        type: safeText(g?.channelId, 'Conversation'),
        outcome,
        turnCount: g?.numberOfTurns ?? transcript.generalInfo.turnCount,
        turnText: '',
      } satisfies SessionSummary];
    }
    if (selectedSessionId === 'all') return sessions;
    const selected = sessions.find((session) => String(session.n) === selectedSessionId);
    return selected ? [selected] : sessions;
  }, [
    durationMs,
    g?.channelId,
    g?.conversationStartTime,
    g?.numberOfTurns,
    outcome,
    selectedSessionId,
    sessions,
    transcript.generalInfo.turnCount,
  ]);
  const displayedSessionCount = visibleSessions.length;
  const startTime = formatDateTime(g?.conversationStartTime) || '—';
  const turns = g?.numberOfTurns ?? transcript.generalInfo.turnCount ?? transcript.turns.length;
  const duration = durationMs ? formatDuration(durationMs) : '—';
  const channel = safeText(g?.channelId);
  const metrics: Metric[] = [
    {
      key: 'sessions',
      label: 'Sessions',
      value: displayedSessionCount,
      tooltip: String(displayedSessionCount),
      hint: 'Number of conversation sessions in the selected scope.',
    },
    {
      key: 'turns',
      label: 'Turns',
      value: turns,
      tooltip: String(turns),
      hint: 'Total number of message turns in the conversation.',
    },
    {
      key: 'outcome',
      label: 'Outcome',
      value: <WorkspaceBadge tone={outcomeGood ? 'ok' : 'neutral'}>{outcome}</WorkspaceBadge>,
      tooltip: outcome,
      hint: 'Final outcome recorded for the conversation.',
    },
    {
      key: 'duration',
      label: 'Duration',
      value: duration,
      tooltip: duration,
      hint: 'Elapsed time from the conversation start to its recorded end.',
    },
    {
      key: 'start',
      label: 'Start time',
      value: startTime,
      tooltip: startTime,
      hint: 'Date and time when the conversation started.',
    },
    {
      key: 'channel',
      label: 'Channel',
      value: channel,
      tooltip: channel,
      hint: 'Channel through which the conversation was received.',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: insights.failedSteps,
      tooltip: String(insights.failedSteps),
      tone: insights.failedSteps ? 'var(--colorPaletteRedForeground1)' : undefined,
    },
  ];
  const cfg = agentConfig?.settings;
  if (cfg?.authenticationMode) {
    metrics.push({
      key: 'auth',
      label: 'Authentication',
      value: cfg.authenticationMode,
      tooltip: cfg.authenticationMode,
    });
  }
  if (cfg?.isSemanticSearchEnabled !== undefined) {
    const value = cfg.isSemanticSearchEnabled ? 'Enabled' : 'Disabled';
    metrics.push({ key: 'semantic', label: 'Semantic Search', value, tooltip: value });
  }
  if (cfg?.isMemoryEnabled !== undefined) {
    const value = cfg.isMemoryEnabled ? 'Enabled' : 'Disabled';
    metrics.push({ key: 'memory', label: 'Memory', value, tooltip: value });
  }

  const totalBreakdownMs = Math.max(1, insights.typeBreakdown.reduce((sum, item) => sum + item.ms, 0));
  const maxToolMs = Math.max(1, ...insights.toolUsage.map((item) => item.totalMs));
  const feedbackEntries = useMemo(
    () => collectFeedback(transcript.turns),
    [transcript.turns],
  );
  const positiveFeedbackCount = feedbackEntries.filter((entry) => entry.rating === "thumbsUp").length;
  const negativeFeedbackCount = feedbackEntries.length - positiveFeedbackCount;

  return (
    <div className="w-tabcontent">
      <div className="w-card">
        <div className="w-hero">
          <span className="av"><Bot24Regular className="w-ic" aria-hidden="true" /></span>
          <div className="info">
            <Tooltip content={displayName} relationship="description" positioning="above-start">
              <h3 title={displayName}>{displayName}</h3>
            </Tooltip>
            {modelName && (
              <Tooltip content={modelName} relationship="description" positioning="above-start">
                <div className="sn" title={modelName}>
                  <Sparkle16Regular className="w-ic" aria-hidden="true" /> {modelName}
                </div>
              </Tooltip>
            )}
            <div className="chips">
              <WorkspaceBadge tone={orchestration === 'generative' ? 'info' : 'neutral'}>
                {orchestration} orchestration
              </WorkspaceBadge>
              {agentConfig?.settings?.language && <WorkspaceBadge>{agentConfig.settings.language}</WorkspaceBadge>}
              {agentConfig?.settings?.isGenerativeDesigner && <WorkspaceBadge tone="warn">design mode</WorkspaceBadge>}
            </div>
          </div>
          <Button
            appearance="transparent"
            className="w-btn"
            type="button"
            disabled={!agentUrl}
            title={agentUrl ? 'Open this agent in Copilot Studio.' : 'Copilot Studio URL is unavailable.'}
            onClick={() => {
              if (agentUrl) window.open(agentUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            <Open16Regular className="w-ic" aria-hidden="true" /> Open in Copilot Studio
          </Button>
        </div>
        <div className="w-agentmetrics">
          {metrics.map((metric) => (
            <div key={metric.key} className="w-metric">
              <div className="k">
                {metric.label}
                {metric.hint && (
                  <Tooltip content={metric.hint} relationship="description" positioning="above">
                    <span
                      className="w-hint"
                      tabIndex={0}
                      aria-label={`${metric.label} information`}
                    >
                      <Info16Regular className="w-ic" aria-hidden="true" />
                    </span>
                  </Tooltip>
                )}
              </div>
              <div
                className="v"
                title={metric.tooltip === '—' ? undefined : metric.tooltip}
                style={metric.tone ? { color: metric.tone } : undefined}
              >
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-split-3565">
        <div className="w-stack">
          <div className="w-card">
            <header>
              <h2><Lightbulb20Regular className="w-ic" aria-hidden="true" /> Recommendations</h2>
              {recCounts.high > 0 && <WorkspaceBadge tone="err">{recCounts.high} high</WorkspaceBadge>}
              {recCounts.medium > 0 && <WorkspaceBadge tone="warn">{recCounts.medium} medium</WorkspaceBadge>}
              {recCounts.low > 0 && <WorkspaceBadge tone="info">{recCounts.low} low</WorkspaceBadge>}
            </header>
            <div className="body">
              {sortedRecommendations.length ? sortedRecommendations.map((rec) => {
                const showLink = !!rec.turnId && rec.turnNumber !== undefined && !linkedTurns.has(rec.turnNumber);
                if (showLink && rec.turnNumber !== undefined) linkedTurns.add(rec.turnNumber);
                const recClass =
                  rec.severity === 'high' ? 'w-rec high' : rec.severity === 'medium' ? 'w-rec medium' : 'w-rec low';
                return (
                  <div key={rec.id} className={recClass}>
                    <div className="rh">
                      <span>{severityIcon(rec.severity)}</span>
                      <span className="rt">{rec.title}</span>
                      <WorkspaceBadge>{rec.category}</WorkspaceBadge>
                      {showLink && (
                        <Button appearance="transparent" className="w-btn subtle" type="button" onClick={() => onTurnSelect(rec.turnId!)}>
                          Go to turn {rec.turnNumber} <ArrowRight16Regular className="w-ic" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <p>{rec.description}</p>
                    <div className="fix"><b>Suggested fix — </b>{rec.suggestion}</div>
                  </div>
                );
              }) : (
                <div className="w-muted"><CheckmarkCircle20Filled className="w-ic" aria-hidden="true" /> No issues detected in this conversation.</div>
              )}
            </div>
          </div>

          <div className="w-card">
            <header>
              <h2><Database20Regular className="w-ic" aria-hidden="true" /> Session{displayedSessionCount > 1 ? 's' : ''} &amp; runtime</h2>
              {displayedSessionCount > 1 && <WorkspaceBadge>{displayedSessionCount} sessions</WorkspaceBadge>}
            </header>
            <div className="body">
              {visibleSessions.map((session) => {
                const sessionOutcome = dedupeOutcome(safeText(session.outcome || outcome));
                const sessionSucceeded = /resolved|success/i.test(sessionOutcome);
                return (
                  <div className="w-sessrow" key={session.n}>
                    <div className="sh">
                      <span className="sn"><Clock16Regular className="w-ic" aria-hidden="true" /> Session {session.n}</span>
                      <span className="sd">{formatSessionStart(session) || formatDate(session.startTimeUtc)}</span>
                      <WorkspaceBadge tone={statusTone(sessionOutcome)}>{sessionOutcome}</WorkspaceBadge>
                      <span style={{ flex: 1 }} />
                      <span className="w-sub">{session.durationMs ? formatDuration(session.durationMs) : '—'}</span>
                    </div>
                    <dl className="w-kv compact">
                      <dt>Type</dt><dd>{safeText(session.type || g?.channelId, 'Conversation')}</dd>
                      <dt>Implied success</dt><dd>{sessionSucceeded ? 'Yes' : 'No'}</dd>
                      <dt>Turns</dt><dd>{session.turnCount}</dd>
                      <dt>Start · end (UTC)</dt><dd>{utcRange(session.startTimeUtc, session.durationMs, session.endTimeUtc)}</dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="w-stack">
          <div className="w-card">
            <header>
              <h2><Timer20Regular className="w-ic" aria-hidden="true" /> Time by step type</h2>
              <WorkspaceBadge>{formatDuration(totalBreakdownMs)} total</WorkspaceBadge>
            </header>
            <div className="w-bars">
              {insights.typeBreakdown.length ? insights.typeBreakdown.map((item) => {
                const color = componentColor(item.type);
                return (
                  <div key={item.type} className="w-barrow">
                    <div className="top">
                      <span className="nm">{item.type}<i className="w-dot" style={{ backgroundColor: color, display: 'inline-block', marginLeft: '6px' }} /></span>
                      <span className="vl">{item.count}× · {formatDuration(item.ms)} · {Math.round(item.ms / totalBreakdownMs * 100)}%</span>
                    </div>
                    <div className="tr"><i style={{ width: `${Math.max(2, item.ms / totalBreakdownMs * 100)}%`, backgroundColor: color }} /></div>
                  </div>
                );
              }) : <div className="w-muted">No timed steps in this conversation.</div>}
            </div>
          </div>

          <div className="w-card">
            <header>
              <h2><Wrench20Regular className="w-ic" aria-hidden="true" /> Tools &amp; actions used</h2>
              <WorkspaceBadge>{insights.toolUsage.length}</WorkspaceBadge>
            </header>
            <div className="w-bars">
              {insights.toolUsage.length ? insights.toolUsage.map((item) => (
                <div key={item.key} className="w-barrow">
                  <div className="top">
                    <span className="nm">{item.name}</span>
                    <span className="vl">{item.count}× · {formatDuration(item.totalMs)}</span>
                  </div>
                  <div className="tr"><i style={{ width: `${Math.max(2, item.totalMs / maxToolMs * 100)}%`, backgroundColor: componentColor(item.type) }} /></div>
                  <div style={{ fontSize: '11px', color: 'var(--colorNeutralForeground3)', marginTop: '2px' }}>{item.type} · <code>{item.taskDialogId.slice(0, 52)}</code></div>
                </div>
              )) : <div className="w-muted">No timed tools in this conversation.</div>}
            </div>
          </div>

          {feedbackEntries.length > 0 && <div className="w-card">
            <header>
              <h2><ThumbLike20Regular className="w-ic" aria-hidden="true" /> User feedback</h2>
              {positiveFeedbackCount > 0 && <WorkspaceBadge tone="ok">{positiveFeedbackCount} positive</WorkspaceBadge>}
              {negativeFeedbackCount > 0 && <WorkspaceBadge tone="err">{negativeFeedbackCount} negative</WorkspaceBadge>}
            </header>
            <div className="w-feedback-list">
              {feedbackEntries.map((entry) => {
                const isPositive = entry.rating === "thumbsUp";
                return (
                  <div className="w-feedback-card" key={entry.key}>
                    <div className="w-feedback-reaction">
                      {isPositive
                        ? <ThumbLike20Regular className="w-ic positive" aria-hidden="true" />
                        : <ThumbDislike20Regular className="w-ic negative" aria-hidden="true" />}
                      <WorkspaceBadge tone={isPositive ? "ok" : "err"}>
                        {isPositive ? "Thumbs up" : "Thumbs down"}
                      </WorkspaceBadge>
                    </div>
                    {entry.userMessage && (
                      <div className="w-feedback-field">
                        <b>User message</b>
                        <p>{truncateFeedbackText(entry.userMessage)}</p>
                      </div>
                    )}
                    {entry.agentMessage && (
                      <div className="w-feedback-field">
                        <b>Agent response</b>
                        <p>{truncateFeedbackText(entry.agentMessage)}</p>
                      </div>
                    )}
                    {entry.comment && (
                      <div className="w-feedback-comment">
                        <b>User feedback</b>
                        <p>{entry.comment}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>}

        </div>
      </div>
    </div>
  );
}
