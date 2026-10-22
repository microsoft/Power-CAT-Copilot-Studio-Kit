import type { AeUnknownKind } from '../contracts/AgentsExperienceModel.js';

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

/**
 * Drop recognised system kinds from a persisted `unknownKinds` list.
 *
 * Applied on read as well as at parse time. A review saved before a kind joined
 * the list still holds it in its payload, and saved reviews are re-rendered
 * rather than re-parsed — so filtering only in the parser would leave the false
 * warning on every existing review until it was re-run. Re-applying the current
 * rule when displaying stored data is the same approach used for persisted
 * capability edges and text references.
 *
 * @param kinds - Unknown kinds as stored on the payload.
 */
export function withoutRecognisedSystemKinds(
  kinds: readonly AeUnknownKind[] | undefined,
): AeUnknownKind[] {
  if (!Array.isArray(kinds)) return [];
  return kinds.filter(entry => !RECOGNISED_UNREVIEWED_KINDS.has(entry?.kind ?? ''));
}

/** Whether a parsed component kind is recognised but intentionally unreviewed. */
export function isRecognisedUnreviewedKind(kind: string | undefined): boolean {
  return RECOGNISED_UNREVIEWED_KINDS.has(kind ?? '');
}
