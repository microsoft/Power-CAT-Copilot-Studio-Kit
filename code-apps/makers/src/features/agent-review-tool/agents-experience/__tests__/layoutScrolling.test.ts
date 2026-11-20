import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import {
  RendererProvider,
  createDOMRenderer,
  renderToStyleElements,
} from '@griffel/react';
import { describe, expect, it } from 'vitest';
import {
  useContentStyles,
  useLayoutStyles,
} from '../../../../shared/components/Layout/Layout.styles';

function LayoutStyleProbe() {
  const layoutStyles = useLayoutStyles();
  const contentStyles = useContentStyles();

  return createElement(
    'div',
    { className: layoutStyles.root },
    createElement('aside', { className: layoutStyles.nav }),
    createElement('main', { className: contentStyles.root }),
  );
}

describe('application layout scrolling', () => {
  it('uses the document as the only vertical scroll container', () => {
    const renderer = createDOMRenderer();

    renderToStaticMarkup(
      createElement(
        RendererProvider,
        { renderer },
        createElement(LayoutStyleProbe),
      ),
    );
    const css = renderToStyleElements(renderer)
      .map(element => String(element.props.dangerouslySetInnerHTML?.__html ?? ''))
      .join('\n');

    expect(css).toContain('position:sticky');
    expect(css).toContain('min-width:0');
    expect(css).not.toContain('overflow:auto');
    expect(css).not.toContain('overflow:hidden');
    expect(css).not.toContain('width:100vw');
  });

  it('does not reserve an empty scrollbar gutter', () => {
    const globalStyles = readFileSync(
      new URL('../../../../index.css', import.meta.url),
      'utf8',
    );

    expect(globalStyles).not.toMatch(/scrollbar-gutter:\s*stable/);
  });
});
