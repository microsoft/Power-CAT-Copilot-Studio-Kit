import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Spinner, mergeClasses } from '@fluentui/react-components';
import { ChatMultiple20Regular, Code20Regular, TaskListLtr20Regular } from '@fluentui/react-icons';

import type { ProcessedTurn } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { ComponentInfo } from '../../services/botcomponents-service';
import type { TranscriptData as FluentTranscriptData } from '../ui';
import { SurfaceCard } from '../common/SurfaceCard';
import { firstSelectableNode, nodeInfo } from '../flow/WorkflowCanvas';
import {
  useWorkflowCanvasModel,
  type WorkflowNode,
  type WorkflowRow,
  type WorkflowTurn,
} from '../flow/WorkflowCanvasModel';
import { ConversationPane } from '../conversation/ConversationPane';
import { ActivityDetailNote, ActivityDetailPane } from '../conversation/ActivityDetailPane';
import { ActivityTimeline } from '../conversation/ActivityTimeline';
import { useActivityLayout } from '../conversation/useActivityLayout';
import { useActivityStyles } from '../../styles/useActivityStyles';
import { useSurfaceStyles } from '../../styles/useSurfaceStyles';
import { fmtMs } from '../../utils/format-ms';

export interface ConversationActivitiesTabProps {
  transcriptData: FluentTranscriptData;
  selectedTurn: ProcessedTurn | null;
  selectedUserMessageId?: string;
  /** Measured turn span keyed by opening user message id — renders "Turn N · 1m 50s". */
  turnDurationByMessageId?: Record<string, number>;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  onUserMessageClick: (messageId: string) => void;
  onFetchChildTranscript?: (agent: ConnectedAgentInfo) => void;
  onViewJson?: () => void;
  canViewJson?: boolean;
  snapshotMode?: boolean;
  environmentUrl?: string;
  emptyMessage?: string;
  isLoadingSteps?: boolean;
  isLoading?: boolean;
  /**
   * All turns in view. A user turn and its replies form one activity group, so the
   * activities of the selected turn come from these turns. Defaults to the selected turn.
   */
  activityTurns?: ProcessedTurn[];
  /** A short message about activity details that are not available, for the selected turn. */
  activityNote?: string;
}

type Pane = 'conversation' | 'activities';

export function findWorkflowTurn(turns: WorkflowTurn[], turnId: string): WorkflowTurn | null {
  return turns.find((turn) => turn.id === turnId)
    ?? turns.find((turn) => turn.assistantTurn?.id === turnId)
    ?? null;
}

/** The selectable activities of a turn by id, including the steps of connected agents. */
export function indexNodes(rows: WorkflowRow[]): Map<string, WorkflowNode> {
  const nodes = new Map<string, WorkflowNode>();
  for (const row of rows) {
    if (row.kind === 'reason') continue;
    nodes.set(row.node.id, row.node);
    if (row.kind === 'agent') {
      for (const child of row.children) if (!child.isReasoning) nodes.set(child.id, child);
    }
  }
  return nodes;
}

/**
 * Tab 3 — Conversation & activities.
 *
 * The conversation and the activity list of the selected turn sit side by side and never
 * stack. From 1080 px a third column shows the details of the selected activity. From 640 px
 * to 1079 px (the inline view) the details open in place below an activity. Below 640 px a
 * switch shows one pane at a time. Each pane scrolls inside its own box; the page does not.
 */
export const ConversationActivitiesTab = forwardRef<
  HTMLDivElement,
  ConversationActivitiesTabProps
>(function ConversationActivitiesTab(
  {
    transcriptData,
    selectedTurn,
    selectedUserMessageId,
    turnDurationByMessageId,
    componentNameBySchemaName,
    connectedAgents,
    onUserMessageClick,
    onFetchChildTranscript,
    onViewJson,
    canViewJson,
    snapshotMode,
    environmentUrl,
    emptyMessage,
    isLoadingSteps,
    isLoading,
    activityTurns,
    activityNote,
  },
  conversationContentRef,
) {
  const styles = useActivityStyles();
  const surface = useSurfaceStyles();
  const layout = useActivityLayout();
  const [pane, setPane] = useState<Pane>('conversation');
  // nodeId null: the user closed the details of this turn. No entry: the layout default applies.
  const [selection, setSelection] = useState<{ turnKey: string; nodeId: string | null } | null>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const chatClick = useRef<string | undefined>(undefined);
  const revealedIn = useRef<HTMLElement | null>(null);

  const selectedTurnKey = selectedTurn?.id ?? selectedUserMessageId ?? '';
  const modelTurns = useMemo(
    () => activityTurns ?? (selectedTurn ? [selectedTurn] : []),
    [activityTurns, selectedTurn],
  );
  const model = useWorkflowCanvasModel(modelTurns, componentNameBySchemaName, connectedAgents);
  const workflowTurn = selectedTurn ? findWorkflowTurn(model.turns, selectedTurn.id) : null;
  const rows = useMemo(() => workflowTurn?.rows ?? [], [workflowTurn]);
  const nodes = useMemo(() => indexNodes(rows), [rows]);
  const chosenNodeId = selection?.turnKey === selectedTurnKey ? selection.nodeId : undefined;
  // Three columns always show details, so the first selectable activity opens by default.
  const defaultNodeId = layout === 'tri' && workflowTurn
    ? firstSelectableNode([workflowTurn])?.id ?? null
    : null;
  const openNodeId = chosenNodeId !== undefined ? chosenNodeId : defaultNodeId;
  const openNode = openNodeId ? nodes.get(openNodeId) ?? null : null;
  const turnLabel = workflowTurn ? `Turn ${workflowTurn.turnNumber}` : 'Selected turn';

  const setChatRef = useCallback((element: HTMLDivElement | null) => {
    chatRef.current = element;
    if (typeof conversationContentRef === 'function') conversationContentRef(element);
    else if (conversationContentRef) conversationContentRef.current = element;
  }, [conversationContentRef]);

  const handleUserMessageClick = useCallback((messageId: string) => {
    chatClick.current = messageId;
    if (layout === 'single') setPane('activities');
    onUserMessageClick(messageId);
  }, [layout, onUserMessageClick]);

  const activate = useCallback((node: WorkflowNode) => {
    setSelection((current) => {
      if (layout === 'tri') return { turnKey: selectedTurnKey, nodeId: node.id };
      const openId = current?.turnKey === selectedTurnKey ? current.nodeId : null;
      return { turnKey: selectedTurnKey, nodeId: openId === node.id ? null : node.id };
    });
  }, [layout, selectedTurnKey]);

  const clearSelection = useCallback(() => {
    setSelection({ turnKey: selectedTurnKey, nodeId: null });
  }, [selectedTurnKey]);

  // A new turn starts at the top of the activity pane. Only that pane scrolls, never the page.
  useEffect(() => {
    if (activityScrollRef.current) activityScrollRef.current.scrollTop = 0;
  }, [selectedTurnKey]);

  // A turn selected outside the conversation (for example from the Execution flow), or a
  // conversation pane that shows again, brings the selected turn into view inside that pane only.
  useEffect(() => {
    const chat = chatRef.current;
    if (!chat || !selectedUserMessageId) return;
    const shownAgain = revealedIn.current !== chat;
    revealedIn.current = chat;
    if (!shownAgain && chatClick.current === selectedUserMessageId) return;
    const message = Array.from(chat.querySelectorAll<HTMLElement>('[data-message-id]'))
      .find((element) => element.dataset.messageId === selectedUserMessageId);
    const target = message?.parentElement ?? message;
    if (!target) return;
    const chatBox = chat.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    if (box.top >= chatBox.top && box.bottom <= chatBox.bottom) return;
    chat.scrollTop += box.top - chatBox.top - 8;
  }, [selectedUserMessageId, layout, pane, isLoading]);

  const compactLayout = layout !== 'tri';
  const activityList = isLoading ? (
    <div className={surface.muted}>
      <Spinner size="small" label="Analyzing activities..." />
    </div>
  ) : rows.length ? (
    <>
      {workflowTurn?.userText ? (
        <p className={styles.turnQuestion} title={workflowTurn.userText}>“{workflowTurn.userText}”</p>
      ) : null}
      <ActivityTimeline
        rows={rows}
        mode={layout === 'tri' ? 'select' : 'expand'}
        openNodeId={openNodeId}
        onActivate={activate}
        renderDetail={layout === 'tri' ? undefined : (node) => (
          <ActivityDetailPane
            embedded
            turn={selectedTurn}
            selectedNode={nodeInfo(node)}
            componentNameBySchemaName={componentNameBySchemaName}
            connectedAgents={connectedAgents}
            onFetchChildTranscript={onFetchChildTranscript}
            snapshotMode={snapshotMode}
            onClearSelection={clearSelection}
            note={activityNote}
          />
        )}
        compact={compactLayout}
        environmentUrl={environmentUrl}
        label={`${turnLabel} activities`}
      />
    </>
  ) : isLoadingSteps ? (
    <div className={surface.muted}>
      <Spinner size="small" label="Analyzing activities..." />
    </div>
  ) : selectedTurn ? (
    <div className={styles.paneEmpty}>
      {activityNote && layout !== 'tri' ? <ActivityDetailNote text={activityNote} /> : null}
      No activities were recorded for this turn.
    </div>
  ) : (
    <div className={styles.paneEmpty}>{emptyMessage || 'Select a user message to inspect its activities.'}</div>
  );

  const conversationCard = (
    <SurfaceCard
      className={styles.pane}
      title={compactLayout ? 'Conversation' : 'Conversation preview'}
      icon={<ChatMultiple20Regular className="w-ic" aria-hidden="true" />}
      actions={
        onViewJson ? (
          <Link onClick={onViewJson} disabled={!canViewJson} className="w-btn subtle">
            <Code20Regular className="w-ic" aria-hidden="true" /> Raw JSON
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className={surface.muted}>
          <Spinner size="small" label="Loading conversation..." />
        </div>
      ) : (
        <ConversationPane
          ref={setChatRef}
          data={transcriptData}
          selectedUserMessageId={selectedUserMessageId}
          turnDurationByMessageId={turnDurationByMessageId}
          onUserMessageClick={handleUserMessageClick}
        />
      )}
    </SurfaceCard>
  );

  const activitiesCard = (
    <SurfaceCard
      className={styles.pane}
      title="Activities"
      icon={<TaskListLtr20Regular className="w-ic" aria-hidden="true" />}
      actions={workflowTurn ? (
        <span className={styles.paneHeaderMeta}>
          {isLoadingSteps && rows.length ? <Spinner size="extra-tiny" aria-label="Loading activity details" /> : null}
          <span className="w-badge info">{turnLabel}</span>
          {workflowTurn.durationMs ? <span className="w-badge neutral">{fmtMs(workflowTurn.durationMs)}</span> : null}
        </span>
      ) : undefined}
    >
      <div ref={activityScrollRef} className={styles.paneScroll} data-testid="activity-pane">
        {activityList}
      </div>
    </SurfaceCard>
  );

  return (
    <div className={mergeClasses(styles.triGroup, compactLayout && styles.triGroupCompact)} data-layout={layout}>
      {layout === 'single' ? (
        <div className={styles.switcher} role="group" aria-label="Pane">
          <button
            type="button"
            className={styles.switchButton}
            aria-pressed={pane === 'conversation'}
            onClick={() => setPane('conversation')}
          >
            <ChatMultiple20Regular className="w-ic" aria-hidden="true" /> Conversation
          </button>
          <button
            type="button"
            className={styles.switchButton}
            aria-pressed={pane === 'activities'}
            onClick={() => setPane('activities')}
          >
            <TaskListLtr20Regular className="w-ic" aria-hidden="true" /> Activities
          </button>
        </div>
      ) : null}
      <div className={mergeClasses(styles.tri, layout === 'tri' && styles.triColumns, layout === 'duo' && styles.duoColumns)}>
        {layout !== 'single' || pane === 'conversation' ? conversationCard : null}
        {layout !== 'single' || pane === 'activities' ? activitiesCard : null}
        {layout === 'tri' ? (
          <SurfaceCard className={mergeClasses(styles.pane, styles.detailCard)}>
            <ActivityDetailPane
              turn={selectedTurn}
              selectedNode={openNode ? nodeInfo(openNode) : null}
              componentNameBySchemaName={componentNameBySchemaName}
              connectedAgents={connectedAgents}
              onFetchChildTranscript={onFetchChildTranscript}
              snapshotMode={snapshotMode}
              onClearSelection={clearSelection}
              note={activityNote}
            />
          </SurfaceCard>
        ) : null}
      </div>
    </div>
  );
});

export default ConversationActivitiesTab;
