/**
 * Human-readable summariser for agent component YAML diffs.
 *
 * The raw YAML stays in the "View YAML" dialog; this module turns the structural
 * difference between two YAML documents into a short list of plain-English
 * statements (e.g. "Code interpreter enabled", "Model changed to sonnet4-5") so a
 * non-technical reader can understand what changed at a glance.
 *
 * It uses a dependency-free, indentation-based flattener that is intentionally
 * lenient: anything it cannot interpret simply yields no statement, and callers
 * fall back to a generic line-count summary.
 */

export type FriendlyKind = 'added' | 'removed' | 'changed';

export interface FriendlyChange {
  kind: FriendlyKind;
  /** Human label for the field, e.g. "Model", "Code interpreter". */
  label: string;
  /** Full sentence fallback / tooltip, e.g. 'Model changed from "a" to "b"'. */
  text: string;
  /** Previous scalar value (for changed scalars). */
  before?: string;
  /** New scalar value (for changed/added scalars). */
  after?: string;
  /** Boolean fields render as an on/off state instead of a value token. */
  state?: 'enabled' | 'disabled';
  /** A bare verb when there is no value to show, e.g. "added", "removed". */
  verb?: string;
  /** Long / multi-line text (e.g. Instructions) — render as a readable block, not a token. */
  longText?: boolean;
}

/** A leaf value keyed by its dotted YAML path (list items use `[n]`). */
type FlatMap = Map<string, string>;

const MAX_VALUE_LEN = 48;

/** Friendlier labels for well-known agent keys (matched on the last path segment). */
const KEY_LABEL: Record<string, string> = {
  modelNameHint: 'Model',
  webBrowsing: 'Web browsing',
  codeInterpreter: 'Code interpreter',
  reasoning: 'Reasoning',
  lastUsedCustomModel: 'Last used custom model',
  orchestration: 'Orchestration',
  generativeMode: 'Generative mode',
  displayName: 'Display name',
  description: 'Description',
  instructions: 'Instructions',
  responseInstructions: 'Response instructions',
  moderatedCustomResponse: 'When potential responses get flagged by content moderation',
  suggestedPrompts: 'Suggested prompts',
  text: 'Message',
  speak: 'Spoken message',
  activity: 'Message',
  value: 'Value',
  prompt: 'Prompt',
  mode: 'Connection mode',
  connectionReference: 'Connection',
  operationId: 'Operation',
};

function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Flatten a simple YAML document into a map of dotted-path -> scalar value. */
export function flattenYaml(src: string): FlatMap {
  const out: FlatMap = new Map();
  if (!src) return out;
  const lines = src.split(/\r?\n/);
  const stack: { indent: number; key: string }[] = [];
  const listCounters = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const line = rawLine.replace(/\s+$/, '');
    const indent = line.length - line.trimStart().length;
    let content = line.trim();

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentPath = stack.map((s) => s.key).join('.');

    if (content.startsWith('- ')) {
      content = content.slice(2).trim();
      const idx = listCounters.get(parentPath) ?? 0;
      listCounters.set(parentPath, idx + 1);
      const itemPath = parentPath ? `${parentPath}.[${idx}]` : `[${idx}]`;
      const m = content.match(/^([^:]+):\s*(.*)$/);
      if (m && m[2] !== '') {
        out.set(`${itemPath}.${m[1].trim()}`, stripQuotes(m[2]));
        // Establish the list-item scope so the item's remaining sibling keys
        // (e.g. `displayName` on the next line, indented under `- id: …`) nest
        // under `items.[idx].*` instead of collapsing onto the parent path and
        // overwriting each other across items — which otherwise makes an added
        // list entry look like a change to the previous entry's value.
        stack.push({ indent, key: `[${idx}]` });
      } else if (m) {
        stack.push({ indent, key: `[${idx}]` });
        stack.push({ indent: indent + 1, key: m[1].trim() });
      } else {
        out.set(itemPath, stripQuotes(content));
      }
      continue;
    }

    const m = content.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2];
    const path = parentPath ? `${parentPath}.${key}` : key;

    // Block scalar (literal `|` / folded `>`, with optional chomping/indent indicators):
    // collect the following more-indented lines as the multi-line value.
    if (/^[|>][+-]?\d*$/.test(value.trim())) {
      const blockLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const bl = lines[j];
        if (!bl.trim()) {
          blockLines.push('');
          continue;
        }
        const blIndent = bl.length - bl.trimStart().length;
        if (blIndent <= indent) break;
        blockLines.push(bl.trimStart());
      }
      while (blockLines.length && blockLines[blockLines.length - 1] === '') blockLines.pop();
      out.set(path, blockLines.join('\n'));
      i = j - 1;
      continue;
    }

    if (value === '') {
      stack.push({ indent, key });
      listCounters.delete(path);
    } else {
      out.set(path, stripQuotes(value));
    }
  }
  return out;
}

interface RawChange {
  kind: FriendlyKind;
  path: string;
  before?: string;
  after?: string;
}

/**
 * Split a flat map into its scalar-list entries and everything else.
 *
 * A YAML list of plain values (`triggerQueries: [a, b, c]`) flattens to
 * `triggerQueries.[0]`, `.[1]`, `.[2]`. Diffing those positionally is wrong:
 * inserting one item shifts every later index and reports a cascade of bogus
 * "changed" rows. They are therefore pulled out here and compared as sets.
 *
 * Lists of objects (`actions.[0].kind`) do not match and keep per-field diffing.
 */
function splitScalarLists(map: FlatMap): { lists: Map<string, string[]>; rest: FlatMap } {
  const lists = new Map<string, string[]>();
  const rest: FlatMap = new Map();
  const indexed = new Map<string, { idx: number; value: string }[]>();

  for (const [path, value] of map) {
    const m = path.match(/^(.+)\.\[(\d+)\]$/);
    if (!m) {
      rest.set(path, value);
      continue;
    }
    const bucket = indexed.get(m[1]);
    const entry = { idx: Number(m[2]), value };
    if (bucket) bucket.push(entry);
    else indexed.set(m[1], [entry]);
  }

  for (const [parent, entries] of indexed) {
    entries.sort((a, b) => a.idx - b.idx);
    lists.set(parent, entries.map((e) => e.value));
  }
  return { lists, rest };
}

/**
 * Compare scalar lists by membership, emitting at most one "added" and one
 * "removed" change per list so a card shows a single readable row such as
 * `Trigger queries  track agent, agent tracking, …`.
 */
function diffScalarLists(
  before: Map<string, string[]>,
  after: Map<string, string[]>,
): RawChange[] {
  const changes: RawChange[] = [];
  for (const parent of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(parent) ?? [];
    const a = after.get(parent) ?? [];
    const bSet = new Set(b);
    const aSet = new Set(a);
    const added = a.filter((v) => !bSet.has(v));
    const removed = b.filter((v) => !aSet.has(v));
    if (added.length) changes.push({ kind: 'added', path: parent, after: added.join(', ') });
    if (removed.length) changes.push({ kind: 'removed', path: parent, before: removed.join(', ') });
  }
  return changes;
}

function diffMaps(before: FlatMap, after: FlatMap): RawChange[] {
  const keys = new Set<string>([...before.keys(), ...after.keys()]);
  const changes: RawChange[] = [];
  for (const k of keys) {
    const b = before.get(k);
    const a = after.get(k);
    if (b === a) continue;
    if (b === undefined) changes.push({ kind: 'added', path: k, after: a });
    else if (a === undefined) changes.push({ kind: 'removed', path: k, before: b });
    else changes.push({ kind: 'changed', path: k, before: b, after: a });
  }
  return changes;
}

/** Turn `aISettings.model.modelNameHint` into a readable label ("Model"). */
function humanizeKey(path: string): string {
  const seg = path.split('.').filter((s) => !s.startsWith('[')).pop() ?? path;
  if (KEY_LABEL[seg]) return KEY_LABEL[seg];
  const words = seg
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!words) return seg;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function isBool(v: string | undefined): v is 'true' | 'false' {
  return v === 'true' || v === 'false';
}

function isEmptyish(v: string | undefined): boolean {
  return v === undefined || v === '' || v === '{}' || v === '[]' || v === 'null' || v === '~';
}

function quote(v: string): string {
  return `"${v}"`;
}

function isLongText(v: string | undefined, inlineSingleLine = false): boolean {
  if (v === undefined) return false;
  if (v.includes('\n')) return true;
  // Some components (e.g. evaluation questions) hold a single sentence that is
  // still one readable line well past the generic cap. Rendering those as a
  // block makes otherwise-identical cards look inconsistent purely because one
  // question is a few characters longer, so keep single-line values inline.
  return inlineSingleLine ? false : v.length > MAX_VALUE_LEN;
}

function describe(change: RawChange, inlineSingleLine = false): FriendlyChange {
  if (change.path.toLowerCase() === 'aisettings.model.kind') {
    const beforeEnabled = change.before?.toLowerCase() === 'deferredupdatemodels';
    const afterEnabled = change.after?.toLowerCase() === 'deferredupdatemodels';
    if (beforeEnabled || afterEnabled) {
      const state = afterEnabled ? 'enabled' : 'disabled';
      return {
        kind: change.kind,
        label: 'Continue using retired Models',
        before: beforeEnabled ? 'Enabled' : 'Disabled',
        after: afterEnabled ? 'Enabled' : 'Disabled',
        state,
        text: `Continue using retired Models ${state}`,
      };
    }
  }

  const label = humanizeKey(change.path);

  if (change.kind === 'added') {
    if (isBool(change.after)) {
      const state = change.after === 'true' ? 'enabled' : 'disabled';
      return { kind: 'added', label, after: state === 'enabled' ? 'Enabled' : 'Disabled', state, text: `${label} ${state}` };
    }
    if (isEmptyish(change.after)) {
      return { kind: 'added', label, verb: 'added', text: `${label} added` };
    }
    if (isLongText(change.after, inlineSingleLine)) {
      return { kind: 'added', label, after: change.after, longText: true, verb: 'added', text: `${label} added` };
    }
    return { kind: 'added', label, after: change.after, text: `${label} set to ${quote(change.after as string)}` };
  }

  if (change.kind === 'removed') {
    if (isBool(change.before)) {
      return {
        kind: 'removed',
        label,
        before: change.before === 'true' ? 'Enabled' : 'Disabled',
        state: 'disabled',
        text: `${label} disabled`,
      };
    }
    if (isEmptyish(change.before)) {
      return { kind: 'removed', label, verb: 'removed', text: `${label} removed` };
    }
    if (isLongText(change.before, inlineSingleLine)) {
      return {
        kind: 'removed',
        label,
        before: change.before,
        longText: true,
        verb: 'removed',
        text: `${label} removed`,
      };
    }
    return {
      kind: 'removed',
      label,
      before: change.before,
      verb: 'removed',
      text: `${label} ${quote(change.before as string)} removed`,
    };
  }

  // changed
  if (isBool(change.after)) {
    const state = change.after === 'true' ? 'enabled' : 'disabled';
    return {
      kind: 'changed',
      label,
      before: change.before === 'true' ? 'Enabled' : 'Disabled',
      after: state === 'enabled' ? 'Enabled' : 'Disabled',
      state,
      text: `${label} ${state}`,
    };
  }
  const b = change.before ?? '';
  const a = change.after ?? '';
  if (isLongText(b, inlineSingleLine) || isLongText(a, inlineSingleLine)) {
    return { kind: 'changed', label, before: b, after: a, longText: true, verb: 'updated', text: `${label} updated` };
  }
  return { kind: 'changed', label, before: b, after: a, text: `${label} changed from ${quote(b)} to ${quote(a)}` };
}

/**
 * Produce a list of plain-English statements describing the difference between
 * two YAML documents. Returns an empty array when nothing interpretable changed
 * (callers should then fall back to a generic line-count summary).
 *
 * When `relevantSegments` is supplied, only fields whose last path segment is in
 * the set are surfaced; everything else stays in the "View YAML" dialog.
 *
 * Set `inlineSingleLine` for components whose values are single-sentence rather
 * than prose, so they render as inline rows regardless of length.
 */
export function summarizeYamlDiff(
  before: string,
  after: string,
  relevantSegments?: Set<string>,
  inlineSingleLine = false,
): FriendlyChange[] {
  const beforeFlat = splitScalarLists(flattenYaml(before));
  const afterFlat = splitScalarLists(flattenYaml(after));
  let raw = [
    ...diffMaps(beforeFlat.rest, afterFlat.rest),
    ...diffScalarLists(beforeFlat.lists, afterFlat.lists),
  ];
  if (relevantSegments && relevantSegments.size > 0) {
    raw = raw.filter((c) => {
      const normalizedPath = c.path.toLowerCase();
      const seg = (c.path.split('.').filter((s) => !s.startsWith('[')).pop() ?? c.path).toLowerCase();
      return relevantSegments.has(seg) || relevantSegments.has(normalizedPath);
    });
  }
  // An empty placeholder (`voiceFont: {}`, `inputType: {}`, a bare null) carries
  // no information when it appears or disappears — reporting "Voice font added"
  // is noise. A transition to or from a real value is still a genuine change.
  raw = raw.filter(
    (c) =>
      !(c.kind === 'added' && isEmptyish(c.after)) && !(c.kind === 'removed' && isEmptyish(c.before)),
  );
  // Stable, readable ordering: additions, then changes, then removals.
  const order: Record<FriendlyKind, number> = { added: 0, changed: 1, removed: 2 };
  raw.sort((x, y) => order[x.kind] - order[y.kind] || x.path.localeCompare(y.path));
  return raw.map((c) => describe(c, inlineSingleLine));
}

/**
 * Whether a body is structured YAML the app can actually describe — i.e. it
 * flattens to at least one `key: value` field.
 *
 * Used to decide whether a generic line-count summary is worth showing. A body
 * that yields no fields (plain prose, a bare sentence recovered from a `name` /
 * `description` history row, or an empty payload) has nothing to display, so a
 * count like "1 added · 1 removed lines" states a fact the reader cannot act on
 * and should be suppressed entirely.
 */
export function hasYamlContent(text: string): boolean {
  if (!text || text.trim() === '') return false;
  return Object.keys(flattenYaml(text)).length > 0;
}

/**
 * Summarise a change to a single plain-text (non-YAML) field, e.g. a component's
 * description. Short values render inline ("Description changed from … to …");
 * long / multi-line values render as a readable before/after block. Returns an
 * empty array when the trimmed value is unchanged.
 */
export function summarizePlainTextChange(
  fieldKey: string,
  before: string,
  after: string,
): FriendlyChange[] {
  const b = (before ?? '').trim();
  const a = (after ?? '').trim();
  if (b === a) return [];
  const kind: FriendlyKind = b === '' ? 'added' : a === '' ? 'removed' : 'changed';
  return [
    describe({
      kind,
      path: fieldKey,
      before: b === '' ? undefined : b,
      after: a === '' ? undefined : a,
    }),
  ];
}
