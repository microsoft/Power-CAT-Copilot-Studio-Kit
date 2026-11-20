import { Caption1 } from '@fluentui/react-components';
import { ActionGuidance } from '../../../components/review-page/StandardFindingContentShared';
import { useStandardFindingContentStyles } from '../../../components/review-page/standardFindingContentStyles';
import { copilotGuidanceSourceLabel } from '../../services/copilotContextualGuidance';
import type { FindingView } from '../viewTypes';

/** Reuse Standard authoring guidance without changing the recorded finding. */
export function FindingActionGuidance({ finding, impact }: {
  finding: Pick<FindingView, 'fix' | 'remediation'>;
  impact?: string;
}) {
  const styles = useStandardFindingContentStyles();
  const guidance = finding.remediation;
  if (!guidance) return null;
  return (
    <div className={styles.root}>
      <Caption1 as="p" className={styles.text}>{copilotGuidanceSourceLabel(guidance.source)}</Caption1>
      <ActionGuidance
        action={guidance.makerAction !== finding.fix ? guidance.makerAction : undefined}
        example={guidance.whyItMatters !== impact ? guidance.whyItMatters : undefined}
        suggestedText={guidance.suggestedText}
        verify={guidance.acceptanceCheck}
        headingLevel="h3"
      />
    </div>
  );
}
