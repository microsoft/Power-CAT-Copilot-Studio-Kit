/**
 * Agreement tests for the line-mark legend sentence.
 *
 * The sentence appeared beside a file whose header said "25 findings" while two
 * lines were shaded, and read "1 of 25 finding is about the file as a whole".
 * The noun follows the total and the verb follows the count. The two do not
 * move together, so each combination is checked separately.
 */
import { describe, expect, it } from 'vitest';
import { describeUnplacedFindings } from '../components/lineMarkSummary';

describe('describeUnplacedFindings', () => {
  it('says nothing when every finding names a line', () => {
    expect(describeUnplacedFindings(25, 0)).toBeNull();
  });

  it('agrees the noun with the total, not with the count', () => {
    const sentence = describeUnplacedFindings(25, 1)!;

    expect(sentence).toContain('1 of 25 findings applies');
    expect(sentence).not.toContain('1 of 25 finding applies');
  });

  it('agrees the verb with the count', () => {
    expect(describeUnplacedFindings(25, 1)).toContain('1 of 25 findings applies');
    expect(describeUnplacedFindings(25, 4)).toContain('4 of 25 findings apply');
    expect(describeUnplacedFindings(25, 4)).toContain('have no line highlight');
  });

  it('drops the ratio for a file with one finding, because "1 of 1" says nothing', () => {
    const sentence = describeUnplacedFindings(1, 1)!;

    expect(sentence).toBe(
      'This finding applies to the whole file and has no line highlight.',
    );
    expect(sentence).not.toContain('1 of 1');
  });

  it('never leaves a bare singular noun after a plural total', () => {
    for (let total = 2; total <= 30; total += 1) {
      for (let unplaced = 1; unplaced <= total; unplaced += 1) {
        expect(describeUnplacedFindings(total, unplaced)).not.toMatch(/\d finding\b/);
      }
    }
  });
});
