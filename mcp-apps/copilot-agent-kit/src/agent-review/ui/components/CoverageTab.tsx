import { Badge, Link, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import { copilotStudioAssetUrl } from '../assets/copilotStudioAsset.js';
import type { CoverageRowView, CoverageSetView, ReviewSummaryView } from './viewTypes.js';

const useStyles = makeStyles({
  intro: {
    padding: '14px 20px 0',
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    margin: '16px 20px 24px',
    padding: '28px 24px',
    borderRadius: tokens.borderRadiusXLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  emptyTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  emptyBody: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground2,
    maxWidth: '52ch',
  },
  emptyLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
    fontSize: '13px',
  },
  studioIcon: {
    display: 'block',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
    objectFit: 'contain',
  },
  summaryStrip: {
    display: 'flex',
    gap: '24px',
    padding: '12px 20px 2px',
    flexWrap: 'wrap',
  },
  summaryItem: {
    fontSize: '12.5px',
    color: tokens.colorNeutralForeground2,
  },
  summaryValue: {
    display: 'block',
    fontSize: '16px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  listSection: {
    padding: '10px 20px 18px',
  },
  list: {
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  listHeading: {
    margin: '0 0 2px',
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '8px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  name: {
    flex: '1 1 200px',
    fontSize: '13px',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  kind: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    flex: '0 0 108px',
  },
  badgeCell: {
    flex: '0 0 132px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  note: {
    margin: '10px 20px 16px',
    color: tokens.colorNeutralForeground2,
    fontSize: '12.5px',
  },
});

export interface CoverageTabProps {
  coverage: CoverageRowView[];
  summary: ReviewSummaryView;
  /** 'declared' when cases name the capability; 'inferred' when matched on wording. */
  coverageBasis?: 'declared' | 'inferred';
  /** Set-level data used only to flag coverage concentrated in one set. */
  coverageSets?: CoverageSetView[];
  /** ZIP reviews have no live agent, so the Studio handoff link is hidden. */
  isZipReview?: boolean;
  /** Deep-link to the agent's Copilot Studio Evaluate screen. */
  evaluateUrl?: string;
}

/** Displays capability-level evaluation gaps without repeating test-set inventory. */
export function CoverageTab({
  coverage,
  summary,
  coverageBasis = 'inferred',
  coverageSets = [],
  isZipReview = false,
  evaluateUrl,
}: CoverageTabProps) {
  const styles = useStyles();
  const declared = coverageBasis === 'declared';

  // Copilot Studio already lists sets, cases and graders. The review adds the
  // missing capability-to-test join and reports only gaps in that coverage.
  const uncovered = coverage.filter((r) => r.cases === 0);
  const contributingSetCount = coverageSets.filter((set) => set.covered > 0).length;
  const coverageIsConcentrated =
    coverageSets.length > 1 &&
    contributingSetCount === 1 &&
    summary.capabilitiesCovered > 0;
  const coverageNote = [
    uncovered.length === 0 ? 'No capability gaps found.' : '',
    coverageIsConcentrated ? 'Capability coverage comes from one evaluation set.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Two distinct empty states — collapsing them produced "No test cases validate
  // this agent's 0 capabilities" for agents that in fact had plenty of tests.
  if (coverage.length === 0) {
    return (
      <section aria-label="Evaluation coverage">
        <div className={styles.empty}>
          <Text as="h3" className={styles.emptyTitle}>Nothing to cover</Text>
          <Text className={styles.emptyBody}>
            This agent declares no tools, skills or connected agents, so there is no
            capability for a test case to exercise.
            {summary.testCases > 0 &&
              ` Its ${summary.testCases} test case${summary.testCases === 1 ? '' : 's'} grade response quality only.`}
          </Text>
        </div>
      </section>
    );
  }

  // Capabilities but no test cases → this is a handoff, not a wall of amber
  // "Not covered" rows. Point the maker to where coverage is authored.
  if (summary.testCases === 0) {
    return (
      <section aria-label="Evaluation coverage">
        <div className={styles.empty}>
          <Text as="h3" className={styles.emptyTitle}>No evaluation coverage yet</Text>
          <Text className={styles.emptyBody}>
            No test cases validate this agent's {summary.capabilitiesTotal} capabilities.
            Coverage appears here once evaluation sets exist.
          </Text>
          {!isZipReview && evaluateUrl && (
            <Link
              className={styles.emptyLink}
              href={evaluateUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img className={styles.studioIcon} src={copilotStudioAssetUrl} alt="" aria-hidden="true" />
              <span>Open in Copilot Studio</span>
              <Open16Regular aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Evaluation coverage">
      <Text block className={styles.intro}>
        {declared
          ? 'Shows whether every agent capability is expected by at least one test case. This reviews test design, not whether an evaluation passed.'
          : 'No test case names an expected capability. Coverage is estimated from test wording and may be inaccurate.'}
      </Text>

      <div className={styles.summaryStrip}>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>
            {summary.capabilitiesCovered} of {summary.capabilitiesTotal}
          </span>
          capabilities with test coverage
        </span>
        {/*
          Carried here when the page-level stat strip was removed: two of its
          three cells duplicated numbers already on screen, but this one had no
          other home on the main path. It belongs beside coverage anyway, since
          the ratio to its left is only meaningful against the number of tests
          that produced it. `testCases > 0` is guaranteed here -- the zero case
          returns the "No evaluation coverage yet" state above.
        */}
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{summary.testCases}</span>
          {summary.testCases === 1 ? 'test case' : 'test cases'}
          {summary.evaluationSets > 0 &&
            ` in ${summary.evaluationSets} evaluation set${summary.evaluationSets === 1 ? '' : 's'}`}
        </span>
      </div>

      {uncovered.length > 0 && (
        <div className={styles.listSection}>
          <h3 className={styles.listHeading}>Capabilities without test coverage</h3>
          <ul className={styles.list}>
            {uncovered.map((row) => (
              <li key={`${row.kind}-${row.name}`} className={styles.row}>
                <span className={styles.name}>
                  {row.name}
                </span>
                <span className={styles.kind}>{row.kind}</span>
                <span className={styles.badgeCell}>
                  <Badge appearance="tint" color="warning" shape="circular">
                    {declared ? 'No test expects this' : 'No matching test'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {coverageNote && (
        <Text block className={styles.note}>{coverageNote}</Text>
      )}
    </section>
  );
}
