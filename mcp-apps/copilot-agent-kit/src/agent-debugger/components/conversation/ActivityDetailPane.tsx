import { type ReactNode } from 'react';
import { Button, mergeClasses } from '@fluentui/react-components';
import {
  BookOpen20Regular,
  BrainCircuit20Regular,
  Dismiss20Regular,
  ErrorCircle20Regular,
  Info16Regular,
  Shield20Regular,
} from '@fluentui/react-icons';

import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { FlowStep } from '../../contracts/flow-step';
import type { ProcessedTurn, StepExecution } from '../../contracts/transcript';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { componentColor, DATA_SLOT } from '../../theme/component-colors';
import { useActivityStyles } from '../../styles/useActivityStyles';
import {
  badgeToneClass,
  useSurfaceStyles,
  type BadgeTone,
} from '../../styles/useSurfaceStyles';
import { execTimeToMs, guessStepSubtitle, resolveExecutionTimeString, resolveStepName } from '../../utils/step-classification';
import { fmtMs as fmtDuration } from '../../utils/format-ms';
import { stepDurationMs } from '../../utils/timeline-insights';
import { FlowStepDetailBody, FlowStepStatusBadges } from '../activities/FlowStepDetailBody';
import { ActivityTypeIcon } from '../ui/ActivityTypeIcon';
import { resolveActivityIconType } from '../ui/activity-icon-type';

type WorkflowNodeInfo = {
  id: string;
  title: string;
  subtitle: string;
  failed: boolean;
  turnNumber: number;
  flowStep?: FlowStep;
  sourceTurn?: ProcessedTurn;
  connectedAgent?: ConnectedAgentInfo;
};

type ActivityDetailPaneProps = {
  turn: ProcessedTurn | null;
  selectedNode: WorkflowNodeInfo | null;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  onFetchChildTranscript?: (agent: ConnectedAgentInfo) => void;
  snapshotMode?: boolean;
  onClearSelection: () => void;
  /** Renders only the detail sections, for details opened in place below an activity row. */
  embedded?: boolean;
  /** A short message about details that are not available, shown above the details. */
  note?: string;
};

type JsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

type JsonToken = {
  text: string;
  kind: JsonTokenKind;
};

type StatePresentation = {
  label: string;
  tone: BadgeTone;
};

function statePresentation(exec: StepExecution): StatePresentation {
  if (exec.blockedError) return { label: 'Blocked', tone: 'warn' };
  if (exec.errorMessage) return { label: 'Failed', tone: 'err' };

  if (typeof exec.state === 'number') {
    if (exec.state === 0) return { label: 'Running', tone: 'info' };
    if (exec.state === 1) return { label: 'Completed', tone: 'ok' };
    return { label: 'Failed', tone: 'err' };
  }

  const state = exec.state?.trim();
  if (!state) return { label: 'Completed', tone: 'ok' };

  const normalized = state.toLowerCase().replace(/[\s_-]/g, '');
  if (['completed', 'complete', 'succeeded', 'success'].includes(normalized)) {
    return { label: 'Completed', tone: 'ok' };
  }
  if (['running', 'inprogress', 'started', 'pending'].includes(normalized)) {
    return { label: 'Running', tone: 'info' };
  }
  if (normalized.includes('block')) return { label: 'Blocked', tone: 'warn' };
  if (normalized.includes('cancel')) return { label: 'Cancelled', tone: 'warn' };
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('fault')
  ) {
    return { label: 'Failed', tone: 'err' };
  }

  return { label: state, tone: 'neutral' };
}

function formatDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function execDuration(exec: StepExecution): string {
  const resolved = resolveExecutionTimeString(exec);
  const ms = resolved ? execTimeToMs(resolved) : stepDurationMs(exec);
  return ms > 0 ? fmtDuration(ms) : '';
}

function workflowIdForExec(turn: ProcessedTurn, exec: StepExecution): string {
  return `${turn.id}:${exec.taskDialogId}:${exec.stepId || exec.triggeredAt || ''}`;
}

function findExecution(turn: ProcessedTurn | null, node: WorkflowNodeInfo | null): StepExecution | undefined {
  if (!turn || !node) return undefined;
  return (turn.debugInfo?.stepExecutions ?? []).find((exec) => workflowIdForExec(turn, exec) === node.id);
}

function findConnectedAgent(exec: StepExecution | undefined, agents: ConnectedAgentInfo[] | undefined): ConnectedAgentInfo | undefined {
  if (!exec) return undefined;
  return (agents ?? []).find((agent) => {
    if (agent.stepId && exec.stepId && agent.stepId === exec.stepId) return true;
    if (agent.dialogSchemaName && agent.dialogSchemaName === exec.taskDialogId) return true;
    if (agent.botSchemaName && agent.botSchemaName === exec.taskDialogId) return true;
    return false;
  });
}

function tokensForJson(value: unknown): JsonToken[] {
  const replacer = (_key: string, current: unknown) => {
    if (typeof current === 'string' && current.length > 500) return `${current.slice(0, 500)}… [${current.length - 500} more characters]`;
    return current;
  };
  const text = typeof value === 'string' ? value : JSON.stringify(value, replacer, 2);
  const pattern = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ text: text.slice(last, index), kind: 'plain' });
    const raw = match[0];
    if (raw.startsWith('"') && /:\s*$/.test(raw)) {
      const quoteIndex = raw.lastIndexOf('"');
      tokens.push({ text: raw.slice(0, quoteIndex + 1), kind: 'key' });
      tokens.push({ text: raw.slice(quoteIndex + 1), kind: 'punct' });
    } else if (raw.startsWith('"')) {
      tokens.push({ text: raw, kind: 'string' });
    } else if (raw === 'true' || raw === 'false') {
      tokens.push({ text: raw, kind: 'boolean' });
    } else if (raw === 'null') {
      tokens.push({ text: raw, kind: 'null' });
    } else {
      tokens.push({ text: raw, kind: 'number' });
    }
    last = index + raw.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), kind: 'plain' });
  return tokens;
}

function JsonBlock({ value }: { value: unknown }) {
  const styles = useActivityStyles();
  const classForKind = (kind: JsonTokenKind): string | undefined => {
    switch (kind) {
      case 'key': return styles.jsonKey;
      case 'string': return styles.jsonString;
      case 'number': return styles.jsonNumber;
      case 'boolean': return styles.jsonBoolean;
      case 'null': return styles.jsonNull;
      case 'punct': return styles.jsonPunct;
      default: return undefined;
    }
  };
  return (
    <pre className={styles.json}>
      <code>
        {tokensForJson(value).map((token, index) => (
          <span key={`${index}-${token.kind}`} className={classForKind(token.kind)}>{token.text}</span>
        ))}
      </code>
    </pre>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  const styles = useActivityStyles();
  return (
    <section className={styles.section}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function iconClass(type: string, styles: ReturnType<typeof useActivityStyles>): string {
  const color = componentColor(type);
  if (color === DATA_SLOT.data2) return styles.iconData2;
  if (color === DATA_SLOT.data3) return styles.iconData3;
  if (color === DATA_SLOT.data7) return styles.iconData7;
  return styles.iconData1;
}

export function ActivityDetailNote({ text }: { text: string }) {
  const styles = useActivityStyles();
  return (
    <div className={styles.note} role="note">
      <Info16Regular aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function ActivityDetailPane({
  turn,
  selectedNode,
  componentNameBySchemaName,
  connectedAgents,
  onFetchChildTranscript,
  snapshotMode,
  onClearSelection,
  embedded,
  note,
}: ActivityDetailPaneProps) {
  const styles = useActivityStyles();
  const surface = useSurfaceStyles();
  const flowStep = selectedNode?.flowStep;
  const detailTurn = selectedNode?.sourceTurn ?? turn;
  const exec = findExecution(detailTurn, selectedNode);
  const type = exec
    ? exec.subtitle?.trim() || guessStepSubtitle(exec.taskDialogId, exec.type, componentNameBySchemaName?.[exec.taskDialogId], exec.observation) || 'Step'
    : selectedNode?.subtitle || 'Step';
  const title = exec
    ? exec.displayName?.trim() || resolveStepName(exec.taskDialogId, componentNameBySchemaName)
    : selectedNode?.title || '';
  const connectedAgent = selectedNode?.connectedAgent ?? findConnectedAgent(exec, connectedAgents);
  const durationLabel = exec ? execDuration(exec) : '';
  const iconType = resolveActivityIconType(type, {
    stepKind: flowStep?.kind,
    taskDialogId: flowStep?.taskDialogId,
    stepKey: flowStep?.key,
  });

  if (!selectedNode) {
    return (
      <div className={styles.empty}>
        {note ? <ActivityDetailNote text={note} /> : null}
        Select an activity to inspect its details.
      </div>
    );
  }

  const state = exec
    ? statePresentation(exec)
    : selectedNode.failed
      ? { label: 'Failed', tone: 'err' as const }
      : { label: 'Selected', tone: 'neutral' as const };

  return (
    <>
      {embedded ? null : <header className={surface.cardHeader}>
        <span className={mergeClasses(styles.detailIcon, iconClass(selectedNode.subtitle || type, styles))}>
          <ActivityTypeIcon type={iconType} />
        </span>
        <h2 className={mergeClasses(surface.cardTitle, styles.detailHeaderTitle)}>{title || selectedNode.title}</h2>
        <div className={surface.headerActions}>
          {flowStep ? <FlowStepStatusBadges step={flowStep} /> : null}
          <Button
            appearance="transparent"
            type="button"
            className="w-iconbtn"
            icon={<Dismiss20Regular aria-hidden="true" />}
            onClick={onClearSelection}
            aria-label="Close details"
          />
        </div>
      </header>}
      <div
        className={mergeClasses(embedded ? styles.detailBodyEmbedded : styles.detailBody, 'w-detailbody')}
        data-testid="activity-detail-body"
      >
        {note ? <ActivityDetailNote text={note} /> : null}
        {embedded && flowStep ? <div className={styles.embeddedBadges}><FlowStepStatusBadges step={flowStep} /></div> : null}
        <Section title="Overview">
          <dl className={surface.kv}>
            <dt className={surface.kvKey}>Type</dt>
            <dd className={surface.kvValue}>{type}</dd>
            <dt className={mergeClasses(surface.kvKey, surface.kvCentered)}>State</dt>
            <dd className={mergeClasses(surface.kvValue, surface.kvCentered)}>
              <span className={mergeClasses('w-badge', surface.badge, badgeToneClass(surface, state.tone))}>
                {state.label}
              </span>
            </dd>
            {durationLabel ? (
              <>
                <dt className={surface.kvKey}>Duration</dt>
                <dd className={surface.kvValue}>{durationLabel}</dd>
              </>
            ) : null}
            {exec?.triggeredAt ? (
              <>
                <dt className={surface.kvKey}>Triggered</dt>
                <dd className={surface.kvValue}>{formatDate(exec.triggeredAt)}</dd>
              </>
            ) : null}
            {exec?.finishedAt ? (
              <>
                <dt className={surface.kvKey}>Finished</dt>
                <dd className={surface.kvValue}>{formatDate(exec.finishedAt)}</dd>
              </>
            ) : null}
            {exec?.taskDialogId ? (
              <>
                <dt className={surface.kvKey}>Task dialog ID</dt>
                <dd className={surface.kvValue}><code>{exec.taskDialogId}</code></dd>
              </>
            ) : null}
          </dl>
        </Section>

        {!flowStep && exec?.thought ? <Section title={<><BrainCircuit20Regular aria-hidden="true" /> Thought</>}><div className={styles.quote}>{exec.thought}</div></Section> : null}
        {exec?.errorMessage ? <Section title={<><ErrorCircle20Regular aria-hidden="true" /> Error</>}><div className={mergeClasses(styles.quote, styles.quoteError)}>{exec.errorMessage}</div></Section> : null}

        {/*
          Type-specific detail. `FlowStepDetailBody` reuses the legacy debug
          panel's renderers, so a step shows Description / Inputs / Outputs /
          Sources / Token usage exactly as before instead of a raw JSON dump.
          It is rendered flat rather than nested under a "Details" heading so
          its sections sit at the same level as Overview — matching the
          prototype's flat `.w-sec` list in `detailPane()`.
          The generic JSON sections below remain only as a fallback for nodes
          that carry no FlowStep payload.
        */}
        {flowStep && flowStep.hasDetail !== false ? (
          <FlowStepDetailBody
            step={flowStep}
            turn={detailTurn}
            componentNameBySchemaName={componentNameBySchemaName}
            connectedAgent={connectedAgent}
          />
        ) : null}

        {!flowStep && exec?.blockedError ? <Section title={<><Shield20Regular aria-hidden="true" /> Blocked</>}><JsonBlock value={exec.blockedError} /></Section> : null}
        {!flowStep && exec?.arguments && Object.keys(exec.arguments).length ? <Section title="Inputs"><JsonBlock value={exec.arguments} /></Section> : null}
        {!flowStep && exec?.observation !== undefined && exec?.observation !== null ? <Section title="Outputs"><JsonBlock value={exec.observation} /></Section> : null}
        {!flowStep && exec?.knowledgeSources ? <Section title={<><BookOpen20Regular aria-hidden="true" /> Knowledge sources</>}><JsonBlock value={exec.knowledgeSources} /></Section> : null}
        {!flowStep && exec?.tokenInfo ? <Section title="Tokens"><JsonBlock value={exec.tokenInfo} /></Section> : null}
        {connectedAgent && onFetchChildTranscript && !snapshotMode && !connectedAgent.isFetched ? (
          <Section title="Connected agent">
            <Button
              appearance="transparent"
              type="button"
              className={mergeClasses(surface.button, surface.buttonSmall)}
              disabled={connectedAgent.isFetching}
              onClick={() => onFetchChildTranscript(connectedAgent)}
            >
              {connectedAgent.isFetching
                ? 'Fetching child transcript...'
                : connectedAgent.fetchError
                  ? 'Retry child transcript'
                  : 'Fetch child transcript'}
            </Button>
            {connectedAgent.fetchError ? (
              <div className={mergeClasses(styles.quote, styles.quoteError)} aria-live="polite">
                {connectedAgent.fetchError}
              </div>
            ) : null}
          </Section>
        ) : null}
      </div>
    </>
  );
}

export default ActivityDetailPane;
