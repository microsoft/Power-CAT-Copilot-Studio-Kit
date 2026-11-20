import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Subtitle2,
  Toolbar,
  Tooltip,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, Dismiss24Regular } from '@fluentui/react-icons';

import type { ProcessedTranscript } from '../../contracts/transcript';
import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { WorkflowCanvas } from '../flow/WorkflowCanvas';
import {
  useWorkflowCanvasModel,
  type WorkflowStats,
  type WorkflowTurn,
} from '../flow/WorkflowCanvasModel';
import { SurfaceCard } from '../common/SurfaceCard';
import { ComponentLegend } from '../common/ComponentLegend';
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
 * Read-only workflow-designer canvas matching the approved HTML/CSS prototype.
 */
export function ExecutionFlowTab({
  transcript,
  componentNameBySchemaName,
  connectedAgents,
  environmentUrl,
  onInspectTurn,
  selectedTurnId,
}: ExecutionFlowTabProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const model = useWorkflowCanvasModel(transcript.turns, componentNameBySchemaName, connectedAgents);
  const [rawTurn, setRawTurn] = useState<WorkflowTurn | null>(null);
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
  const downloadRawTurn = useCallback(() => {
    if (!rawTurn || !rawTurnText) return;

    const url = URL.createObjectURL(
      new Blob([rawTurnText], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = rawTurn.assistantTurn.role === 'user'
      ? `execution-flow-turn-${rawTurn.turnNumber}.json`
      : 'execution-flow-conversation-start.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [rawTurn, rawTurnText]);

  useEffect(() => {
    if (!selectedTurnId) return;
    const frame = window.requestAnimationFrame(() => {
      const flow = flowRef.current;
      const target = flow?.querySelector<HTMLElement>(
        `[data-turn-id="${CSS.escape(selectedTurnId)}"]`,
      );
      if (!target) return;

      const app = target.closest<HTMLElement>('.w-app');
      const stickyOffset = app
        ? Number.parseFloat(
            window.getComputedStyle(app).getPropertyValue('--debugger-sticky-offset'),
          ) || 0
        : 0;
      focusNavigationTarget(target, { block: 'start', topOffset: stickyOffset });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedTurnId, transcript]);

  return (
    <>
      <SurfaceCard
        title={<FlowStats stats={model.stats} />}
        actions={<ComponentLegend types={model.types} />}
      >
        <div ref={flowRef}>
          <WorkflowCanvas
            turns={transcript.turns}
            componentNameBySchemaName={componentNameBySchemaName}
            connectedAgents={connectedAgents}
            environmentUrl={environmentUrl}
            clickable={false}
            showTurnActions
            onShowRawTurn={setRawTurn}
            onInspectTurn={(turn) => onInspectTurn?.(turn.id)}
            selectedTurnId={selectedTurnId}
          />
        </div>
      </SurfaceCard>

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
              <Subtitle2>{rawTurn?.assistantTurn.role === 'assistant' ? 'Conversation start JSON' : rawTurn ? `Turn ${rawTurn.turnNumber} JSON` : 'Turn JSON'}</Subtitle2>
              <Toolbar>
                <CopyButton value={rawTurnText} size="medium" />
                <Tooltip content="Download JSON" relationship="label">
                  <Button
                    appearance="subtle"
                    aria-label="Download JSON"
                    icon={<ArrowDownload24Regular />}
                    onClick={downloadRawTurn}
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
              {rawTurnData ? <JsonViewer data={rawTurnData} enableSearch /> : null}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

export default ExecutionFlowTab;
