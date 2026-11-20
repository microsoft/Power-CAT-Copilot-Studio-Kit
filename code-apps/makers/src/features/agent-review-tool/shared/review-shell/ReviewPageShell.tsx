/**
 * Shared review page shell (spec 017, FR-1/FR-2).
 *
 * Renders header, tabbed content card and right rail. Arrangement is the only
 * thing it hardcodes; tabs, sub-scores, rail facts and header actions all
 * arrive as data.
 *
 * **There is no metric strip.** Its cells would repeat numbers that are
 * already on screen at the same time. Neither review dialog renders a strip,
 * so nothing is lost by its absence.
 *
 * Geometry is taken from `CopilotReviewPage` so a screenshot diff between the
 * three review types differs only inside the content regions (SC-3).
 */

import { useEffect, useRef } from 'react';
import {
  Badge, Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem, Caption1,
  FluentProvider, Tab, TabList, Title3, Tooltip, makeStyles, mergeClasses, shorthands, tokens,
} from '@fluentui/react-components';
import { copilotStudioReviewLightTheme } from '../../agents-experience/components/copilotStudioReviewTheme';
import { ReviewSummaryRail } from './ReviewSummaryRail';
import type { ReviewPageShellProps } from './reviewShellTypes';

const useStyles = makeStyles({
  page: {
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
    minHeight: '100vh',
  },
  pageWithPanel: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 560px',
    gridTemplateRows: 'auto auto',
    alignItems: 'stretch',
  },
  chrome: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
  },
  chromeActions: {
    marginLeft: 'auto', display: 'flex', gap: tokens.spacingHorizontalS,
    alignItems: 'center', flexWrap: 'wrap',
  },
  chromeWithPanel: {
    gridColumn: '1 / -1',
  },
  /**
   * Full-page chrome carries the breadcrumb and, when the caller supplies one,
   * a subtitle beneath it. The Copilot Studio and declarative reviews pass no
   * subtitle, so this column collapses to the breadcrumb alone for them and
   * their chrome is unchanged.
   */
  chromeIdentity: {
    display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, maxWidth: '100%',
  },
  breadcrumb: {
    maxWidth: '100%',
    '& ol': { flexWrap: 'wrap' },
    '& li': { minWidth: 0, maxWidth: '100%' },
  },
  chromeSubtitle: {
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalS,
  },
  crumb: {
    minWidth: 0,
    maxWidth: '100%',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    textAlign: 'left',
    backgroundColor: tokens.colorTransparentBackground,
    ...shorthands.borderColor('transparent'),
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover, ...shorthands.borderColor('transparent') },
    ':hover:active': { backgroundColor: tokens.colorSubtleBackgroundPressed, ...shorthands.borderColor('transparent') },
  },
  container: {
    maxWidth: '1240px', margin: '0 auto',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL} 48px`,
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL,
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} 24px`,
    },
  },
  layout: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 316px',
    gap: tokens.spacingHorizontalL, alignItems: 'start',
    '@media (max-width: 840px)': { gridTemplateColumns: '1fr' },
  },
  layoutWide: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  /**
   * A detail view can reuse the summary rail's column. Callers that need exact
   * width parity also set `drawerMatchesRailWidth`.
   */
  layoutWithDrawer: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: tokens.spacingHorizontalL, alignItems: 'start',
    '@media (max-width: 840px)': { gridTemplateColumns: '1fr' },
  },
  /**
   * A finding drawer answers a different question from the rail, and
   * `ReviewDialogV2` kept the score panel visible beside it, so all three sit
   * side by side when there is room.
   *
   * Below 1400px there is not room, and the rail yields — see `railYields`.
   * The column count and the number of rendered children must stay in step: a
   * third child against two columns wraps the drawer onto a second row, where
   * it sits below the fold.
   */
  layoutWithRailAndDrawer: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 316px auto',
    gap: tokens.spacingHorizontalL, alignItems: 'start',
    '@media (max-width: 1400px)': { gridTemplateColumns: 'minmax(0, 1fr) auto' },
    '@media (max-width: 840px)': { gridTemplateColumns: '1fr' },
  },
  /**
   * Hides the rail at exactly the width where the layout above drops to two
   * columns, keeping children and columns in step.
   */
  railYields: {
    '@media (max-width: 1400px)': { display: 'none' },
  },
  /**
   * Card treatment for whatever sits in the drawer column, so a drawer reads
   * as a third card beside the content card and the rail rather than a panel
   * that fell out of the page.
   *
   * Applied by the shell rather than by each drawer, because
   * `CSAgentDetailsDrawer` is reused unmodified (SC-5) and hardcodes its own
   * class with no `className` prop to override it.
   */
  drawerColumn: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    position: 'sticky',
    top: '16px',
    maxHeight: 'calc(100vh - 32px)',
    display: 'flex',
    flexDirection: 'column',
    '@media (max-width: 840px)': {
      position: 'static',
      top: 'auto',
      maxHeight: 'none',
      width: '100%',
    },
    // The drawer inside supplies its own border; a second one doubles the rule.
    '& > *': { borderLeft: 'none' },
  },
  drawerColumnRailWidth: {
    width: '316px',
    minWidth: '316px',
    maxWidth: '316px',
    boxSizing: 'border-box',
    '@media (max-width: 840px)': {
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
    },
  },
  /** Widened while a drawer sits beside the rail, so findings stay legible. */
  containerWide: {
    maxWidth: '1720px',
  },
  containerDocked: {
    gridColumn: '1',
    width: '100%',
    maxWidth: 'none',
    minWidth: 0,
    margin: 0,
    boxSizing: 'border-box',
  },
  /**
   * Embedded: the host tab already supplies the page margins and the maximum
   * width, so repeating them here would inset the results twice.
   */
  containerEmbedded: {
    maxWidth: 'none',
    margin: 0,
    ...shorthands.padding(0),
    '@media (max-width: 600px)': { ...shorthands.padding(0) },
  },
  /**
   * Embedded head: an optional breadcrumb above the agent name and the actions.
   *
   * The host tab keeps its tab strip visible, but the results replace that
   * tab's landing page entirely, so the reader still needs a way back. A
   * breadcrumb names where "back" goes, which a bare button does not, and it
   * matches the full-page reviews. It renders only when the host supplies
   * `breadcrumbRoot`.
   *
   * The name and the actions are not duplicated by the host and still have to
   * appear — and they have to appear inside the scoped theme, or the buttons
   * would carry the app's colour while everything below them carries the
   * review's.
   */
  embeddedHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  embeddedHeader: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  embeddedHeaderText: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  embeddedSubtitle: { color: tokens.colorNeutralForeground3 },
  contentCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
    paddingBottom: tokens.spacingVerticalS,
  },
  tabBar: {
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
    '& [role="tab"]': {
      // Fluent's own tab sizing. A custom minHeight overrides it and makes the
      // tab bar taller than the design intends.
      minHeight: 'unset',
    },
  },
  tabCount: { marginLeft: tokens.spacingHorizontalSNudge },
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

export function ReviewPageShell(props: ReviewPageShellProps) {
  const styles = useStyles();
  const {
    agentName, pageTitle, embedded, subtitle, breadcrumbRoot, headerIcon, headerChips, headerActions, banners,
    workspaceNavigation, tabs, selectedTabId, onTabSelect, tabsAriaLabel, hideTabList,
    rail, hideRail, resultIdentity,
    drawer, drawerOpen, drawerReplacesRail, drawerMatchesRailWidth, drawerPresentation = 'card', overlay, footer,
  } = props;

  const showDrawer = Boolean(drawer && drawerOpen);
  const showRail = !hideRail && (!showDrawer || !drawerReplacesRail);
  const showDrawerAsPanel = showDrawer && drawerPresentation === 'panel';
  const showDrawerInGrid = showDrawer && !showDrawerAsPanel;

  /*
    Results arrive by replacing something else — the progress dialog on a fresh
    review, or the history list when a stored review is opened. Neither leaves
    focus anywhere useful, so a screen reader user was told nothing and a
    keyboard user restarted from the top of the document. Moving focus to the
    page heading names what appeared and puts the next Tab at the start of the
    results (WCAG 2.4.3). `tabIndex={-1}` makes the heading focusable by script
    only, so it never becomes a tab stop of its own.
  */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [resultIdentity]);

  const layoutClass = !showDrawerInGrid
    ? showRail
      ? styles.layout
      : styles.layoutWide
    : showRail
      ? styles.layoutWithRailAndDrawer
      : styles.layoutWithDrawer;

  return (
    <FluentProvider theme={copilotStudioReviewLightTheme}>
      <div
        className={mergeClasses(
          embedded ? undefined : styles.page,
          showDrawerAsPanel && styles.pageWithPanel,
        )}
      >
        {!embedded && (
          <header className={mergeClasses(styles.chrome, showDrawerAsPanel && styles.chromeWithPanel)}>
            {headerIcon}
            <div className={styles.chromeIdentity}>
              <Breadcrumb className={styles.breadcrumb} aria-label="Navigation">
                {breadcrumbRoot && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbButton className={styles.crumb} onClick={breadcrumbRoot.onClick}>
                        {breadcrumbRoot.label}
                      </BreadcrumbButton>
                    </BreadcrumbItem>
                    <BreadcrumbDivider />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbButton className={styles.crumb} current>{agentName}</BreadcrumbButton>
                </BreadcrumbItem>
              </Breadcrumb>
              {subtitle && <Caption1 className={styles.chromeSubtitle}>{subtitle}</Caption1>}
            </div>
            {headerChips}
            {headerActions && <div className={styles.chromeActions}>{headerActions}</div>}
          </header>
        )}

        {/*
          A `section`, not a `main`: the app shell at `Layout/Content.tsx`
          already renders the page's `main` landmark, and nesting a second one
          inside it is invalid and confuses landmark navigation.
        */}
        <section
          className={mergeClasses(
            styles.container,
            showDrawerInGrid && showRail && styles.containerWide,
            showDrawerAsPanel && styles.containerDocked,
            embedded && styles.containerEmbedded,
          )}
          aria-label={`${agentName} review results`}
        >
          <h1 ref={headingRef} tabIndex={-1} className={styles.visuallyHidden}>{agentName}: {pageTitle}</h1>

          {embedded && (
            <div className={styles.embeddedHead}>
              {breadcrumbRoot && (
                <Breadcrumb className={styles.breadcrumb} aria-label="Navigation" size="small">
                  <BreadcrumbItem>
                    <BreadcrumbButton className={styles.crumb} onClick={breadcrumbRoot.onClick}>
                      {breadcrumbRoot.label}
                    </BreadcrumbButton>
                  </BreadcrumbItem>
                  <BreadcrumbDivider />
                  <BreadcrumbItem>
                    <BreadcrumbButton className={styles.crumb} current>{agentName}</BreadcrumbButton>
                  </BreadcrumbItem>
                </Breadcrumb>
              )}
              <header className={styles.embeddedHeader}>
                {headerIcon}
                <div className={styles.embeddedHeaderText}>
                  <Title3 as="h2">{agentName}</Title3>
                  {subtitle && <Caption1 className={styles.embeddedSubtitle}>{subtitle}</Caption1>}
                </div>
                {headerChips}
                {headerActions && <div className={styles.chromeActions}>{headerActions}</div>}
              </header>
            </div>
          )}

          {banners}

          {workspaceNavigation}

          <div className={layoutClass}>
            <div className={styles.contentCard}>
              {!hideTabList && (
                <TabList
                  className={styles.tabBar}
                  selectedValue={selectedTabId}
                  onTabSelect={(_, data) => onTabSelect(data.value as string)}
                  aria-label={tabsAriaLabel}
                >
                  {tabs.map((tab) => (
                    <Tab
                      key={tab.id}
                      value={tab.id}
                      id={`review-tab-${tab.id}`}
                      aria-controls={`review-panel-${tab.id}`}
                    >
                      {tab.label}
                      {tab.badge && (
                        <Tooltip relationship="description" content={tab.badge.tooltip}>
                          <Badge
                            className={styles.tabCount}
                            appearance="tint"
                            color={selectedTabId === tab.id ? 'brand' : 'informative'}
                            size="small"
                            shape="circular"
                            aria-label={tab.badge.ariaLabel}
                          >
                            {tab.badge.text}
                          </Badge>
                        </Tooltip>
                      )}
                    </Tab>
                  ))}
                </TabList>
              )}

              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  role="tabpanel"
                  id={`review-panel-${tab.id}`}
                  aria-labelledby={hideTabList ? undefined : `review-tab-${tab.id}`}
                  aria-label={hideTabList ? tab.label : undefined}
                  /*
                    Some panels (Rubric dimensions, Runtime verdicts) hold only
                    cards, so they contain nothing focusable. Without a tab stop
                    of their own a keyboard user moves from the tab list past
                    the whole panel and never reaches its content. Setting this
                    on every panel, rather than only the ones that need it,
                    keeps the number of key presses the same on all four tabs
                    (WAI-ARIA APG, Tabs pattern).
                  */
                  tabIndex={0}
                  hidden={selectedTabId !== tab.id}
                >
                  {selectedTabId === tab.id && (
                    <>
                      <h2 className={styles.visuallyHidden}>{tab.label}</h2>
                      {tab.render()}
                    </>
                  )}
                </div>
              ))}
            </div>

            {showRail && (
              <ReviewSummaryRail
                model={rail}
                className={showDrawer ? styles.railYields : undefined}
              />
            )}
            {showDrawerInGrid && (
              <div
                className={mergeClasses(
                  styles.drawerColumn,
                  drawerMatchesRailWidth && styles.drawerColumnRailWidth,
                )}
              >
                {drawer}
              </div>
            )}
          </div>

          {footer}
        </section>
        {showDrawerAsPanel && drawer}
      </div>
      {overlay}
    </FluentProvider>
  );
}
