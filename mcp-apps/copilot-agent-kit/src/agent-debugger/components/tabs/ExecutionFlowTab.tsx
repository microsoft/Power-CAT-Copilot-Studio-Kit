import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle2,
  Toolbar,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, ChatMultiple20Regular, Dismiss24Regular } from '@fluentui/react-icons';

import type { ProcessedTranscript, ProcessedTurn } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { ComponentInfo } from '../../services/botcomponents-service';
import type { TranscriptData as FluentTranscriptData } from '../ui';
import { WorkflowCanvas, firstSelectableNode, nodeInfo } from '../flow/WorkflowCanvas';
import {
  useWorkflowCanvasModel,
  type WorkflowNode,
  type WorkflowNodeInfo,
  type WorkflowStats,
  type WorkflowTurn,
} from '../flow/WorkflowCanvasModel';
import { SurfaceCard } from '../common/SurfaceCard';
import { ComponentLegend } from '../common/ComponentLegend';
import { ConversationPane } from '../conversation/ConversationPane';
import { ActivityDetailPane } from '../conversation/ActivityDetailPane';
import { useActivityLayout } from '../conversation/useActivityLayout';
import { findWorkflowTurn, indexNodes } from './ConversationActivitiesTab';
import { useActivityStyles } from '../../styles/useActivityStyles';
import { useSurfaceStyles } from '../../styles/useSurfaceStyles';
import CopyButton from '../ui/CopyButton';
import { JsonViewer } from '../ui';
import { focusNavigationTarget } from '../../utils/focus-navigation-target';

export interface ExecutionFlowTabProps {
  transcript: ProcessedTranscript;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  environmentUrl?: string;
  onInspectTurn?: (turnId: string) => void;
  selectedTurnId?: string;
  onDownloadJson?: (text: string, fileName: string) => Promise<void>;
  downloadSupported?: boolean;
  /**
   * Full screen only. From 1080 px, the conversation and the details of the selected step
   * show beside the flow, and the steps are selectable. Needs `transcriptData`.
   */
  detailColumns?: boolean;
  transcriptData?: FluentTranscriptData;
  selectedTurn?: ProcessedTurn | null;
  /** Selects a turn without a tab change, so that its details load. */
  onSelectTurn?: (turnId: string) => void;
  onFetchChildTranscript?: (agent: ConnectedAgentInfo) => void;
  isLoadingSteps?: boolean;
  /** A short message about step details that are not available, for the selected turn. */
  activityNote?: string;
}

/**
 * `.w-fstats` / `.w-fstat` — emitted verbatim so the globally-loaded
 * `styles/design/workspace.css` styles them; no Griffel rules needed.
 */
function FlowStats({ stats }: { stats: WorkflowStats }) {
  return (
    <div className="w-fstats" aria-label="Execution flow summary">
      <div className="w-fstat">
        <span className="l">Steps</span>
        <span className="v">{stats.steps}</span>
      </div>
      {stats.agentHandoffs ? (
        <div className="w-fstat">
          <span className="l">Agent handoffs</span>
          <span className="v">{stats.agentHandoffs}</span>
        </div>
      ) : null}
      {stats.failed ? (
        <div className="w-fstat">
          <span className="l">Failed</span>
          <span className="v" style={{ color: 'var(--colorPaletteRedForeground1)' }}>{stats.failed}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tab 2 — Execution flow.
 *
 * Read-only workflow-designer canvas matching the approved HTML/CSS prototype. In full
 * screen from 1080 px, the conversation, the flow and the details of the selected step
 * sit in three columns, and each column scrolls inside its own box.
 */
export function ExecutionFlowTab({
  transcript,
  componentNameBySchemaName,
  connectedAgents,
  environmentUrl,
  onInspectTurn,
  selectedTurnId,
  onDownloadJson,
  downloadSupported = true,
  detailColumns,
  transcriptData,
  selectedTurn,
  onSelectTurn,
  onFetchChildTranscript,
  isLoadingSteps,
  activityNote,
}: ExecutionFlowTabProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const model = useWorkflowCanvasModel(transcript.turns, componentNameBySchemaName, connectedAgents);
  const styles = useActivityStyles();
  const surface = useSurfaceStyles();
  const columns = useActivityLayout() === 'tri' && Boolean(detailColumns && transcriptData);
  // nodeId null: the user closed the details of this turn. No entry: the first step of the turn opens.
  const [selection, setSelection] = useState<{ turnKey: string; nodeId: string | null } | null>(null);
  // The column where the user selected the turn: the flow does not scroll for its own selection.
  const picked = useRef<{ turnId: string; from: 'flow' | 'chat' } | null>(null);
  const nodes = useMemo(() => {
    const byId = new Map<string, { turnId: string; node: WorkflowNode }>();
    if (columns) {
      for (const turn of model.turns) {
        for (const node of indexNodes(turn.rows).values()) byId.set(node.id, { turnId: turn.id, node });
      }
    }
    return byId;
  }, [columns, model.turns]);
  const turnKey = selectedTurnId ?? '';
  const workflowTurn = columns && turnKey ? findWorkflowTurn(model.turns, turnKey) : null;
  const chosenNodeId = selection?.turnKey === turnKey ? selection.nodeId : undefined;
  const openNodeId = chosenNodeId !== undefined
    ? chosenNodeId
    : workflowTurn ? firstSelectableNode([workflowTurn])?.id ?? null : null;
  const openNode = columns && openNodeId ? nodes.get(openNodeId)?.node ?? null : null;

  const selectNode = useCallback((node: WorkflowNodeInfo) => {
    const turnId = nodes.get(node.id)?.turnId ?? turnKey;
    setSelection({ turnKey: turnId, nodeId: node.id });
    if (turnId === turnKey) return;
    picked.current = { turnId, from: 'flow' };
    onSelectTurn?.(turnId);
  }, [nodes, turnKey, onSelectTurn]);

  const selectMessage = useCallback((messageId: string) => {
    picked.current = { turnId: messageId, from: 'chat' };
    onSelectTurn?.(messageId);
  }, [onSelectTurn]);
  const [rawTurn, setRawTurn] = useState<WorkflowTurn | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const rawTurnData = useMemo(
    () =>
      rawTurn
        ? {
            turnNumber: rawTurn.turnNumber,
            userText: rawTurn.userText,
            durationMs: rawTurn.durationMs,
            hasError: rawTurn.hasError,
            turn: rawTurn.assistantTurn,
          }
        : null,
    [rawTurn],
  );
  const rawTurnText = useMemo(
    () => (rawTurnData ? JSON.stringify(rawTurnData, null, 2) : ''),
    [rawTurnData],
  );
  const downloadRawTurn = useCallback(async () => {
    if (!rawTurn || !rawTurnText) return;
    const fileName = `execution-flow-turn-${rawTurn.turnNumber}.json`;
    setDownloadError("");
    setDownloading(true);
    try {
      if (onDownloadJson) {
        await onDownloadJson(rawTurnText, fileName);
      } else {
        const url = URL.createObjectURL(new Blob([rawTurnText], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "The JSON download failed.");
    } finally {
      setDownloading(false);
    }
  }, [rawTurn, rawTurnText, onDownloadJson]);

  useEffect(() => {
    if (!selectedTurnId) return;
    const from = picked.current?.turnId === selectedTurnId ? picked.current.from : undefined;
    if (columns && from === 'flow') return;
    const frame = window.requestAnimationFrame(() => {
      const flow = flowRef.current;
      const target = flow?.querySelector<HTMLElement>(
        `[data-turn-id="${CSS.escape(selectedTurnId)}"]`,
      );
      if (!target) return;

      // Three columns: only the flow column scrolls, and a message click keeps the focus.
      if (columns) {
        focusNavigationTarget(target, { block: 'start', container: flow, focusTarget: from === 'chat' ? null : target });
        return;
      }
      const app = target.closest<HTMLElement>('.w-app');
      const stickyOffset = app
        ? Number.parseFloat(
            window.getComputedStyle(app).getPropertyValue('--debugger-sticky-offset'),
          ) || 0
        : 0;
      focusNavigationTarget(target, { block: 'start', topOffset: stickyOffset });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedTurnId, transcript, columns]);

  // A turn selected in the flow shows its user message inside the conversation column only.
  useEffect(() => {
    const chat = chatRef.current;
    if (!columns || !chat || !selectedTurnId || (picked.current?.from === 'chat' && picked.current.turnId === selectedTurnId)) return;
    const message = Array.from(chat.querySelectorAll<HTMLElement>('[data-message-id]'))
      .find((element) => element.dataset.messageId === selectedTurnId);
    const target = message?.parentElement ?? message;
    if (!target) return;
    const chatBox = chat.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    if (box.top < chatBox.top || box.bottom > chatBox.bottom) chat.scrollTop += box.top - chatBox.top - 8;
  }, [columns, selectedTurnId]);

  const flowCard = (
    <SurfaceCard
      className={columns ? mergeClasses(styles.pane, styles.flowPane) : undefined}
      title={<FlowStats stats={model.stats} />}
      actions={<ComponentLegend types={model.types} />}
    >
      <div ref={flowRef} className={columns ? styles.paneScroll : undefined}>
        <WorkflowCanvas
          turns={transcript.turns}
          componentNameBySchemaName={componentNameBySchemaName}
          connectedAgents={connectedAgents}
          environmentUrl={environmentUrl}
          clickable={columns}
          selectedNodeId={openNode?.id}
          onNodeSelect={columns ? selectNode : undefined}
          showTurnActions
          onShowRawTurn={(turn) => { setDownloadError(""); setRawTurn(turn); }}
          onInspectTurn={(turn) => onInspectTurn?.(turn.id)}
          selectedTurnId={selectedTurnId}
        />
      </div>
    </SurfaceCard>
  );

  return (
    <>
      {columns && transcriptData ? (
        <div className={styles.triGroup} data-testid="flow-columns">
          <div className={mergeClasses(styles.tri, styles.flowColumns)}>
            <SurfaceCard
              className={styles.pane}
              title="Conversation"
              icon={<ChatMultiple20Regular className="w-ic" aria-hidden="true" />}
            >
              <ConversationPane
                ref={chatRef}
                data={transcriptData}
                selectedUserMessageId={selectedTurnId}
                onUserMessageClick={selectMessage}
              />
            </SurfaceCard>
            {flowCard}
            <SurfaceCard className={mergeClasses(styles.pane, styles.detailCard)}>
              {isLoadingSteps ? (
                <div className={surface.muted}>
                  <Spinner size="tiny" label="Loading step details..." />
                </div>
              ) : null}
              <ActivityDetailPane
                turn={selectedTurn ?? null}
                selectedNode={openNode ? nodeInfo(openNode) : null}
                componentNameBySchemaName={componentNameBySchemaName}
                connectedAgents={connectedAgents}
                onFetchChildTranscript={onFetchChildTranscript}
                onClearSelection={() => setSelection({ turnKey, nodeId: null })}
                note={activityNote}
              />
            </SurfaceCard>
          </div>
        </div>
      ) : flowCard}

      <Dialog
        open={rawTurn !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setRawTurn(null);
        }}
      >
        <DialogSurface
          style={{
            maxWidth: '90vw',
            width: '900px',
            height: '85vh',
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <DialogBody
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <DialogTitle
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Subtitle2>{rawTurn ? `Turn ${rawTurn.turnNumber} JSON` : 'Turn JSON'}</Subtitle2>
              <Toolbar>
                <CopyButton value={rawTurnText} size="medium" />
                <Tooltip content={downloadSupported ? "Download JSON" : "This host does not support downloads. Copy the JSON instead."} relationship="label">
                  <Button
                    appearance="subtle"
                    aria-label="Download JSON"
                    icon={<ArrowDownload24Regular />}
                    disabled={!downloadSupported || downloading}
                    onClick={() => void downloadRawTurn()}
                  />
                </Tooltip>
                <DialogTrigger action="close">
                  <Button appearance="subtle" aria-label="Close dialog" icon={<Dismiss24Regular />} />
                </DialogTrigger>
              </Toolbar>
            </DialogTitle>
            <DialogContent
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {downloadError && <MessageBar intent="error"><MessageBarBody>{downloadError}</MessageBarBody></MessageBar>}
              {rawTurnData ? <JsonViewer data={rawTurnData} enableSearch /> : null}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

export default ExecutionFlowTab;
