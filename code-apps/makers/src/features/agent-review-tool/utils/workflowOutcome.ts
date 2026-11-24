/**
 * What the Review Agent Components workflow actually returned, as something a reader can act on.
 *
 * ## Why this exists
 *
 * The results page used to render a green "Workflow verified" badge and a unit count whenever
 * provenance was present at all. Provenance is written on every standard review, including one
 * where the workflow returned nothing, so a review that assessed none of its non-deterministic
 * rules still announced itself as verified — next to fifteen rules reading "Could not run". The
 * badge was describing the existence of a job, not its outcome.
 *
 * The count had the same problem: `units` is built from the corpus, so it is always five. "5 result
 * units" was a property of the request, not the response.
 *
 * ## What the states mean
 *
 * A unit is `missing` when the workflow never wrote a result row for it. Zero rows is the ordinary
 * shape of a freshly imported environment, where the flow arrives stopped and its connection
 * references unconsented — which is a setup step nobody has been told about yet, not a finding
 * about the agent. Saying so plainly is the whole point of this module: the reader needs to know
 * the difference between "your agent has problems" and "this environment is not finished".
 */

import type { StandardReviewWorkflowProvenance } from '../contracts/StandardReviewWorkflow';

export type WorkflowOutcomeState = 'verified' | 'partial' | 'did-not-run';

export interface WorkflowOutcomeNotice {
  intent: 'warning' | 'info';
  title: string;
  body: string;
}

export interface WorkflowOutcome {
  state: WorkflowOutcomeState;
  succeededUnits: number;
  totalUnits: number;
  badgeLabel: string;
  badgeColor: 'success' | 'warning' | 'danger';
  /** Reader-facing banner, or null when the workflow did its job and there is nothing to say. */
  notice: WorkflowOutcomeNotice | null;
}

const SETUP_ACTION =
  'turn the Review Agent Components flow on and consent to its Dataverse and Agents connection '
  + 'references, then review the agent again';

function buildNotice(
  state: WorkflowOutcomeState,
  succeeded: number,
  total: number,
): WorkflowOutcomeNotice | null {
  if (state === 'verified') return null;

  if (state === 'partial') {
    return {
      intent: 'warning',
      title: 'The review workflow returned only part of its answer',
      body:
        `${succeeded} of ${total} result units came back, so the checks the rest of them answer are `
        + `reported as "Could not run" rather than assessed. Reviewing the agent again usually `
        + 'resolves this; if it keeps happening, check the flow run history for a failed run.',
    };
  }

  return {
    intent: 'warning',
    title: "The review workflow didn't run",
    body:
      'No results came back from the Review Agent Components flow, so every check it answers is '
      + 'reported as "Could not run" rather than assessed. This is a setup problem in this '
      + 'environment, not a finding about the agent: a newly imported solution arrives with the '
      + `flow stopped and its connections unconsented. To fix it, ${SETUP_ACTION}.`,
  };
}

/**
 * Classify a finished standard review by what the workflow returned.
 *
 * Counts `succeeded` units rather than trusting the presence of provenance, because provenance is
 * written either way.
 */
export function describeWorkflowOutcome(
  provenance: StandardReviewWorkflowProvenance,
): WorkflowOutcome {
  const totalUnits = provenance.units.length;
  const succeededUnits = provenance.units.filter((unit) => unit.status === 'succeeded').length;

  const state: WorkflowOutcomeState =
    totalUnits > 0 && succeededUnits === totalUnits
      ? 'verified'
      : succeededUnits > 0
        ? 'partial'
        : 'did-not-run';

  const badgeLabel =
    state === 'verified'
      ? 'Workflow verified'
      : state === 'partial'
        ? 'Workflow incomplete'
        : "Workflow didn't run";

  const badgeColor =
    state === 'verified' ? 'success' : state === 'did-not-run' ? 'danger' : 'warning';

  return {
    state,
    succeededUnits,
    totalUnits,
    badgeLabel,
    badgeColor,
    notice: buildNotice(state, succeededUnits, totalUnits),
  };
}
