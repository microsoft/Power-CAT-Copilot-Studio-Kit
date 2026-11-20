import {
  Badge,
  Body1,
  Body1Strong,
  Caption1,
} from '@fluentui/react-components';
import type { PatternDisplayRow } from '../../contracts/DisplayModels';
import type { ReviewEvidence } from '../../contracts/StageOutputs';
import { AssessmentStatusBadge } from '../core/AssessmentStatusBadge';
import { useStandardFindingContentStyles } from './standardFindingContentStyles';

export type GuidanceHeading = 'h3' | 'h5';

export type FindingBadgeRow = Pick<
  PatternDisplayRow,
  'status' | 'statusColor' | 'statusLabel' | 'severity' | 'severityColor' | 'category'
>;

/** Shows the saved result, inherent severity, and category without explanatory prose. */
export function FindingBadges({ assessment }: { assessment: FindingBadgeRow }) {
  const styles = useStandardFindingContentStyles();
  return (
    <div className={styles.badges}>
      <AssessmentStatusBadge
        status={assessment.status}
        statusColor={assessment.statusColor}
        statusLabel={assessment.statusLabel}
        size="large"
      />
      <Badge
        shape="rounded"
        appearance="tint"
        color={assessment.severityColor}
        size="large"
        aria-label={`Inherent severity: ${assessment.severity}`}
      >
        {assessment.severity} severity
      </Badge>
      <Badge shape="rounded" appearance="outline" color="informative" size="large">
        {assessment.category}
      </Badge>
    </div>
  );
}

/**
 * Shows the recommended action, an optional example for the reviewed agent,
 * an optional unapplied draft, and the verification step.
 */
export function ActionGuidance({
  action,
  example,
  suggestedText,
  verify,
  headingLevel,
}: {
  action?: string;
  example?: string;
  suggestedText?: string;
  verify?: string;
  headingLevel: GuidanceHeading;
}) {
  const styles = useStandardFindingContentStyles();
  return (
    <>
      {action && (
        <section className={styles.action}>
          <Body1Strong as={headingLevel} className={styles.heading}>
            Recommended action
          </Body1Strong>
          <Body1 as="p" className={styles.text}>{action}</Body1>
        </section>
      )}
      {example && (
        <section className={styles.suggestion}>
          <Body1Strong as={headingLevel} className={styles.heading}>
            Example for this agent
          </Body1Strong>
          <Body1 as="p" className={styles.text}>{example}</Body1>
        </section>
      )}
      {suggestedText !== undefined && (
        <section className={styles.suggestion}>
          <div className={styles.headingRow}>
            <Body1Strong as={headingLevel} className={styles.heading}>
              Draft change
            </Body1Strong>
            <Badge shape="rounded" appearance="tint" color="brand">Not applied</Badge>
          </div>
          <Body1 as="p" className={styles.text}>
            {suggestedText === '' ? '(empty)' : suggestedText}
          </Body1>
        </section>
      )}
      {verify && (
        <section className={styles.section}>
          <Body1Strong as={headingLevel} className={styles.heading}>How to verify</Body1Strong>
          <Body1 as="p" className={styles.text}>{verify}</Body1>
        </section>
      )}
    </>
  );
}

/** Shows saved evidence only when the user opens supporting review details. */
export function EvidenceDetails({ evidence }: { evidence?: ReviewEvidence }) {
  const styles = useStandardFindingContentStyles();
  if (!evidence) return <Body1>No evidence was recorded in this saved review.</Body1>;
  const sourceLabels = {
    configuration: 'Configuration',
    instructions: 'Reviewed instructions',
    'ai-response': 'AI response',
  };
  const statusLabels = {
    verified: 'Verified',
    unverified: 'Unverified',
    unavailable: 'Unavailable',
  };
  const statusLabel = statusLabels[evidence.status];
  return (
    <div className={styles.section}>
      <div className={styles.badges}>
        <Badge
          shape="rounded"
          appearance="outline"
          color="informative"
          aria-label={`Evidence validation: ${statusLabel}`}
        >
          {statusLabel}
        </Badge>
        <Caption1>Source: {sourceLabels[evidence.source]}</Caption1>
      </div>
      {evidence.setting && <Body1 className={styles.text}>Setting: {evidence.setting}</Body1>}
      {evidence.quote !== undefined && (
        <Body1 as="p" className={styles.text}>
          {evidence.quote === '' ? '(empty)' : evidence.quote}
        </Body1>
      )}
      {evidence.reason && <Body1 as="p" className={styles.text}>{evidence.reason}</Body1>}
    </div>
  );
}
