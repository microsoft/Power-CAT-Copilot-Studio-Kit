import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../components/CopilotReviewPage.tsx', import.meta.url)),
  'utf8',
);

describe('CopilotReviewPage theme', () => {
  it('separates workspace sections from the review views', () => {
    expect(source).toContain('<ReviewSectionNavigation');

    const navigationSource = readFileSync(
      fileURLToPath(new URL('../components/ReviewSectionNavigation.tsx', import.meta.url)),
      'utf8',
    );
    const primaryTabValues = [...navigationSource.matchAll(/\bvalue="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(primaryTabValues).toEqual(['review', 'map', 'cost']);
    expect(navigationSource).toContain('TaskListSquareSparkleRegular');
    expect(navigationSource).toContain('MapRegular');
    expect(navigationSource).toContain('MoneySettingsRegular');
    expect(navigationSource).not.toContain('boxShadow: tokens.shadow2');
    expect(navigationSource).not.toContain("minHeight: '44px'");
    expect(navigationSource).toContain('padding: 0,');
    expect(navigationSource).toContain('size="medium"');

    const reviewViewsLabelIndex = source.indexOf('aria-label="Review views"');
    expect(reviewViewsLabelIndex).toBeGreaterThan(-1);
    const reviewTabListStart = source.lastIndexOf('<TabList', reviewViewsLabelIndex);
    const reviewTabListEnd = source.indexOf('</TabList>', reviewViewsLabelIndex);
    const reviewTabListSource = source.slice(reviewTabListStart, reviewTabListEnd);
    const reviewTabValues = [...reviewTabListSource.matchAll(/<Tab[^>]+value="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(reviewTabValues).toEqual(['findings', 'skills', 'coverage', 'checks']);
  });

  it('returns cross-section finding links to the review findings view', () => {
    expect(source).toContain("setActiveSection('review');");
    expect(source).toContain("setActiveReviewTab('findings');");
  });

  it('uses the shared light theme without an isolated page toggle', () => {
    expect(source).toContain('<FluentProvider theme={copilotStudioReviewLightTheme}>');
    expect(source).not.toContain('copilotStudioReviewDarkTheme');
    expect(source).not.toContain('Switch to dark theme');
    expect(source).not.toContain('Switch to light theme');
    expect(source).not.toContain('WeatherMoonRegular');
    expect(source).not.toContain('WeatherSunnyRegular');
  });

  it('shows a page-shaped skeleton while a saved review loads', () => {
    expect(source).toContain('<CopilotReviewSkeleton agentName={agentName} />');
    expect(source).not.toContain('<CopilotReviewProgress');
  });

  it('shows an explicit warning when saved AI assessments are incomplete', () => {
    expect(source).toContain('getCopilotReviewCompletion(activePayload)');
    expect(source).toContain('{completionNotice?.errorMessage && (');
    expect(source).toContain('{completionNotice.errorMessage}');
  });

  it('does not announce an incomplete saved review as ready in the background', () => {
    const runner = readFileSync(
      fileURLToPath(new URL('../context/CopilotReviewRunner.tsx', import.meta.url)),
      'utf8',
    );
    expect(runner).toContain("incomplete: mutation.data.status === 'failed'");
    expect(runner).toContain("completed.incomplete ? 'Review incomplete' : 'Review ready'");
  });
});
