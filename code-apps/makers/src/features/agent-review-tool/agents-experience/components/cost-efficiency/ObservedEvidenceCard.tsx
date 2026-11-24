import { useState } from 'react';
import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Skeleton,
  SkeletonItem,
  Subtitle2,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronUpRegular,
  DismissCircleRegular,
  InfoRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import type {
  CoverageItem,
  EvidenceState,
  ObservationWindow,
  ToolCoverage,
} from '../../contracts/TranscriptEvidence';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
  },
  rootQuiet: {
    borderLeftColor: tokens.colorNeutralStroke1,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
  },
  iconQuiet: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    color: tokens.colorNeutralForeground3,
  },
  titleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    flex: 1,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  window: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  },
  collapseButton: {
    marginLeft: 'auto',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  detailsHidden: {
    display: 'none',
  },
  subtle: {
    color: tokens.colorNeutralForeground3,
  },
  finding: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  findingCount: {
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
    fontVariantNumeric: 'tabular-nums',
  },
  findingText: {
    color: tokens.colorStatusWarningForeground2,
    minWidth: 0,
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'visible',
  },
  coverageGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  coverageHeading: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
  },
  coverageMeta: {
    color: tokens.colorNeutralForeground3,
  },
  hiddenNotice: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground3,
  },
  hiddenNamePanel: {
    maxHeight: '240px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  hiddenNamePanelClosed: {
    display: 'none',
  },
  hiddenNameList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    margin: 0,
    padding: tokens.spacingHorizontalM,
    listStylePosition: 'inside',
  },
  row: {
    display: 'grid',
    // Floors total 132px. With three 12px gaps and 24px of padding the row
    // needs 192px, which fits inside a 320px viewport (SC 1.4.10).
    gridTemplateColumns: 'minmax(96px, auto) minmax(0, 1fr) minmax(0, auto) minmax(36px, auto)',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    '@media (max-width: 519px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      alignItems: 'stretch',
      rowGap: tokens.spacingVerticalXS,
    },
  },
  hideNarrow: {
    display: 'block',
  },
  headerRow: {
    borderTop: 'none',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground3,
    '@media (max-width: 519px)': {
      display: 'none',
    },
  },
  headerCell: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    flex: '0 0 auto',
  },
  dotObserved: {
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  dotNotObserved: {
    backgroundColor: tokens.colorPaletteDarkOrangeForeground1,
  },
  // Neutral, not a warning colour: "not attributable" is a limit of the
  // evidence, not a finding against the agent.
  dotNotAttributable: {
    backgroundColor: tokens.colorNeutralForeground4,
  },
  name: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  type: {
    color: tokens.colorNeutralForeground3,
    minWidth: 0,
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  calls: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  mobileCell: {
    '@media (max-width: 519px)': {
      display: 'grid',
      gridTemplateColumns: 'minmax(88px, max-content) minmax(0, 1fr)',
      alignItems: 'start',
      gap: tokens.spacingHorizontalS,
      minWidth: 0,
      textAlign: 'left',
      whiteSpace: 'normal',
      '&::before': {
        content: 'attr(data-label)',
        color: tokens.colorNeutralForeground3,
        fontWeight: tokens.fontWeightSemibold,
      },
    },
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  emptyIcon: {
    color: tokens.colorNeutralForeground3,
    fontSize: '20px',
    lineHeight: 1,
  },
  emptyNote: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  foot: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  disclosure: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  disclosureIcon: {
    flex: '0 0 auto',
    marginTop: '2px',
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

/** Copy shared by every state, so the window is always described the same way. */
function windowLabel(window: ObservationWindow): string {
  const conversations = window.conversations === 1 ? '1 conversation' : `${window.conversations} conversations`;
  return `${conversations} \u00b7 last ${window.days} days`;
}

function coverageTitle(kind: ToolCoverage['kind']): string {
  return kind === 'knowledge' ? 'Knowledge source' : 'Skill';
}

function coverageSectionTitle(kind: ToolCoverage['kind']): string {
  return kind === 'knowledge' ? 'Knowledge sources' : 'Skills';
}

/**
 * One sentence a screen reader hears when the card settles.
 *
 * The card swaps its whole body when the transcript read finishes, and a
 * silent swap leaves a non-sighted reader on the loading message forever. A
 * short summary is announced instead of the whole card, which would otherwise
 * read out every coverage table row.
 */
function statusAnnouncement(state: EvidenceState): string {
  switch (state.status) {
    case 'loading':
      return '';
    case 'no-access':
      return 'Observed capability use is unavailable.';
    case 'no-transcripts':
      return `No conversation activity in the last ${state.window.days} days, so capability use was not measured.`;
    case 'no-signal':
      return `No capability use was recorded in the last ${state.window.days} days.`;
    case 'ready': {
      // Quote only the attributable population, so the spoken summary matches
      // the visible headline and never overstates the gap.
      const attributable = state.coverage.reduce(
        (total, entry) => total + entry.configured - (entry.notAttributable ?? 0),
        0,
      );
      const observed = state.coverage.reduce((total, entry) => total + entry.observed, 0);
      const notAttributable = state.coverage.reduce(
        (total, entry) => total + (entry.notAttributable ?? 0),
        0,
      );
      const excluded = notAttributable > 0
        ? ` ${notAttributable} further configured ${
            notAttributable === 1 ? 'capability was' : 'capabilities were'
          } excluded as not attributable.`
        : '';
      return `Observed capability use ready. ${observed} of ${attributable} configured capabilities were observed in the last ${state.window.days} days.${excluded}`;
    }
  }
}

export interface ObservedEvidenceCardProps {
  state: EvidenceState;
  /** Lets an outer disclosure own the whole-section collapse behavior. */
  collapsible?: boolean;
  /** Preserves semantic heading order in standalone and embedded layouts. */
  headingLevel?: 'h3' | 'h4';
  /** Lets a parent keep one persistent live region outside a collapsed panel. */
  announceStatus?: boolean;
}

/**
 * Leads the Cost & efficiency tab with what the agent actually did.
 *
 * This card reports a **provisioning gap**, never a cost. Conversation
 * transcripts carry no credit or token data, so any per-agent figure would be
 * fabricated. Wording follows spec 019 FR-5: a capability with no signal is
 * "not observed in the window", never "unused" or "wasted".
 */
export function ObservedEvidenceCard({
  state,
  collapsible = true,
  headingLevel = 'h3',
  announceStatus = true,
}: ObservedEvidenceCardProps) {
  const styles = useStyles();
  const announcement = statusAnnouncement(state);

  return (
    <>
      {/*
        A stable node outside the swapped body, so the live region survives the
        state change and the new text is actually announced.
      */}
      {announceStatus ? (
        <div role="status" aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
          {announcement}
        </div>
      ) : null}
      <ObservedEvidenceCardBody
        state={state}
        collapsible={collapsible}
        headingLevel={headingLevel}
        announceStatus={announceStatus}
      />
    </>
  );
}

function ObservedEvidenceCardBody({
  state,
  collapsible = true,
  headingLevel = 'h3',
}: ObservedEvidenceCardProps) {
  const styles = useStyles();
  const [detailsExpanded, setDetailsExpanded] = useState(true);

  if (state.status === 'loading') {
    return (
      <section className={styles.root} aria-labelledby="observed-evidence-heading" aria-busy>
        <div className={styles.head}>
          <span className={mergeClasses(styles.icon, styles.iconQuiet)} aria-hidden>
            <SearchRegular />
          </span>
          <div className={styles.titleWrap}>
            <Subtitle2 as={headingLevel} id="observed-evidence-heading">
              Observed capability use
            </Subtitle2>
            <Caption1 className={styles.subtle}>
              Reading this agent&apos;s conversation transcripts&hellip;
            </Caption1>
          </div>
        </div>
        <Skeleton aria-label="Loading observed capability use">
          <SkeletonItem size={40} />
        </Skeleton>
      </section>
    );
  }

  if (state.status === 'no-access') {
    return (
      <section className={mergeClasses(styles.root, styles.rootQuiet)} aria-labelledby="observed-evidence-heading">
        <div className={styles.head}>
          <span className={mergeClasses(styles.icon, styles.iconQuiet)} aria-hidden>
            <SearchRegular />
          </span>
          <div className={styles.titleWrap}>
            <div className={styles.titleRow}>
              <Subtitle2 as={headingLevel} id="observed-evidence-heading">
                Observed capability use
              </Subtitle2>
              <Badge appearance="tint" color="informative" shape="rounded" size="small">
                Unavailable
              </Badge>
            </div>
            <Caption1 className={styles.subtle}>{state.reason}</Caption1>
          </div>
        </div>
        <div className={styles.foot}>
          <Caption1 className={styles.disclosure}>
            <InfoRegular className={styles.disclosureIcon} aria-hidden />
            <span>The budget planning section below still works. It does not depend on transcripts.</span>
          </Caption1>
        </div>
      </section>
    );
  }

  if (state.status === 'no-transcripts' || state.status === 'no-signal') {
    const noTranscripts = state.status === 'no-transcripts';
    return (
      <section className={mergeClasses(styles.root, styles.rootQuiet)} aria-labelledby="observed-evidence-heading">
        <div className={styles.head}>
          <span className={mergeClasses(styles.icon, styles.iconQuiet)} aria-hidden>
            <SearchRegular />
          </span>
          <div className={styles.titleWrap}>
            <div className={styles.titleRow}>
              <Subtitle2 as={headingLevel} id="observed-evidence-heading">
                Observed capability use
              </Subtitle2>
              <Badge appearance="tint" color="informative" shape="rounded" size="small">
                No data
              </Badge>
              <Caption1 className={styles.window}>{windowLabel(state.window)}</Caption1>
            </div>
            <Caption1 className={styles.subtle}>
              Read from this agent&apos;s conversation transcripts.
            </Caption1>
          </div>
        </div>

        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden>
            <InfoRegular />
          </span>
          <Body1Strong as="p">
            {noTranscripts
              ? `No conversation activity in the last ${state.window.days} days`
              : `No capability use recorded in the last ${state.window.days} days`}
          </Body1Strong>
          <Caption1 as="p" className={styles.subtle}>
            {noTranscripts
              ? 'This agent has no transcripts in the window, so capability use cannot be compared with its configuration. This is not a finding about the agent \u2014 it means there is nothing to measure yet.'
              : 'Transcripts exist for this window, but none recorded a capability the maker configured. This is not a finding about the agent \u2014 it means there is nothing to compare yet.'}
          </Caption1>
          <Caption1 className={styles.emptyNote}>
            <DismissCircleRegular aria-hidden />
            <span>No counts are shown. Zero is not reported as a result.</span>
          </Caption1>
        </div>

        <div className={styles.foot}>
          <Caption1 className={styles.disclosure}>
            <InfoRegular className={styles.disclosureIcon} aria-hidden />
            <span>The budget planning section below still works. It does not depend on transcripts.</span>
          </Caption1>
        </div>
      </section>
    );
  }

  // The headline may only quote items the evidence can decide. Counting
  // `configured - observed` swept in every not-attributable item and produced
  // "353 of 358 ... not observed (99%)" for an agent whose uploaded files were
  // demonstrably searched — the finding this state exists to prevent.
  const headline = state.coverage.find((entry) => countNotObserved(entry) > 0)
    ?? state.coverage[0];
  const notObserved = headline ? countNotObserved(headline) : 0;
  const headlineDenominator = headline
    ? headline.configured - (headline.notAttributable ?? 0)
    : 0;
  const percent = headlineDenominator > 0
    ? Math.round((notObserved / headlineDenominator) * 100)
    : 0;
  const notAttributable = state.coverage.reduce(
    (total, entry) => total + (entry.notAttributable ?? 0),
    0,
  );
  // Read defensively: this component is a module boundary, and losing the whole
  // Cost & efficiency tab to a missing array is far worse than omitting one
  // disclosure line.
  const aggregateNames = [
    ...new Set(
      state.coverage.flatMap((entry) =>
        (entry.aggregateObservations ?? []).map((obs) => obs.name),
      ),
    ),
  ];
  // Every capability the evidence can decide produced a signal, so there is no
  // "Not observed" row on screen. Explaining a term the reader cannot see is
  // noise, and the fully-covered case deserves its own plain statement.
  const fullyObserved = state.coverage.every((entry) => countNotObserved(entry) === 0);
  const totalAttributable = state.coverage.reduce(
    (total, entry) => total + entry.configured - (entry.notAttributable ?? 0),
    0,
  );
  const totalObserved = state.coverage.reduce(
    (total, entry) => total + entry.observed,
    0,
  );

  return (
    <section className={styles.root} aria-labelledby="observed-evidence-heading">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <SearchRegular />
        </span>
        <div className={styles.titleWrap}>
          <div className={styles.titleRow}>
            <Subtitle2 as={headingLevel} id="observed-evidence-heading">
              Observed capability use
            </Subtitle2>
            <Badge appearance="tint" color="brand" shape="rounded" size="small">
              Observed
            </Badge>
            <Caption1 className={styles.window}>{windowLabel(state.window)}</Caption1>
            {collapsible ? (
              <Button
                appearance="subtle"
                size="small"
                className={styles.collapseButton}
                icon={detailsExpanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
                aria-expanded={detailsExpanded}
                aria-controls="observed-evidence-details"
                onClick={() => setDetailsExpanded((expanded) => !expanded)}
              >
                {detailsExpanded ? 'Collapse details' : 'Expand details'}
              </Button>
            ) : null}
          </div>
          <Caption1 className={styles.subtle}>
            Knowledge sources and skills are separate because transcripts identify them differently.
            {' '}Each table compares configured capabilities with what ran.
          </Caption1>
          {collapsible && !detailsExpanded ? (
            <Caption1 className={styles.subtle}>
              {totalObserved} of {totalAttributable} attributable capabilities were observed.
              {notAttributable > 0 ? ` ${notAttributable} were not attributable.` : ''}
            </Caption1>
          ) : null}
        </div>
      </div>

      <div
        id="observed-evidence-details"
        className={mergeClasses(
          styles.details,
          collapsible && !detailsExpanded && styles.detailsHidden,
        )}
        hidden={collapsible && !detailsExpanded}
      >
        {headline && notObserved > 0 ? (
          <div className={styles.finding}>
            <Title2 as="span" className={styles.findingCount}>
              {notObserved} of {headlineDenominator}
            </Title2>
            <Body1 className={styles.findingText}>
              configured {headline.kind === 'knowledge' ? 'knowledge sources' : 'skills'} were{' '}
              <strong>not observed</strong> in this window ({percent}%). This is a review lead,
              {' '}not a removal decision. Confirm it over a longer window before you change
              {' '}the configuration.
            </Body1>
          </div>
        ) : null}

        {state.coverage.map((coverage) => (
          <CoverageTable
            key={coverage.kind}
            coverage={coverage}
            headingLevel={headingLevel === 'h4' ? 'h5' : 'h4'}
          />
        ))}

        <div className={styles.foot}>
          {fullyObserved ? (
            <Caption1 className={styles.disclosure}>
              <InfoRegular className={styles.disclosureIcon} aria-hidden />
              <span>
                Every configured capability the transcripts can speak to was invoked in this window,
                so there is no provisioning gap to act on.
              </span>
            </Caption1>
          ) : (
            <Caption1 className={styles.disclosure}>
              <InfoRegular className={styles.disclosureIcon} aria-hidden />
              <span>
                &quot;Not observed&quot; means the capability was never invoked in this window. It does
                not mean the capability is unused &mdash; a longer window may show different results.
              </span>
            </Caption1>
          )}
          {notAttributable > 0 ? (
            <Caption1 className={styles.disclosure}>
              <InfoRegular className={styles.disclosureIcon} aria-hidden />
              <span>
                {notAttributable} configured{' '}
                {notAttributable === 1 ? 'capability is' : 'capabilities are'} marked{' '}
                <strong>not attributable</strong> and excluded from the count above. The transcript
                records searches of this class under a group name
                {aggregateNames.length > 0 ? ` (${aggregateNames.join(', ')})` : ''} rather than by
                individual name, so the evidence cannot confirm use either way. They are not a
                provisioning gap and should not be removed on the strength of this card.
              </span>
            </Caption1>
          ) : null}
          <Caption1 className={styles.disclosure}>
            <InfoRegular className={styles.disclosureIcon} aria-hidden />
            <span>
              Harness built-in actions (shell, file read and write) are not counted here. They are not
              maker-configurable, so they cannot be optimized.
            </span>
          </Caption1>
          <Caption1 className={styles.disclosure}>
            <InfoRegular className={styles.disclosureIcon} aria-hidden />
            <span>
              Transcripts do not contain credit or token data, so no per-agent cost is shown.
            </span>
          </Caption1>
          {state.window.truncated ? (
            <Caption1 className={styles.disclosure}>
              <InfoRegular className={styles.disclosureIcon} aria-hidden />
              <span>
                The read stopped at the page limit, so this window is not complete.{' '}
                {fullyObserved
                  ? 'The call counts shown are a lower bound.'
                  : 'A capability shown as not observed may appear in transcripts that were not read.'}
              </span>
            </Caption1>
          ) : null}
          {state.blockedConversations > 0 ? (
            <Caption1 className={styles.disclosure}>
              <InfoRegular className={styles.disclosureIcon} aria-hidden />
              <span>
                {state.blockedConversations} blocked{' '}
                {state.blockedConversations === 1 ? 'conversation was' : 'conversations were'} excluded.
                A blocked conversation never reached capability selection.
              </span>
            </Caption1>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Items the evidence can decide and that produced no signal. */
function countNotObserved(coverage: ToolCoverage): number {
  return coverage.items.filter((item) => item.state === 'not-observed').length;
}

function CoverageTable({
  coverage,
  headingLevel,
}: {
  coverage: ToolCoverage;
  headingLevel: 'h4' | 'h5';
}) {
  const styles = useStyles();
  const label = coverageTitle(coverage.kind);
  const sectionTitle = coverageSectionTitle(coverage.kind);
  const [showNotAttributable, setShowNotAttributable] = useState(false);
  const visibleItems = coverage.items.filter((item) => item.state !== 'not-attributable');
  const notAttributableItems = coverage.items.filter(
    (item) => item.state === 'not-attributable',
  );
  const notAttributableDetailsId = `observed-${coverage.kind}-not-attributable`;
  const hiddenNoun = coverage.kind === 'knowledge' ? 'knowledge source' : 'skill';

  return (
    <section className={styles.coverageGroup} aria-labelledby={`observed-${coverage.kind}-heading`}>
      <div className={styles.coverageHeading}>
        <Body1Strong as={headingLevel} id={`observed-${coverage.kind}-heading`}>
          {sectionTitle}
        </Body1Strong>
        <Caption1 className={styles.coverageMeta}>
          {coverage.configured} configured · {coverage.observed} observed
        </Caption1>
      </div>
      <div className={styles.table} role="table" aria-label={`${label} observation`}>
        <div className={mergeClasses(styles.row, styles.headerRow)} role="row">
          <Caption1 role="columnheader" className={styles.headerCell}>Status</Caption1>
          <Caption1 role="columnheader" className={styles.headerCell}>{label}</Caption1>
          <Caption1 role="columnheader" className={mergeClasses(styles.headerCell, styles.hideNarrow)}>Type</Caption1>
          <Caption1 role="columnheader" className={mergeClasses(styles.headerCell, styles.calls)}>Calls</Caption1>
        </div>
        {(coverage.aggregateObservations ?? []).map((observation) => (
          <div className={styles.row} role="row" key={`${coverage.kind}:agg:${observation.name}`}>
            <Caption1
              role="cell"
              className={mergeClasses(styles.status, styles.mobileCell)}
              data-label="Status"
            >
              <span className={mergeClasses(styles.dot, styles.dotObserved)} aria-hidden />
              Observed
            </Caption1>
            <Caption1
              role="cell"
              className={mergeClasses(styles.name, styles.mobileCell)}
              data-label={label}
            >
              {observation.name}
            </Caption1>
            <Caption1
              role="cell"
              className={mergeClasses(
                styles.type,
                styles.hideNarrow,
                styles.mobileCell,
              )}
              data-label="Type"
            >
              Group
            </Caption1>
            <Caption1
              role="cell"
              className={mergeClasses(styles.calls, styles.mobileCell)}
              data-label="Calls"
            >
              {observation.invocations}
            </Caption1>
          </div>
        ))}
        {visibleItems.map((item) => (
          <CoverageRow
            key={`${coverage.kind}:${item.name}`}
            item={item}
            itemLabel={label}
          />
        ))}
      </div>
      {notAttributableItems.length > 0 ? (
        <>
          <div className={styles.hiddenNotice}>
            <Caption1>
              Not attributable: {notAttributableItems.length} {hiddenNoun}{' '}
              {notAttributableItems.length === 1 ? 'name is' : 'names are'} hidden.
              {' '}The transcript cannot identify individual use.
            </Caption1>
            <Button
              appearance="subtle"
              size="small"
              icon={showNotAttributable ? <ChevronUpRegular /> : <ChevronDownRegular />}
              aria-expanded={showNotAttributable}
              aria-controls={notAttributableDetailsId}
              onClick={() => setShowNotAttributable((shown) => !shown)}
            >
              {showNotAttributable
                ? `Hide ${notAttributableItems.length} names`
                : `Show ${notAttributableItems.length} names`}
            </Button>
          </div>
          <div
            id={notAttributableDetailsId}
            className={mergeClasses(
              styles.hiddenNamePanel,
              !showNotAttributable && styles.hiddenNamePanelClosed,
            )}
            hidden={!showNotAttributable}
          >
            {showNotAttributable ? (
              <ul className={styles.hiddenNameList}>
                {notAttributableItems.map((item) => (
                  <li key={`${coverage.kind}:${item.name}`}>
                    <Caption1 title={item.name}>{item.name}</Caption1>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

const STATE_LABEL: Record<CoverageItem['state'], string> = {
  observed: 'Observed',
  'not-observed': 'Not observed',
  'not-attributable': 'Not attributable',
};

function CoverageRow({
  item,
  itemLabel,
}: {
  item: CoverageItem;
  itemLabel: string;
}) {
  const styles = useStyles();

  return (
    <div className={styles.row} role="row">
      <Caption1
        role="cell"
        className={mergeClasses(styles.status, styles.mobileCell)}
        data-label="Status"
      >
        <span
          className={mergeClasses(
            styles.dot,
            item.state === 'observed'
              ? styles.dotObserved
              : item.state === 'not-observed'
                ? styles.dotNotObserved
                : styles.dotNotAttributable,
          )}
          aria-hidden
        />
        {STATE_LABEL[item.state]}
      </Caption1>
      <Caption1
        role="cell"
        className={mergeClasses(styles.name, styles.mobileCell)}
        data-label={itemLabel}
      >
        {item.name}
      </Caption1>
      <Caption1
        role="cell"
        className={mergeClasses(
          styles.type,
          styles.hideNarrow,
          styles.mobileCell,
        )}
        data-label="Type"
      >
        {item.sourceType ?? '\u2014'}
      </Caption1>
      <Caption1
        role="cell"
        className={mergeClasses(styles.calls, styles.mobileCell)}
        data-label="Calls"
      >
        {item.state === 'not-attributable' ? '\u2014' : item.invocations}
      </Caption1>
    </div>
  );
}
