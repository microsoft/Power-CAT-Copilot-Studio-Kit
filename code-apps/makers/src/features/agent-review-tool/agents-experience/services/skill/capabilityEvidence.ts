/**
 * Whether a model-asserted capability edge is supported by its own citation.
 *
 * Shared by two callers on purpose. `WorkflowReviewAiProvider` applies it when
 * mapping a fresh workflow result, and the Agent Map applies it again to edges
 * read back from a saved review. Re-checking on read matters because a review
 * saved before this rule existed still carries edges that were never validated,
 * and the map draws persisted edges directly. The deterministic text path
 * already re-validates persisted evidence for the same reason
 * (`isSkillCapabilityReferenceSupported`); this keeps the model path honest to
 * the same standard.
 */

/** Words too common to count as evidence that a capability was named. */
const EVIDENCE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'the', 'to', 'via', 'with', 'use', 'using', 'tool', 'agent', 'data',
]);

function contentTokens(value: string): Set<string> {
  return new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter(token => token.length > 2 && !EVIDENCE_STOP_WORDS.has(token)),
  );
}

/**
 * Require the cited evidence to actually name the capability it is claimed for.
 *
 * Measured failure this guards against (ZAVA Visual Merchandiser, 2026-08-06):
 * the model returned `capabilityName: "Display Photo Library"` citing
 * "Pull the build photograph from the store camera feed." — the evidence names
 * a capability the agent does NOT have, and the model silently substituted one
 * it does. Two runs ten seconds apart disagreed, so this is not reproducible by
 * retrying. The citation is what exposes the error.
 *
 * One shared content word is enough, so paraphrase still passes: "Check the
 * layout against the ZAVA visual standards." keeps its link to
 * "ZAVA-Visual-Merchandising-Standards-v4.2.docx". But "photograph" does not
 * match "photo", so the substitution above is rejected.
 *
 * This trades a little recall for precision, deliberately. These edges are drawn
 * as lines on the Agent Map, where a reviewer reads them as fact; an edge whose
 * own quotation does not mention the capability cannot be defended.
 *
 * @param capabilityName - Capability the model claims the skill uses.
 * @param evidence - Verbatim span the model cited as proof.
 */
export function evidenceNamesCapability(capabilityName: string, evidence: string): boolean {
  const wanted = contentTokens(capabilityName);
  // A name made entirely of stop words or very short tokens cannot be checked
  // this way; withholding every such edge would be a worse failure than
  // allowing it through, so it passes and relies on the other guards.
  if (wanted.size === 0) return true;
  const cited = contentTokens(evidence);
  for (const token of wanted) {
    if (cited.has(token)) return true;
  }
  return false;
}
