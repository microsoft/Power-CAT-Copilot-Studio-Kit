import type { ReactNode } from 'react';
import { mergeClasses } from '@fluentui/react-components';
import {
  BrainCircuit20Regular,
  ChevronDown16Regular,
  ErrorCircle16Regular,
  Open16Regular,
} from '@fluentui/react-icons';

import type { WorkflowNode, WorkflowRow } from '../flow/WorkflowCanvasModel';
import { Markdown, clip, nodeGlyphType } from '../flow/WorkflowCanvas';
import { ActivityTypeIcon } from '../ui/ActivityTypeIcon';
import { connectedAgentTranscriptUrls } from '../../utils/connected-agent-links';
import { useActivityStyles } from '../../styles/useActivityStyles';
import { useFlowStyles } from '../../styles/useFlowStyles';

/** `select` marks the open activity as current, for a separate detail column; `expand` opens its details below the row. */
export type ActivityTimelineMode = 'select' | 'expand';

export interface ActivityTimelineProps {
  /** The rows of one turn, from the same model as the Execution flow. */
  rows: WorkflowRow[];
  mode: ActivityTimelineMode;
  /** The selected (`select`) or expanded (`expand`) activity. */
  openNodeId?: string | null;
  onActivate: (node: WorkflowNode) => void;
  /** The details of the open activity in `expand` mode. */
  renderDetail?: (node: WorkflowNode) => ReactNode;
  /** A narrower timeline gutter for the two-pane and one-pane layouts. */
  compact?: boolean;
  /** Dataverse organization URL used to open connected-agent transcript records. */
  environmentUrl?: string;
  label: string;
}

/** Standalone steps without detail data and reasoning rows are not selectable, as in the Execution flow. */
export function isSelectableRow(row: WorkflowRow): boolean {
  if (row.kind === 'reason') return false;
  return row.kind === 'agent' || row.node.flowStep?.hasDetail !== false;
}

function childTranscriptText(row: Extract<WorkflowRow, { kind: 'agent' }>): string {
  if (row.childTranscriptState === 'loading') return 'Fetching child transcript...';
  if (row.childTranscriptState === 'error') return row.childTranscriptError || 'Child transcript could not be loaded.';
  if (row.childTranscriptState === 'loaded') return 'No child steps captured';
  return 'Child transcript not loaded.';
}

function ActivityRowHeader({
  node,
  extra,
  selectable,
  open,
  mode,
  small,
  hasBelow,
  onActivate,
}: {
  node: WorkflowNode;
  extra?: string;
  selectable: boolean;
  open: boolean;
  mode: ActivityTimelineMode;
  small?: boolean;
  hasBelow: boolean;
  onActivate: (node: WorkflowNode) => void;
}) {
  const styles = useActivityStyles();
  const className = mergeClasses(
    styles.actHeader,
    small && styles.actHeaderSmall,
    !selectable && styles.actHeaderStatic,
    hasBelow && styles.actHeaderTop,
  );
  const content = (
    <>
      <span className={mergeClasses(styles.actIcon, small && styles.actIconSmall)} style={{ backgroundColor: node.color }}>
        <ActivityTypeIcon type={nodeGlyphType(node)} className="w-ic" />
      </span>
      <span className={mergeClasses(styles.actLines, small && styles.actLinesSmall)}>
        <span className="a1">{node.title}</span>
        <span className="a2">
          <span>{node.subtitle}{extra}</span>
          {node.failed ? (
            <span className="w-failed-status">
              <ErrorCircle16Regular className="w-ic" aria-hidden="true" />
              Failed
            </span>
          ) : null}
        </span>
      </span>
      {node.duration ? <span className={styles.actDuration}>{node.duration}</span> : null}
      {selectable && mode === 'expand' ? (
        <ChevronDown16Regular aria-hidden="true" className={mergeClasses(styles.actChevron, open && styles.actChevronOpen)} />
      ) : null}
    </>
  );

  if (!selectable) {
    return <div className={className} title={`${node.title} — ${node.subtitle}`}>{content}</div>;
  }
  return (
    <button
      type="button"
      className={className}
      title={`${node.title} — ${node.subtitle}`}
      aria-current={mode === 'select' && open ? 'true' : undefined}
      aria-expanded={mode === 'expand' ? open : undefined}
      onClick={() => onActivate(node)}
    >
      {content}
    </button>
  );
}

/**
 * The activities of one turn as a vertical timeline list. It is not a flow diagram: each
 * activity is one row, and a connected agent is a group row with its own steps nested below.
 */
export function ActivityTimeline({
  rows,
  mode,
  openNodeId,
  onActivate,
  renderDetail,
  compact,
  environmentUrl,
  label,
}: ActivityTimelineProps) {
  const styles = useActivityStyles();
  const flow = useFlowStyles();
  const detailFor = (node: WorkflowNode) => (mode === 'expand' && openNodeId === node.id && renderDetail
    ? <div className={styles.actBody}>{renderDetail(node)}</div>
    : null);
  const isOpenInPlace = (node: WorkflowNode) => mode === 'expand' && openNodeId === node.id && Boolean(renderDetail);

  return (
    <ol className={mergeClasses(styles.acts, compact && styles.actsCompact)} aria-label={label}>
      {rows.map((row) => {
        if (row.kind === 'reason') {
          return (
            <li key={row.node.id} className={mergeClasses(styles.act, compact && styles.actCompact, styles.actReason, compact && styles.actReasonCompact)}>
              <strong className={flow.reasonLabel}>
                <BrainCircuit20Regular aria-hidden="true" /> Reasoning
              </strong>
              <Markdown className={flow.markdown} text={clip(row.node.thought ?? '', 1200)} />
            </li>
          );
        }

        const open = openNodeId === row.node.id;
        const rowClassName = mergeClasses(
          styles.act,
          compact && styles.actCompact,
          row.node.failed && styles.actFailed,
          open && isSelectableRow(row) && styles.actOpen,
        );

        if (row.kind === 'standalone') {
          const selectable = isSelectableRow(row);
          return (
            <li key={row.node.id} className={rowClassName}>
              <ActivityRowHeader
                node={row.node}
                selectable={selectable}
                open={open}
                mode={mode}
                hasBelow={selectable && isOpenInPlace(row.node)}
                onActivate={onActivate}
              />
              {selectable ? detailFor(row.node) : null}
            </li>
          );
        }

        const isInlineChildAgent = row.node.subtitle === 'Child agent';
        const hasVisibleBody = row.children.length > 0 || !isInlineChildAgent;
        const transcriptUrls = row.connectedAgent
          ? connectedAgentTranscriptUrls(row.connectedAgent, environmentUrl)
          : [];
        const count = row.children.length;
        return (
          <li key={row.node.id} className={rowClassName}>
            <ActivityRowHeader
              node={row.node}
              extra={count ? ` · ${count} activit${count > 1 ? 'ies' : 'y'}` : ''}
              selectable
              open={open}
              mode={mode}
              hasBelow={isOpenInPlace(row.node) || transcriptUrls.length > 0 || hasVisibleBody}
              onActivate={onActivate}
            />
            {detailFor(row.node)}
            {transcriptUrls.length ? (
              <div className={mergeClasses('w-agent-transcript-links', styles.groupLinks)}>
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
              <div className={styles.groupBody}>
                {count ? (
                  <ol className={styles.childList} aria-label={`${row.node.title} activities`}>
                    {row.children.map((child) => child.isReasoning ? (
                      <li key={child.id} className={styles.childReason}>
                        <strong className={flow.reasonLabel}>
                          <BrainCircuit20Regular aria-hidden="true" /> Reasoning
                        </strong>
                        <Markdown className={flow.markdown} text={clip(child.thought ?? '', 1200)} />
                      </li>
                    ) : (
                      <li key={child.id} className={mergeClasses(styles.child, openNodeId === child.id && styles.childOpen)}>
                        <ActivityRowHeader
                          node={child}
                          selectable
                          open={openNodeId === child.id}
                          mode={mode}
                          small
                          hasBelow={isOpenInPlace(child)}
                          onActivate={onActivate}
                        />
                        {detailFor(child)}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className={styles.groupEmpty} aria-live="polite">{childTranscriptText(row)}</div>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
