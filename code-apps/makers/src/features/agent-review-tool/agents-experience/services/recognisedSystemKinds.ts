import type { AeUnknownKind } from '../contracts/AgentsExperienceModel';

/**
 * Component kinds the tool recognises but deliberately does not review.
 *
 * Copilot Studio creates these itself — they carry no maker-authored content —
 * so listing them as "did not match a known schema" reported a problem the
 * maker neither caused nor can act on. `DefaultFeedbackCollection` appeared on
 * 9 of 12 agents measured, which is why the warning showed on nearly every
 * review. `NoFeedbackCollection` is the same component when feedback is off.
 */
const RECOGNISED_UNREVIEWED_KINDS = new Set([
  'DefaultFeedbackCollection',
  'NoFeedbackCollection',
]);

/**
 * Component kinds that older parsers stored as unknown and the parser now maps.
 *
 * Saved reviews are re-rendered, not re-parsed, so an old payload still lists
 * these kinds in `unknownKinds`. Dropping them on read removes the false
 * "did not match a known schema" warning. The old rule rows stay until the
 * review is run again.
 */
const PARSED_COMPONENT_KINDS = new Set([
  'IQCapability',
  'WorkflowTool',
  'AgentHook',
]);

/**
 * Drop recognised system kinds, and kinds the parser now maps, from a persisted
 * `unknownKinds` list.
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
  return kinds.filter(entry => {
    const kind = entry?.kind ?? '';
    return !RECOGNISED_UNREVIEWED_KINDS.has(kind) && !PARSED_COMPONENT_KINDS.has(kind);
  });
}

/** Whether a parsed component kind is recognised but intentionally unreviewed. */
export function isRecognisedUnreviewedKind(kind: string | undefined): boolean {
  return RECOGNISED_UNREVIEWED_KINDS.has(kind ?? '');
}
