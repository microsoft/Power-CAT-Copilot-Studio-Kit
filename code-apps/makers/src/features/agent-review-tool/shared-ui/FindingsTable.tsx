/**
 * The reasons behind one verdict, as a table.
 *
 * A rule that fired on nine components is nine separate facts reaching the same conclusion, and a
 * reader's question about them is comparative — *which* nine, and how do they differ. Stacked cards
 * answer that badly: every card repeats the same labels, the facts never line up, and finding the
 * one that differs means reading all of them. A table puts the facts in one column so the eye can
 * run down it, and each row keeps its own verdict and its own decision.
 *
 * Columns appear only when something fills them. A table of empty cells reads as missing data
 * rather than as data that was never applicable, and a rule whose findings carry no quoted fact is
 * the normal case for a judgement the model reached without a verbatim source.
 */

import type { ReactNode } from 'react';
import {
  Body1,
  Caption1,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';

import { FindingStatusBadge, type ResultTone } from './ExpandableRow';

export interface FindingsTableRow {
  key: string;
  /** The claim this row makes. Should read as a sentence, not a category. */
  title: string;
  /** What was read from the agent, quoted. */
  fact?: string;
  /** Where in the captured subject the fact was read, e.g. `bot.tools[0].description`. */
  fieldPath?: string;
  /** How the maker confirms this one is fixed. */
  acceptanceCheck?: string;
  tone: ResultTone;
  /** Per-row control, e.g. the manual-pass menu for this rule instance. */
  action?: ReactNode;
}

export interface FindingsTableProps {
  rows: readonly FindingsTableRow[];
  /** Heading over the first column. Names what a row *is* on this surface. */
  titleLabel?: string;
}

const useStyles = makeStyles({
  table: { tableLayout: 'fixed', width: '100%' },
  headerCell: { ...typographyStyles.caption1Strong, color: tokens.colorNeutralForeground3 },
  /**
   * Cells align to the top and wrap.
   *
   * A quoted fact is a sentence, not a value, so a row's height is set by its longest cell and the
   * title has to stay level with the fact it introduces. Fluent centres by default, which reads as
   * though the short cells belong to a different row.
   */
  cell: {
    verticalAlign: 'top',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  titleCell: { width: '38%' },
  factCell: { width: '44%' },
  statusCell: { width: '18%' },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0 },
  status: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXXS,
  },
  fieldPath: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  note: { color: tokens.colorNeutralForeground3 },
  empty: { color: tokens.colorNeutralForeground4 },
});

export function FindingsTable({ rows, titleLabel = 'Finding' }: FindingsTableProps) {
  const styles = useStyles();

  const showFact = rows.some(r => !!r.fact || !!r.fieldPath || !!r.acceptanceCheck);

  return (
    <Table size="small" className={styles.table}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell className={styles.headerCell}>{titleLabel}</TableHeaderCell>
          {showFact ? (
            <TableHeaderCell className={styles.headerCell}>What we found</TableHeaderCell>
          ) : null}
          <TableHeaderCell className={styles.headerCell}>Status</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.key}>
            <TableCell className={`${styles.cell} ${styles.titleCell}`}>
              <Body1>{r.title}</Body1>
            </TableCell>
            {showFact ? (
              <TableCell className={`${styles.cell} ${styles.factCell}`}>
                <span className={styles.stack}>
                  {r.fact ? <Body1>{r.fact}</Body1> : null}
                  {r.fieldPath ? <Caption1 className={styles.fieldPath}>{r.fieldPath}</Caption1> : null}
                  {r.acceptanceCheck ? (
                    <Caption1 className={styles.note}>Confirm: {r.acceptanceCheck}</Caption1>
                  ) : null}
                  {!r.fact && !r.fieldPath && !r.acceptanceCheck ? (
                    <Caption1 className={styles.empty}>No quoted source</Caption1>
                  ) : null}
                </span>
              </TableCell>
            ) : null}
            <TableCell className={`${styles.cell} ${styles.statusCell}`}>
              <span className={styles.status}>
                <FindingStatusBadge tone={r.tone} />
                {r.action}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
