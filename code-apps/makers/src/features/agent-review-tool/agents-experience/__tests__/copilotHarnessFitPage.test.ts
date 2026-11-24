import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
}

const PAGE_SOURCE = readSource('../components/CopilotReviewPage.tsx');
const NAVIGATION_SOURCE = readSource('../components/ReviewSectionNavigation.tsx');

function countOf(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('CopilotReviewPage harness fit placement', () => {
  it('shows no harness fit message in the review section', () => {
    expect(countOf(PAGE_SOURCE, 'CopilotHarnessFitNotice')).toBe(0);

    const unknownKinds = PAGE_SOURCE.indexOf('withoutRecognisedSystemKinds(');
    const coverage = PAGE_SOURCE.indexOf('{instructionCoverageBanner(vm.summary.instructionCoverageStatus)}');
    expect(unknownKinds).toBeGreaterThan(-1);
    expect(coverage).toBeGreaterThan(unknownKinds);
    expect(PAGE_SOURCE.slice(unknownKinds, coverage)).not.toMatch(/harness/i);
  });

  it('adds no Harness section to the Copilot review page', () => {
    expect(NAVIGATION_SOURCE).toContain("export type ReviewSection = 'review' | 'map' | 'cost';");
    expect(NAVIGATION_SOURCE).not.toMatch(/harness/i);
    expect(PAGE_SOURCE).not.toContain("activeSection === 'harness'");
    expect(PAGE_SOURCE).not.toContain('copilot-review-section-panel-harness');
  });

  it('gives Cost & efficiency the same model for saved, live, and ZIP reviews', () => {
    expect(PAGE_SOURCE).toContain('runPayload ?? persistedData?.payload ?? undefined;');
    expect(countOf(PAGE_SOURCE, '<CostEfficiencyTab\n                      model={activePayload.model}')).toBe(1);
  });
});