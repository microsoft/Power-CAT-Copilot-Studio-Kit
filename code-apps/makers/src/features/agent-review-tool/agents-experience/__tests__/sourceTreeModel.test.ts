/**
 * Source-view file tree.
 *
 * Measured on ZAVA Training Hub: the Source tab showed only the raw
 * `<!-- bic:bundle=... -->` marker and a `source: inline` badge, while the
 * designer showed four files across three folders. These pin the grouping the
 * maker sees so the two views stay comparable.
 */
import { describe, expect, it } from 'vitest';

import {
  buildSourceTree,
  countSourceFiles,
  formatFileSize,
} from '../components/sourceTreeModel';
import type { SkillSourceFileView } from '../components/viewTypes';

/** The real ZAVA Training Hub bundle. */
const trainingHub: SkillSourceFileView[] = [
  { path: 'SKILL.md', sizeBytes: 496, language: 'markdown', isSkillDefinition: true },
  { path: 'scripts/cleanup.py', sizeBytes: 239, language: 'python' },
  { path: 'templates/welcome.html', sizeBytes: 796, language: 'html' },
  { path: 'references/trainer-notes.md', sizeBytes: 464, language: 'markdown' },
];

describe('buildSourceTree', () => {
  it('groups the bundle into root plus one folder per directory', () => {
    const tree = buildSourceTree(trainingHub);
    expect(tree.map(f => f.name)).toEqual(['', 'references', 'scripts', 'templates']);
    expect(countSourceFiles(tree)).toBe(4);
  });

  it('puts SKILL.md first, matching the designer', () => {
    const tree = buildSourceTree(trainingHub);
    expect(tree[0].files[0].name).toBe('SKILL.md');
    expect(tree[0].files[0].isSkillDefinition).toBe(true);
  });

  it('treats ./a/b and a/b as the same folder', () => {
    // Both spellings occur: retrieval issues report "./scripts/cleanup.py"
    // while the manifest stores "scripts/cleanup.py".
    const tree = buildSourceTree([
      { path: './scripts/cleanup.py', sizeBytes: 1 },
      { path: 'scripts/other.py', sizeBytes: 2 },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('scripts');
    expect(tree[0].files.map(f => f.name)).toEqual(['cleanup.py', 'other.py']);
  });

  it('sorts folders alphabetically with root files first', () => {
    const tree = buildSourceTree([
      { path: 'zeta/z.md', sizeBytes: 1 },
      { path: 'alpha/a.md', sizeBytes: 1 },
      { path: 'README.md', sizeBytes: 1 },
    ]);
    expect(tree.map(f => f.name)).toEqual(['', 'alpha', 'zeta']);
  });

  it('handles an inline skill with no resources', () => {
    const tree = buildSourceTree([
      { path: 'SKILL.md', sizeBytes: 120, isSkillDefinition: true },
    ]);
    expect(countSourceFiles(tree)).toBe(1);
    expect(tree[0].name).toBe('');
  });

  it('returns nothing for an empty list rather than throwing', () => {
    expect(buildSourceTree([])).toEqual([]);
    expect(countSourceFiles([])).toBe(0);
  });

  it('drops a path that has no file name', () => {
    expect(buildSourceTree([{ path: 'scripts/', sizeBytes: 0 }])).toEqual([]);
  });
});

describe('formatFileSize', () => {
  it('uses bytes below 1 KB, matching the designer chip', () => {
    expect(formatFileSize(496)).toBe('496 B');
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('switches to KB at 1024', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2560)).toBe('2.5 KB');
  });

  it('does not render a bogus size', () => {
    expect(formatFileSize(Number.NaN)).toBe('—');
    expect(formatFileSize(-1)).toBe('—');
  });
});
