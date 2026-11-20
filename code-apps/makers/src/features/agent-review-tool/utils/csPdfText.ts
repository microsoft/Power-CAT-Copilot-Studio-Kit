import type { jsPDF } from 'jspdf';

const WIN_ANSI = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ndash: '–', mdash: '—', hellip: '…',
};

export const PDF_FONT_NOTICE =
  'Font support: built-in Helvetica preserves Western Latin/WinAnsi text. Other characters are represented as Unicode code points [U+XXXX], not silently removed. Original saved text is unchanged.';

/** Decode supported HTML entities without corrupting supplementary or invalid code points. */
export function decodePdfTextEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (key[0] !== '#') return ENTITIES[key.toLowerCase()] ?? entity;
    const code = key[1].toLowerCase() === 'x'
      ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : entity;
  });
}

/** Prepare text for the existing licensed PDF base font without corrupting unsupported scripts. */
export function preparePdfText(value: string): string {
  const decoded = decodePdfTextEntities(value).normalize('NFC')
    .replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  return Array.from(decoded, character => {
    const code = character.codePointAt(0)!;
    const supported = character === '\n' || (code >= 0x20 && code <= 0x7e)
      || (code >= 0xa0 && code <= 0xff && code !== 0xad) || WIN_ANSI.has(character);
    return supported ? character : `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`;
  }).join('');
}

/** Bound unkerned PDF base-font advances, including jsPDF's rounded or absent glyph metrics. */
export function measurePdfText(doc: jsPDF, value: string): number {
  const metadata = doc.getFont().metadata as {
    Unicode?: { widths?: Record<number, number> & { fof?: number } };
  };
  const widths = metadata.Unicode?.widths;
  const divisor = widths?.fof ?? 100;
  const units = Array.from(value).reduce((sum, character) => {
    const width = widths?.[character.codePointAt(0)!];
    // Base-font metrics are rounded to 1/100 em; PDF viewers use full AFM advances, without kerning.
    const advance = width === undefined ? Math.max(1, doc.getStringUnitWidth(character, { doKerning: false }))
      : width / divisor;
    return sum + advance + 1 / divisor;
  }, 0);
  return units * doc.getFontSize() / doc.internal.scaleFactor;
}

function fittingPrefix(doc: jsPDF, token: string, width: number): number {
  let low = 0;
  let high = token.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measurePdfText(doc, token.slice(0, middle)) <= width) low = middle;
    else high = middle - 1;
  }
  if (low === 0) throw new Error('PDF text column is narrower than a single glyph.');
  return low;
}

/** Wrap using the active font metrics, including unbroken identifiers and explicit paragraph breaks. */
export function wrapPdfText(doc: jsPDF, value: string, width: number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid PDF text column width.');
  const lines: string[] = [];
  for (const paragraph of preparePdfText(value).split('\n')) {
    let line = '';
    for (let token of paragraph.match(/\s+|\S+/g) ?? []) {
      if (measurePdfText(doc, line + token) <= width) {
        line += token;
        continue;
      }
      if (line) {
        lines.push(line.trimEnd());
        line = '';
      }
      if (!token.trim()) continue;
      while (measurePdfText(doc, token) > width) {
        const count = fittingPrefix(doc, token, width);
        lines.push(token.slice(0, count));
        token = token.slice(count);
      }
      line = token;
    }
    lines.push(line);
  }
  return lines;
}
