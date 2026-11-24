/**
 * The grouped error list under the runtime metrics.
 *
 * Errors are grouped by what went wrong rather than listed per conversation: the same connector
 * failure across forty transcripts is one problem to fix, and forty rows of it would bury the other
 * nineteen. The occurrence count and share carry the scale that the grouping hides.
 *
 * Transcript examples are links out to the conversation, not embedded copies. The evidence lives in
 * Dataverse and can be long; the reader who doubts a grouping needs to reach one, not read all of
 * them inline. The caller supplies the destination because only it knows how its host routes.
 */

import { Badge, Caption1, Link, makeStyles, tokens } from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';
import { ExpandableRow, ExpandableRowList, RowCode, RowSection } from './ExpandableRow';
import { formatPercent, pluralize } from './RuntimeMetrics';

/** One transcript that exhibits the error. */
export interface RuntimeErrorExample {
  /** Shown on the chip, e.g. "Transcript 1". */
  label: string;
  /** Followed on click. Supply either this or `onOpen`. */
  href?: string;
  onOpen?: () => void;
}

export interface RuntimeErrorGroup {
  /** Stable key. The error signature, not the row index. */
  id: string;
  /** What failed, phrased as an observation: "GetMyDetails failed". */
  title: string;
  /** Where it failed — "Connector", "Knowledge", "Agent". */
  kind?: string;
  /** Share of analysed conversations affected, 0-100. Omitted when it cannot be computed. */
  sharePercent?: number;
  occurrences: number;
  examples?: readonly RuntimeErrorExample[];
  /** The platform's own message, quoted verbatim. */
  reported?: string;
  /** Our reading of why it happened. */
  cause?: string;
  /** What to do about it. */
  recommendation?: string;
}

export interface RuntimeErrorListProps {
  groups: readonly RuntimeErrorGroup[];
  /** Rendered instead of the list when there is nothing to show. */
  empty?: ReactNode;
  /**
   * Groups dropped to bound the payload. Non-zero turns the list into a top slice, which the reader
   * has to be told — otherwise "12 error types" and twelve rows silently disagree.
   */
  omitted?: number;
}

const useStyles = makeStyles({
  examples: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  meta: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  omitted: { color: tokens.colorNeutralForeground3 },
});

function ExampleChip({ example }: { example: RuntimeErrorExample }) {
  const styles = useStyles();
  return (
    <span className={styles.chip}>
      <Link
        href={example.href}
        onClick={example.onOpen}
        target={example.href ? '_blank' : undefined}
        rel={example.href ? 'noreferrer' : undefined}
      >
        {example.label}
      </Link>
      <OpenRegular fontSize={12} />
    </span>
  );
}

/**
 * The transcript chips on their own, so any runtime row can carry them.
 *
 * An error is not the only claim a transcript settles: a knowledge source reported as cited and a
 * topic reported as escalating are both statements a reader may want to check against the
 * conversation that produced them. One component keeps every such row reading the same way.
 */
export function RuntimeExampleChips({ examples }: { examples: readonly RuntimeErrorExample[] }) {
  const styles = useStyles();

  if (examples.length === 0) return null;

  return (
    <div className={styles.examples}>
      {examples.map((example) => (
        <ExampleChip key={example.label} example={example} />
      ))}
    </div>
  );
}

export function RuntimeErrorList({ groups, empty, omitted = 0 }: RuntimeErrorListProps) {
  const styles = useStyles();

  if (groups.length === 0) return <>{empty ?? null}</>;

  return (
    <ExpandableRowList>
      {groups.map((group) => (
        <ExpandableRow
          key={group.id}
          title={group.title}
          tags={group.kind ? [group.kind] : undefined}
          meta={
            <span className={styles.meta}>
              {group.sharePercent === undefined ? null : (
                <Badge shape="rounded" appearance="filled" color="subtle" size="small">
                  {formatPercent(group.sharePercent)}
                </Badge>
              )}
              {pluralize(group.occurrences, 'occurrence')}
            </span>
          }
        >
          {group.examples && group.examples.length > 0 ? (
            <RowSection label="Examples">
              <RuntimeExampleChips examples={group.examples} />
            </RowSection>
          ) : null}
          {group.reported ? (
            <RowSection label="Reported">
              <RowCode>{group.reported}</RowCode>
            </RowSection>
          ) : null}
          {group.cause ? <RowSection label="Cause">{group.cause}</RowSection> : null}
          {group.recommendation ? (
            <RowSection label="Recommendation">{group.recommendation}</RowSection>
          ) : null}
        </ExpandableRow>
      ))}
      {omitted > 0 ? (
        <Caption1 className={styles.omitted}>
          {pluralize(omitted, 'further error type')} not shown — this is the top slice, not the
          whole set.
        </Caption1>
      ) : null}
    </ExpandableRowList>
  );
}
