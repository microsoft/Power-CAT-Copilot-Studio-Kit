import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Caption1,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { EvaluationIssue, IssueSeverity } from '../contracts/DAEvaluationResult';
import { DAIssueRow } from './DAEvaluationRows';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    minWidth: 0,
  },
  title: { margin: 0 },
  header: {
    minHeight: `calc(${tokens.spacingVerticalXXXL} + ${tokens.spacingVerticalM})`,
  },
  expandIcon: { flex: '0 0 auto' },
  headerContent: {
    display: 'flex',
    flex: 1,
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    '@media (max-width: 479px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: tokens.spacingVerticalXS,
    },
  },
  severity: {
    flexShrink: 0,
    marginTop: tokens.spacingVerticalXXS,
    alignSelf: 'flex-start',
  },
  problem: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  file: { color: tokens.colorNeutralForeground2 },
});

const SEVERITY_ORDER: Record<IssueSeverity, number> = { High: 0, Medium: 1, Low: 2 };
const SEVERITY_COLOR = {
  High: 'danger',
  Medium: 'warning',
  Low: 'informative',
} as const;

/** Shows package and review problems as collapsed issues, with the most severe first. */
export function DACustomSkillIssues({ issues }: { issues: readonly EvaluationIssue[] }) {
  const styles = useStyles();
  if (issues.length === 0) return null;
  const sorted = [...issues].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );

  return (
    <section className={styles.section} aria-label="Custom skill package and review issues">
      <Subtitle2 as="h3" className={styles.title}>
        Package and review issues ({issues.length})
      </Subtitle2>
      <Body1>Open an issue to see the action and recorded evidence.</Body1>
      <Accordion collapsible>
        {sorted.map((issue, index) => (
          <AccordionItem key={`${issue.ruleId ?? 'review'}:${index}`} value={`issue-${index}`}>
            <AccordionHeader
              as="h4"
              expandIconPosition="end"
              expandIcon={{ className: styles.expandIcon }}
              button={{ className: styles.header }}
            >
              <span className={styles.headerContent}>
                <Badge
                  className={styles.severity}
                  appearance="tint"
                  shape="rounded"
                  color={SEVERITY_COLOR[issue.severity]}
                >
                  {issue.severity} severity
                </Badge>
                <span className={styles.problem}>
                  <Body1>{issue.description}</Body1>
                  {issue.sourceFile && <Caption1 className={styles.file}>{issue.sourceFile}</Caption1>}
                </span>
              </span>
            </AccordionHeader>
            <AccordionPanel>
              <DAIssueRow issue={issue} showHeading={false} />
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
