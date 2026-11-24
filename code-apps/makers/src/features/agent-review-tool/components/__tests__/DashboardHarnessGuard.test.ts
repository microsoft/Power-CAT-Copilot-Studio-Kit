import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../Dashboard.tsx', import.meta.url), 'utf8');

function count(text: string): number {
  return source.split(text).length - 1;
}

describe('Dashboard harness guards (issue 947)', () => {
  it('routes the agent list and the solution ZIP review starts by harness', () => {
    expect(count('startReviewForHarness(')).toBe(2);
    expect(count('unsupported: notifyUnsupportedHarness')).toBe(1);
    expect(source).not.toContain("bot.harness === 'copilot'");
  });

  it('keeps the unsupported harness message in the upload message bar for a solution ZIP agent', () => {
    const zipStart = source.slice(source.indexOf('function handleCSZipStartReview('));
    expect(zipStart).toMatch(
      /unsupported: \(\) => \{\s*notifyUnsupportedHarness\(\);\s*setUploadError\(UNSUPPORTED_HARNESS_MESSAGE\);\s*\}/,
    );
    expect(count('setUploadError(UNSUPPORTED_HARNESS_MESSAGE)')).toBe(1);
  });

  it('passes the template of a solution ZIP agent to the Microsoft Copilot review', () => {
    const zipStart = source.slice(source.indexOf('function handleCSZipStartReview('));
    expect(zipStart).toContain('template: bot.template,');
  });

  it('shows the exact unsupported harness message as a warning toast', () => {
    expect(source).toContain(
      "import { UNSUPPORTED_HARNESS_MESSAGE } from '../agents-experience/services/detection';",
    );
    expect(source).toContain('<ToastTitle>{UNSUPPORTED_HARNESS_MESSAGE}</ToastTitle>');
    expect(count("{ intent: 'warning' }")).toBe(1);
  });

  it('opens a saved review by the harness of that review', () => {
    expect(source).toContain("if (resolveSavedReviewHarness(row, bot?.harness) === 'copilot') {");
    expect(source).not.toContain("row?.harness === 'copilot'");
  });
});
