import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Caption1, MessageBar, MessageBarBody, Text, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { CheckmarkCircleFilled, ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons';
import type { AgentMapNode } from '../../../agent-map/types.js';
import { getNodeFindings } from '../../../widgets/agent-map/nodeFindings.js';
import { FindingsList, FindingSeverityIcon } from './findings/FindingsList.js';
import {
  buildReviewResultRows,
  EMPTY_FINDINGS_FILTER,
  filterReviewResultRows,
  type ReviewResultRow,
} from './findings/findingsListModel.js';
import type { ChecksView, FindingView } from './viewTypes.js';

/** The most rows that one inline page measures. */
const PAGE_CANDIDATES = 12;
const PRIMARY_STATUSES = new Set<ReviewResultRow['status']>(['error', 'warning', 'info']);

const useStyles = makeStyles({
  root: {
    position: 'relative', minWidth: 0, minHeight: 0,
    flexGrow: 1, flexShrink: 1, flexBasis: 'auto',
    display: 'flex', flexDirection: 'column',
    overflowX: 'hidden', overflowY: 'hidden',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
  },
  summary: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalS),
    '& > svg': { flexShrink: 0, fontSize: '20px' },
  },
  nodeFilter: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', minWidth: 0, overflowWrap: 'anywhere',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  listArea: {
    position: 'relative', minWidth: 0, minHeight: 0,
    flexGrow: 1, flexShrink: 1, flexBasis: '0',
    overflowX: 'hidden', overflowY: 'hidden',
  },
  footer: {
    display: 'flex', alignItems: 'center', flexWrap: 'nowrap', minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  caption: {
    flexGrow: 1, flexShrink: 1, flexBasis: '0', minWidth: 0,
    overflowX: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex', alignItems: 'center', flexShrink: 0,
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
});

export interface InlineFindingsPreviewProps {
  findings: FindingView[];
  checks?: ChecksView;
  issueCount: number;
  componentCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  focusFindingId?: string | null;
  nodeFilter?: { nodeId: string; node?: AgentMapNode };
  onClearNodeFilter?: () => void;
  /** Present while the host offers fullscreen. Inline then shows one page and this action. */
  onViewAll?: () => void;
}

/**
 * The inline Findings tab. It shows only the rows that fit in the height that the host gives the
 * widget. Fullscreen shows all of them; without fullscreen, the maker pages through them.
 */
export function InlineFindingsPreview({
  findings, checks, issueCount, componentCount, hasMore = false, loadingMore = false, onLoadMore,
  focusFindingId, nodeFilter, onClearNodeFilter, onViewAll,
}: InlineFindingsPreviewProps) {
  const styles = useStyles();
  const rows = useMemo(() => buildReviewResultRows(findings, checks), [findings, checks]);
  const attribution = useMemo(() => nodeFilter
    ? nodeFilter.node ? getNodeFindings(findings, nodeFilter.node) : { scope: 'unavailable' as const, findings: [] }
    : undefined, [findings, nodeFilter]);
  const nodeRows = useMemo(() => {
    if (!attribution || attribution.scope === 'agent') return rows;
    const matches = new Set(attribution.findings);
    return rows.filter(row => row.finding && matches.has(row.finding));
  }, [attribution, rows]);
  const sorted = useMemo(() => filterReviewResultRows(nodeRows, EMPTY_FINDINGS_FILTER), [nodeRows]);
  const primary = useMemo(() => sorted.filter(row => PRIMARY_STATUSES.has(row.status)), [sorted]);
  const other = useMemo(() => sorted.filter(row => !PRIMARY_STATUSES.has(row.status)), [sorted]);
  const paged = !onViewAll;
  // Without fullscreen, inline is the only view, so its pages include the other check results.
  const ordered = useMemo(
    () => paged ? [...primary, ...other] : primary.length > 0 ? primary : other,
    [other, paged, primary],
  );
  const listed = !attribution || attribution.scope === 'agent' || nodeRows.length > 0;

  const [starts, setStarts] = useState<number[]>([0]);
  const start = paged ? Math.min(starts[starts.length - 1], Math.max(0, ordered.length - 1)) : 0;
  const [sizeVersion, setSizeVersion] = useState(0);
  const pageKey = `${start}:${ordered.length}:${sizeVersion}`;
  const [fit, setFit] = useState<{ key: string; count: number }>({ key: '', count: PAGE_CANDIDATES });
  const measured = fit.key === pageKey;
  const shown = listed ? ordered.slice(start, start + (measured ? fit.count : PAGE_CANDIDATES)) : [];
  const end = start + shown.length;
  const listArea = useRef<HTMLDivElement>(null);
  const advanceAfterLoad = useRef<number | null>(null);

  // Render the candidates once, then keep only the rows whose bottom edge is inside the list area.
  useLayoutEffect(() => {
    if (measured) return;
    const area = listArea.current;
    let count = shown.length;
    if (area && shown.length > 0) {
      const limit = area.clientHeight + 1;
      const overflowing = [...area.querySelectorAll<HTMLElement>('li')]
        .findIndex(item => item.offsetTop + item.offsetHeight > limit);
      if (overflowing >= 0) count = Math.max(1, overflowing);
    }
    setFit({ key: pageKey, count: Math.max(1, count) });
  });

  useEffect(() => {
    const area = listArea.current;
    if (!area || typeof ResizeObserver === 'undefined') return;
    let last: string | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (last !== undefined && last !== size) setSizeVersion(value => value + 1);
      last = size;
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = advanceAfterLoad.current;
    if (target === null || ordered.length <= target) return;
    advanceAfterLoad.current = null;
    setStarts(previous => [...previous, target]);
  }, [ordered.length]);

  const next = () => {
    if (end < ordered.length) {
      setStarts(previous => [...previous, end]);
      return;
    }
    if (hasMore && onLoadMore) {
      advanceAfterLoad.current = end;
      onLoadMore();
    }
  };
  const previous = () => setStarts(value => value.length > 1 ? value.slice(0, -1) : value);

  const couldNotRun = rows.some(row => row.status === 'failed');
  let caption = '';
  if (listed && ordered.length > 0) {
    if (paged) {
      caption = `Showing ${start + 1}–${end} of ${ordered.length}${hasMore ? ' loaded' : ''} results`;
    } else if (primary.length > 0) {
      caption = `Showing ${shown.length} of ${primary.length} ${primary.length === 1 ? 'finding' : 'findings'}`
        + (other.length > 0 ? `; ${other.length} other check results` : '');
    } else {
      caption = `Showing ${shown.length} of ${other.length} other check results`;
    }
  }
  const viewAllLabel = primary.length === 1 ? 'View 1 finding in full screen'
    : primary.length > 1 ? `View all ${primary.length} findings in full screen` : 'View all results in full screen';

  return (
    <section className={styles.root} aria-label="Review findings">
      <div className={styles.summary} aria-label="Review findings summary">
        {issueCount > 0
          ? <FindingSeverityIcon status={findings.some(finding => finding.sev === 'error') ? 'error' : 'warning'} />
          : <CheckmarkCircleFilled style={{ color: tokens.colorPaletteGreenForeground1 }} aria-hidden="true" />}
        <Text>
          {issueCount === 0 ? 'No issues found in the saved results.'
            : componentCount === undefined
              ? <><strong>{issueCount}</strong> {issueCount === 1 ? 'issue' : 'issues'} found.</>
              : <><strong>{issueCount}</strong> {issueCount === 1 ? 'issue' : 'issues'} across <strong>{componentCount}</strong> connected components.</>}
        </Text>
        {couldNotRun && <Caption1>Some checks could not run.</Caption1>}
      </div>
      {nodeFilter && (
        <div className={styles.nodeFilter} role="group" aria-label="Selected map node">
          <Caption1>Node: {nodeFilter.node?.label ?? nodeFilter.nodeId}</Caption1>
          <Button size="small" appearance="subtle" onClick={onClearNodeFilter}>Clear node filter</Button>
        </div>
      )}
      {nodeFilter && attribution?.scope === 'unavailable' && (
        <MessageBar intent="warning"><MessageBarBody>
          Saved finding attribution is not available for this node.
        </MessageBarBody></MessageBar>
      )}
      {nodeFilter && attribution?.scope === 'component' && nodeRows.length === 0 && (
        <MessageBar intent="info"><MessageBarBody>
          No review findings were linked to this node.
        </MessageBarBody></MessageBar>
      )}
      {nodeFilter && attribution?.scope !== 'agent' && rows.some(row => !row.finding) && (
        <Caption1>Saved check results without component IDs are available when you clear the node filter.</Caption1>
      )}
      <div className={styles.listArea} ref={listArea}>
        {shown.length > 0 && <FindingsList key={start} rows={shown} focusFindingId={focusFindingId} />}
      </div>
      {(caption || onViewAll || (paged && hasMore)) && (
        <div className={styles.footer}>
          <Caption1 className={styles.caption} aria-live="polite" title={caption || undefined}>{caption}</Caption1>
          <div className={styles.actions}>
            {onViewAll ? (
              <Button size="small" appearance="primary" onClick={onViewAll}>{viewAllLabel}</Button>
            ) : (
              <>
                <Button
                  size="small" appearance="subtle" icon={<ChevronLeft20Regular />} aria-label="Previous page"
                  disabled={starts.length === 1} onClick={previous}
                />
                <Button
                  size="small" appearance="subtle" icon={<ChevronRight20Regular />}
                  aria-label={loadingMore ? 'Loading more results' : 'Next page'}
                  disabled={loadingMore || (end >= ordered.length && !(hasMore && onLoadMore))} onClick={next}
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
