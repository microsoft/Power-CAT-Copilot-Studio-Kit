/**
 * Dependency-free line diff for turning two YAML/text blobs into a
 * human-readable, color-codeable change view.
 *
 * Uses a classic Longest-Common-Subsequence walk over lines — fast and stable
 * for the capped (≤8 KB) component payloads the change tracker stores.
 */

export type DiffLineType = 'same' | 'add' | 'remove' | 'gap';

export interface DiffLine {
  type: DiffLineType;
  /** The line text (without trailing newline); '…' for a collapsed gap. */
  text: string;
}

/** Compute a line-level diff between `before` and `after`. */
export function diffLines(before: string, after: string): DiffLine[] {
  // An absent document has no lines. Splitting '' yields [''] — one phantom
  // empty line — which makes a deletion report a spurious "1 added" alongside
  // its removals (and inflates every count by one against an empty side).
  const toLines = (value: string): string[] => {
    const normalized = (value ?? '').replace(/\r\n/g, '\n');
    return normalized === '' ? [] : normalized.split('\n');
  };
  const a = toLines(before);
  const b = toLines(after);
  const m = a.length;
  const n = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: 'remove', text: a[i++] });
  while (j < n) out.push({ type: 'add', text: b[j++] });
  return out;
}

/** Count of added / removed lines in a diff. */
export function diffSummary(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
  }
  return { added, removed };
}

/**
 * Collapse long runs of unchanged lines into a single `gap`, keeping `context`
 * unchanged lines around every change so the result reads like a focused diff.
 */
export function compactDiff(lines: DiffLine[], context = 2): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'same') {
      const from = Math.max(0, i - context);
      const to = Math.min(lines.length - 1, i + context);
      for (let j = from; j <= to; j++) keep[j] = true;
    }
  }

  const out: DiffLine[] = [];
  let inGap = false;
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      out.push(lines[i]);
      inGap = false;
    } else if (!inGap) {
      out.push({ type: 'gap', text: '…' });
      inGap = true;
    }
  }
  return out;
}

/** One aligned row of a side-by-side (split) diff. */
export interface SideBySideRow {
  leftNo?: number;
  rightNo?: number;
  left?: string;
  right?: string;
  leftType: 'same' | 'remove' | 'empty';
  rightType: 'same' | 'add' | 'empty';
}

/**
 * Convert a flat line diff into aligned left/right rows for a split view.
 * Consecutive removes/adds are paired up so a changed line appears on both
 * sides; leftover removes/adds get a blank cell on the opposite side.
 */
export function toSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let removeBuf: string[] = [];
  let addBuf: string[] = [];

  const flush = () => {
    const max = Math.max(removeBuf.length, addBuf.length);
    for (let i = 0; i < max; i++) {
      const l = i < removeBuf.length ? removeBuf[i] : undefined;
      const r = i < addBuf.length ? addBuf[i] : undefined;
      rows.push({
        left: l,
        right: r,
        leftNo: l !== undefined ? ++leftNo : undefined,
        rightNo: r !== undefined ? ++rightNo : undefined,
        leftType: l !== undefined ? 'remove' : 'empty',
        rightType: r !== undefined ? 'add' : 'empty',
      });
    }
    removeBuf = [];
    addBuf = [];
  };

  for (const line of lines) {
    if (line.type === 'same') {
      flush();
      rows.push({
        left: line.text,
        right: line.text,
        leftNo: ++leftNo,
        rightNo: ++rightNo,
        leftType: 'same',
        rightType: 'same',
      });
    } else if (line.type === 'remove') {
      removeBuf.push(line.text);
    } else if (line.type === 'add') {
      addBuf.push(line.text);
    }
  }
  flush();
  return rows;
}

