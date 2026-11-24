import { Fragment } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Body1Strong,
  makeStyles,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';
import type { LearnDocLink } from '../contracts/learnDocs';
import { useStandardFindingContentStyles } from '../../components/review-page/standardFindingContentStyles';
import { DAEvidenceContent } from './DAEvidenceContent';
import { DAGuidanceLink } from './DAGuidanceLink';

const useStyles = makeStyles({
  trace: {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
  },
  traceKey: {
    ...typographyStyles.caption1Strong,
    color: tokens.colorNeutralForeground2,
  },
  traceValue: {
    ...typographyStyles.caption1,
    margin: 0,
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground2,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  evidence: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
});

interface TraceFields {
  sourceFile?: string;
  jsonPath?: string;
  ruleId?: string;
  evidence?: string;
}

/** Keeps the exact file, location, rule, and recorded evidence available on request. */
export function DAReviewDetails({ trace, link }: { trace: TraceFields; link?: LearnDocLink }) {
  const styles = useStyles();
  const shared = useStandardFindingContentStyles();
  const rows = [
    { label: 'File', value: trace.sourceFile },
    { label: 'Location', value: trace.jsonPath },
    { label: 'Check', value: trace.ruleId },
  ].filter((row) => row.value?.trim());
  const hasEvidence = Boolean(trace.evidence?.trim());
  if (rows.length === 0 && !hasEvidence && !link) return null;

  return (
    <Accordion collapsible className={shared.reviewAccordion}>
      <AccordionItem value="review-details">
        <AccordionHeader
          as="h5"
          expandIconPosition="end"
          button={{ className: shared.reviewHeader }}
        >
          Evidence and location
        </AccordionHeader>
        <AccordionPanel className={shared.reviewPanel}>
          <div className={shared.reviewContent}>
            {rows.length > 0 && (
              <dl className={styles.trace}>
                {rows.map((row) => (
                  <Fragment key={row.label}>
                    <dt className={styles.traceKey}>{row.label}</dt>
                    <dd className={styles.traceValue}>{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
            {hasEvidence && trace.evidence !== undefined && (
              <section className={styles.evidence}>
                <Body1Strong as="h6" className={shared.heading}>Recorded evidence</Body1Strong>
                <DAEvidenceContent evidence={trace.evidence} />
              </section>
            )}
            {link && <DAGuidanceLink link={link} />}
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
