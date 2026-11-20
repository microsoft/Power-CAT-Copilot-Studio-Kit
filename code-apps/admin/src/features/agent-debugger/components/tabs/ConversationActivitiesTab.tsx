import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Link, Spinner, mergeClasses } from '@fluentui/react-components';
import { ChatMultiple20Regular, Code20Regular } from '@fluentui/react-icons';

import type { ProcessedTurn } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { ComponentInfo } from '../../services/botcomponents-service';
import type { TranscriptData as FluentTranscriptData } from '../ui';
import { SurfaceCard } from '../common/SurfaceCard';
import { WorkflowCanvas } from '../flow/WorkflowCanvas';
import { ConversationPane } from '../conversation/ConversationPane';
import { ActivityDetailPane } from '../conversation/ActivityDetailPane';
import { useActivityStyles } from '../../styles/useActivityStyles';
import { useSurfaceStyles } from '../../styles/useSurfaceStyles';
import { focusNavigationTarget } from '../../utils/focus-navigation-target';

type WorkflowNodeInfo = import('../flow/WorkflowCanvasModel').WorkflowNodeInfo;

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
  environmentId?: string;
  conversationId?: string;
  emptyMessage?: string;
  isLoadingSteps?: boolean;
  isLoading?: boolean;
  offlineMode?: boolean;
  /** Hidden offline panels retain state without moving focus or scrolling. Defaults to active. */
  active?: boolean;
  messageLabels?: Record<string, string>;
  selectableMessageIds?: string[];
  renderFlowRunLink?: ComponentProps<typeof ActivityDetailPane>['renderFlowRunLink'];
}

/**
 * Tab 3 — Conversation & activities.
 *
 * Rebuilds the approved prototype's `.w-trigroup > .w-tri` composition: a
 * conversation card, a compact workflow canvas and a sticky detail card that
 * all start on the same y-axis. The legacy DebugPanel is intentionally not used.
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
    environmentId,
    conversationId,
    emptyMessage,
    isLoadingSteps,
    isLoading,
    offlineMode,
    active = true,
    messageLabels,
    selectableMessageIds,
    renderFlowRunLink,
  },
  conversationContentRef,
) {
  const activityStyles = useActivityStyles();
  const surface = useSurfaceStyles();
  const activityListRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const [activityFocusRequest, setActivityFocusRequest] = useState(0);
  const [nodeSelection, setNodeSelection] = useState<{
    turnKey: string;
    node: WorkflowNodeInfo;
  } | null>(null);
  const selectedTurnKey = selectedTurn?.id ?? selectedUserMessageId ?? '';
  const selectedNode =
    nodeSelection?.turnKey === selectedTurnKey ? nodeSelection.node : null;
  const selectedTurns = useMemo(() => (selectedTurn ? [selectedTurn] : []), [selectedTurn]);
  const handleUserMessageClick = useCallback((messageId: string) => {
    setActivityFocusRequest((request) => request + 1);
    onUserMessageClick(messageId);
  }, [onUserMessageClick]);
  const handleClearSelection = useCallback(() => {
    const activities = activityListRef.current;
    const target = activities?.querySelector<HTMLElement>('button[aria-current="true"]') ??
      activities?.querySelector<HTMLElement>('button:not([disabled])') ??
      activities?.closest('.w-tri')?.querySelector<HTMLElement>('.w-chat button[aria-current="true"], .w-chat [role="button"]');
    setNodeSelection(null);
    target?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!selectedTurnKey || isLoading || isLoadingSteps) return;
    const frame = window.requestAnimationFrame(() => {
      if (!activeRef.current) return;
      const firstActivity = activityListRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      if (!firstActivity) return;

      const app = firstActivity.closest<HTMLElement>('.w-app');
      const stickyOffset = app
        ? Number.parseFloat(
            window.getComputedStyle(app).getPropertyValue('--debugger-sticky-offset'),
          ) || 0
        : 0;
      focusNavigationTarget(firstActivity, {
        block: 'start',
        behavior: 'auto',
        topOffset: stickyOffset,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityFocusRequest, isLoading, isLoadingSteps, selectedTurnKey]);

  return (
    <div className={activityStyles.triGroup}>
      <div className={mergeClasses('w-tri', activityStyles.tri)}>
        <SurfaceCard
          className={activityStyles.conversationCard}
          title="Conversation preview"
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
              ref={conversationContentRef}
              data={transcriptData}
              componentNameBySchemaName={componentNameBySchemaName}
              selectedUserMessageId={selectedUserMessageId}
              turnDurationByMessageId={turnDurationByMessageId}
              onUserMessageClick={handleUserMessageClick}
              messageLabels={messageLabels}
              selectableMessageIds={selectableMessageIds}
            />
          )}
        </SurfaceCard>

        <div ref={activityListRef} className={mergeClasses('w-work', activityStyles.work)} role="region" aria-label="Activities">
          {isLoading || isLoadingSteps ? (
            <div className={surface.muted}>
              <Spinner size="small" label="Analyzing activities..." />
            </div>
          ) : selectedTurn ? (
            <WorkflowCanvas
              turns={selectedTurns}
              componentNameBySchemaName={componentNameBySchemaName}
              connectedAgents={connectedAgents}
              environmentUrl={environmentUrl}
              offlineMode={offlineMode}
              compact
              clickable
              autoSelectFirst={active}
              selectedNodeId={selectedNode?.id}
              onNodeSelect={(node) =>
                setNodeSelection((current) =>
                  current?.turnKey === selectedTurnKey && current.node.id === node.id
                    ? null
                    : { turnKey: selectedTurnKey, node },
                )
              }
              showTurnActions={false}
            />
          ) : (
            <div className={surface.muted}>{emptyMessage || 'Select a user message to inspect its activities.'}</div>
          )}
        </div>

        <div className={activityStyles.detail}>
          <SurfaceCard className={activityStyles.detailCard}>
            <ActivityDetailPane
              turn={selectedTurn}
              selectedNode={selectedNode}
              componentNameBySchemaName={componentNameBySchemaName}
              connectedAgents={connectedAgents}
              onFetchChildTranscript={onFetchChildTranscript}
              snapshotMode={snapshotMode}
              environmentUrl={environmentUrl}
              environmentId={environmentId}
              conversationId={conversationId}
              onClearSelection={handleClearSelection}
              renderFlowRunLink={renderFlowRunLink}
              offlineMode={offlineMode}
            />
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
});

export default ConversationActivitiesTab;
