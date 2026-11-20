import {
  Badge, Body1, Body1Strong, Button, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Link, Subtitle2, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, Open16Regular } from '@fluentui/react-icons';
import type { PatternDisplayRow } from '../../contracts/DisplayModels';
import { EVIDENCE_KIND_LABELS, STATUS_BADGE_COLOR } from '../../contracts/DisplayModels';
import type {
  ContextualRemediation,
  PatternTopic,
  ReviewEvidence,
} from '../../contracts/StageOutputs';
import { PATTERN_LEARN_DOCS } from '../../contracts/Constants';
import { STANDARD_REVIEW_LIMITS } from '../../utils/standardReviewProjection';
import { ASSESSMENT_LABELS, getPatternTopicAssessment } from '../../utils/reviewAssessment';
import { ActionablePatternFindingDetails } from '../review-page/StandardPatternFindingContent';

export interface PatternDetailsDialogProps {
  open: boolean;
  pattern: PatternDisplayRow | null;
  onClose: () => void;
}

const useStyles = makeStyles({
  surface: { width: '600px', maxWidth: `calc(100vw - 2 * ${tokens.spacingHorizontalL})` },
  details: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXL,
    minWidth: 0, overflowWrap: 'anywhere',
  },
  badges: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    gap: tokens.spacingHorizontalS, minWidth: 0,
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 },
  identity: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  topics: {
    listStyleType: 'none', padding: 0, margin: 0, display: 'flex',
    flexDirection: 'column', gap: tokens.spacingVerticalXXL,
  },
  recommendation: {
    backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  guidance: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    backgroundColor: tokens.colorBrandBackground2,
    borderLeftColor: tokens.colorBrandStroke1,
    borderLeftStyle: 'solid',
    borderLeftWidth: tokens.strokeWidthThick,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
  },
  guidanceItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  draftBadge: { alignSelf: 'flex-start' },
});

type AssessmentDetailsRow = Pick<PatternDisplayRow,
  'statusLabel' | 'statusColor' | 'status' | 'severity' | 'severityColor' | 'category' | 'assessmentReason' | 'evidenceKind'
>;

/** Assessment metadata shared by the standard finding surfaces, not runtime conclusions. */
export function AssessmentDetails({ assessment }: { assessment: AssessmentDetailsRow }) {
  const styles = useStyles();
  const evidenceType = (assessment.evidenceKind && EVIDENCE_KIND_LABELS[assessment.evidenceKind]) || 'Not recorded';
  return (
    <>
      <div className={styles.badges}>
        <Badge
          shape="rounded" appearance={assessment.status === null ? 'outline' : 'filled'}
          color={assessment.statusColor} size="large" aria-label={`Assessment status: ${assessment.statusLabel}`}
        >
          {assessment.statusLabel}
        </Badge>
        <Badge shape="rounded" appearance="tint" color={assessment.severityColor} size="large" aria-label={`Inherent severity: ${assessment.severity}`}>
          {assessment.severity} severity
        </Badge>
        <Badge shape="rounded" appearance="outline" color="informative" size="large">{assessment.category}</Badge>
      </div>
      <section className={styles.section}>
        <Subtitle2 as="h3">Assessment</Subtitle2>
        <Body1 as="p" className={styles.text}>{assessment.assessmentReason}</Body1>
        <Body1 as="p" className={styles.text}>Evidence type: {evidenceType}</Body1>
      </section>
      <section className={styles.section}>
        <Subtitle2 as="h3">Assessment limits</Subtitle2>
        <Body1 as="p" className={styles.text}>{STANDARD_REVIEW_LIMITS}</Body1>
        <Body1 as="p" className={styles.text}>
          Severity is the check&apos;s fixed inherent priority, not a measured runtime impact.
        </Body1>
      </section>
    </>
  );
}

/** Show saved evidence and its validation state, including explicitly empty reviewed text. */
export function ReviewEvidenceDetails({ evidence }: { evidence?: ReviewEvidence }) {
  const styles = useStyles();
  const sourceLabels = {
    configuration: 'Configuration', instructions: 'Reviewed instructions', 'ai-response': 'AI response',
  };
  const statusLabels = { verified: 'Verified', unverified: 'Unverified', unavailable: 'Unavailable' };
  return (
    <div className={styles.section}>
      <Body1Strong>Evidence</Body1Strong>
      {evidence ? (
        <>
          <div className={styles.badges}>
            <Badge shape="rounded" appearance="outline" color="informative" aria-label={`Evidence validation: ${statusLabels[evidence.status]}`}>
              {statusLabels[evidence.status]}
            </Badge>
            <Body1>Source: {sourceLabels[evidence.source]}</Body1>
          </div>
          {evidence.setting && <Body1 className={styles.text}>Evidence setting: {evidence.setting}</Body1>}
          {evidence.quote !== undefined && (
            <Body1 as="p" className={styles.text}>Evidence quote: {evidence.quote === '' ? '(empty)' : evidence.quote}</Body1>
          )}
          {evidence.reason && <Body1 as="p" className={styles.text}>{evidence.reason}</Body1>}
        </>
      ) : <Body1>No evidence was recorded in this saved review.</Body1>}
    </div>
  );
}

/** Show evidence-bound guidance while keeping generated text clearly marked as a draft. */
export function ContextualRemediationDetails({
  remediation,
  headingLevel = 'h4',
}: {
  remediation?: ContextualRemediation;
  headingLevel?: 'h4' | 'h5';
}) {
  const styles = useStyles();
  if (!remediation) return null;
  return (
    <section className={styles.guidance} aria-label="Maker guidance">
      <Subtitle2 as={headingLevel}>{remediation.findingTitle}</Subtitle2>
      <div className={styles.guidanceItem}>
        <Body1Strong>Why it matters</Body1Strong>
        <Body1 as="p" className={styles.text}>{remediation.whyItMatters}</Body1>
      </div>
      <div className={styles.guidanceItem}>
        <Body1Strong>Maker action</Body1Strong>
        <Body1 as="p" className={styles.text}>{remediation.makerAction}</Body1>
      </div>
      {remediation.suggestedText && (
        <div className={styles.guidanceItem}>
          <Badge
            className={styles.draftBadge}
            shape="rounded"
            appearance="tint"
            color="brand"
          >
            Draft for maker review
          </Badge>
          <Body1Strong>Suggested text</Body1Strong>
          <Body1 as="p" className={styles.text}>{remediation.suggestedText}</Body1>
        </div>
      )}
      <div className={styles.guidanceItem}>
        <Body1Strong>Acceptance check</Body1Strong>
        <Body1 as="p" className={styles.text}>{remediation.acceptanceCheck}</Body1>
      </div>
    </section>
  );
}

export interface PatternFindingDetailsProps {
  pattern: PatternDisplayRow;
  presentation?: 'full' | 'actionable';
}

/** Complete per-setting pattern content reused in the page drawer and legacy dialog. */
export function PatternFindingDetails({
  pattern,
  presentation = 'full',
}: PatternFindingDetailsProps) {
  const styles = useStyles();
  if (presentation === 'actionable') {
    return <ActionablePatternFindingDetails pattern={pattern} />;
  }
  const learnDoc = PATTERN_LEARN_DOCS[pattern.patternName];
  const affectedSettings: PatternTopic[] = pattern.rawTopics.length
    ? pattern.rawTopics
    : pattern.topics.map(item => ({ item }));
  return (
    <div className={styles.details}>
      <AssessmentDetails assessment={pattern} />
      <section className={styles.section}>
        <Subtitle2 as="h3">Check description</Subtitle2>
        <Body1 as="p" className={styles.text}>{pattern.description || 'No description was recorded.'}</Body1>
      </section>
      <section className={styles.section}>
        <Subtitle2 as="h3">Recommendation</Subtitle2>
        <Body1 as="p" className={mergeClasses(styles.text, styles.recommendation)}>
          {pattern.recommendation || 'No recommendation was recorded.'}
        </Body1>
      </section>
      {learnDoc && (
        <Link href={learnDoc.url} target="_blank" rel="noopener noreferrer">
          <Open16Regular aria-hidden /> Learn more: {learnDoc.label}
        </Link>
      )}
      <section className={styles.section}>
        <Subtitle2 as="h3">Recorded settings ({affectedSettings.length})</Subtitle2>
        {affectedSettings.length > 0 && (
          <Body1>{`${pattern.topicCount} setting${pattern.topicCount === 1 ? '' : 's'} marked Fail.`}</Body1>
        )}
        {affectedSettings.length > 0 ? (
          <ul className={styles.topics}>
            {affectedSettings.map((topic, index) => {
              const status = getPatternTopicAssessment(pattern.assessmentStatus, topic);
              const label = ASSESSMENT_LABELS[status];
              return (
              <li className={styles.section} key={`${topic.componentId ?? topic.item}-${topic.variable ?? ''}-${index}`}>
                <div className={styles.identity}>
                  <Subtitle2 as="h4">{topic.item}</Subtitle2>
                  <div className={styles.badges}>
                    <Badge
                      shape="rounded" appearance="outline" color={STATUS_BADGE_COLOR[label]}
                      aria-label={`Setting assessment: ${label}`}
                    >{label}</Badge>
                  </div>
                  {topic.assessmentReason && <Body1 as="p" className={styles.text}>{topic.assessmentReason}</Body1>}
                  {topic.componentId && <Body1 className={styles.text}>Component ID: {topic.componentId}</Body1>}
                  {topic.schemaName && <Body1 className={styles.text}>Component schema: {topic.schemaName}</Body1>}
                  {(topic.setting ?? topic.evidence?.setting) && (
                    <Body1 className={styles.text}>Setting: {topic.setting ?? topic.evidence?.setting}</Body1>
                  )}
                  {topic.variable && <Body1 className={styles.text}>Variable: {topic.variable}</Body1>}
                </div>
                <div className={styles.identity}>
                  <Body1Strong>Reviewed text</Body1Strong>
                  <Body1 as="p" className={styles.text}>
                    {topic.current === undefined ? 'Not available in this saved review.' : topic.current === '' ? '(empty)' : topic.current}
                  </Body1>
                </div>
                {topic.suggested !== undefined && !topic.remediation?.suggestedText && (
                  <div className={styles.identity}>
                    <Body1Strong>Suggested correction</Body1Strong>
                    <Body1 as="p" className={styles.text}>{topic.suggested === '' ? '(empty)' : topic.suggested}</Body1>
                  </div>
                )}
                <ReviewEvidenceDetails evidence={topic.evidence} />
                <ContextualRemediationDetails remediation={topic.remediation} headingLevel="h5" />
              </li>
              );
            })}
          </ul>
        ) : (
          <Body1>
            {pattern.status === true
              ? 'No affected settings were recorded for this passed check.'
              : 'No per-setting evidence was recorded. See the assessment reason above.'}
          </Body1>
        )}
      </section>
    </div>
  );
}

/** Standalone details dialog for a selected standard-review pattern. */
export function PatternDetailsDialog({ open, pattern, onClose }: PatternDetailsDialogProps) {
  const styles = useStyles();
  if (!pattern) return null;
  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" aria-label="Close pattern details" icon={<Dismiss24Regular />} onClick={onClose} />}>
            {pattern.patternName}
          </DialogTitle>
          <DialogContent><PatternFindingDetails pattern={pattern} /></DialogContent>
          <DialogActions><Button appearance="primary" onClick={onClose}>Close</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
