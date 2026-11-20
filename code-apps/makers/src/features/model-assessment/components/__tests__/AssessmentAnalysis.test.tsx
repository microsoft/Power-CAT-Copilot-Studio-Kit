import { renderToStaticMarkup } from 'react-dom/server';
import { createDOMRenderer, RendererProvider, renderToStyleElements } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { AssessmentAnalysis } from '../AssessmentAnalysis';

describe('AssessmentAnalysis', () => {
  it('lets summary and findings fill their container while retaining long-text wrapping', () => {
    const renderer = createDOMRenderer();
    renderToStaticMarkup(
      <RendererProvider renderer={renderer}>
        <AssessmentAnalysis
          text="One result regressed. Project-site access failed. Review the project-site run details."
          results={[]}
        />
      </RendererProvider>,
    );
    const css = renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>);
    expect(css).not.toContain('max-width:');
    expect(css).toContain('overflow-wrap:anywhere');
  });

  it('renders summary and findings without the next-step recommendation', () => {
    const html = renderToStaticMarkup(
      <AssessmentAnalysis
        text="One result regressed. Project-site access failed. Review the project-site run details."
        results={[]}
      />,
    );
    expect(html).toContain('Summary</h4>');
    expect(html).toContain('Findings</h4>');
    expect(html).toContain('<li>Project-site access failed.</li>');
    expect(html).not.toContain('Next step');
    expect(html).not.toContain('Review the project-site run details.');
    expect(html).not.toContain('role="note"');
  });

  it('renders headed analysis lines as titled sections', () => {
    const html = renderToStaticMarkup(
      <AssessmentAnalysis
        text={'🧭 **Overall:** Most checks passed.\n⚠️ **Needs attention:** VPN failed.\n⚠️ **Needs attention:** Wi-Fi failed.'}
        results={[]}
      />,
    );
    expect(html).toContain('<span aria-hidden="true">🧭 </span>Overall</h4>');
    expect(html).toContain('Most checks passed.</p>');
    expect(html).toContain('<li>VPN failed.</li><li>Wi-Fi failed.</li>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('Summary</h4>');
  });

  it('does not create empty sections or interpret summary text as HTML', () => {
    const html = renderToStaticMarkup(
      <AssessmentAnalysis text="<script>alert(1)</script>" results={[]} />,
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Findings');
    expect(html).not.toContain('Next step');
  });
});
