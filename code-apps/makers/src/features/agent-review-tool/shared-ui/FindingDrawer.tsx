/**
 * The finding detail drawer.
 *
 * Opened from a title in the consolidated list, which deliberately shows nothing but the claim and
 * the verdict. Everything that justifies the verdict is here, ordered as an argument rather than as
 * a form: what the rule asks, what we saw, what it means, what to do, and how to know it worked. A
 * recommendation printed above its evidence reads as an instruction from nowhere.
 *
 * Two different voices appear in this panel and they are kept apart on purpose. The registry owns
 * the *rule* — its question, its citations, its generic remediation — and is identical for every
 * agent. The finding owns this *instance* of it and is specific to the agent in front of the
 * reader. Collapsing them would let a generic sentence be read as a measurement of this agent.
 */

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  Badge,
  Body1,
  Button,
  Caption1,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
  Link,
  OverlayDrawer,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';
import {
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Dismiss24Regular,
  OpenRegular,
  SparkleRegular,
} from '@fluentui/react-icons';

import { AffectedComponents } from './AffectedComponents';
import { CollapsibleSection } from './CollapsibleSection';
import { FindingsTable, type FindingsTableRow } from './FindingsTable';
import { FindingStatusBadge, RowCode, severityForTone, type ResultTone } from './ExpandableRow';
import { InstanceOverrideMenu, RuleOverrideControls } from './RuleOverrideControls';
import { resolveReference, ruleReferenceId } from './ruleReferences';
import type { ConsolidatedRow, FindingInput, RuleMetaLookup } from './consolidatedFindings';

export interface FindingDrawerProps {
  open: boolean;
  row: ConsolidatedRow | null;
  /** Position within the list the reader can actually see, for the stepper. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Static rule facts from the host's registry. Without it the drawer shows only what the review recorded. */
  ruleMeta?: RuleMetaLookup;
  referenceUrl?: (referenceId: string) => string | undefined;
  onSetAside?: (keys: readonly string[], setAside: boolean) => void;
  setAsideBusy?: boolean;
  /**
   * A per-component body for this row, rendered below the drawer's own argument.
   *
   * A callback rather than a node so the host builds it only for the row the reader opened, and so
   * this tree keeps no dependency on either app's component model — the same reason `ruleMeta` is a
   * lookup rather than an import.
   */
  componentPanel?: (row: ConsolidatedRow) => ReactNode;
  /** Id the list's rows point at with `aria-controls`. */
  id: string;
  /** Render beside the list instead of over it, where the viewport has room for both. */
  overlay?: boolean;
}

const useStyles = makeStyles({
  drawer: { width: '650px', maxWidth: '100%', minWidth: 0, flexShrink: 0 },
  /**
   * Fills the rail it is given: `minHeight` rather than `height` so a short finding still holds the
   * column open while a long one grows and lets the rail scroll.
   *
   * The border is ours rather than Fluent's `separator`, which draws only the edge facing the
   * content it slid over — a single left-hand line, leaving the panel open at the top. Beside a
   * list whose every row is an enclosed card, a panel with no top edge reads as text that ran off
   * the top of the page rather than as the card the reader just opened. The same stroke and radius
   * the rows use closes it on all four sides and makes the pair read as one surface.
   */
  inlineDrawer: {
    alignSelf: 'stretch',
    height: 'auto',
    minHeight: '100%',
    maxHeight: 'none',
    overflow: 'visible',
    width: '100%',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalXXL,
    minWidth: 0,
  },
  inlineBody: { flex: '0 0 auto', overflowY: 'visible' },
  headerTitle: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  /**
   * The claim and the verdict on one line.
   *
   * A badge stacked above the title reads as a section heading for everything below it rather than
   * as the answer to this one rule, and it pushed the title a line further from the top of a panel
   * that is already a long scroll. Side by side, the eye reads "this rule — this outcome" in one
   * movement, and the title is free to wrap without moving the verdict.
   */
  titleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  title: { minWidth: 0, overflowWrap: 'anywhere' },
  verdict: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    flexShrink: 0,
    paddingTop: tokens.spacingVerticalXXS,
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS, alignItems: 'center' },
  /**
   * The qualifiers under the title, on one line.
   *
   * These are the rule's own labels — how it was detected, how much it matters, what it is about.
   * Wrapped, they built a block two or three rows deep that pushed
   * the drawer's first real content below the fold and read as content in its own right rather than
   * as a caption on the title. One row keeps them subordinate to the title they describe, and the
   * drawer is now wide enough to hold them; a rule with an unusually long set scrolls sideways
   * rather than growing the header, so nothing becomes unreachable.
   */
  tagRow: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'center',
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'thin',
    '> *': { flexShrink: 0 },
  },
  fieldPath: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
    color: tokens.colorNeutralForeground1,
  },
  sourceBadge: { '::after': { pointerEvents: 'none' } },
  note: { color: tokens.colorNeutralForeground3 },
  disclaimer: {
    color: tokens.colorNeutralForeground3,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalS,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
    marginTop: 'auto',
  },
  navCount: {
    ...typographyStyles.caption1,
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
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

/** A finding's own severity, as a verdict tone. Only a verdict is shown; `info` stays informational. */
const TONE_FOR_SEVERITY: Record<FindingInput['severity'], ResultTone> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/**
 * The rule instance a single finding belongs to, where the row can tell them apart.
 *
 * A rule that ran once per skill holds one key per skill, and the finding names the skill it was
 * read from, so the two can be matched and every card can carry its own decision. A row with a
 * single instance needs no matching at all.
 *
 * Anything else returns nothing and the decision stays at row level. Guessing would record a
 * reviewer's judgement against the wrong component, which is worse than not offering it.
 */
function instanceKeyFor(row: ConsolidatedRow, finding: FindingInput): string | undefined {
  if (finding.componentIdUnique) {
    return row.affected.find(a => a.id === finding.componentIdUnique)?.instanceKey;
  }
  return row.instanceKeys.length === 1 ? row.instanceKeys[0] : undefined;
}

export function FindingDrawer({
  open,
  row,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  ruleMeta,
  referenceUrl,
  onSetAside,
  setAsideBusy,
  componentPanel,
  id,
  overlay = true,
}: FindingDrawerProps) {
  const styles = useStyles();
  const closeRef = useRef<HTMLButtonElement>(null);
  const Drawer = overlay ? OverlayDrawer : InlineDrawer;

  useLayoutEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open, row?.key]);

  const meta = row && ruleMeta ? ruleMeta(row.ruleId) : undefined;

  // A finding's own citation wins over the rule's: a finding may cite something more specific than
  // the rule that raised it. The rule's full list follows, so a passing row — which produces no
  // finding and therefore no citation of its own — is still linkable.
  const quoted = row ? (row.reference ?? ruleReferenceId(row.ruleId)) : undefined;
  const referenceIds = dedupe([quoted, ...(meta?.references ?? [])]);

  // A merged row is one verdict reached several times over, so the drawer lists every reason rather
  // than the first one found. A single-reason row has already shown its fact above.
  const evidence = row?.evidence ?? [];
  const merged = evidence.length > 1;
  // A single-reason row shows its fact at the top rather than in the list below, so the one place
  // that fact was read from has to travel with it or the reader never learns where to go.
  const soleFieldPath = merged ? undefined : evidence[0]?.fieldPath;

  const steps = row?.fixSteps?.length ? row.fixSteps : meta?.fixSteps;

  /*
    The finding's own words when it has them, otherwise the rule's.

    A passing row carries no finding, so `row.why` is empty exactly where the reader most needs the
    context: they can see that something passed but not what it was being held to.
  */
  const why = row?.why ?? meta?.why;

  /*
    Exactly one surface offers the override, chosen by what this drawer actually lists.

    Where the findings list is shown and its entries resolve to distinct rule instances, each card
    carries its own decision. Where it is not, the components list does. Where neither names an
    instance, the header does, and that last case is the only way to overrule a verdict on a rule
    that fired once against the agent as a whole.
  */
  const cardOverrides =
    !!row && merged && evidence.some(e => !!instanceKeyFor(row, e));
  const componentOverrides =
    !cardOverrides && !!row && row.affected.some(a => !!a.instanceKey);
  const perInstanceOverride = cardOverrides || componentOverrides;

  return (
    <Drawer
      open={open}
      position="end"
      separator={overlay}
      id={id}
      className={mergeClasses(styles.drawer, !overlay && styles.inlineDrawer)}
      role={overlay ? 'dialog' : 'region'}
      aria-label={row ? `Finding details: ${row.title}` : 'Finding details'}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!overlay && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      {...(overlay
        ? {
            onOpenChange: (_: unknown, data: { open: boolean }) => {
              if (!data.open) onClose();
            },
          }
        : {})}
    >
      {row ? (
        <>
          <DrawerHeader>
            <DrawerHeaderTitle
              action={
                <Button
                  ref={closeRef}
                  appearance="subtle"
                  aria-label="Close finding details"
                  icon={<Dismiss24Regular />}
                  onClick={onClose}
                />
              }
            >
              <span className={styles.headerTitle}>
                <span className={styles.titleRow}>
                  <Subtitle2 className={styles.title}>{row.title}</Subtitle2>
                  <span className={styles.verdict}>
                    {row.tone ? <FindingStatusBadge tone={row.tone} /> : null}
                    {/*
                      Beside the verdict it overrules, not at the foot of the drawer. The decision is
                      about the badge next to it, and a reader scanning for "can I overrule this?"
                      looks where the verdict is.

                      Only where the drawer lists no instances of its own. Where it does, the
                      decision belongs beside each one, and offering it twice would let a reviewer
                      make two different decisions at once.
                    */}
                    {onSetAside && !perInstanceOverride ? (
                      <RuleOverrideControls row={row} onSetAside={onSetAside} busy={setAsideBusy} />
                    ) : null}
                  </span>
                </span>
              </span>
            </DrawerHeaderTitle>
          </DrawerHeader>

          <DrawerBody className={mergeClasses(styles.body, !overlay && styles.inlineBody)}>
            <div className={styles.tagRow}>
              {/*
                How the finding was produced leads the row, then how much it matters. The rule's id,
                its family and its harnesses used to lead here and were dropped: the list row the
                reader just clicked already carries the id, and the other two restate the grouping
                they navigated through to reach it. What is left qualifies the title instead of
                repeating what is already on screen.
              */}
              <Badge
                shape="rounded"
                appearance="outline"
                color={row.detection === 'ai' ? 'brand' : 'informative'}
                size="small"
                icon={row.detection === 'ai' ? <SparkleRegular /> : undefined}
              >
                {row.detection === 'ai' ? 'AI generated' : 'Static'}
              </Badge>
              {severityTag(row, meta?.severity)}
              {(meta?.tags ?? []).map(t => (
                <Badge key={t} shape="rounded" appearance="tint" color="subtle" size="small">
                  {t}
                </Badge>
              ))}
              {row.confidence ? (
                <Badge shape="rounded" appearance="outline" color="subtle" size="small">
                  {row.confidence} confidence
                </Badge>
              ) : null}
            </div>

            {row.note ? <Caption1 className={styles.note}>{row.note}</Caption1> : null}

            {meta?.description ? (
              <CollapsibleSection label="What this rule checks">{meta.description}</CollapsibleSection>
            ) : null}

            {!merged && row.fact ? (
              <CollapsibleSection label="What we found">
                <RowCode>{row.fact}</RowCode>
                {soleFieldPath ? (
                  <Caption1 className={styles.fieldPath}>{soleFieldPath}</Caption1>
                ) : null}
              </CollapsibleSection>
            ) : null}

            {why ? <CollapsibleSection label="Why it matters">{why}</CollapsibleSection> : null}

            {row.fix ? <CollapsibleSection label="Recommendation">{row.fix}</CollapsibleSection> : null}

            {steps?.length ? (
              <CollapsibleSection label="How to fix">
                <ol className={styles.steps}>
                  {steps.map((step, i) => (
                    <li key={i}><Body1>{step}</Body1></li>
                  ))}
                </ol>
              </CollapsibleSection>
            ) : null}

            {row.suggestedText ? (
              <CollapsibleSection label="Suggested text">
                <RowCode>{row.suggestedText}</RowCode>
              </CollapsibleSection>
            ) : null}

            {row.acceptanceCheck ? (
              <CollapsibleSection label="How to confirm the fix">{row.acceptanceCheck}</CollapsibleSection>
            ) : null}

            {referenceIds.length ? (
              <CollapsibleSection label="References" meta={referenceIds.length}>
                <div className={styles.chips}>
                  {referenceIds.map(refId => {
                    const resolved = resolveReference(refId);
                    if (!resolved) return null;
                    const href = referenceUrl?.(refId) ?? resolved.url;
                    return (
                      <Badge
                        key={refId}
                        shape="rounded"
                        className={styles.sourceBadge}
                        appearance="outline"
                        color="informative"
                        size="small"
                      >
                        {href ? (
                          <Link href={href} target="_blank" rel="noreferrer" title={resolved.title}>
                            {resolved.label} <OpenRegular />
                          </Link>
                        ) : (
                          resolved.label
                        )}
                      </Badge>
                    );
                  })}
                </div>
              </CollapsibleSection>
            ) : null}

            {merged ? (
              <CollapsibleSection label="Findings" meta={evidence.length}>
                <FindingsTable rows={evidence.map((e, i): FindingsTableRow => {
                  const instanceKey = cardOverrides ? instanceKeyFor(row, e) : undefined;
                  const dismissed = row.dismissed === true;
                  return {
                    key: `${e.id}-${i}`,
                    title: e.title,
                    ...(e.fact ? { fact: e.fact } : {}),
                    ...(e.fieldPath ? { fieldPath: e.fieldPath } : {}),
                    ...(e.acceptanceCheck ? { acceptanceCheck: e.acceptanceCheck } : {}),
                    tone: dismissed ? 'ignored' : TONE_FOR_SEVERITY[e.severity],
                    ...(onSetAside && instanceKey
                      ? {
                          action: (
                            <InstanceOverrideMenu
                              instanceKey={instanceKey}
                              label={e.title}
                              dismissed={dismissed}
                              onSetAside={onSetAside}
                              busy={setAsideBusy}
                            />
                          ),
                        }
                      : {}),
                  };
                })} />
              </CollapsibleSection>
            ) : null}

            {row.affected.length ? (
              <CollapsibleSection
                label={affectedLabel(row.family, row.affected.length)}
                meta={row.affected.length}
              >
                <AffectedComponents
                  row={row}
                  onSetAside={componentOverrides ? onSetAside : undefined}
                  busy={setAsideBusy}
                />
              </CollapsibleSection>
            ) : null}

            {row.detection === 'ai' ? (
              <Caption1 className={styles.disclaimer}>
                AI-generated content may be incorrect.
              </Caption1>
            ) : null}

            {componentPanel?.(row) ?? null}

            {total > 1 ? (
              <div className={styles.nav}>
                <Button
                  appearance="subtle"
                  icon={<ChevronLeft20Regular />}
                  // Keep focus on the stepper when it reaches a boundary.
                  disabledFocusable={index === 0}
                  onClick={onPrev}
                  aria-label={index === 0 ? 'Previous finding, already at the first' : 'Previous finding'}
                >
                  Prev
                </Button>
                <span className={styles.navCount}>{index + 1} / {total}</span>
                <span role="status" aria-live="polite" className={styles.visuallyHidden}>
                  {`Finding ${index + 1} of ${total}: ${row.title}`}
                </span>
                <Button
                  appearance="subtle"
                  iconPosition="after"
                  icon={<ChevronRight20Regular />}
                  disabledFocusable={index === total - 1}
                  onClick={onNext}
                  aria-label={index === total - 1 ? 'Next finding, already at the last' : 'Next finding'}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </DrawerBody>
        </>
      ) : null}
    </Drawer>
  );
}

/**
 * How much the rule matters when it is not satisfied.
 *
 * Taken from the registry where the host supplies one, because that is the rule's declared level;
 * the tone is only a fallback for rows whose rule the host cannot resolve. Shown only on a row that
 * carries a verdict — a passing rule has no severity to state.
 */
function severityTag(row: ConsolidatedRow, declared: string | undefined) {
  const level = declared ?? severityForTone(row.tone);
  if (!level || row.tone === 'pass' || row.tone === 'ignored') return null;
  const color = /high|error/i.test(level) ? 'danger' : /medium|warning/i.test(level) ? 'warning' : 'informative';
  return (
    <Badge shape="rounded" appearance="tint" color={color} size="small">
      {`${level[0].toUpperCase()}${level.slice(1)} severity`}
    </Badge>
  );
}

/** What the component list underneath is. Naming the kind beats the generic word that also covers tools. */
function affectedLabel(family: string, count: number): string {
  if (family === 'Skills') return count === 1 ? 'Affected skill' : 'Affected skills';
  return count === 1 ? 'Affected component' : 'Affected components';
}

function dedupe(ids: readonly (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
