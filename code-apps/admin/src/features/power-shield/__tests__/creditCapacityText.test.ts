import { describe, it, expect } from 'vitest';
import {
  addRangeText,
  approvedVsRequestedText,
  requestFitText,
  partFailureText,
  paygApproveText,
  paygStatusText,
  checkVerdict,
  checkBadge,
  approveOffTip,
  CHECKING_TEXT,
  describeActivity,
} from '../features/credits/components/creditCapacityText';
import { WARNING_TEXT } from '../features/credits/components/creditApproveText';

describe('creditCapacityText (spec 025)', () => {
  it('adds the 500 minimum note when the environment is under 500', () => {
    expect(addRangeText(300, 8000, 200)).toBe(
      `To approve with credits, add between 300 and ${(8000).toLocaleString()}. This environment needs at least 500 in total.`,
    );
  });

  it('leaves the note out once the environment has 500 or more', () => {
    expect(addRangeText(1, 8000, 500)).toBe(`To approve with credits, add between 1 and ${(8000).toLocaleString()}.`);
  });

  it('names the active billing policy in the approve sentence', () => {
    expect(paygApproveText('Contoso PAYG')).toBe(
      'You can also approve without adding credits. Extra use is billed through the billing policy "Contoso PAYG".',
    );
  });

  it('uses the shared warning for a linked but inactive policy', () => {
    expect(paygStatusText('linkedInactive')).toBe(WARNING_TEXT.PaygLinkedInactive);
    expect(paygStatusText('none')).toBe('No pay-as-you-go billing policy is linked to this environment.');
  });

  it('adds a wait hint only when Power Platform is busy', () => {
    expect(partFailureText('spare', 'Unknown')).toBe("Couldn't load your tenant's spare credits.");
    expect(partFailureText('spare', 'Throttled')).toMatch(/^Couldn't load your tenant's spare credits\. Power Platform is busy/);
  });

  it('tells the admin whether the request fits in the spare credits', () => {
    expect(requestFitText(2000, 5000)).toBe(`The maker's request of ${(2000).toLocaleString()} fits in your spare credits.`);
    expect(requestFitText(8000, 5000)).toMatch(/^The maker asked for .+, but only .+ are spare\./);
  });

  it('notes an approval lower than the request', () => {
    expect(approvedVsRequestedText(1500, 2000)).toBe('(500 less than requested, see Comments)');
    expect(approvedVsRequestedText(2000, 2000)).toBeUndefined();
    expect(approvedVsRequestedText(0, undefined)).toBeUndefined();
  });
});

describe('credits check text (spec 030)', () => {
  const blocked = { kind: 'blocked', blocks: ['NoValidTotal'] } as const;
  const allocate = { kind: 'ok', via: 'allocate' } as const;

  it('explains the zero-credit case in the Approve tooltip and points to the Summary tab', () => {
    expect(approveOffTip(blocked)).toBe(
      'Not enough spare credits to approve. See the Copilot Credits check on the Summary tab.',
    );
    expect(approveOffTip({ kind: 'checking' })).toBe(CHECKING_TEXT);
  });

  it('names the reason in the blocked title and leaves the numbers to the stats', () => {
    const v = checkVerdict(blocked, { current: 0, spare: 0, paygStatus: 'none' });
    expect(v?.title).toBe('Not enough spare credits to approve.');
    expect(v?.lines[0]).toBe(
      'Buy more Copilot Credits, or link an active pay-as-you-go billing policy to this environment.',
    );
    expect(checkVerdict(blocked, { current: 1000, spare: 0, paygStatus: 'linkedInactive' })?.lines[0]).toBe(
      'Turn on pay-as-you-go for Copilot Credits on the linked billing policy, or buy more Copilot Credits.',
    );
  });

  it('names the active billing policy in one short line', () => {
    expect(paygStatusText('active', 'Contoso PAYG')).toBe('Pay-as-you-go is on through "Contoso PAYG".');
    expect(paygStatusText('active')).toBe('Pay-as-you-go is on through a billing policy.');
  });

  it('leaves the Approve tooltip alone when Approve is on', () => {
    expect(approveOffTip(allocate)).toBeUndefined();
    expect(approveOffTip({ kind: 'unknown' })).toBeUndefined();
  });

  it('gives each result its own verdict', () => {
    expect(checkVerdict({ kind: 'checking' }, {})).toBeUndefined();
    expect(checkVerdict(blocked, { current: 0, spare: 0, paygStatus: 'none' })).toMatchObject({ intent: 'warning' });
    expect(checkVerdict({ kind: 'unknown' }, {})).toMatchObject({ intent: 'error' });
    expect(checkVerdict({ kind: 'ok', via: 'payg' }, { paygPolicyName: 'Contoso PAYG' })?.lines[0]).toMatch(/"Contoso PAYG"/);
  });

  it('warns when the request is bigger than the spare credits', () => {
    const f = { current: 1000, spare: 300, requested: 2000 };
    expect(checkVerdict(allocate, f)?.intent).toBe('warning');
    expect(checkBadge(allocate, f)).toEqual({ label: 'Needs attention', color: 'warning' });
    expect(checkBadge(allocate, { ...f, requested: 200 })).toEqual({ label: 'Credits allow approval', color: 'success' });
  });

  it('keeps a clean pass quiet but shows the shortfall warning', () => {
    const f = { current: 1000, spare: 300 };
    expect(checkVerdict(allocate, { ...f, requested: 200 })?.quiet).toBe(true);
    expect(checkVerdict(allocate, { ...f, requested: 2000 })?.quiet).toBe(false);
    expect(checkVerdict(blocked, { current: 0, spare: 0, paygStatus: 'none' })?.quiet).toBeFalsy();
  });
});

describe('describeActivity (spec 032 P4)', () => {
  const attempt = (o: Record<string, unknown>) =>
    JSON.stringify({ attemptId: 'abcdef12-3456', adminId: 'x', paygChoice: 'n/a', at: '2026-01-01', ...o });

  it('labels a verified approval by what changed, not "attempted"', () => {
    const v = describeActivity('Credit allocation attempted', attempt({
      before: 1200, target: 4200, verified: 4200, turnOnDraw: true, outcome: 'Succeeded',
    }));
    expect(v.action).toBe('Approved - credits added and tenant draw turned on');
    expect(v.summary).toBe(
      `Added ${(3000).toLocaleString()} credits (from ${(1200).toLocaleString()} to ${(4200).toLocaleString()}). Turned on tenant draw. Confirmed in Power Platform.`,
    );
    expect(v.reference).toBe('abcdef12-3456');
  });

  it('shows the failure reason', () => {
    const v = describeActivity('Credit allocation attempted', attempt({
      outcome: 'FailedRetryable', step: 'Save your comment', error: 'Try again.',
    }));
    expect(v).toMatchObject({ action: 'Approval failed', summary: 'Failed step: Save your comment. Try again.' });
  });

  it('describes assign and reassign', () => {
    expect(describeActivity('Request assigned', JSON.stringify({ assignedTo: 'Ana' })))
      .toEqual({ action: 'Request assigned', summary: 'Assigned to Ana.' });
    expect(describeActivity('Request assigned', JSON.stringify({ assignedTo: 'Ana', assignedFrom: 'Bo' })))
      .toEqual({ action: 'Request reassigned', summary: 'Reassigned from Bo to Ana.' });
  });

  it('shows a rejection comment and keeps plain-text rows as they are', () => {
    expect(describeActivity('Credit request rejected', JSON.stringify({ comment: 'Not now.' })))
      .toEqual({ action: 'Credit request rejected', summary: 'Not now.', reference: undefined });
    expect(describeActivity('Started', 'Flow started')).toEqual({ action: 'Started', summary: 'Flow started' });
  });
});
