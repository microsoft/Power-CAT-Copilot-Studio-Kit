import {
  MIN_NONZERO_TOTAL,
  isNothingToChange,
  type ApproveBlock,
  type ApproveAvailability,
  type CreditAllocationErrorKind,
  type PaygStatus,
} from '../services/creditApprovalRules';
import type { CreditSnapshot } from '../services/creditCapacity';
import { WARNING_TEXT, allocateBlockText, needsPpacLink } from './creditApproveText';

// Read-only wording for the credits check card. The service's own messages talk about saving, so they aren't reused.

export type CapacityPart = 'env' | 'spare' | 'payg';

const PART_FAILURE: Record<CapacityPart, string> = {
  env: "Couldn't load this environment's credits.",
  spare: "Couldn't load your tenant's spare credits.",
  payg: "Couldn't load the billing policy.",
};

export const ACCESS_DENIED_TEXT =
  "Power Platform didn't allow access. Sign in again if asked, and check that you have the Power Platform Administrator role.";

/** Message for one failed read. Adds a hint when Power Platform was busy. */
export function partFailureText(part: CapacityPart, kind: CreditAllocationErrorKind): string {
  const base = PART_FAILURE[part];
  return kind === 'Throttled' ? `${base} Power Platform is busy. Wait a minute, then select Refresh.` : base;
}

/** What the billing-policy row says for each pay-as-you-go state. The card hides the row for 'none'. */
export function paygStatusText(status: PaygStatus, policyName?: string): string {
  switch (status) {
    case 'active':
      return policyName ? `Pay-as-you-go is on through "${policyName}".` : 'Pay-as-you-go is on through a billing policy.';
    case 'linkedInactive':
      return WARNING_TEXT.PaygLinkedInactive;
    case 'none':
      return 'No pay-as-you-go billing policy is linked to this environment.';
  }
}

/** Shown under the range when pay-as-you-go is active (FR-008). */
export function paygApproveText(policyName?: string): string {
  return policyName
    ? `You can also approve without adding credits. Extra use is billed through the billing policy "${policyName}".`
    : 'You can also approve without adding credits. Extra use is billed through the billing policy.';
}

/** The "What you can add" sentence (FR-007). */
export function addRangeText(min: number, max: number, current: number): string {
  const range = `To approve with credits, add between ${min.toLocaleString()} and ${max.toLocaleString()}.`;
  return current < MIN_NONZERO_TOTAL
    ? `${range} This environment needs at least ${MIN_NONZERO_TOTAL.toLocaleString()} in total.`
    : range;
}

/** How the maker's request compares with the tenant's spare credits (spec 027). */
export function requestFitText(requested: number, spare: number): string {
  return requested <= spare
    ? `The maker's request of ${requested.toLocaleString()} fits in your spare credits.`
    : `The maker asked for ${requested.toLocaleString()}, but only ${spare.toLocaleString()} are spare. If you add less, explain why in your approval comment.`;
}

// ── Spec 030: proactive credits check on the request page ───────────────────────

/** Id of the credits check card's header button, so other parts of the page can move focus to it. */
export const CREDITS_CHECK_HEADER_ID = 'credits-check-header';
export const CHECKING_TEXT = 'Checking whether you can approve this request…';
export const UNKNOWN_BAR_TEXT = "Couldn't check Copilot Credits. Approve will check again when you open it.";
export const ATTEMPT_OPEN_TEXT = 'An earlier approval needs attention. Use Retry in the bar above before you decide.';

export interface CheckVerdict {
  intent: 'success' | 'warning' | 'error';
  title: string;
  lines: string[];
  /** Show a link to the Power Platform admin center. */
  ppac: boolean;
  /** A clean pass. An enabled Approve already says this, so the card only announces it to screen readers. */
  quiet?: boolean;
}

/** The facts the verdict needs. Only read when the matching part loaded. */
export interface VerdictFacts {
  current?: number;
  spare?: number;
  paygStatus?: PaygStatus;
  paygPolicyName?: string;
  requested?: number;
}

/** The facts the verdict wording needs, taken only from reads that worked. */
export function toVerdictFacts(s: CreditSnapshot | null, requested?: number): VerdictFacts {
  return {
    current: s?.env.ok ? s.env.value.allocated : undefined,
    spare: s?.spare.ok ? s.spare.value : undefined,
    paygStatus: s?.payg.ok ? s.payg.value.status : undefined,
    paygPolicyName: s?.payg.ok ? s.payg.value.policyName : undefined,
    requested,
  };
}

export const NO_SPARE_TITLE = 'Not enough spare credits to approve.';
export const NOTHING_TO_APPROVE_TITLE = 'Nothing to approve.';

function blockLine(b: ApproveBlock, f: VerdictFacts): string {
  if (b === 'DrawAlreadyOn') {
    return "The maker asked only for tenant draw, and it's already on for this environment. Reject the request and let the maker know in the comment.";
  }
  if (b === 'PaygCoversDraw') {
    return "The maker asked only for tenant draw. Pay-as-you-go is active, so the app doesn't change tenant draw. Reject the request and let the maker know in the comment.";
  }
  if (b === 'UnknownRule') {
    return "This environment has a credit setting the app doesn't understand. Adding credits won't fix this. Change the credits in the Power Platform admin center instead.";
  }
  if (b === 'NoRules') return allocateBlockText(b, { current: f.current ?? 0, available: f.spare ?? 0 });
  // The title and the stats already say why, so only the next step is given.
  return f.paygStatus === 'linkedInactive'
    ? 'Turn on pay-as-you-go for Copilot Credits on the linked billing policy, or buy more Copilot Credits.'
    : 'Buy more Copilot Credits, or link an active pay-as-you-go billing policy to this environment.';
}

function billedThrough(policyName?: string): string {
  return policyName ? `Extra use is billed through "${policyName}".` : 'Extra use is billed through the billing policy.';
}

/** What the credits check card says. Undefined while the check is still running. */
export function checkVerdict(a: ApproveAvailability, f: VerdictFacts): CheckVerdict | undefined {
  switch (a.kind) {
    case 'checking':
      return undefined;
    case 'unknown':
      return {
        intent: 'error',
        title: "Couldn't check Copilot Credits.",
        lines: ['Select Refresh to try again. You can still open Approve. It checks everything again before it saves.'],
        ppac: false,
      };
    case 'blocked':
      return {
        intent: 'warning',
        title: blockedTitle(a.blocks),
        lines: a.blocks.map((b) => blockLine(b, f)),
        ppac: a.blocks.some(needsPpacLink),
      };
    case 'ok':
      if (a.via === 'payg') {
        const why =
          f.spare !== undefined && f.current !== undefined
            ? "Credits can't be added to this environment right now, but pay-as-you-go is on."
            : 'Pay-as-you-go is on for this environment.';
        return {
          intent: 'success',
          title: 'You can approve without adding credits.',
          lines: [`${why} ${billedThrough(f.paygPolicyName)}`],
          ppac: false,
        };
      }
      return allocateVerdict(f);
  }
}

function allocateVerdict(f: VerdictFacts): CheckVerdict {
  const current = f.current ?? 0;
  const spare = f.spare ?? 0;
  const lines = [addRangeText(Math.max(1, MIN_NONZERO_TOTAL - current), spare, current)];
  if (f.requested !== undefined) lines.push(requestFitText(f.requested, spare));
  if (f.paygStatus === 'active') lines.push(paygApproveText(f.paygPolicyName));
  const short = f.requested !== undefined && f.requested > spare;
  return {
    intent: short ? 'warning' : 'success',
    title: 'Your credits allow approval.',
    lines,
    ppac: false,
    quiet: !short,
  };
}

function blockedTitle(blocks: ApproveBlock[]): string {
  if (blocks.some(isNothingToChange)) return NOTHING_TO_APPROVE_TITLE;
  return blocks.includes('NoValidTotal') ? NO_SPARE_TITLE : "You can't approve this request yet.";
}

/** Short reason for the Approve tooltip and the bar above the tabs. */
export function blockedShortText(blocks: ApproveBlock[]): string {
  if (blocks.includes('DrawAlreadyOn')) return 'Nothing to approve. Tenant draw is already on for this environment.';
  if (blocks.includes('PaygCoversDraw')) return "Nothing to approve. Pay-as-you-go is active, so tenant draw isn't changed.";
  return blocks.includes('NoValidTotal')
    ? NO_SPARE_TITLE
    : "You can't approve yet. This environment has a credit setting the app can't change.";
}

/** Approve tooltip while Approve is turned off. Undefined when Approve is on. */
export function approveOffTip(a: ApproveAvailability): string | undefined {
  if (a.kind === 'checking') return CHECKING_TEXT;
  if (a.kind !== 'blocked') return undefined;
  return `${blockedShortText(a.blocks)} See the Copilot Credits check on the Summary tab.`;
}

export type CheckBadgeColor = 'informative' | 'warning' | 'danger' | 'success';

/** Badge shown next to the card heading when the card is collapsed. */
export function checkBadge(a: ApproveAvailability, f: VerdictFacts): { label: string; color: CheckBadgeColor } {
  switch (a.kind) {
    case 'checking':
      return { label: 'Checking…', color: 'informative' };
    case 'blocked':
      return a.blocks.some(isNothingToChange)
        ? { label: 'Nothing to approve', color: 'warning' }
        : { label: "Can't approve yet", color: 'warning' };
    case 'unknown':
      return { label: "Couldn't check", color: 'danger' };
    case 'ok':
      return a.via === 'allocate' && f.requested !== undefined && f.spare !== undefined && f.requested > f.spare
        ? { label: 'Needs attention', color: 'warning' }
        : { label: 'Credits allow approval', color: 'success' };
  }
}

/** Note after the approved amount when it's lower than the request (spec 027). Undefined when not lower. */
export function approvedVsRequestedText(approved: number, requested: number | undefined): string | undefined {
  if (requested === undefined || approved >= requested) return undefined;
  return `(${(requested - approved).toLocaleString()} less than requested, see Comments)`;
}

/** One Activity tab row in plain words. `reference` is the attempt ID support needs. */
export interface ActivityView {
  action: string;
  summary: string;
  reference?: string;
}

interface ActivityDetail {
  attemptId?: string;
  before?: number;
  target?: number;
  verified?: number;
  turnOnDraw?: boolean;
  outcome?: string;
  error?: string;
  note?: string;
  comment?: string;
  step?: string;
  assignedTo?: string;
  assignedFrom?: string;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function parseDetail(raw: string | undefined): ActivityDetail | undefined {
  if (!raw?.trim().startsWith('{')) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      attemptId: str(o.attemptId), before: num(o.before), target: num(o.target), verified: num(o.verified),
      turnOnDraw: o.turnOnDraw === true, outcome: str(o.outcome), error: str(o.error), note: str(o.note),
      comment: str(o.comment), step: str(o.step), assignedTo: str(o.assignedTo), assignedFrom: str(o.assignedFrom),
    };
  } catch {
    return undefined;
  }
}

function approvedText(d: ActivityDetail): ActivityView {
  const end = d.verified ?? d.target;
  const added = d.before !== undefined && end !== undefined && end > d.before ? end - d.before : undefined;
  const parts: string[] = [];
  if (added !== undefined) {
    parts.push(`Added ${added.toLocaleString()} credits (from ${d.before!.toLocaleString()} to ${end!.toLocaleString()}).`);
  }
  if (d.turnOnDraw) parts.push('Turned on tenant draw.');
  if (d.verified !== undefined) parts.push('Confirmed in Power Platform.');
  const action =
    added !== undefined && d.turnOnDraw ? 'Approved - credits added and tenant draw turned on'
      : added !== undefined ? 'Approved - credits added'
        : d.turnOnDraw ? 'Approved - tenant draw turned on'
          : 'Approved';
  return { action, summary: parts.join(' ') };
}

/**
 * Turns a stored activity row into readable text. The JSON stays in Dataverse as the audit record;
 * the label is derived from the outcome, so older rows read correctly too. Non-JSON detail is shown as is.
 */
export function describeActivity(action: string, raw: string | undefined): ActivityView {
  const d = parseDetail(raw);
  if (!d) return { action, summary: raw?.trim() || '-' };
  if (d.assignedTo) {
    return {
      action: d.assignedFrom ? 'Request reassigned' : 'Request assigned',
      summary: d.assignedFrom ? `Reassigned from ${d.assignedFrom} to ${d.assignedTo}.` : `Assigned to ${d.assignedTo}.`,
    };
  }
  if (!d.outcome) return { action, summary: d.comment ?? d.note ?? '-', reference: d.attemptId };
  const failedAt = d.step ? `Failed step: ${d.step}. ` : '';

  let view: ActivityView;
  switch (d.outcome) {
    case 'Succeeded':
      view = approvedText(d);
      break;
    case 'Skipped':
      view = {
        action: 'Approved without adding credits',
        summary: d.before !== undefined
          ? `Pay-as-you-go covers this environment. Credits stay at ${d.before.toLocaleString()}.`
          : 'Pay-as-you-go covers this environment.',
      };
      break;
    case 'FailedRetryable':
    case 'FailedPermanent':
      view = { action: 'Approval failed', summary: failedAt + (d.error ?? "The change didn't go through.") };
      break;
    case 'UnknownOutcome':
      view = { action: 'Approval result unknown', summary: d.error ?? "Couldn't confirm the change in Power Platform." };
      break;
    case 'Superseded':
      view = { action: 'Approval stopped', summary: 'Something changed in Power Platform first, so nothing was changed.' };
      break;
    default:
      view = { action, summary: d.error ?? '-' };
  }
  const summary = [view.summary, d.note].filter((s) => s && s !== '-').join(' ') || '-';
  return { ...view, summary, reference: d.attemptId };
}
