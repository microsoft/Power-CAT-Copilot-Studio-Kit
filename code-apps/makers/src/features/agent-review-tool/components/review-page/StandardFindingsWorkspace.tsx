import { useState } from 'react';
import {
  Button,
  Caption1,
  Skeleton,
  SkeletonItem,
  Text,
  makeStyles,
  tokens,
  useId,
} from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import type { StandardReviewShellModel, StandardTabId } from '../../adapters/standardReviewShellModel';
import type { ReviewResult } from '../../contracts/ReviewResult';
import { ComplianceDataGrid } from '../grids/ComplianceDataGrid';
import { PatternsDataGrid } from '../grids/PatternsDataGrid';

const useStyles = makeStyles({
  panel: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  intro: {
    display: 'block',
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalS,
  },
  instructionsSection: {
    marginBottom: tokens.spacingVerticalM,
  },
  instructionsToggle: {
    justifyContent: 'flex-start',
  },
  instructionsBody: {
    marginTop: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  instructionsText: {
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.6,
  },
  skeletonRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  skeletonRow: {
    height: '36px',
  },
});

export interface StandardFindingsWorkspaceProps {
  review: ReviewResult;
  model: StandardReviewShellModel;
  isLoadingDetails: boolean;
  selectedPatternIndex: number | null;
  selectedCriterionIndex: number | null;
  selectedTab: StandardTabId;
  onOpenPattern: (index: number | null, trigger: HTMLButtonElement) => void;
  onOpenCriterion: (index: number | null, trigger: HTMLButtonElement) => void;
}

/** Render the two finding categories as sub-tabs under Review findings. */
export function StandardFindingsWorkspace({
  review,
  model,
  isLoadingDetails,
  selectedPatternIndex,
  selectedCriterionIndex,
  selectedTab,
  onOpenPattern,
  onOpenCriterion,
}: StandardFindingsWorkspaceProps) {
  const styles = useStyles();
  const instructionsBodyId = useId('standard-review-instructions');
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const renderSkeleton = (rows: number) => (
    <Skeleton>
      <div className={styles.skeletonRows}>
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonItem key={index} className={styles.skeletonRow} />
        ))}
      </div>
    </Skeleton>
  );
  const assessmentStatusNote = (
    <Caption1 className={styles.intro}>
      N/A and Not assessed results are excluded from the score. Hover over or focus a status
      for its meaning, or open Details for the recorded reason and evidence.
    </Caption1>
  );

  return selectedTab === 'patterns' ? (
    <div className={styles.panel}>
      {assessmentStatusNote}
      {isLoadingDetails
        ? renderSkeleton(review.patternTotalCount ?? 8)
        : (
          <PatternsDataGrid
            patterns={model.patternRows}
            selectedId={
              selectedPatternIndex !== null
                ? model.patternRows[selectedPatternIndex]?.id
                : undefined
            }
            onViewDetails={(pattern, trigger) => {
              const index = model.patternRows.findIndex(row => row.id === pattern.id);
              onOpenPattern(index >= 0 ? index : null, trigger);
            }}
          />
        )}
    </div>
  ) : (
    <div className={styles.panel}>
      {assessmentStatusNote}
      {review.complianceSummary && (
        <div className={styles.instructionsSection}>
          <Button
            appearance="subtle"
            className={styles.instructionsToggle}
            icon={summaryExpanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
            onClick={() => setSummaryExpanded(value => !value)}
            aria-expanded={summaryExpanded}
            aria-controls={instructionsBodyId}
          >
            Instruction analysis
          </Button>
          <div
            id={instructionsBodyId}
            className={styles.instructionsBody}
            hidden={!summaryExpanded}
          >
            <Text size={200} className={styles.instructionsText}>
              {review.complianceSummary}
            </Text>
          </div>
        </div>
      )}
      {isLoadingDetails
        ? renderSkeleton(15)
        : (
          <ComplianceDataGrid
            criteria={model.complianceRows}
            selectedId={
              selectedCriterionIndex !== null
                ? model.complianceRows[selectedCriterionIndex]?.id
                : undefined
            }
            onViewDetails={(criterion, trigger) => {
              const index = model.complianceRows.findIndex(row => row.id === criterion.id);
              onOpenCriterion(index >= 0 ? index : null, trigger);
            }}
          />
        )}
    </div>
  );
}
