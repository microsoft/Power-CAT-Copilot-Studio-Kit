/**
 * Group a skill bundle's flat file list into a folder tree for the Source view.
 *
 * The Copilot Studio designer shows a bundle as `SKILL.md` followed by its
 * folders (`references/`, `scripts/`, `templates/`), and the review should read
 * the same way so a maker can match one to the other without translating.
 *
 * Paths arrive normalized but inconsistently prefixed (`./scripts/cleanup.py`
 * and `scripts/cleanup.py` both occur), so they are cleaned before grouping.
 */
import type { SkillSourceFileView } from './viewTypes.js';

export interface SourceTreeFile {
  /** Name shown in the tree, e.g. `cleanup.py`. */
  name: string;
  /** Full path, kept for the tooltip and for a stable React key. */
  path: string;
  sizeBytes: number;
  language?: string;
  isSkillDefinition?: boolean;
}

export interface SourceTreeFolder {
  /** Folder name, or '' for files that sit at the bundle root. */
  name: string;
  files: SourceTreeFile[];
}

/** Strip `./` and any leading slash so `./a/b.md` and `a/b.md` group together. */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '');
}

/** Human-readable size using the units the designer uses. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Build the folder tree.
 *
 * Root files come first with `SKILL.md` at the very top (it is the skill
 * definition, and the designer lists it first), then folders alphabetically.
 *
 * @param files - Flat file list from the persisted review.
 * @returns Folders in display order; root files live under the '' folder.
 */
export function buildSourceTree(files: SkillSourceFileView[]): SourceTreeFolder[] {
  const byFolder = new Map<string, SourceTreeFile[]>();

  for (const file of files) {
    const clean = normalizePath(file.path);
    const cut = clean.lastIndexOf('/');
    const folder = cut === -1 ? '' : clean.slice(0, cut);
    const name = cut === -1 ? clean : clean.slice(cut + 1);
    if (!name) continue;

    const entry: SourceTreeFile = {
      name,
      path: clean,
      sizeBytes: file.sizeBytes,
      language: file.language,
      isSkillDefinition: file.isSkillDefinition,
    };
    const bucket = byFolder.get(folder);
    if (bucket) bucket.push(entry);
    else byFolder.set(folder, [entry]);
  }

  for (const bucket of byFolder.values()) {
    bucket.sort((left, right) => {
      if (left.isSkillDefinition !== right.isSkillDefinition) {
        return left.isSkillDefinition ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  const folders = [...byFolder.keys()].sort((left, right) => {
    if (left === '') return -1;
    if (right === '') return 1;
    return left.localeCompare(right);
  });

  return folders.map(name => ({ name, files: byFolder.get(name)! }));
}

/** Total file count, for the "N files" heading. */
export function countSourceFiles(folders: SourceTreeFolder[]): number {
  return folders.reduce((total, folder) => total + folder.files.length, 0);
}
