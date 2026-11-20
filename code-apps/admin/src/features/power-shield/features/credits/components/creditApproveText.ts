import {
  MIN_NONZERO_TOTAL,
  type AllocateBlock,
  type ApproveBlock,
  type ApprovalWarning,
  type ReviewSnapshot,
  type TenantDrawState,
} from '../services/creditApprovalRules';

export type ApprovalChoice = 'skip' | 'allocate';

export const WARNING_TEXT: Record<ApprovalWarning, string> = {
  PaygLinkedInactive:
    "Pay-as-you-go isn't on for Copilot Credits in this environment, so extra use isn't billed. Add enough credits.",
};

/** Shown when the environment had no credits entry, so the app will keep PPAC's default rule. */
export const DEFAULTED_RULES_TEXT =
  "Credits haven't been set for this environment before. When it runs out, it will keep using your tenant's spare credits, as it does now.";

/** Plain explanation for a block on the Allocate path (FR-012). */
export function allocateBlockText(b: AllocateBlock, review: Pick<ReviewSnapshot, 'current' | 'available'>): string {
  switch (b) {
    case 'NoValidTotal':
      return `Your tenant has only ${review.available.toLocaleString()} spare credits. This environment has ${review.current.toLocaleString()} and needs at least ${MIN_NONZERO_TOTAL.toLocaleString()} in total.`;
    case 'UnknownRule':
      return "This environment has a credit setting the app doesn't understand. Add credits in the Power Platform admin center instead.";
    case 'NoRules':
      return "This environment's credit settings are empty, so the app can't safely change them. Add credits in the Power Platform admin center instead.";
  }
}

/** True when the block can only be fixed in PPAC, so a link should be shown. */
export function needsPpacLink(b: ApproveBlock): boolean {
  return b === 'UnknownRule' || b === 'NoRules';
}

/** Confirm-step warning when the admin adds fewer credits than the maker asked for (spec 027). */
export function belowRequestText(requested: number): string {
  return `That's less than the ${requested.toLocaleString()} the maker asked for. Please say why in the comment. The comment is required, and the maker sees it.`;
}

/** Hint under the amount box when the spare credits cap the maker's request (spec 027). */
export function spareCapHint(requested: number, available: number): string {
  return requested > available
    ? `The maker asked for ${requested.toLocaleString()}, but only ${available.toLocaleString()} are spare.`
    : `The maker asked for ${requested.toLocaleString()}.`;
}

// ── Microsoft 365 admin center (MAC) scope ──────────────────────────────────
// No API reveals whether a MAC spending policy covers an environment, so these
// messages are static and shown to every admin.

export const MAC_SCOPE_LEARN_URL =
  'https://learn.microsoft.com/copilot/implement/usage-based-billing-manage-copilot-studio-costs';
export const M365_ADMIN_LINK = 'https://admin.microsoft.com';
/** List banner, rendered as: <LIST_TEXT> [Power Platform admin center]. [Learn more] */
export const MAC_SCOPE_LIST_TEXT = 'You can approve credits for environments whose Copilot Credits are managed in the';
export const MAC_SCOPE_LIST_PPAC = 'Power Platform admin center';
/** Dialog check sentence, rendered as: Check [PPAC] if this environment uses an [M365] spending policy. */
export const MAC_SCOPE_CHECK_PPAC = 'PPAC';
export const MAC_SCOPE_CHECK_MIDDLE = 'if this environment uses an';
export const MAC_SCOPE_CHECK_M365 = 'M365';
export const MAC_SCOPE_CHECK_END = 'spending policy.';
export const MAC_SCOPE_ASSIGN_TITLE = 'Before you approve';
export const MAC_SCOPE_ASSIGN_NEXT = 'If it does, reject the request instead.';
export const MAC_SCOPE_APPROVE_NEXT = 'If it does, close this dialog and reject the request instead.';

// ── Spec 032: tenant draw ───────────────────────────────────────────────────

export const DRAW_STAT_LABEL = 'Draw from tenant';
export const DRAW_STAT_TIP =
  "Whether this environment can use your tenant's unassigned credits when its own run out, or if it has none.";
export const DRAW_GROUP_HINT_END = 'If the environment group has tenant draw turned off, approval fails.';
export const DRAW_LOCKED_NEXT = 'Approve without tenant draw, or reject the request.';

/** Spec 032 US5-AS4: editable starting comment for Reject after the group lock. */
export function drawLockedRejectComment(groupName?: string): string {
  const group = groupName ? `The ${groupName} environment group` : 'Its environment group';
  return `Tenant draw can't be turned on for this environment. ${group} has tenant draw turned off.`;
}
export const DRAW_HINT_ON =
  "The maker asked for this. This environment can then use your tenant's unassigned credits when its own run out, or if it has none.";
export const DRAW_HINT_ALREADY_ON = 'Already on for this environment. Nothing to change.';
export const DRAW_HINT_PAYG = 'Not changed while pay-as-you-go is active.';
export const DRAW_DECLINED_TEXT = "The maker asked for tenant draw, but you're not turning it on. Say why in the comment.";
export const SUPERSEDED_PAYG_TEXT =
  "Pay-as-you-go turned on while you were reviewing, so nothing was saved. Tenant draw isn't changed while pay-as-you-go is active. Check the new details and try again.";
export const SUPERSEDED_CHANGED_TEXT =
  'This environment or request changed while you were reviewing, so nothing was saved. Check the new details and try again.';

export function drawStateText(state: TenantDrawState): string {
  return state === 'off' ? 'Off' : state === 'on' ? 'On' : 'On (default)';
}

export function paygDrawText(policyName?: string): string {
  const policy = policyName ? `the billing policy "${policyName}"` : 'the linked billing policy';
  return `Pay-as-you-go is active through ${policy}. Tenant draw isn't changed while pay-as-you-go is active.`;
}

/** The value after "Draw from tenant:" on the Confirm step. */
export function confirmDrawText(requested: boolean, state: TenantDrawState, turnOn: boolean): string {
  if (!requested) return `not requested, stays ${state === 'off' ? 'off' : 'on'}`;
  if (state !== 'off') return 'already on, no change';
  return turnOn ? 'turns on' : 'stays off';
}

export function approveButtonLabel(addCredits: boolean, turnOn: boolean): string {
  if (addCredits && turnOn) return 'Approve and apply';
  if (addCredits) return 'Approve and add credits';
  return turnOn ? 'Approve and turn on' : 'Approve without changes';
}

/** Success text. The notify line is added by the caller. */
export function succeededText(requestNumber: string, total: number, creditsAdded: boolean, drawTurnedOn: boolean): string {
  const parts: string[] = [];
  if (creditsAdded) parts.push(`now has ${total.toLocaleString()} credits`);
  if (drawTurnedOn) parts.push('tenant draw is on');
  return parts.length === 0
    ? 'Approved without changes.'
    : `Approved. ${requestNumber} ${parts.join(' and ')}, verified in Power Platform.`;
}
