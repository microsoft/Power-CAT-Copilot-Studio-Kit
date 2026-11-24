/**
 * Shared review-shell view models (spec 017).
 *
 * The shell hardcodes arrangement only. Everything that varies between the
 * three review types — tabs, sub-scores, rail facts, header actions — arrives
 * as data (FR-2). Observed ranges across the three consumers: tabs 2/5/7,
 * sub-scores 0/2/6.
 */

import type { ReactNode } from 'react';

/**
 * Count shown beside a tab label.
 *
 * `text` is what renders; `ariaLabel` and `tooltip` carry the full wording so
 * the meaning of a bare number is never lost. Badges count problems, never
 * things (FR-7).
 */
export interface ReviewTabBadge {
  text: string;
  ariaLabel: string;
  tooltip: string;
}

export interface ReviewTabModel {
  id: string;
  label: string;
  badge?: ReviewTabBadge;
  /** Rendered only while the tab is selected, matching CopilotReviewPage. */
  render: () => ReactNode;
}

/**
 * One weighted component of the overall score.
 *
 * Every review type weights its sub-scores, so `weight` should be set on all of
 * them. It stays optional only so a caller can omit it while a screen is being
 * built. The string is the weight this particular review used, not the nominal
 * one — a dimension that could not be assessed is dropped and its share passed
 * to the rest, so the same label can read '50%' on one review and '100%' on
 * another.
 */
export interface RailSubScore {
  label: string;
  /** The percentage, or `null` when this dimension could not be assessed. */
  percent: number | null;
  weight?: string;
}

/** One key/value row in the rail's facts list. */
export interface RailFact {
  key: string;
  label: string;
  value: ReactNode;
  /** Renders in the quieter foreground, for supporting detail. */
  quiet?: boolean;
  /** Aligns the label with the first line of a value that can wrap to two lines. */
  alignToFirstLine?: boolean;
}

export interface RailSummaryBlock {
  title: string;
  body: string;
}

export interface ReviewRailModel {
  /** Rail heading. Defaults to "Review summary". */
  title?: string;
  /** Caption above the score, e.g. "Overall score". */
  scoreLabel: string;
  /**
   * The headline percentage, or `null` when no overall score is available.
   *
   * `null` is not the same as zero: zero says "reviewed and scored badly",
   * which is a claim the review did not make. Available pillar scores can
   * coexist with an unavailable saved overall score. It renders as `--`.
   */
  score: number | null;
  /** Explanation for an unavailable score; omitted consumers retain their existing no-assessment wording. */
  scoreUnavailableReason?: string;
  /**
   * Optional explanation behind an info trigger, for the "how was this
   * calculated?" question that is asked once rather than on every glance.
   */
  scoreHint?: ReactNode;
  subScores?: RailSubScore[];
  /** Rendered under the sub-scores, e.g. the AI-generated disclaimer. */
  badges?: ReactNode;
  facts: RailFact[];
  /** AI summary block, shown last. Declarative only today. */
  summary?: RailSummaryBlock;
}

export interface ReviewPageShellProps {
  /** Current agent, shown as the trailing breadcrumb and the page title. */
  agentName: string;
  /** Accessible page title suffix, e.g. "Standard Agent Review". */
  pageTitle: string;
  /**
   * Renders the shell inside a host that already supplies page chrome.
   *
   * The three review types must show the same result arrangement, but they do
   * not all arrive the same way. Two are routes and own the whole page. The
   * Skills and Automations result replaces the body of a dashboard tab, with
   * that page's header and tab bar still on screen — so a second breadcrumb, a
   * second full-height background and a second set of page margins would nest
   * one page inside another.
   *
   * Embedded drops exactly those three things. The container grid, the content
   * card, the tab bar and the rail are untouched, which is the part that has to
   * match. The scoped review theme is kept: the colour belongs to the review,
   * not to the route that reached it.
   */
  embedded?: boolean;
  /**
   * Supporting line under the agent name in embedded mode, e.g. the artifact
   * kind and when it was reviewed. Ignored on a full page, where the breadcrumb
   * and header chips already carry that.
   */
  subtitle?: string;
  /** Root breadcrumb. Omit to render the agent name alone. */
  breadcrumbRoot?: { label: string; onClick: () => void };
  /** Optional icon rendered before the breadcrumb, e.g. the agent's own icon. */
  headerIcon?: ReactNode;
  /** Status chips beside the breadcrumb, e.g. Live / Uploaded ZIP, type. */
  headerChips?: ReactNode;
  /** Export, re-run, agent details. Right-aligned. */
  headerActions?: ReactNode;
  /** MessageBars rendered above the content card. */
  banners?: ReactNode;
  /** Primary workspace navigation rendered above and outside the content card. */
  workspaceNavigation?: ReactNode;
  tabs: ReviewTabModel[];
  selectedTabId: string;
  onTabSelect: (id: string) => void;
  tabsAriaLabel: string;
  /** Hide the inner tab list when the selected workspace has one content view. */
  hideTabList?: boolean;
  rail: ReviewRailModel;
  /** Hide the fixed summary rail when the selected content needs full width. */
  hideRail?: boolean;
  /** Immutable result identity used to refocus the heading after navigation. */
  resultIdentity?: string;
  /**
   * Optional inline drawer column.
   *
   * `drawerReplacesRail` lets a detail view reuse the fixed summary-rail slot
   * when showing both would duplicate information or leave too little room for
   * the main content. Without it, the drawer opens in a third column.
   */
  drawer?: ReactNode;
  drawerOpen?: boolean;
  drawerReplacesRail?: boolean;
  /** Keeps the replacement drawer in the same fixed-width slot as the summary rail. */
  drawerMatchesRailWidth?: boolean;
  /**
   * `card` keeps the drawer inside the shell's card treatment. `panel` gives
   * the drawer a wider, full-height side-panel slot without rounded card chrome.
   */
  drawerPresentation?: 'card' | 'panel';
  /** Overlay content that must inherit the review shell's Fluent theme. */
  overlay?: ReactNode;
  /** Content rendered below the card, outside the tab panels. */
  footer?: ReactNode;
}
