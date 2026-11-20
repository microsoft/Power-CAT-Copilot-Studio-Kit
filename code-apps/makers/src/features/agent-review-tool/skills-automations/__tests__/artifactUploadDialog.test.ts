import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RuntimeCoverageHint } from '../components/RuntimeCoverageHint';
import type { TargetRuntime } from '../contracts/ArtifactReview';
import { describeRuntimeCoverage } from '../data/catalogueResolver';

function renderHint(runtime: TargetRuntime): string {
  return renderToStaticMarkup(
    createElement(RuntimeCoverageHint, {
      runtime,
      description: describeRuntimeCoverage(runtime),
    }),
  );
}

describe('ArtifactUploadDialog runtime documentation', () => {
  it('links Cowork skills to Microsoft Learn without inventing a tool-catalogue link', () => {
    const markup = renderHint('cowork');

    expect(markup).toContain(
      'href="https://learn.microsoft.com/microsoft-365/copilot/cowork/use-cowork#cowork-skills"',
    );
    expect(markup).toMatch(/15 <a[^>]+>built-in skills<\/a>/);
    expect(markup).not.toMatch(/<a[^>]+>50 tools<\/a>/);
  });

  it('links Scout skills to the official bundled-skills documentation', () => {
    const markup = renderHint('scout');

    expect(markup).toContain('href="https://learn.microsoft.com/microsoft-scout/overview#bundled-skills"');
    expect(markup).toMatch(/7 <a[^>]+>built-in skills<\/a>/);
    expect(markup).not.toMatch(/<a[^>]+>35 tools<\/a>/);
  });

  it('leaves runtimes without matching Microsoft Learn documentation unlinked', () => {
    expect(renderHint('copilot-studio')).not.toContain('<a');
  });
});
