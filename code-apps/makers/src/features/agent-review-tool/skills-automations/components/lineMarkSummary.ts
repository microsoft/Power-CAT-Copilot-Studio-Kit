/**
 * The sentence that accounts for findings which carry no line number.
 *
 * The file header counts every finding about a file, but only some of them name
 * a line, so a reader can see "25 findings" above a file with two shaded lines
 * and be left to guess whether the other twenty-three were missed, hidden, or
 * simply not about a line. This says which.
 *
 * Kept out of the component so the agreement can be tested. Three things have
 * to agree independently and they do not move together: the noun follows the
 * total ("1 of 25 findings", never "1 of 25 finding"), while the verb follows
 * the count ("1 ... applies", "2 ... apply").
 */
export function describeUnplacedFindings(total: number, unplaced: number): string | null {
  if (unplaced <= 0) return null;

  // A file with one finding needs no ratio: "1 of 1" tells the reader nothing
  // they cannot already see, and reads as though something is missing.
  if (total === 1) {
    return 'This finding applies to the whole file and has no line highlight.';
  }

  return unplaced === 1
    ? `1 of ${total} findings applies to the whole file and has no line highlight.`
    : `${unplaced} of ${total} findings apply to the whole file and have no line highlight.`;
}
