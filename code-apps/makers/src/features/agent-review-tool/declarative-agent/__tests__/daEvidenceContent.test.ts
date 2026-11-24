import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import { DAEvidenceContent } from '../components/DAEvidenceContent';
import { DAReviewDetails } from '../components/DAReviewDetails';

const render = (evidence: string) => renderToStaticMarkup(createElement(
  SSRProvider, null, createElement(DAEvidenceContent, { evidence }),
));

describe('recorded Declarative Agent evidence', () => {
  it('shows objects as labeled fields and arrays as ordered lists', () => {
    const html = render('{"name":"WebSearch","sites":[{"url":"https://www.zava-diy.example/how-to"}]}');
    expect(html).toContain('<dl');
    expect(html).toContain('<dt');
    expect(html).toContain('WebSearch');
    expect(html).toContain('<ol');
    expect(html).toContain('https://www.zava-diy.example/how-to');
    expect(html).not.toContain('<a');
    expect(html).toContain('Original evidence');
    expect(html).toContain('aria-expanded="false"');
  });

  it.each(['plain text\n second line', '{"incomplete":', '', '""', 'null', 'true', '42'])(
    'retains free text or a scalar JSON excerpt: %s',
    (evidence) => {
      const html = render(evidence);
      expect(html).toContain(evidence.replaceAll('"', '&quot;'));
      expect(html).not.toContain('Original evidence');
    },
  );

  it('keeps empty nested values distinct from omitted fields', () => {
    const html = render('{"blank":"","missing":null,"enabled":false,"count":0,"list":[],"object":{}}');
    for (const value of ['&quot;&quot;', 'null', 'false', '>0<', '[]', '{}']) {
      expect(html).toContain(value);
    }
  });

  it('uses a formatted JSON block for deeper structures without losing nested fields', () => {
    const html = render('{"a":{"b":{"c":{"d":"retained"}}}}');
    expect(html).toContain('<pre');
    expect(html).toContain('&quot;d&quot;: &quot;retained&quot;');
  });

  it('uses formatted JSON instead of creating an unbounded field list', () => {
    const evidence = JSON.stringify(Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`field-${index}`, index]),
    ));
    const html = render(evidence);
    expect(html).toContain('<pre');
    expect(html).toContain('&quot;field-0&quot;: 0');
    expect(html).toContain('&quot;field-19&quot;: 19');
  });

  it.each(['{"number":9007199254740993}', '{"number":1e400}'])(
    'keeps numbers outside the safe JSON display range exactly as recorded: %s',
    (evidence) => {
      expect(render(evidence)).toContain(evidence.replaceAll('"', '&quot;'));
    },
  );

  it('keeps extremely deep JSON as recorded instead of failing the review page', () => {
    const evidence = '['.repeat(10000) + '0' + ']'.repeat(10000);
    expect(render(evidence)).toContain(evidence);
  });

  it('escapes recorded HTML in field names, values, and malformed evidence', () => {
    const html = render('{"<script>":"<img src=x onerror=alert(1)>"}');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(render('<script>bad</script>')).toContain('&lt;script&gt;bad&lt;/script&gt;');
  });

  it('does not hide unexpected parser failures', () => {
    const parser = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw new TypeError('Synthetic unexpected parser error');
    });
    try {
      expect(() => render('{}')).toThrow('Synthetic unexpected parser error');
    } finally {
      parser.mockRestore();
    }
  });

  it('keeps all location and evidence content collapsed until requested', () => {
    const html = renderToStaticMarkup(createElement(SSRProvider, null,
      createElement(DAReviewDetails, {
        trace: { sourceFile: 'declarativeAgent.json', jsonPath: '$.capabilities', evidence: '{"name":"WebSearch"}' },
      }),
    ));
    expect(html).toContain('Evidence and location');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('WebSearch');
    expect(html).not.toContain('declarativeAgent.json');
  });

  it('omits an empty details control when nothing was recorded', () => {
    expect(renderToStaticMarkup(createElement(DAReviewDetails, { trace: {} }))).toBe('');
  });
});
