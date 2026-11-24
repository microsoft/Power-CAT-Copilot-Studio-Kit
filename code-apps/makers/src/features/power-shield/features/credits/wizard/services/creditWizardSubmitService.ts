import { submitCreditRequest } from '../../../../shared/services/dataverse/creditRequestService';
import type {
  CreditWizardEnvironment,
  CreditSubmitOutcome,
} from '../../../../models/creditRequest';

export { mergeSubmitOutcomes } from '../contexts/creditWizardTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Credit wizard submit adapter (spec 016, T022/T023).
//
// Submit path decision (2026-09-17, confirmed with user): the Makers slice submits
// through the existing CLIENT-SIDE repository `submitCreditRequest` fan-out, not a
// server command. The server-side SubmitCreditRequest command (contracts/
// credit-server-commands.md) and true cross-environment transactionality remain a
// cross-slice server gate scoped OUT of this client (data-model.md §7a). Partial
// success is therefore expected and first-class (A-5).
//
// This adapter maps wizard state → the repository payload, then shapes the
// per-environment outcomes for the UI: it partitions created / conflict / failed
// and derives a retry set that targets ONLY `failed` environments — a `created`
// row must never be resubmitted, and a `conflict` is non-retryable until the
// owning active request is resolved (T023). A same-environment Connector row is
// never a conflict: the repository scopes the active-key check to Credits rows.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditWizardSubmitInput {
  environments: CreditWizardEnvironment[];
  justification: string;
  supportingDocument?: File;
  /** Parsed amounts keyed by environmentId. Missing is fine when the environment is ticked below. */
  requestedAmounts: Record<string, number>;
  /** `true` for environments where the maker asked to draw from tenant capacity (spec 031). */
  requestTenantDraw?: Record<string, boolean>;
  /** Present when submitting from a resumed draft; the repository validates + cleans it up. */
  draftRequestId?: string;
  createdByAadObjectId: string;
  createdByUpn: string;
}

export interface CreditWizardSubmitSummary {
  /** Raw per-environment outcomes, in submission order. Keyed by PP environment id. */
  outcomes: CreditSubmitOutcome[];
  created: CreditSubmitOutcome[];
  conflicts: CreditSubmitOutcome[];
  failed: CreditSubmitOutcome[];
  anyCreated: boolean;
  allCreated: boolean;
  /** Environments to resubmit on retry — only the `failed` ones. */
  retryEnvironments: CreditWizardEnvironment[];
}

export async function submitCreditWizard(
  input: CreditWizardSubmitInput,
): Promise<CreditWizardSubmitSummary> {
  const { results } = await submitCreditRequest({
    environments: input.environments,
    justification: input.justification,
    supportingDocument: input.supportingDocument,
    requestedAmounts: input.requestedAmounts,
    requestTenantDraw: input.requestTenantDraw,
    draftRequestId: input.draftRequestId,
    createdByAadObjectId: input.createdByAadObjectId,
    createdByUpn: input.createdByUpn,
  });

  return summarizeOutcomes(results, input.environments);
}

/** Pure shaping of repository outcomes — exported for unit tests (T025). */
export function summarizeOutcomes(
  outcomes: CreditSubmitOutcome[],
  submittedEnvironments: CreditWizardEnvironment[],
): CreditWizardSubmitSummary {
  const created = outcomes.filter((o) => o.status === 'created');
  const conflicts = outcomes.filter((o) => o.status === 'conflict');
  const failed = outcomes.filter((o) => o.status === 'failed');

  // Map the environmentGuid on each failed outcome back to the wizard environment
  // (id + display name) so a retry can resubmit exactly those envs (duck #12).
  const byId = new Map(submittedEnvironments.map((e) => [e.environmentId, e]));
  const retryEnvironments = failed
    .map((o) => byId.get(o.environmentGuid))
    .filter((e): e is CreditWizardEnvironment => e !== undefined);

  return {
    outcomes,
    created,
    conflicts,
    failed,
    anyCreated: created.length > 0,
    allCreated: outcomes.length > 0 && created.length === outcomes.length,
    retryEnvironments,
  };
}
