/**
 * Rows of one declarative agent criterion panel: the issues to fix, the
 * assessment notes, the passed checks, and the Microsoft guidance links.
 * The issue content uses the same action guidance as the Standard review.
 */
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkCircle16Regular } from '@fluentui/react-icons';
import type {
  AssessmentNote,
  EvaluationMethod,
  IssueSeverity,
  PassingCheck,
} from '../contracts/DAEvaluationResult';
import type { LearnDocLink } from '../contracts/learnDocs';
import { AssessmentStatusBadge } from '../../components/core/AssessmentStatusBadge';
import { getAssessmentStatusDescription } from '../../components/core/assessmentStatus';
import { ActionGuidance } from '../../components/review-page/StandardFindingContentShared';
import { useStandardFindingContentStyles } from '../../components/review-page/standardFindingContentStyles';
import { splitRecommendation } from '../utils/packageRemediation';
import {
  distinctGuidanceLinks,
  issueGuidanceLink,
  type GuidanceIssue,
} from '../utils/guidanceLinks';
import { DAGuidanceLink } from './DAGuidanceLink';
import { DAReviewDetails } from './DAReviewDetails';

export { DAGuidanceLink } from './DAGuidanceLink';

const useStyles = makeStyles({
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    ':first-child': {
      borderTopStyle: 'none',
      paddingTop: tokens.spacingVerticalXS,
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  passedRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  passedIcon: {
    flexShrink: 0,
    marginTop: tokens.spacingVerticalXXS,
    color: tokens.colorStatusSuccessForeground1,
  },
  footer: {
    ...shorthands.borderTop(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    paddingTop: tokens.spacingVerticalM,
  },
});

const SEVERITY_BADGE_COLOR: Record<IssueSeverity, 'danger' | 'warning' | 'informative'> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'informative',
};

const METHOD_LABEL: Record<EvaluationMethod, string> = {
  deterministic: 'Rule-based check',
  semantic: 'AI assessment',
};

/** One issue: the problem, the severity, the fix, an agent example, and how to verify. */
export function DAIssueRow({
  issue,
  showHeading = true,
}: {
  issue: GuidanceIssue;
  showHeading?: boolean;
}) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  const parts = splitRecommendation(issue.recommendation ?? '');
  const methodLabel = issue.method ? (METHOD_LABEL[issue.method] ?? issue.method) : undefined;

  return (
    <section className={styles.row}>
      <div className={shared.section}>
        {showHeading && (
          <Body1Strong as="h4" className={shared.heading}>{issue.description}</Body1Strong>
        )}
        <div className={shared.badges}>
          <Badge
            shape="rounded"
            appearance="tint"
            color={SEVERITY_BADGE_COLOR[issue.severity] ?? 'informative'}
          >
            {issue.severity} severity
          </Badge>
          {methodLabel && (
            <Badge shape="rounded" appearance="outline" color="informative">
              {methodLabel}
            </Badge>
          )}
        </div>
      </div>
      <ActionGuidance
        action={parts.action || 'No action was recorded.'}
        example={parts.example}
        verify={parts.verify}
        headingLevel="h5"
      />
      <DAReviewDetails trace={issue} link={issueGuidanceLink(issue)} />
    </section>
  );
}

/** One N/A or Not assessed result. It does not change the score. */
export function DAAssessmentNoteRow({ note }: { note: AssessmentNote }) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  const [link] = distinctGuidanceLinks([{ url: note.learnUrl }]);

  return (
    <section className={styles.row}>
      <div className={shared.section}>
        <Body1Strong as="h4" className={shared.heading}>{note.description}</Body1Strong>
        <div className={shared.badges}>
          <AssessmentStatusBadge
            status={null}
            statusColor="informative"
            statusLabel={note.status}
          />
        </div>
      </div>
      <Body1 as="p" className={shared.text}>
        {getAssessmentStatusDescription(note.status)}
      </Body1>
      <DAReviewDetails trace={note} link={link} />
    </section>
  );
}

/** The checks that passed, in one group that the user can expand. */
export function DAPassedChecks({
  checks,
  defaultOpen,
}: {
  checks: readonly PassingCheck[];
  defaultOpen: boolean;
}) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  if (checks.length === 0) return null;

  return (
    <Accordion
      collapsible
      defaultOpenItems={defaultOpen ? ['passed-checks'] : []}
      className={shared.reviewAccordion}
    >
      <AccordionItem value="passed-checks">
        <AccordionHeader
          as="h4"
          expandIconPosition="end"
          button={{ className: shared.reviewHeader }}
        >
          Passed checks ({checks.length})
        </AccordionHeader>
        <AccordionPanel className={shared.reviewPanel}>
          <ul className={styles.list}>
            {checks.map((check, index) => (
              <li key={`${index}-${check.description}`} className={styles.passedRow}>
                <CheckmarkCircle16Regular aria-hidden className={styles.passedIcon} />
                <Body1>{check.description}</Body1>
              </li>
            ))}
          </ul>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

/** Each Microsoft guidance page for the criterion, one time. */
export function DAGuidanceFooter({ links }: { links: readonly LearnDocLink[] }) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  if (links.length === 0) return null;

  return (
    <section className={mergeClasses(shared.section, styles.footer)}>
      <Body1Strong as="h4" className={shared.heading}>Microsoft guidance</Body1Strong>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.url}>
            <DAGuidanceLink link={link} />
          </li>
        ))}
      </ul>
    </section>
  );
}
