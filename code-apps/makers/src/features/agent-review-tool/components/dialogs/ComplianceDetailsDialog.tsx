import {
  Accordion, AccordionHeader, AccordionItem, AccordionPanel, Badge, Body1, Body1Strong,
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Link, Subtitle2, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, Info16Regular, Open16Regular, Warning16Regular } from '@fluentui/react-icons';
import type { ComplianceDisplayRow } from '../../contracts/DisplayModels';
import { COMPLIANCE_LEARN_DOCS } from '../../contracts/Constants';
import { ASSESSMENT_LABELS } from '../../utils/reviewAssessment';
import { getInstructionIssueDisplay } from '../../utils/transformUtils';
import {
  AssessmentDetails,
  ContextualRemediationDetails,
  ReviewEvidenceDetails,
} from './PatternDetailsDialog';
import { ActionableComplianceFindingDetails } from '../review-page/StandardComplianceFindingContent';

export interface ComplianceDetailsDialogProps {
  open: boolean;
  criterion: ComplianceDisplayRow | null;
  agentInstructions?: string;
  onClose: () => void;
}

const useStyles = makeStyles({
  surface: { width: '600px', maxWidth: `calc(100vw - 2 * ${tokens.spacingHorizontalL})` },
  details: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXL,
    minWidth: 0, overflowWrap: 'anywhere',
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  badges: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 },
  instructions: {
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0,
    backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
});

export interface ComplianceFindingDetailsProps {
  criterion: ComplianceDisplayRow;
  agentInstructions?: string;
  presentation?: 'full' | 'actionable';
}

/** Render saved instruction findings without interpreting missing findings as a successful check. */
export function ComplianceFindingDetails({
  criterion,
  agentInstructions,
  presentation = 'full',
}: ComplianceFindingDetailsProps) {
  const styles = useStyles();
  if (presentation === 'actionable') {
    return (
      <ActionableComplianceFindingDetails
        criterion={criterion}
        agentInstructions={agentInstructions}
      />
    );
  }
  const learnDoc = COMPLIANCE_LEARN_DOCS[criterion.criteriaId];
  const coverageLabels = { missing: 'Missing guidance', incomplete: 'Incomplete guidance', unclear: 'Unclear guidance' };
  return (
    <div className={styles.details}>
      <AssessmentDetails assessment={criterion} />
      <section className={styles.section}>
        <Subtitle2 as="h3">Agent instructions reviewed</Subtitle2>
        <Body1 as="p" className={styles.instructions}>
          {agentInstructions === undefined
            ? 'The reviewed instruction text is unavailable in this saved review.'
            : agentInstructions === '' ? '(empty)' : agentInstructions}
        </Body1>
      </section>
      <section className={styles.section}>
        <Subtitle2 as="h3">Criterion description</Subtitle2>
        <Body1 as="p" className={styles.text}>{criterion.description}</Body1>
      </section>
      {learnDoc && (
        <Link href={learnDoc.url} target="_blank" rel="noopener noreferrer">
          <Open16Regular aria-hidden /> Learn more: {learnDoc.label}
        </Link>
      )}
      <section className={styles.section}>
        <Subtitle2 as="h3">Recorded findings ({criterion.issueCount})</Subtitle2>
        {criterion.issues.length > 0 ? (
          <Accordion collapsible multiple>
            {criterion.issues.map((issue, index) => {
              const { assessmentStatus: status } = getInstructionIssueDisplay(criterion, issue);
              return (
                <AccordionItem key={`${issue.id}-${index}`} value={`issue-${index}`}>
                  <AccordionHeader icon={status === 'fail' ? <Warning16Regular /> : <Info16Regular />} expandIconPosition="end">
                    <div className={styles.badges}>
                      <Badge shape="rounded" appearance="outline" color={status === 'fail' ? 'danger' : 'informative'}>{ASSESSMENT_LABELS[status]}</Badge>
                      <Body1Strong>{issue.title}</Body1Strong>
                    </div>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div className={styles.section}>
                      {issue.assessmentReason && <Body1 as="p" className={styles.text}>{issue.assessmentReason}</Body1>}
                      {issue.coverage && <Body1>Coverage: {coverageLabels[issue.coverage]}</Body1>}
                      {!issue.remediation && (
                        <Body1 as="p" className={styles.text}>{issue.description}</Body1>
                      )}
                      {issue.uncoveredSituation && (
                        <div className={styles.section}>
                          <Body1Strong>Uncovered situation</Body1Strong>
                          <Body1 as="p" className={styles.text}>{issue.uncoveredSituation}</Body1>
                        </div>
                      )}
                      <ReviewEvidenceDetails evidence={issue.evidence} />
                      {issue.remediation ? (
                        <ContextualRemediationDetails remediation={issue.remediation} />
                      ) : (
                        <div className={styles.section}>
                          <Body1Strong>Recommendation</Body1Strong>
                          <Body1 as="p" className={styles.text}>{issue.recommendation || 'No recommendation was recorded.'}</Body1>
                        </div>
                      )}
                    </div>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <Body1 as="p" className={styles.text}>
            {criterion.assessmentStatus === 'pass'
              ? 'This criterion passed in the saved authoring assessment. No findings were recorded.'
              : 'No finding details were recorded. This is not evidence of a passed check; see the assessment reason above.'}
          </Body1>
        )}
      </section>
    </div>
  );
}

/** Standalone details dialog for a selected instruction criterion. */
export function ComplianceDetailsDialog({ open, criterion, agentInstructions, onClose }: ComplianceDetailsDialogProps) {
  const styles = useStyles();
  if (!criterion) return null;
  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" aria-label="Close instruction details" icon={<Dismiss24Regular />} onClick={onClose} />}>
            {criterion.criteriaName}
          </DialogTitle>
          <DialogContent><ComplianceFindingDetails criterion={criterion} agentInstructions={agentInstructions} /></DialogContent>
          <DialogActions><Button appearance="primary" onClick={onClose}>Close</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
