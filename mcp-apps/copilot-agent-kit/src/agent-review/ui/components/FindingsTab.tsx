import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Caption1, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { CheckmarkCircleFilled } from '@fluentui/react-icons';
import type { FindingView, CapabilityChip, ChecksView } from './viewTypes.js';
import type { AgentMapNode } from '../../../agent-map/types.js';
import { getNodeFindings } from '../../../widgets/agent-map/nodeFindings.js';
import { FindingsList, FindingSeverityIcon } from './findings/FindingsList.js';
import { resolveFindingRowFocus } from './findings/findingsGroupedModel.js';
import {
  buildReviewResultRows,
  EMPTY_FINDINGS_FILTER,
  filterReviewResultRows,
  findingRows,
} from './findings/findingsListModel.js';

const useStyles = makeStyles({
  summary: {
    display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS,
    margin: '16px 20px', padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    '& > svg': { flexShrink: 0, fontSize: '20px' },
  },
  summaryText: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  loadedNotice: { color: tokens.colorNeutralForeground3, padding: '0 20px 8px' },
  nodeFilter: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    gap: tokens.spacingHorizontalS, padding: '0 20px 8px', overflowWrap: 'anywhere',
  },
  notice: { padding: '0 20px 8px' },
  body: { padding: '0 20px 20px' },
  other: {
    marginTop: tokens.spacingVerticalM,
    '& > summary': {
      color: tokens.colorNeutralForeground2, cursor: 'pointer', fontSize: tokens.fontSizeBase200,
      padding: `${tokens.spacingVerticalS} 0`,
      ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}` },
    },
  },
});

export interface FindingsTabProps {
  findings: FindingView[];
  capabilityChips: CapabilityChip[];
  checks?: ChecksView;
  issueCount?: number;
  componentCount?: number;
  hasMore?: boolean;
  /** Rule id to preselect (cross-tab jump from the Skill evaluator). */
  focusFindingId?: string | null;
  nodeFilter?: { nodeId: string; node?: AgentMapNode };
  onClearNodeFilter?: () => void;
}

export function FindingsTab({ findings, checks, issueCount, componentCount, hasMore, focusFindingId, nodeFilter, onClearNodeFilter }: FindingsTabProps) {
  const styles = useStyles();
  const rows = useMemo(() => buildReviewResultRows(findings, checks), [findings, checks]);
  const attribution = useMemo(() => nodeFilter
    ? nodeFilter.node ? getNodeFindings(findings, nodeFilter.node) : { scope: 'unavailable' as const, findings: [] }
    : undefined, [findings, nodeFilter]);
  const nodeRows = useMemo(() => {
    if (!attribution || attribution.scope === 'agent') return rows;
    const matches = new Set(attribution.findings);
    // Construct rows from the full saved array before filtering their identities.
    return rows.filter(row => row.finding && matches.has(row.finding));
  }, [attribution, rows]);
  const sorted = useMemo(() => filterReviewResultRows(nodeRows, EMPTY_FINDINGS_FILTER), [nodeRows]);
  const primary = sorted.filter(row => ['error', 'warning', 'info'].includes(row.status));
  const other = sorted.filter(row => !['error', 'warning', 'info'].includes(row.status));
  const focusedOther = resolveFindingRowFocus(findingRows(other), focusFindingId);
  // A selected node with only other check results shows them without an extra click.
  const otherOnlyNode = Boolean(nodeFilter) && primary.length === 0 && other.length > 0;
  const [otherOpen, setOtherOpen] = useState(Boolean(focusedOther) || otherOnlyNode);
  const shownNodeId = useRef(nodeFilter?.nodeId);
  useEffect(() => { if (focusedOther) setOtherOpen(true); }, [focusedOther]);
  // A changed node filter starts from the default disclosure state of the new node.
  useEffect(() => {
    const nodeChanged = shownNodeId.current !== nodeFilter?.nodeId;
    shownNodeId.current = nodeFilter?.nodeId;
    if (otherOnlyNode) setOtherOpen(true);
    else if (nodeChanged) setOtherOpen(Boolean(focusedOther));
  }, [focusedOther, nodeFilter?.nodeId, otherOnlyNode]);
  const issues = issueCount ?? findings.filter(finding => finding.sev !== 'info').length;
  const couldNotRun = rows.some(row => row.status === 'failed');

  return (
    <section aria-label="Review findings">
      <div className={styles.summary} aria-label="Review findings summary">
        {issues > 0
          ? <FindingSeverityIcon status={findings.some(finding => finding.sev === 'error') ? 'error' : 'warning'} />
          : <CheckmarkCircleFilled style={{ color: tokens.colorPaletteGreenForeground1 }} aria-hidden="true" />}
        <div className={styles.summaryText}>
          <Text>
            {issues === 0 ? 'No issues found in the saved results.'
              : componentCount === undefined
                ? <><strong>{issues}</strong> {issues === 1 ? 'issue' : 'issues'} found.</>
                : <><strong>{issues}</strong> {issues === 1 ? 'issue' : 'issues'} across <strong>{componentCount}</strong> connected components.</>}
          </Text>
          {couldNotRun && <Caption1>Some checks could not run.</Caption1>}
        </div>
      </div>
      {nodeFilter && (
        <div className={styles.nodeFilter} role="group" aria-label="Selected map node">
          <Caption1>Node: {nodeFilter.node?.label ?? nodeFilter.nodeId}</Caption1>
          <Button size="small" appearance="subtle" onClick={onClearNodeFilter}>Clear node filter</Button>
        </div>
      )}
      {nodeFilter && (
        <div className={styles.notice}>
          {attribution?.scope === 'unavailable' ? (
            <MessageBar intent="warning"><MessageBarBody>
              Saved finding attribution is not available for this node.
            </MessageBarBody></MessageBar>
          ) : attribution?.scope === 'component' && !nodeRows.length ? (
            <MessageBar intent="info"><MessageBarBody>
              No review findings were linked to this node.
            </MessageBarBody></MessageBar>
          ) : null}
          {attribution?.scope !== 'agent' && rows.some(row => !row.finding) && (
            <Caption1>Saved check results without component IDs are available when you clear the node filter.</Caption1>
          )}
        </div>
      )}
      {hasMore && <Caption1 className={styles.loadedNotice} block>
        These are the loaded results. Load more to include the remaining findings.
      </Caption1>}
      <div className={styles.body}>
        {(!attribution || attribution.scope === 'agent' || nodeRows.length > 0) && (
          <>
            {primary.length > 0 && <FindingsList rows={primary} focusFindingId={focusFindingId} accordion />}
            {other.length > 0 && (
              <details className={styles.other} open={otherOpen}>
                <summary onClick={event => { event.preventDefault(); setOtherOpen(value => !value); }}>
                  Show {other.length} other check results
                </summary>
                {otherOpen && <FindingsList rows={other} focusFindingId={focusFindingId} label="Other check results" />}
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
