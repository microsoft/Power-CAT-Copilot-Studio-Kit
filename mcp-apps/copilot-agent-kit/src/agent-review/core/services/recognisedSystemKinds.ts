/**
 * Component kinds the tool recognises but deliberately does not review.
 *
 * Copilot Studio creates these itself — they carry no maker-authored content —
 * so listing them as "did not match a known schema" reported a problem the
 * maker neither caused nor can act on. `DefaultFeedbackCollection` appeared on
 * 9 of 12 agents measured, which is why the warning showed on nearly every
 * review.
 */
const RECOGNISED_UNREVIEWED_KINDS = new Set([
  'DefaultFeedbackCollection',
]);

/** Whether a parsed component kind is recognised but intentionally unreviewed. */
export function isRecognisedUnreviewedKind(kind: string | undefined): boolean {
  return RECOGNISED_UNREVIEWED_KINDS.has(kind ?? '');
}
