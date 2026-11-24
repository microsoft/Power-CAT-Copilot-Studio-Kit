import type { ReviewStageStatus } from '../../contracts/ReviewResult';

/** Describe the saved score basis without assigning modern provenance to a legacy review. */
export function scoreBasisLabel(score: { basisVersion?: 2; status?: 'complete' | 'partial' }): string {
  if (score.basisVersion === undefined) return 'Legacy score (basis version 1) — rerun recommended';
  return score.status === 'partial'
    ? 'Grounded configuration score (v2) — Partial'
    : 'Grounded configuration score (v2)';
}

/** Describe the recorded instruction-coverage stage independently of agent findings. */
export function instructionCoverageExportLabel(status?: ReviewStageStatus): string {
  if (!status) return 'Unknown (legacy review)';
  switch (status.state) {
    case 'complete': return 'Complete';
    case 'partial': return 'Partial';
    case 'unavailable': return 'Not evaluated (classifier unavailable)';
    case 'not-applicable': return 'Not applicable (no instructions)';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
  }

}

/** Describe the host's saved cross-skill scope without inferring it from an old review's findings. */
export function crossSkillOrchestrationLabel(status?: ReviewStageStatus): string {
  if (!status) return 'Unknown (legacy review)';
  switch (status.state) {
    case 'complete': return 'Complete';
    case 'partial': return 'Partial';
    case 'unavailable': return 'Not evaluated (assessment unavailable)';
    case 'not-applicable': return 'Not applicable (fewer than two eligible skills)';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
  }
}
