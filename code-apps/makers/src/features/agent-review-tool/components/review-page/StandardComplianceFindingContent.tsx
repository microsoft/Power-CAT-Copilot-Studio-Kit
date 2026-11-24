import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  Caption1,
  Link,
  Subtitle2,
} from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import type {
  ComplianceDisplayRow,
  ComplianceIssueDetail,
} from '../../contracts/DisplayModels';
import { EVIDENCE_KIND_LABELS } from '../../contracts/DisplayModels';
import { COMPLIANCE_LEARN_DOCS } from '../../contracts/Constants';
import { ASSESSMENT_LABELS } from '../../utils/reviewAssessment';
import {
  createComplianceFindingItems,
  reconcileFindingSelection,
} from '../../utils/standardFindingNavigation';
import { getInstructionIssueDisplay } from '../../utils/transformUtils';
import {
  ActionGuidance,
  EvidenceDetails,
  FindingBadges,
} from './StandardFindingContentShared';
import { StandardFindingArrayNavigator } from './StandardFindingArrayNavigator';
import { useStandardFindingContentStyles } from './standardFindingContentStyles';

function sameText(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();
}

function InstructionIssueReviewDetails({ issue }: { issue: ComplianceIssueDetail }) {
  const styles = useStandardFindingContentStyles();
  const coverageLabels = {
    missing: 'Missing guidance',
    incomplete: 'Incomplete guidance',
    unclear: 'Unclear guidance',
  };
  const impact = issue.remediation?.whyItMatters || issue.description;
  return (
    <section className={styles.section}>
      <Body1Strong as="h4" className={styles.heading}>{issue.title}</Body1Strong>
      {issue.assessmentReason && (
        <Body1 as="p" className={styles.text}>{issue.assessmentReason}</Body1>
      )}
      {issue.coverage && <Caption1>Coverage: {coverageLabels[issue.coverage]}</Caption1>}
      {issue.uncoveredSituation && (
        <Body1 as="p" className={styles.text}>{issue.uncoveredSituation}</Body1>
      )}
      {impact && !sameText(impact, issue.assessmentReason) && (
        <div className={styles.section}>
          <Body1Strong as="h5" className={styles.heading}>Impact</Body1Strong>
          <Body1 as="p" className={styles.text}>{impact}</Body1>
        </div>
      )}
      <EvidenceDetails evidence={issue.evidence} />
    </section>
  );
}

function InstructionReviewDetails({
  criterion,
  issue,
  agentInstructions,
}: {
  criterion: ComplianceDisplayRow;
  issue?: ComplianceIssueDetail;
  agentInstructions?: string;
}) {
  const styles = useStandardFindingContentStyles();
  const learnDoc = COMPLIANCE_LEARN_DOCS[criterion.criteriaId];
  const evidenceType =
    (criterion.evidenceKind && EVIDENCE_KIND_LABELS[criterion.evidenceKind]) || 'Not recorded';
  return (
    <Accordion collapsible className={styles.reviewAccordion}>
      <AccordionItem value="review-details">
        <AccordionHeader
          as="h3"
          expandIconPosition="end"
          button={{ className: styles.reviewHeader }}
        >
          Review details
        </AccordionHeader>
        <AccordionPanel className={styles.reviewPanel}>
          <div className={styles.reviewContent}>
            <section className={styles.section}>
              <Body1Strong as="h4" className={styles.heading}>Review result</Body1Strong>
              <Body1 as="p" className={styles.text}>{criterion.assessmentReason}</Body1>
              <Caption1>Evidence type: {evidenceType}</Caption1>
            </section>
            <section className={styles.section}>
              <Body1Strong as="h4" className={styles.heading}>Criterion</Body1Strong>
              <Body1 as="p" className={styles.text}>{criterion.description}</Body1>
            </section>
            <section className={styles.section}>
              <Body1Strong as="h4" className={styles.heading}>
                Instructions reviewed
              </Body1Strong>
              <Body1 as="p" className={styles.instructions}>
                {agentInstructions === undefined
                  ? 'The reviewed instruction text is unavailable in this saved review.'
                  : agentInstructions === '' ? '(empty)' : agentInstructions}
              </Body1>
            </section>
            {issue && <InstructionIssueReviewDetails issue={issue} />}
            {learnDoc && (
              <Link
                href={learnDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${learnDoc.label}, opens in a new tab`}
              >
                <Open16Regular aria-hidden /> {learnDoc.label}
              </Link>
            )}
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

function InstructionIssueContent({
  criterion,
  issue,
}: {
  criterion: ComplianceDisplayRow;
  issue: ComplianceIssueDetail;
}) {
  const styles = useStandardFindingContentStyles();
  const { assessmentStatus: status } = getInstructionIssueDisplay(criterion, issue);
  const remediation = issue.remediation;

  return (
    <section className={styles.setting}>
      <div className={styles.headingRow}>
        <Badge
          shape="rounded"
          appearance="outline"
          color={status === 'fail' ? 'danger' : 'informative'}
          aria-label={`Finding assessment: ${ASSESSMENT_LABELS[status]}`}
        >
          {ASSESSMENT_LABELS[status]}
        </Badge>
        <Body1Strong as="h4" className={styles.heading}>{issue.title}</Body1Strong>
      </div>
      {issue.uncoveredSituation && (
        <section className={styles.section}>
          <Body1Strong as="h5" className={styles.heading}>Gap</Body1Strong>
          <Body1 as="p" className={styles.text}>{issue.uncoveredSituation}</Body1>
        </section>
      )}
      <ActionGuidance
        action={remediation?.makerAction || issue.recommendation || 'No action was recorded.'}
        suggestedText={remediation?.suggestedText}
        verify={remediation?.acceptanceCheck}
        headingLevel="h5"
      />
    </section>
  );
}

/** Renders instruction findings as concise maker tasks for the Standard Review drawer. */
export function ActionableComplianceFindingDetails({
  criterion,
  agentInstructions,
}: {
  criterion: ComplianceDisplayRow;
  agentInstructions?: string;
}) {
  const styles = useStandardFindingContentStyles();
  const options = useMemo(
    () => createComplianceFindingItems(criterion.issues),
    [criterion.issues],
  );
  const [storedSelectedId, setStoredSelectedId] = useState<string | null>(
    () => options[0]?.id ?? null,
  );
  const selectedId = reconcileFindingSelection(options, storedSelectedId);
  const selectedIssue = options.find(option => option.id === selectedId)?.value;

  return (
    <div className={styles.root}>
      <FindingBadges assessment={criterion} />
      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>
          Findings ({criterion.issueCount})
        </Subtitle2>
        {selectedId && selectedIssue ? (
          <div className={styles.navigator}>
            <StandardFindingArrayNavigator
              options={options}
              selectedId={selectedId}
              collectionLabel="Findings"
              itemLabel="finding"
              onSelect={setStoredSelectedId}
            />
            <InstructionIssueContent
              criterion={criterion}
              issue={selectedIssue}
            />
          </div>
        ) : (
          <Body1>
            {criterion.status === true
              ? 'No action is needed for this criterion.'
              : 'No actionable finding was recorded. This result does not confirm a pass.'}
          </Body1>
        )}
      </section>
      <InstructionReviewDetails
        criterion={criterion}
        issue={selectedIssue}
        agentInstructions={agentInstructions}
      />
    </div>
  );
}
