import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useEffect, useRef } from 'react';
import { Badge, Button, mergeClasses } from '@fluentui/react-components';
import {
  ArrowDown24Regular,
  BrainCircuit20Regular,
  ChatMultiple20Regular,
  Code20Regular,
  ErrorCircle16Regular,
  Open16Regular,
} from '@fluentui/react-icons';

import { DATA_SLOT } from '../../theme/component-colors';
import { NODE_WIDTH } from '../../theme/design-tokens';
import { useFlowStyles } from '../../styles/useFlowStyles';
import { useWorkflowCanvasModel, type WorkflowCanvasProps, type WorkflowNode, type WorkflowNodeInfo, type WorkflowRow, type WorkflowTurn } from './WorkflowCanvasModel';
export type { WorkflowCanvasProps, WorkflowTurn } from './WorkflowCanvasModel';
import { fmtMs as fmtDuration } from '../../utils/format-ms';
import { ActivityTypeIcon } from '../ui/ActivityTypeIcon';
import { resolveActivityIconType } from '../ui/activity-icon-type';
import { connectedAgentTranscriptUrls } from '../../utils/connected-agent-links';

export type { WorkflowNodeInfo } from './WorkflowCanvasModel';

export function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

export function Markdown({ text, className }: { text: string; className: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  const renderInline = (line: string, keyPrefix: string): ReactNode[] => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g);
    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)$/);
      if (link) return <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
      return <Fragment key={key}>{part}</Fragment>;
    });
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${i}`);
      blocks.push(level === 1 ? <h1 key={i}>{content}</h1> : level === 2 ? <h2 key={i}>{content}</h2> : <h3 key={i}>{content}</h3>);
      i += 1;
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.*)$/);
    if (unordered) {
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (!item) break;
        items.push(<li key={i}>{renderInline(item[1], `ul-${i}`)}</li>);
        i += 1;
      }
      blocks.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = lines[i].trim().match(/^\d+[.)]\s+(.*)$/);
        if (!item) break;
        items.push(<li key={i}>{renderInline(item[1], `ol-${i}`)}</li>);
        i += 1;
      }
      blocks.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    }

    if (/^(&gt;|>)\s?/.test(line)) {
      blocks.push(<blockquote key={i}>{renderInline(line.replace(/^(&gt;|>)\s?/, ''), `bq-${i}`)}</blockquote>);
      i += 1;
      continue;
    }

    blocks.push(<p key={i}>{renderInline(line, `p-${i}`)}</p>);
    i += 1;
  }

  return <div className={className}>{blocks}</div>;
}

export function nodeGlyphType(node: WorkflowNode): string {
  return resolveActivityIconType(node.subtitle, {
    stepKind: node.flowStep?.kind,
    taskDialogId: node.flowStep?.taskDialogId,
    stepKey: node.stepKey,
  });
}

function customProperties(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

export function nodeInfo(node: WorkflowNode): WorkflowNodeInfo {
  return {
    id: node.id,
    title: node.title,
    subtitle: node.subtitle,
    failed: node.failed,
    turnNumber: node.turnNumber,
    flowStep: node.flowStep,
    sourceTurn: node.sourceTurn,
    connectedAgent: node.connectedAgent,
  };
}

export function firstSelectableNode(turns: WorkflowTurn[]): WorkflowNodeInfo | null {
  for (const turn of turns) {
    for (const row of turn.rows) {
      if (row.kind === 'reason') continue;
      if (row.kind === 'standalone' && row.node.flowStep?.hasDetail === false) continue;
      return nodeInfo(row.node);
    }
  }
  return null;
}

/** Joins literal `.w-*` design classes, dropping falsy entries. */
function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

function WorkflowConnector() {
  return <div className="w-conn" aria-hidden="true" />;
}

function WorkflowReason({ thought, hasIn, hasOut = true }: { thought: string; hasIn: boolean; hasOut?: boolean }) {
  const styles = useFlowStyles();
  // No trailing connector here: reasoning is a first-class row in the chain, so
  // the chain loop already emits the connector between it and the next row.
  // Rendering one here too produced a doubled gap.
  return (
    <div className={mergeClasses(styles.reason, hasIn && styles.hasIn, hasOut && styles.hasOut)}>
      <strong className={styles.reasonLabel}>
        <BrainCircuit20Regular aria-hidden="true" /> Reasoning
      </strong>
      <Markdown className={styles.markdown} text={clip(thought, 1200)} />
    </div>
  );
}

function WorkflowNodeView({
  node,
  hasIn,
  hasOut,
  clickable,
  selectedNodeId,
  onNodeSelect,
}: {
  node: WorkflowNode;
  hasIn: boolean;
  hasOut: boolean;
  clickable: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: WorkflowNodeInfo) => void;
}) {
  const isSelected = selectedNodeId === node.id;
  const className = cx('w-rnode', hasIn && 'has-in', hasOut && 'has-out');
  const content = (
    <>
      <span className="glyph">
        <ActivityTypeIcon type={nodeGlyphType(node)} className="w-ic" />
      </span>
      <span className="lines">
        <span className="n1">{node.title}</span>
        <span className="n2">{node.subtitle}</span>
      </span>
      {node.failed ? (
        <span className="w-failed-status">
          <ErrorCircle16Regular className="w-ic" aria-hidden="true" />
          Failed
        </span>
      ) : null}
      <span className="dur">{node.duration}</span>
    </>
  );

  const style = customProperties({ '--nodeColor': node.color });
  if (clickable) {
    return (
      <Button
        appearance="transparent"
        type="button"
        className={className}
        style={style}
        aria-current={isSelected ? 'true' : undefined}
        title={`${node.title} — ${node.subtitle}`}
        onClick={() => onNodeSelect?.(nodeInfo(node))}
      >
        {content}
      </Button>
    );
  }

  return (
    <div className={className} style={style} title={`${node.title} — ${node.subtitle}`}>
      {content}
    </div>
  );
}

function WorkflowRowView({
  row,
  hasIn,
  hasOut,
  clickable,
  selectedNodeId,
  onNodeSelect,
  environmentUrl,
}: {
  row: WorkflowRow;
  hasIn: boolean;
  hasOut: boolean;
  clickable: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: WorkflowNodeInfo) => void;
  environmentUrl?: string;
}) {
  // Reasoning traces are inline text, not selectable cards — matching how the
  // legacy debug panel and Copilot Studio itself surface ThinkingTrace.
  if (row.kind === 'reason') {
    return <WorkflowReason thought={row.node.thought ?? ''} hasIn={hasIn} hasOut={hasOut} />;
  }

  // A step's own `thought` is NOT rendered as a reasoning block. The design
  // sources `.w-reason` exclusively from `reasoningBefore` (generative
  // ThinkingTrace activities), so a classic/standard agent shows none; a step's
  // thought belongs to the detail pane's Thought section instead. Emitting one
  // here duplicated the same text in two places.
  if (row.kind === 'standalone') {
    return (
      <WorkflowNodeView
        node={row.node}
        hasIn={hasIn}
        hasOut={hasOut}
        clickable={clickable && row.node.flowStep?.hasDetail !== false}
        selectedNodeId={selectedNodeId}
        onNodeSelect={onNodeSelect}
      />
    );
  }

  const isSelected = selectedNodeId === row.node.id;
  const isInlineChildAgent = row.node.subtitle === 'Child agent';
  const hasVisibleBody = row.children.length > 0 || !isInlineChildAgent;
  const transcriptUrls = row.connectedAgent
    ? connectedAgentTranscriptUrls(row.connectedAgent, environmentUrl)
    : [];
  const headClassName = 'ghead';
  const headContent = (
    <>
      <span className="glyph"><ActivityTypeIcon type={nodeGlyphType(row.node)} className="w-ic" /></span>
      <span className="lines">
        <span className="n1">{row.node.title}</span>
        <span className="n2">
          {row.node.subtitle}{row.children.length ? ` · ${row.children.length} activit${row.children.length > 1 ? 'ies' : 'y'}` : ''}
        </span>
      </span>
      {row.node.failed ? (
        <span className="w-failed-status">
          <ErrorCircle16Regular className="w-ic" aria-hidden="true" />
          Failed
        </span>
      ) : null}
      <span className="dur">{row.node.duration}</span>
    </>
  );

  return (
    <div
      className={cx(
        'w-agentgrp',
        !hasVisibleBody && 'inline-only',
        row.node.failed && 'failed',
        hasIn && 'has-in',
        hasOut && 'has-out',
      )}
      style={customProperties({ '--agent': DATA_SLOT.data3 })}
    >
      {clickable ? (
        <Button
          appearance="transparent"
          type="button"
          className={headClassName}
          aria-current={isSelected ? 'true' : undefined}
          title={`${row.node.title} — ${row.node.subtitle}`}
          onClick={() => onNodeSelect?.(nodeInfo(row.node))}
        >
          {headContent}
        </Button>
      ) : (
        <div className={headClassName} title={`${row.node.title} — ${row.node.subtitle}`}>{headContent}</div>
      )}
      {transcriptUrls.length ? (
        <div className="w-agent-transcript-links">
          <Open16Regular className="w-ic" aria-hidden="true" />
          <a href={transcriptUrls[0]} target="_blank" rel="noopener noreferrer">
            Open connected agent transcript
          </a>
          {transcriptUrls.slice(1).map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              #{index + 2}
            </a>
          ))}
        </div>
      ) : null}
      {hasVisibleBody ? (
        <div className="gbody">
          {row.children.length ? (
            row.children.map((child, index) => (
              <Fragment key={child.id}>
                {index ? <WorkflowConnector /> : null}
                {child.isReasoning ? (
                  <WorkflowReason
                    thought={child.thought ?? ''}
                    hasIn={index > 0}
                    hasOut={index < row.children.length - 1}
                  />
                ) : (
                  <WorkflowNodeView
                    node={child}
                    hasIn={index > 0}
                    hasOut={index < row.children.length - 1}
                    clickable={clickable}
                    selectedNodeId={selectedNodeId}
                    onNodeSelect={onNodeSelect}
                  />
                )}
              </Fragment>
            ))
          ) : (
            <div className="empty">
              {row.childTranscriptState === 'loading'
                ? 'Fetching child transcript...'
                : row.childTranscriptState === 'error'
                  ? row.childTranscriptError || 'Child transcript could not be loaded.'
                  : row.childTranscriptState === 'loaded'
                    ? 'No child steps captured'
                    : 'Child transcript not loaded.'}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TurnHeader({
  turn,
  selected,
  showTurnActions,
  onShowRawTurn,
  onInspectTurn,
}: {
  turn: WorkflowTurn;
  selected: boolean;
  showTurnActions: boolean;
  onShowRawTurn?: (turn: WorkflowTurn) => void;
  onInspectTurn?: (turn: WorkflowTurn) => void;
}) {
  return (
    <div className="th">
      <Badge appearance="filled" className={`w-badge ${selected ? 'info' : 'neutral'}`}>
        Turn {turn.turnNumber}
      </Badge>
      <span className="q" title={turn.userText}>“{clip(turn.userText || 'User turn', 56)}”</span>
      <Badge appearance="filled" className="w-badge neutral">{fmtDuration(turn.durationMs)}</Badge>
      {turn.hasError ? <Badge appearance="filled" className="w-badge err"><ErrorCircle16Regular className="w-ic" aria-hidden="true" /> error</Badge> : null}
      {showTurnActions && (onShowRawTurn || onInspectTurn) ? (
        <span className="w-thactions">
          {onShowRawTurn ? (
            <Button
              appearance="transparent"
              type="button"
              className="w-btn subtle"
              onClick={() => onShowRawTurn(turn)}
              title="Raw JSON"
            >
              <Code20Regular className="w-ic" aria-hidden="true" /> Raw JSON
            </Button>
          ) : null}
          {onInspectTurn ? (
            <Button
              appearance="transparent"
              type="button"
              className="w-btn subtle"
              onClick={() => onInspectTurn(turn)}
              title="Inspect turn"
            >
              <ChatMultiple20Regular className="w-ic" aria-hidden="true" /> Inspect
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export function WorkflowCanvas({
  turns,
  componentNameBySchemaName,
  connectedAgents,
  compact = false,
  clickable = false,
  selectedNodeId,
  onNodeSelect,
  autoSelectFirst = false,
  showTurnActions = true,
  onShowRawTurn,
  onInspectTurn,
  selectedTurnId,
  environmentUrl,
  className,
}: WorkflowCanvasProps) {
  const model = useWorkflowCanvasModel(turns, componentNameBySchemaName, connectedAgents);
  const autoSelectedKeyRef = useRef<string | null>(null);
  const autoSelectKey = turns.map((turn) => turn.id).join('|');

  useEffect(() => {
    if (!autoSelectFirst || !clickable || !onNodeSelect) return;
    if (!autoSelectKey || autoSelectedKeyRef.current === autoSelectKey) return;

    const firstNode = firstSelectableNode(model.turns);
    if (!firstNode) return;
    autoSelectedKeyRef.current = autoSelectKey;
    onNodeSelect(firstNode);
  }, [autoSelectFirst, autoSelectKey, clickable, model.turns, onNodeSelect]);

  if (!model.turns.length) {
    return <div className={mergeClasses('w-muted', className)}>No turns in this transcript.</div>;
  }

  // Compact mode (Tab 3 — Activities pane) mirrors `renderActivities()`:
  // just the bare `.w-chain`, with no `.w-diag`/`.w-diagturn`/turn-header
  // chrome around it — that wrapper belongs to Tab 2's full diagram only.
  if (compact) {
    const turn = model.turns[0];
    if (!turn) return null;
    return (
      <div
        className={mergeClasses('w-chain', className)}
        style={customProperties({ '--nodeW': NODE_WIDTH.compact })}
      >
        {turn.rows.map((row, index) => (
          <Fragment key={row.node.id}>
            {index ? <WorkflowConnector /> : null}
            <WorkflowRowView
              row={row}
              hasIn={index > 0}
              hasOut={index < turn.rows.length - 1}
              clickable={clickable}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              environmentUrl={environmentUrl}
            />
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className={mergeClasses('w-diag', className)}>
      {model.turns.map((turn, turnIndex) => {
        const isSelectedTurn = turn.id === selectedTurnId;
        return (
          <Fragment key={turn.id}>
            {turnIndex ? (
              <div className="w-turnlink" aria-hidden="true">
                <ArrowDown24Regular className="w-ic" />
              </div>
            ) : null}
            <div
              className="w-diagturn on"
              data-turn-id={turn.id}
              tabIndex={-1}
              aria-current={isSelectedTurn ? 'true' : undefined}
            >
              <TurnHeader
                turn={turn}
                selected={isSelectedTurn}
                showTurnActions={showTurnActions}
                onShowRawTurn={onShowRawTurn}
                onInspectTurn={onInspectTurn}
              />
              <div
                className="w-chain"
                style={customProperties({ '--nodeW': NODE_WIDTH.default })}
              >
                {turn.rows.length ? (
                  turn.rows.map((row, index) => (
                    <Fragment key={row.node.id}>
                      {index ? <WorkflowConnector /> : null}
                      <WorkflowRowView
                        row={row}
                        hasIn={index > 0}
                        hasOut={index < turn.rows.length - 1}
                        clickable={clickable}
                        selectedNodeId={selectedNodeId}
                        onNodeSelect={onNodeSelect}
                        environmentUrl={environmentUrl}
                      />
                    </Fragment>
                  ))
                ) : (
                  <div className="w-muted">No execution steps captured for this turn.</div>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
