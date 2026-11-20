/**
 * The consolidated review tab: every check as one list.
 *
 * Rows run worst first as a single sequence rather than under Fail / Needs attention / Pass
 * headings. The verdict is already on every row, and headings would ask the reader to hold a
 * section in mind while reading a claim that states its own status.
 *
 * Rules that could not be graded and facts recorded about the agent sit in the same list, ordered
 * last and labelled with their own status. Giving them separate sections meant a reader who could
 * name a rule but not classify it had three places to look; the status filter answers "what
 * happened to X" in one. They are still kept out of the ratio above — the summary bar counts only
 * graded rows, so nothing here can distort it.
 *
 * A row shows its claim and its verdict and nothing else; the argument behind it opens in a drawer
 * beside the list. Expanding in place pushed every later row down the page, so reading the second
 * finding meant losing sight of the first, and comparing two was impossible.
 */

import { Body1, makeStyles, tokens, useId } from '@fluentui/react-components';
import { useMemo, useState } from 'react';

import { ExpandableRowList } from './ExpandableRow';
import { FindingDrawer, type FindingDrawerProps } from './FindingDrawer';
import { FindingListRow } from './FindingListRow';
import { FindingsToolbar } from './FindingsToolbar';
import { ReviewSummaryBar, type ReviewSummaryMetadata } from './ReviewSummaryBar';
import { citationProvenance } from './ruleReferences';
import {
  allRows,
  familyOptions,
  filterRows,
  statusOptions,
  type ConsolidatedView,
  type FindingsFilter,
  type RuleMetaLookup,
} from './consolidatedFindings';

export interface ConsolidatedFindingsListProps {
  view: ConsolidatedView;
  /**
   * Overrides the cited-sources line under the bar.
   *
   * Left unset, the list counts its own citations, which is what a host wants: the number then
   * cannot disagree with the Source badges on the rows underneath it.
   */
  provenance?: readonly string[];
  metadata?: readonly ReviewSummaryMetadata[];
  referenceUrl?: (referenceId: string) => string | undefined;
  /**
   * Records an "Ignore this rule" decision, or undoes one.
   *
   * Omitted where the host has nowhere to store the decision, which hides the control rather than
   * offering a button that silently forgets what the reviewer told it.
   */
  onSetAside?: (keys: readonly string[], setAside: boolean) => void;
  /** A decision is being written. */
  setAsideBusy?: boolean;
  /**
   * Static rule facts from the host's rule registry.
   *
   * A callback rather than an import so this tree keeps no dependency on either app's registry. A
   * host that passes nothing still gets every recorded field; only the rule's own description,
   * tags and full citation list are missing.
   */
  ruleMeta?: RuleMetaLookup;
  /** Shown in place of everything when the review predates stored rule outcomes. */
  emptyMessage?: string;
  /** A per-component body for the opened row's drawer. Passed straight through to `FindingDrawer`. */
  componentPanel?: FindingDrawerProps['componentPanel'];
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  /**
   * The list and the opened row, side by side.
   *
   * The drawer used to float over the list, which hid the very rows a reader needs in order to
   * judge whether the one they opened is the worst of them. Folding the list into a narrower
   * column instead keeps the sequence on screen: the reader can see where they are, step to the
   * next row without closing anything, and compare two claims without losing either.
   */
  split: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalL,
    minWidth: 0,
  },
  /**
   * Carries the summary and the filters as well as the rows, so the split begins at the top of the
   * findings area rather than below them. With those two bands above the split the drawer could
   * only ever start a third of the way down the page, which left it a short box beside a long list
   * instead of the full-height argument the reader is meant to read alongside the sequence.
   */
  listPane: {
    flex: '1 1 420px',
    minWidth: '260px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  /**
   * A full-height rail, sticky so a long list scrolls past an argument that stays put. The height
   * is fixed rather than capped: a short finding should still hold the column open, or the divider
   * between the two panes stops partway down and the drawer reads as another card in the list.
   *
   * It is sized to the host's scrolling card rather than to the viewport. The card is inset from
   * the window by a margin on every side, so a plain `100vh` would overhang it and clip the last
   * line of the drawer below the fold. Where an ancestor clips its overflow the browser falls back
   * to static positioning, which is the old behaviour rather than a broken one.
   */
  drawerPane: {
    flex: '0 1 650px',
    minWidth: '320px',
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    height: `calc(100vh - 2 * ${tokens.spacingHorizontalS})`,
    overflowY: 'auto',
  },
  empty: {
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

export function ConsolidatedFindingsList({
  view,
  provenance,
  metadata,
  referenceUrl,
  onSetAside,
  setAsideBusy,
  ruleMeta,
  componentPanel,
  emptyMessage = 'This review was saved before per-rule results were recorded. Run the review again to see the full list.',
}: ConsolidatedFindingsListProps) {
  const styles = useStyles();
  const [filter, setFilter] = useState<FindingsFilter>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const drawerId = useId('finding-drawer-');

  const families = useMemo(() => familyOptions(view), [view]);
  const rows = useMemo(() => allRows(view), [view]);
  const statuses = useMemo(() => statusOptions(rows), [rows]);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);

  /**
   * Which row the drawer is showing, derived from what the reader can actually see.
   *
   * Held as a key and resolved against the filtered list rather than stored as an index, so
   * narrowing a filter cannot leave the drawer pointing at a row that is no longer on screen. A row
   * filtered out closes the drawer; bringing it back reopens it where the reader left off.
   */
  const selectedIndex = selectedKey ? shown.findIndex(r => r.key === selectedKey) : -1;
  const selected = selectedIndex >= 0 ? shown[selectedIndex] : null;

  /**
   * Counted over every row, not the filtered ones: the bar above describes the review, and a line
   * that shrank as the reader narrowed a filter would be describing the filter instead.
   */
  const citations = useMemo(
    () => provenance ?? citationProvenance(rows),
    [provenance, rows],
  );

  if (!view.recorded) {
    return <Body1 className={styles.empty}>{emptyMessage}</Body1>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.listPane}>
          <ReviewSummaryBar totals={view.totals} provenance={citations} metadata={metadata} />

          <FindingsToolbar
            filter={filter}
            onFilterChange={setFilter}
            families={families}
            statuses={statuses}
            shown={shown.length}
          />

          {shown.length === 0 ? (
            <Body1 className={styles.empty}>No checks match this filter.</Body1>
          ) : (
            <ExpandableRowList>
              {shown.map(row => (
                <FindingListRow
                  key={row.key}
                  row={row}
                  selected={row.key === selectedKey}
                  onSelect={setSelectedKey}
                  drawerId={drawerId}
                />
              ))}
            </ExpandableRowList>
          )}
        </div>

        {selected ? (
          <div className={styles.drawerPane}>
            <FindingDrawer
              id={drawerId}
              open
              overlay={false}
              row={selected}
              index={selectedIndex}
              total={shown.length}
              onPrev={() => setSelectedKey(shown[Math.max(0, selectedIndex - 1)]?.key ?? null)}
              onNext={() => setSelectedKey(shown[Math.min(shown.length - 1, selectedIndex + 1)]?.key ?? null)}
              onClose={() => setSelectedKey(null)}
              ruleMeta={ruleMeta}
              referenceUrl={referenceUrl}
              componentPanel={componentPanel}
              onSetAside={onSetAside}
              setAsideBusy={setAsideBusy}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
