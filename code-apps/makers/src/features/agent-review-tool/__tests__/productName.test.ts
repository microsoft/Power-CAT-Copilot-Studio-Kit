import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the product name. The harness is "Microsoft Copilot". The old name
 * and its abbreviation must not come back into the Agent Review Tool source.
 * Test files and fixtures are not scanned, because they can quote dated text.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OLD_NAME = /git ?hub copilot/i;
const OLD_ABBREVIATION = /\bGHCP/;
const SPLIT_START = /git ?hub\s*$/i;
const SPLIT_END = /^\s*(?:\*\s*|\{' '\})?copilot\b/i;
// A real developer tool. It is built from 2 parts, so this file does not contain the old name.
const ALLOWED = ['Git', 'Hub Copilot CLI'].join('');
const SKIPPED_FOLDERS = new Set(['__tests__', 'generated', 'node_modules']);

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

function offendingLines(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  return lines.flatMap((line, index) => {
    const text = line.split(ALLOWED).join('');
    const splitName = SPLIT_START.test(text) && SPLIT_END.test(lines[index + 1] ?? '');
    return OLD_NAME.test(text) || OLD_ABBREVIATION.test(text) || splitName
      ? [`${relative(ROOT, file)}:${index + 1}`]
      : [];
  });
}

describe('product name', () => {
  // The sync reads of the full folder can take more than the 5 s default on a busy machine.
  it('uses "Microsoft Copilot" in the Agent Review Tool source', () => {
    const offenders = sourceFiles(ROOT).flatMap(file => offendingLines(file));
    expect(offenders.length, offenders.join('\n')).toBe(0);
  }, 30_000);
});
