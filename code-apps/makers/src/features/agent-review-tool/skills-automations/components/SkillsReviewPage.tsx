/**
 * Skills and Automations review result page.
 * Path: /agent-review-tool/skills/:reviewId
 *
 * The third tab's results now open on their own screen, as the Copilot Studio
 * and M365 Declarative reviews already do. Before this, the result replaced the
 * tab's contents in place: the reader stayed on the landing page URL, the tab
 * strip stayed on screen above the result, and there was no breadcrumb out —
 * three ways in which the same information looked like a different product
 * depending on which tab produced it.
 *
 * Keyed by `reviewId` and not by artifact hash, matching
 * `DeclarativeReviewRoute`: the same bytes can be reviewed more than once, and
 * a saved row is the thing a link should point at.
 *
 * A freshly finished review is handed over in router state so the page can
 * paint it without waiting for Dataverse to return the row that was written a
 * moment earlier. The id remains the source of truth on reload.
 */

import { useCallback, useState } from 'react';
import {
  MessageBar, MessageBarBody, Spinner, makeStyles, tokens,
} from '@fluentui/react-components';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ArtifactFinding, ArtifactReviewResult } from '../contracts/ArtifactReview';
import { useArtifactReviewRecord } from '../hooks/useArtifactReviewRecord';
import { ArtifactResultsPanel } from './ArtifactResultsPanel';

/** Returning here must put the reader back on the tab they came from. */
export const SKILLS_TAB_PATH = '/agent-review-tool?tab=skills-automations';

/**
 * Router state carried from the tab, so a review that has just been written
 * does not have to be read back before it can be shown.
 */
export interface SkillsReviewLocationState {
  result?: ArtifactReviewResult;
}

const useStyles = makeStyles({
  panel: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}` },
  centred: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

export interface SkillsReviewPageProps {
  reviewId: string;
}

export function SkillsReviewPage({ reviewId }: SkillsReviewPageProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const handedOver = (location.state as SkillsReviewLocationState | null)?.result ?? null;

  const { review, isLoading, loadError, notFound } = useArtifactReviewRecord(reviewId);

  const [selectedFinding, setSelectedFinding] = useState<ArtifactFinding | null>(null);

  const handleBack = useCallback(() => navigate(SKILLS_TAB_PATH), [navigate]);

  /**
   * "Review another" returns to the tab and opens the upload dialog there. The
   * dialog belongs to the tab, which owns the duplicate check and the history
   * write; re-creating it here would fork that logic.
   */
  const handleReviewAnother = useCallback(
    () => navigate(SKILLS_TAB_PATH, { state: { openUpload: true } }),
    [navigate],
  );

  // The handed-over result wins: it is the same review, and it is already here.
  const result = handedOver ?? review?.result ?? null;

  if (!result && isLoading) {
    return (
      <div className={styles.centred}>
        <Spinner label="Loading saved review…" />
      </div>
    );
  }

  if (!result && loadError) {
    return (
      <div className={styles.panel}>
        <MessageBar intent="error">
          <MessageBarBody>Review could not be loaded: {loadError}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (!result || notFound) {
    return (
      <div className={styles.panel}>
        <MessageBar intent="error">
          <MessageBarBody>
            This review is unavailable. It may have been deleted, or you may not have access
            to it.
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  return (
    <ArtifactResultsPanel
      result={result}
      selectedFinding={selectedFinding}
      onSelectFinding={setSelectedFinding}
      onDismissFinding={() => setSelectedFinding(null)}
      onReviewAnother={handleReviewAnother}
      onBack={handleBack}
    />
  );
}
