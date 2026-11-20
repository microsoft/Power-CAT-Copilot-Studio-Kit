/**
 * Negation-aware matching for rules that read free prose (spec 018).
 *
 * Why this file exists
 * --------------------
 * A rule that matches a phrase inside an author's prose is making a claim about
 * intent, and intent is reversed by the words in front of the phrase. A real
 * upload read "…and never ask me a clarifying question, since this run is
 * unattended" — the author's own safeguard — and the unattended-run rule
 * reported it as a high-severity defect, because it matched "ask me" and never
 * looked left.
 *
 * That is worse than a missed finding. A reviewer who sees the tool blame an
 * author for the very thing the author got right stops trusting every other
 * finding on the page.
 *
 * Scope
 * -----
 * Only rules that read prose need this. Rules that read structure — a file
 * path, a heading, a cron field, a frontmatter key, the shape of a token —
 * cannot be reversed by a nearby word, and must not route through here.
 *
 * Any new rule that matches a phrase in SKILL.md, in an automation prompt, or
 * in any other author-written sentence must use {@link firstUnnegatedMatch} or
 * {@link unnegatedMatches} rather than calling the regex itself.
 */

/**
 * A negation sitting in front of a match, which reverses its meaning.
 *
 * Built from two parts because English puts a verb between the two: authors
 * write "never **use** Playwright" and "does not **need** browser automation"
 * as readily as "never ask me". Matching only an adjacent negator would catch
 * the third and miss the first two.
 *
 * The chain must run unbroken up to the match — only spaces and one comma may
 * follow. A full stop therefore ends the negation, which is what keeps
 * "If the answer is not clear, ask the user" reported: "clear" is not a carrier
 * verb, so the chain breaks and the finding stands. Widening this further would
 * trade a false positive for a false negative, and a missed real defect is the
 * more expensive of the two.
 */
const NEGATOR = String.raw`(?:\bnever\b|\bnot\b|n['’]t|\bavoid(?:s|ing)?\b|\bwithout\b|\brather\s+than\b|\bno\s+need\s+to\b|\binstead\s+of\b)`;

/** Verbs and articles that may sit between a negation and the phrase it denies. */
const CARRIER = String.raw`(?:\s+(?:to|the|a|an|any|it|this|that|ever|be|being|do|does))*(?:\s+(?:us(?:e|es|ing)|call(?:s|ing)?|invok(?:e|es|ing)|rely(?:ing)?|relies|requir(?:e|es|ing)|need(?:s|ing)?|run(?:s|ning)?|driv(?:e|es|ing)|open(?:s|ing)?|launch(?:es|ing)?|depend(?:s|ing)?|touch(?:es|ing)?|involv(?:e|es|ing)|mak(?:e|es|ing)|attempt(?:s|ing)?|try(?:ing)?|tries|on|upon))*`;

const NEGATION_BEFORE_RE = new RegExp(`${NEGATOR}${CARRIER}\\s*,?\\s*$`, 'i');

/** How much text to read back from a match when looking for a negation. */
const LOOKBEHIND_CHARS = 56;

/** How much text to quote either side of a match, so the reader can judge it. */
const DEFAULT_EVIDENCE_RADIUS = 60;

/** Whether the words directly in front of `index` reverse the phrase that starts there. */
export function isNegatedAt(text: string, index: number): boolean {
  return NEGATION_BEFORE_RE.test(text.slice(Math.max(0, index - LOOKBEHIND_CHARS), index));
}

/**
 * Every match of `pattern` in `text` that a negation does not reverse.
 *
 * Scans all matches rather than stopping at the first, because one prompt can
 * hold both a forbidden phrase and a real one: "never ask the user about
 * formatting. If the sender is unknown, ask the user whether to reply."
 * Returning early on the first negated hit would hide the second.
 *
 * `pattern` must carry the global flag. `matchAll` works on a clone, so no
 * `lastIndex` state leaks between calls and two artifacts in one batch score
 * identically.
 */
export function unnegatedMatches(text: string, pattern: RegExp): RegExpMatchArray[] {
  if (!pattern.global) {
    throw new Error(`unnegatedMatches needs a global pattern, received ${String(pattern)}`);
  }
  return [...text.matchAll(pattern)].filter((match) => !isNegatedAt(text, match.index ?? 0));
}

/** The first match of `pattern` that a negation does not reverse, or null. */
export function firstUnnegatedMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  return unnegatedMatches(text, pattern)[0] ?? null;
}

/**
 * Quote a match together with the words around it.
 *
 * A reader has to be able to check a finding without opening the file, and a
 * bare matched phrase cannot be checked — the words that change its meaning are
 * exactly the ones left out. Ellipses appear only where text was removed, so a
 * short prompt is quoted whole and reads as such.
 */
export function quoteWithContext(
  text: string,
  match: RegExpMatchArray,
  radius: number = DEFAULT_EVIDENCE_RADIUS,
): string {
  const at = match.index ?? 0;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + match[0].length + radius);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}
