import { jsPDF } from 'jspdf';
import { describe, expect, it, vi } from 'vitest';
import { CsPdfLayout } from '../csPdfLayout';
import { measurePdfText, preparePdfText, wrapPdfText } from '../csPdfText';
import { pdfPageText } from './csPdfFixtures';

describe('PDF text support and measured wrapping', () => {
  it('preserves supported multilingual text and represents unsupported code points explicitly', () => {
    const result = preparePdfText('Français, Español, Português, cafe\u0301; 東京 😀');
    expect(result).toBe('Français, Español, Português, café; [U+6771][U+4EAC] [U+1F600]');
  });

  it('decodes supplementary numeric entities without dropping or corrupting characters', () => {
    expect(preparePdfText('A &amp; B &#233; &#x1F600; &#99999999;'))
      .toBe('A & B é [U+1F600] &#99999999;');
  });

  it('wraps using the active font and breaks very long tokens within the actual column width', () => {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const input = 'Variable_' + 'W'.repeat(1600);
    const lines = wrapPdfText(doc, input, 72);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.join('')).toBe(input);
    for (const line of lines) expect(doc.getTextWidth(line)).toBeLessThanOrEqual(72.001);
  });

  it('preserves intentional paragraph breaks and all wrapped words', () => {
    const doc = new jsPDF();
    doc.setFontSize(10.5);
    expect(wrapPdfText(doc, 'First paragraph.\n\nSecond paragraph.', 174))
      .toEqual(['First paragraph.', '', 'Second paragraph.']);
  });

  it('accounts for base-font metric rounding found in the rendered PDF', () => {
    const doc = new jsPDF();
    doc.setFontSize(10.5);
    const value = 'runtime failure. This long saved finding explains a configuration limitation without claiming a runtime failure.';
    // PDF base-font rendering measures this line at 496.02 pt, wider than a 174 mm column.
    expect(wrapPdfText(doc, value, 174).length).toBeGreaterThan(1);
  });

  it('reserves real glyph space for supported WinAnsi characters absent from jsPDF width tables', () => {
    const doc = new jsPDF();
    doc.setFontSize(10.5);
    const lines = wrapPdfText(doc, 'Œ'.repeat(50), 100);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Œ'.repeat(50));
  });
});

describe('PDF pagination geometry', () => {
  it.each([false, true])('fits a long running title beside the report label (public-safe: %s)', publicSafe => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    const title = 'Synthetic multilingual review - Français Español Português / 東京 / العربية Agent Review';
    layout.field('Agent name', title);
    const placements: { text: string; x: number; y: number; width: number }[] = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((...args: Parameters<typeof doc.text>) => {
      placements.push({
        text: String(args[0]),
        x: Number(args[1]),
        y: Number(args[2]),
        width: measurePdfText(doc, String(args[0])),
      });
      return original(...args);
    });
    layout.finish(publicSafe, false, title);
    const header = placements.find(item => item.y === 10 && item.x === 17);
    const label = placements.find(item => item.y === 10 && item.x !== 17);
    expect(header).toBeDefined();
    expect(label).toBeDefined();
    expect(header!.text).toMatch(/\.\.\.$/);
    expect(header!.x + header!.width + 6).toBeLessThanOrEqual(label!.x - label!.width);
    expect(pdfPageText(doc.output()).join(' ')).toContain(preparePdfText(title));
  });

  it.each([27, 28, 29, 30])('keeps a short measured title/status/reason block together after %s paragraphs', preceding => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    const placements: { text: string; page: number }[] = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((...args: Parameters<typeof doc.text>) => {
      placements.push({ text: String(args[0]), page: doc.getNumberOfPages() });
      return original(...args);
    });
    for (let index = 0; index < preceding; index++) layout.paragraph('A preceding paragraph.');
    layout.heading('CRITERION TITLE', 3);
    layout.block([
      { value: 'Status: Not assessed | Criterion inherent severity: High' },
      { value: 'Assessment reason: SAVED SHORT REASON' },
    ]);
    const rows = placements.filter(item => /CRITERION TITLE|Status:|SAVED SHORT REASON/.test(item.text));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.page)).size).toBe(1);
  });

  it('repeats compact context on long-content pages and clears it for subsequent sections', () => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    const placements: { text: string; page: number; y: number }[] = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((...args: Parameters<typeof doc.text>) => {
      placements.push({ text: String(args[0]), page: doc.getNumberOfPages(), y: Number(args[2]) });
      return original(...args);
    });
    layout.setContinuationContext('Pattern check 1 | Affected setting 4');
    layout.heading('Affected setting 4', 3);
    layout.paragraph('RETAINED_WORD '.repeat(3000));
    const continuedPages = doc.getNumberOfPages();
    for (let page = 2; page <= continuedPages; page++) {
      expect(placements.find(item => item.page === page)?.text)
        .toBe('Pattern check 1 | Affected setting 4 (continued)');
    }
    expect(placements.map(item => item.text).join(' ').match(/RETAINED_WORD/g)).toHaveLength(3000);
    for (const { y } of placements) expect(y).toBeLessThanOrEqual(278);
    layout.setContinuationContext();
    layout.newPage();
    layout.paragraph('NEXT SECTION');
    expect(placements.find(item => item.page === continuedPages + 1)?.text).toBe('NEXT SECTION');
  });

  it('identifies the parent finding when a new affected setting starts on a continuation page', () => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    layout.setContinuationContext('Pattern check 1');
    layout.paragraph('The original finding has begun.');
    layout.setContinuationContext('Pattern check 1 | Affected setting 2', true);
    const calls = vi.spyOn(doc, 'text');
    layout.newPage();
    layout.heading('Affected setting 2', 3);
    layout.paragraph('Variable: next_input');
    expect(calls.mock.calls[0][0]).toBe('Pattern check 1 | Affected setting 2 (continued)');
    expect(calls.mock.calls[1][0]).toBe('Affected setting 2');
  });

  it('keeps each body line inside printable bounds for long paragraphs and hundreds of variables', () => {
    const doc = new jsPDF();
    const calls = vi.spyOn(doc, 'text');
    const layout = new CsPdfLayout(doc);
    layout.heading('A long finding', 2);
    layout.paragraph('Detailed assessment evidence. '.repeat(1800));
    for (let index = 0; index < 180; index++) {
      layout.heading(`Affected setting ${index + 1}`, 3);
      layout.paragraph(`Variable: input_${index}_${'W'.repeat(220)}`);
      layout.paragraph('Suggested: A clear description of the reviewed setting.');
    }
    expect(doc.getNumberOfPages()).toBeGreaterThan(10);
    for (const [, x, y] of calls.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(17);
      expect(x).toBeLessThanOrEqual(193);
      expect(y).toBeGreaterThanOrEqual(18);
      expect(y).toBeLessThanOrEqual(278);
    }
  });

  it('keeps a section heading with its first following paragraph when the current page is full', () => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    const placements: { text: string; page: number }[] = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((...args: Parameters<typeof doc.text>) => {
      placements.push({ text: String(args[0]), page: doc.getNumberOfPages() });
      return original(...args);
    });
    for (let index = 0; index < 34; index++) layout.paragraph('A short preceding paragraph.');
    layout.heading('NEXT SECTION', 2);
    layout.paragraph('FIRST PARAGRAPH');
    const heading = placements.find(item => item.text === 'NEXT SECTION');
    const first = placements.find(item => item.text === 'FIRST PARAGRAPH');
    expect(heading).toBeDefined();
    expect(first?.page).toBe(heading?.page);
  });

  it('measures long headings instead of overlapping a separate severity label', () => {
    const doc = new jsPDF();
    const calls = vi.spyOn(doc, 'text');
    const layout = new CsPdfLayout(doc);
    layout.heading('Long descriptive finding title '.repeat(25), 2);
    layout.paragraph('Status: Fail | Inherent severity: High');
    const positions = calls.mock.calls.map(([, , y]) => y);
    expect(positions.length).toBeGreaterThan(4);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('keeps chained group and finding headings with their first real detail paragraph', () => {
    const doc = new jsPDF();
    const layout = new CsPdfLayout(doc);
    const placements: { text: string; page: number }[] = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((...args: Parameters<typeof doc.text>) => {
      placements.push({ text: String(args[0]), page: doc.getNumberOfPages() });
      return original(...args);
    });
    for (let index = 0; index < 28; index++) layout.paragraph('A short preceding paragraph.');
    layout.heading('GROUP HEADING', 2);
    layout.heading('A verbose saved finding title that wraps across many lines. '.repeat(10), 3);
    layout.paragraph('FIRST REAL DETAIL');
    expect(placements.find(item => item.text === 'GROUP HEADING')?.page)
      .toBe(placements.find(item => item.text === 'FIRST REAL DETAIL')?.page);
  });
});
