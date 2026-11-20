import type { AssessmentStatus, PatternTopic, TopicRuleApplicability } from '../contracts/StageOutputs';
import { isAssessmentStatus } from './reviewAssessment';

type ReferenceAssessment = Pick<PatternTopic, 'assessmentStatus' | 'assessmentReason'>;

function retainReason(original: string | undefined, reason: string): string {
  return original && original !== reason ? `${original}\n${reason}` : reason;
}

/** Read optional AI reference metadata without treating invalid or partial fields as legacy completion. */
export function readReferenceAssessment(reference: Record<string, unknown>): ReferenceAssessment {
  const hasStatus = Object.prototype.hasOwnProperty.call(reference, 'assessmentStatus');
  const hasReason = Object.prototype.hasOwnProperty.call(reference, 'assessmentReason');
  if (!hasStatus && !hasReason) return {};
  const reason = typeof reference.assessmentReason === 'string' ? reference.assessmentReason : undefined;
  if (!isAssessmentStatus(reference.assessmentStatus) || (hasReason && reason === undefined)) {
    return {
      assessmentStatus: 'not-assessed',
      assessmentReason: retainReason(reason, 'The reference assessment metadata is incomplete or unreadable.'),
    };
  }
  return { assessmentStatus: reference.assessmentStatus, assessmentReason: reason };
}

/** Record a validated reference outcome while retaining its original reason text. */
export function setReferenceAssessment(reference: PatternTopic, status: AssessmentStatus, reason: string): PatternTopic {
  return {
    ...reference, assessmentStatus: status,
    assessmentReason: retainReason(reference.assessmentReason, reason),
  };
}

/** Complete a fresh reference only when its assessment, identity, evidence and scope permit it. */
export function assessPatternReference(
  reference: PatternTopic, parentStatus: AssessmentStatus, scope: TopicRuleApplicability,
  verified: boolean, completionReason: string,
): PatternTopic {
  if (parentStatus === 'not-assessed' || parentStatus === 'not-applicable') {
    return setReferenceAssessment(reference, parentStatus, completionReason);
  }
  if (scope.status !== 'applicable') return setReferenceAssessment(reference, scope.status, scope.reason);
  const supplied = reference.assessmentStatus;
  if (supplied !== undefined && supplied !== 'pass' && supplied !== 'fail') {
    return setReferenceAssessment(reference, 'not-assessed',
      'A completed assessment was not returned for this eligible reference. Matching source text does not complete the assessment.');
  }
  if (!verified) {
    return setReferenceAssessment(reference, 'not-assessed',
      reference.evidence?.reason ?? 'The reference identity or evidence could not be confirmed.');
  }
  if (parentStatus === 'pass' && supplied === 'fail') {
    return setReferenceAssessment(reference, 'not-assessed',
      'The reference failure contradicts the returned category Pass; a consistent completed assessment was not established.');
  }
  return setReferenceAssessment(reference, supplied ?? parentStatus, completionReason);
}
