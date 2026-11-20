import type { AnalysisReportContentBlock } from "../contracts/analysis-report";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function label(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "Not recorded";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Presents recorded results as prose, fields or tables, without repeating their raw envelope. */
export function reportEvidence(value: unknown): AnalysisReportContentBlock[] {
  if (value === undefined || value === null || value === "") {
    return [{ kind: "text", text: "Not recorded" }];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[{[]/.test(trimmed) && !/^\[\d+\]:\s+cite:/.test(trimmed)) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        return reportEvidence(parsed);
      } catch {
        // Incomplete source JSON remains visible as recorded text, never guessed or discarded.
        return [{ kind: "code", text: value }];
      }
    }
    const envelope = /^Title:[^\r\n]*\r?\nReferenceId:\s*([^\r\n]*)\r?\n(?=\s*\S)/.exec(value);
    if (envelope) {
      return reportEvidence(value.slice(envelope[0].length));
    }
    if (value.includes("```")) return [{ kind: "markdown", text: value }];
    const references: string[] = [];
    const proseLines = value.split("\n").filter(line => {
      const match = /^\s*\[(\d+)\]:\s+(cite:[^\s]+)(?:\s.*)?$/.exec(line);
      if (!match) return true;
      references.push(`[${match[1]}] (${match[2]})`);
      return false;
    });
    if (references.length) {
      const prose = proseLines.join("\n").trim();
      const referenceText = `Recorded tool references: ${references.join(", ")}`;
      const lastLine = prose.split("\n").at(-1) ?? "";
      if (prose && !/^\s*(?:\||#{1,6}\s|[>*-]\s|\d+[.)]\s)/.test(lastLine)) {
        return reportEvidence(`${prose} (${referenceText})`);
      }
      return [
        ...(prose ? reportEvidence(prose) : []),
        { kind: "text", text: referenceText },
      ];
    }
    const lines = value.split("\n");
    for (let index = 0; index < lines.length; index++) {
      if (!/^[{[]/.test(lines[index].trim())) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(lines.slice(index).join("\n")); } catch { continue; }
      return [
        ...(index ? [{ kind: "markdown" as const, text: lines.slice(0, index).join("\n") }] : []),
        ...reportEvidence(parsed),
      ];
    }
    const blocks: AnalysisReportContentBlock[] = [];
    let prose: string[] = [];
    const flush = () => {
      if (prose.length) blocks.push({ kind: "markdown", text: prose.join("\n") });
      prose = [];
    };
    for (const line of value.split("\n")) {
      const start = line.indexOf("{");
      if (start >= 0) {
        let parsed: unknown;
        try { parsed = JSON.parse(line.slice(start)); } catch { /* Plain text, not a JSON record. */ }
        if (record(parsed)) {
          flush();
          if (line.slice(0, start).trim()) blocks.push({ kind: "text", text: line.slice(0, start).trim() });
          blocks.push(...reportEvidence(parsed));
          continue;
        }
      }
      prose.push(line);
    }
    flush();
    return blocks;
  }
  if (Array.isArray(value)) {
    if (!value.length) return [{ kind: "text", text: "No results returned" }];
    if (value.every(record)) {
      const columns = [...new Set(value.flatMap(row => Object.keys(row)))];
      if (columns.length && columns.length <= 5 && value.every(row =>
        Object.values(row).every(item => item === null || typeof item !== "object"))) {
        return [{ kind: "table", columns: columns.map(label), rows: value.map(row => columns.map(key => cell(row[key]))) }];
      }
    }
    return value.flatMap((item, index) => [
      { kind: "heading" as const, text: `Result ${index + 1}` }, ...reportEvidence(item),
    ]);
  }
  if (!record(value)) return [{ kind: "text", text: String(value) }];
  const columnValues = value.columns;
  if (Array.isArray(columnValues) && columnValues.length &&
    columnValues.every(column => typeof column === "string") && Array.isArray(value.rows) &&
    value.rows.every(row => Array.isArray(row) && row.length === columnValues.length)) {
    const columns: string[] = columnValues;
    const rows: unknown[][] = value.rows;
    if (columns.length <= 5) {
      return [{ kind: "table", columns, rows: rows.map(row => row.map(cell)) }];
    }
    return rows.flatMap((row, index) => [
      { kind: "heading" as const, text: `Result ${index + 1}` },
      { kind: "fields" as const, fields: columns.map((column, i) => ({ label: column, value: cell(row[i]) })) },
    ]);
  }
  if (typeof value.agent_response === "string") return reportEvidence(value.agent_response);
  if (Array.isArray(value.content)) {
    return value.content.flatMap((item): AnalysisReportContentBlock[] =>
      record(item) && typeof item.text === "string" ? reportEvidence(item.text) :
        [{ kind: "text", text: `Non-text tool output (${record(item) ? cell(item.type) : "unknown type"}). See the original JSON.` }]);
  }
  const blocks: AnalysisReportContentBlock[] = [];
  const primitiveFields: Array<{ label: string; value: string }> = [];
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "object" && item !== null) {
      blocks.push({ kind: "heading", text: label(key) }, ...reportEvidence(item));
    } else {
      primitiveFields.push({ label: label(key), value: cell(item) });
    }
  }
  return [
    ...(primitiveFields.length ? [{ kind: "fields" as const, fields: primitiveFields }] : []),
    ...blocks,
    ...(!primitiveFields.length && !blocks.length ? [{ kind: "text" as const, text: "No output fields recorded" }] : []),
  ];
}
