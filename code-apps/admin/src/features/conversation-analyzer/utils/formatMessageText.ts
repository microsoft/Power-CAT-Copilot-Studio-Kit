/** Convert transcript Markdown to escaped HTML, allowing only HTTP(S) and mailto links. */
export function formatMessageText(text: string): string {
  if (!text) return '';

  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Protect fenced code from inline Markdown processing.
  const codeBlocks: string[] = [];
  escaped = escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
    return `CODEBLOCKPLACEHOLDER${idx}END`;
  });
  escaped = escaped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = escaped.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^[-*]{3,}$/.test(line.trim())) {
      output.push('<hr>');
      i++;
      continue;
    }

    const h3 = line.match(/^### (.+)$/);
    if (h3) { output.push(`<h3>${applyInline(h3[1])}</h3>`); i++; continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { output.push(`<h2>${applyInline(h2[1])}</h2>`); i++; continue; }
    const h1 = line.match(/^# (.+)$/);
    if (h1) { output.push(`<h1>${applyInline(h1[1])}</h1>`); i++; continue; }

    if (line.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      output.push(renderTable(tableRows));
      continue;
    }

    if (line.startsWith('&gt; ') || line === '&gt;') {
      const quoteContent: string[] = [];
      while (i < lines.length && (lines[i].startsWith('&gt; ') || lines[i] === '&gt;')) {
        quoteContent.push(applyInline(lines[i].replace(/^&gt; ?/, '')));
        i++;
      }
      output.push(`<blockquote>${quoteContent.join('<br>')}</blockquote>`);
      continue;
    }

    if (/^[*-] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-] /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].replace(/^[*-] /, ''))}</li>`);
        i++;
      }
      output.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      output.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (line === '') {
      output.push('<br>');
    } else {
      output.push(applyInline(line));
    }
    i++;
  }

  // Avoid extra line breaks around block-level elements.
  const isBlock = (s: string) =>
    /^(<(h[1-6]|ul|ol|blockquote|pre|hr|br|table)|CODEBLOCKPLACEHOLDER\d+END$)/.test(s);

  let result = '';
  for (let j = 0; j < output.length; j++) {
    if (j === 0) {
      result += output[j];
    } else if (isBlock(output[j]) || isBlock(output[j - 1])) {
      result += output[j];
    } else {
      result += '<br>' + output[j];
    }
  }

  return result.replace(/CODEBLOCKPLACEHOLDER(\d+)END/g, (_, idx) => codeBlocks[parseInt(idx, 10)]);
}

function isTableSeparator(line: string): boolean {
  if (!line.startsWith('|')) return false;
  const cells = line.replace(/^\||\|$/g, '').split('|');
  return cells.length > 0 && cells.every(cell => /^[\s:-]*-+[\s:-]*$/.test(cell));
}

function renderTable(rows: string[]): string {
  if (rows.length < 2) return rows.map(r => applyInline(r)).join('<br>');

  const parseRow = (row: string): string[] =>
    row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => applyInline(cell.trim()));

  const headers = parseRow(rows[0]);
  const colCount = headers.length;
  const dataRows = rows.slice(2).map(r => {
    const cells = parseRow(r);
    while (cells.length < colCount) cells.push('');
    return cells.slice(0, colCount);
  });

  const headerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  const bodyHTML = dataRows.map(row =>
    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
  ).join('');

  return `<table><thead>${headerHTML}</thead><tbody>${bodyHTML}</tbody></table>`;
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;');
}

function applyInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, title, url) => {
        const trimmed = url.trim();
        return /^(https?:\/\/|mailto:)/i.test(trimmed)
          ? `<a href="${escapeAttributeValue(trimmed)}" target="_blank" rel="noopener noreferrer">${title}</a>`
          : title;
      }
    );
}
