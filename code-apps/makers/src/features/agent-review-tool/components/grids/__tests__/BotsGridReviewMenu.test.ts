import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../BotsGrid.tsx', import.meta.url),
  'utf8',
);

describe('BotsGrid review action', () => {
  it('uses one direct Review action without a source menu', () => {
    const reviewColumn = source.slice(
      source.indexOf("columnId: 'review'"),
      source.indexOf("columnId: 'details'"),
    );

    expect(reviewColumn).not.toContain('<Menu>');
    expect(reviewColumn).not.toContain('Upload solution ZIP');
    expect(reviewColumn).toContain(
      'row.isZipSource ? onReviewFromZip() : onReview(row.botId)',
    );
    expect(reviewColumn).not.toContain('Review again');
    expect(reviewColumn).toMatch(/>\s*Review\s*<\/Button>/);
  });
});
