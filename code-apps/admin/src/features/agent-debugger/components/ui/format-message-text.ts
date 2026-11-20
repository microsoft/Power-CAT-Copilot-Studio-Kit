/**
 * Converts markdown-formatted text to safe HTML for display in chat bubbles and adaptive cards.
 * Supports: headings (h1-h3), tables, unordered/ordered lists, blockquotes, horizontal rules,
 * fenced code blocks, inline code, bold, italic, and links (https/mailto only).
 */
export function formatMessageText(text: string): string {
  if (!text) return "";

  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Extract fenced code blocks before line processing to protect their content
  const codeBlocks: string[] = [];
  escaped = escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
    return `CODEBLOCKPLACEHOLDER${idx}END`;
  });

  // Normalize \r\n and bare \r to \n so carriage-return-separated lines are handled correctly
  escaped = escaped.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = escaped.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule: line consisting entirely of 3+ dashes or asterisks
    if (/^[-*]{3,}$/.test(line.trim())) {
      output.push("<hr>");
      i++;
      continue;
    }

    // ATX headings — longest prefix first to avoid false matches
    const h3 = line.match(/^### (.+)$/);
    if (h3) { output.push(`<h3>${applyInline(h3[1])}</h3>`); i++; continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { output.push(`<h2>${applyInline(h2[1])}</h2>`); i++; continue; }
    const h1 = line.match(/^# (.+)$/);
    if (h1) { output.push(`<h1>${applyInline(h1[1])}</h1>`); i++; continue; }

    // Table: header row starting with | followed by a separator row
    if (line.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableRows.push(lines[i]);
        i++;
      }
      output.push(renderTable(tableRows));
      continue;
    }

    // Blockquote — HTML-escaped ">" becomes "&gt;"
    if (line.startsWith("&gt; ") || line === "&gt;") {
      const quoteContent: string[] = [];
      while (i < lines.length && (lines[i].startsWith("&gt; ") || lines[i] === "&gt;")) {
        quoteContent.push(applyInline(lines[i].replace(/^&gt; ?/, "")));
        i++;
      }
      output.push(`<blockquote>${quoteContent.join("<br>")}</blockquote>`);
      continue;
    }

    // Unordered list: lines starting with "- " or "* "
    if (/^[*-] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-] /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].replace(/^[*-] /, ""))}</li>`);
        i++;
      }
      output.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list: lines starting with "1. ", "2. ", etc.
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      output.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Code block placeholder (already extracted above)
    if (line.includes("\x00CB")) {
      output.push(line);
    } else if (line === "") {
      output.push("<br>");
    } else {
      output.push(applyInline(line));
    }
    i++;
  }

  // Join: suppress extra <br> adjacent to block-level elements
  const isBlock = (s: string) =>
    /^<(h[1-6]|ul|ol|blockquote|pre|hr|br|table)/.test(s);

  let result = "";
  for (let j = 0; j < output.length; j++) {
    if (j === 0) {
      result += output[j];
    } else if (isBlock(output[j]) || isBlock(output[j - 1])) {
      result += output[j];
    } else {
      result += "<br>" + output[j];
    }
  }

  // Restore code blocks
  result = result.replace(/CODEBLOCKPLACEHOLDER(\d+)END/g, (_, idx) => codeBlocks[parseInt(idx, 10)]);

  return result;
}

/** Returns true if a line is a markdown table separator row (e.g. |---|---| or |:---|---:|). */
function isTableSeparator(line: string): boolean {
  if (!line.startsWith("|")) return false;
  const cells = line.replace(/^\||\|$/g, "").split("|");
  return cells.length > 0 && cells.every(cell => /^[\s:-]*-+[\s:-]*$/.test(cell));
}

/** Converts collected table rows (header + separator + data) to an HTML table. */
function renderTable(rows: string[]): string {
  if (rows.length < 2) return rows.map(r => applyInline(r)).join("<br>");

  const parseRow = (row: string): string[] =>
    row.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => applyInline(cell.trim()));

  const headers = parseRow(rows[0]);
  const colCount = headers.length;
  // rows[1] is the separator — skip it
  const dataRows = rows.slice(2).map(r => {
    const cells = parseRow(r);
    while (cells.length < colCount) cells.push("");
    return cells.slice(0, colCount);
  });

  const headerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  const bodyHTML = dataRows.map(row =>
    `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`
  ).join("");

  return `<table><thead>${headerHTML}</thead><tbody>${bodyHTML}</tbody></table>`;
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

/** Applies inline markdown (bold, italic, inline code, links) to a single line of already-escaped text. */
function applyInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>")
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
