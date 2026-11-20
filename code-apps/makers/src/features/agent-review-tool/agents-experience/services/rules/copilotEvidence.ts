import type { AeComponentIdentity } from '../../contracts/AgentsExperienceModel';
import type { GroundedFinding } from '../../contracts/Findings';
import type { UnifiedEvidence, UnifiedOutcome } from '../../contracts/UnifiedReview';
import type { CopilotInspection } from './copilotRuleDefinition';

interface CapturedSubject extends AeComponentIdentity { name: string; schemaname: string }

export interface CopilotFindingDetail {
  finding: GroundedFinding;
  subject: string;
  subjectId?: string;
  evidence: readonly UnifiedEvidence[];
}

/** Retain schema/ID at the predicate site; names and array positions never supply identity. */
export function capturedEvidence(
  component: CapturedSubject, fieldPath: string, quote?: string,
): UnifiedEvidence {
  const componentId = component.componentIdUnique?.trim() || component.componentId?.trim() || undefined;
  const schemaName = component.schemaname?.trim() || undefined;
  return {
    componentId, schemaName, fieldPath, quote,
    status: componentId || schemaName ? 'verified' : 'unavailable',
    reason: componentId || schemaName ? 'Captured static configuration; no runtime behavior was observed.'
      : 'This captured component has no stable ID or schema name.',
  };
}

/** Bind a finding to the subject already held by its evaluator, not a later display-name lookup. */
export function capturedFinding(
  finding: GroundedFinding, component: CapturedSubject, fieldPath: string, quote?: string,
): CopilotFindingDetail {
  const evidence = capturedEvidence(component, fieldPath, quote);
  return {
    finding, subject: component.name, subjectId: evidence.componentId ?? evidence.schemaName, evidence: [evidence],
  };
}

/** Shared projection for rules with one contextual finding per affected component. */
export function copilotComponentResult<T extends CapturedSubject>(
  outcome: UnifiedOutcome, components: readonly T[], fieldPath: string,
  finding: (component: T) => GroundedFinding, quote: (component: T) => string | undefined,
): CopilotInspection {
  const findingDetails = components.map(component => capturedFinding(finding(component), component, fieldPath, quote(component)));
  return { outcome, legacy: findingDetails.map(d => d.finding), findingDetails };
}
