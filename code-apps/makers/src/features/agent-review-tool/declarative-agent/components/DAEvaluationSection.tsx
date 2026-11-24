/**
 * DAEvaluationSection Component
 *
 * One criterion AccordionItem on the declarative agent review page and in
 * DAReviewDialog. The header shows the criterion name, the issue count, and
 * the status. The panel shows the issues to fix first, highest severity
 * first, with the same action guidance as the Standard review. Then it shows
 * the assessment notes, the passed checks in one group, and each Microsoft
 * guidance page one time.
 */

import {
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Badge,
  CounterBadge,
  ProgressBar,
  Text,
  Skeleton,
  SkeletonItem,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type {
  CriterionResult,
  EvaluationStatus,
  IssueSeverity,
  PassingCheck,
} from '../contracts/DAEvaluationResult';
import { CRITERION_LEARN_DOCS } from '../contracts/learnDocs';
import { criterionScore } from '../utils/scoreCalculator';
import {
  distinctGuidanceLinks,
  distinctPassingChecks,
  issueGuidanceLink,
  type GuidanceIssue,
} from '../utils/guidanceLinks';
import { AssessmentStatusBadge } from '../../components/core/AssessmentStatusBadge';
import {
  DAAssessmentNoteRow,
  DAGuidanceFooter,
  DAIssueRow,
  DAPassedChecks,
} from './DAEvaluationRows';

const useStyles = makeStyles({
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  progress: {
    width: '80px',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    paddingBottom: tokens.spacingVerticalM,
  },
  skeletonItem: {
    width: '200px',
    height: '16px',
  },
});

type AssessedStatus = Exclude<EvaluationStatus, 'N/A' | 'Not assessed'>;

const STATUS_BADGE_COLOR: Record<AssessedStatus, 'success' | 'warning' | 'danger'> = {
  Pass: 'success',
  Warning: 'warning',
  Fail: 'danger',
};

const PROGRESS_BAR_COLOR: Record<AssessedStatus, 'success' | 'warning' | 'error'> = {
  Pass: 'success',
  Warning: 'warning',
  Fail: 'error',
};

const SEVERITY_ORDER: Record<IssueSeverity, number> = { High: 0, Medium: 1, Low: 2 };

/** The passed-checks group opens by itself only when nothing needs action and the list is short. */
const OPEN_PASSED_CHECKS_LIMIT = 5;

function isAssessedStatus(status: EvaluationStatus): status is AssessedStatus {
  return status === 'Pass' || status === 'Warning' || status === 'Fail';
}

function bySeverity(issues: readonly GuidanceIssue[]): GuidanceIssue[] {
  const rank = (issue: GuidanceIssue) => SEVERITY_ORDER[issue.severity] ?? 3;
  return [...issues].sort((left, right) => rank(left) - rank(right));
}

export interface DAEvaluationSectionProps {
  value: string;
  criterionName: string;
  /** Key in DAEvaluationResult — used for Learn doc links */
  criterionKey: string;
  result?: CriterionResult & {
    issues: GuidanceIssue[];
    passingChecks?: PassingCheck[];
  };
  isLoading?: boolean;
  /**
   * Renders the score bar and the "N / 100" figure in the header.
   *
   * The review *page* sets this false: its summary rail already states each
   * criterion's weighted score with its own bar, so leaving these on repeats
   * the same number four times on one screen — bar, status badge, "100 / 100"
   * and the rail. The status badge stays either way; a Pass/Fail verdict is
   * not the same statement as a percentage.
   *
   * Defaults true so `DAReviewDialog`, which has no rail, is unaffected.
   */
  showScore?: boolean;
}

export function DAEvaluationSection({
  value,
  criterionName,
  criterionKey,
  result,
  isLoading = false,
  showScore = true,
}: DAEvaluationSectionProps) {
  const styles = useStyles();

  if (isLoading || !result) {
    return (
      <AccordionItem value={value}>
        <AccordionHeader as="h3">
          <div className={styles.headerLeft}>
            <Skeleton>
              <SkeletonItem className={styles.skeletonItem} />
            </Skeleton>
          </div>
        </AccordionHeader>
      </AccordionItem>
    );
  }

  const issues = bySeverity(result.issues ?? []);
  const assessmentNotes = result.assessmentNotes ?? [];
  const score = criterionScore(result);
  const assessedStatus = isAssessedStatus(result.status) ? result.status : null;
  const passingChecks = assessedStatus ? distinctPassingChecks(result.passingChecks ?? []) : [];
  const guidanceLinks = distinctGuidanceLinks([
    ...issues.map(issueGuidanceLink),
    ...assessmentNotes.map((note) => ({ url: note.learnUrl })),
    ...(CRITERION_LEARN_DOCS[criterionKey] ?? []),
    ...passingChecks.map((check) => ({ url: check.learnUrl })),
  ]);
  const openPassedChecks =
    issues.length === 0
    && assessmentNotes.length === 0
    && passingChecks.length <= OPEN_PASSED_CHECKS_LIMIT;

  return (
    <AccordionItem value={value}>
      <AccordionHeader as="h3">
        <div className={styles.headerLeft}>
          <Text weight="semibold">{criterionName}</Text>
          {issues.length > 0 && (
            <CounterBadge count={issues.length} color="danger" size="small" />
          )}
        </div>
        <div className={styles.headerRight}>
          {showScore && score !== null && assessedStatus && (
            <ProgressBar
              value={score / 100}
              color={PROGRESS_BAR_COLOR[assessedStatus]}
              thickness="medium"
              className={styles.progress}
              aria-label={`${criterionName} score: ${score} out of 100`}
            />
          )}
          {assessedStatus ? (
            <Badge appearance="tint" color={STATUS_BADGE_COLOR[assessedStatus]}>
              {result.status}
            </Badge>
          ) : (
            <AssessmentStatusBadge
              status={null}
              statusColor="informative"
              statusLabel={result.status}
            />
          )}
          {showScore && score !== null && <Text size={200}>{score} / 100</Text>}
        </div>
      </AccordionHeader>

      <AccordionPanel>
        <div className={styles.panel}>
          {issues.map((issue, index) => (
            <DAIssueRow key={`${issue.ruleId ?? issue.issueKey ?? 'issue'}-${index}`} issue={issue} />
          ))}
          {assessmentNotes.map((note, index) => (
            <DAAssessmentNoteRow
              key={`${note.status}-${note.sourceFile ?? ''}-${note.jsonPath ?? ''}-${index}`}
              note={note}
            />
          ))}
          <DAPassedChecks checks={passingChecks} defaultOpen={openPassedChecks} />
          <DAGuidanceFooter links={guidanceLinks} />
        </div>
      </AccordionPanel>
    </AccordionItem>
  );
}
