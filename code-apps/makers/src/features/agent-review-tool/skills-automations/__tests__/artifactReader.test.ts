/**
 * Tests for artifactReader.
 *
 * The reader decides two things that every later stage depends on: which files
 * are treated as text, and what path each file is reported under. Getting
 * either wrong makes findings point at the wrong place, so both are pinned
 * here.
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { hashUploadedFile, readUploadedArtifact } from '../services/artifactReader';

/** Build a File from a JSZip instance, as the browser would hand us. */
async function zipFile(name: string, build: (zip: JSZip) => void): Promise<File> {
  const zip = new JSZip();
  build(zip);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], name, { type: 'application/zip' });
}

function textFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('readUploadedArtifact — single files', () => {
  it('reads a bare SKILL.md as decoded text', async () => {
    const artifact = await readUploadedArtifact(textFile('SKILL.md', '---\nname: x\n---\nBody'));

    expect(artifact.files).toHaveLength(1);
    expect(artifact.files[0].path).toBe('SKILL.md');
    expect(artifact.files[0].isBinary).toBe(false);
    expect(artifact.files[0].text).toContain('name: x');
  });

  it('reads a bare automation .json as text', async () => {
    const artifact = await readUploadedArtifact(textFile('automation.json', '{"name":"x"}'));

    expect(artifact.files[0].isBinary).toBe(false);
    expect(artifact.files[0].text).toBe('{"name":"x"}');
  });

  it('reports the same value for compressed and uncompressed size', async () => {
    const artifact = await readUploadedArtifact(textFile('SKILL.md', 'abcdef'));

    // A loose file was never compressed, so claiming a compression ratio
    // would invent a number.
    expect(artifact.compressedBytes).toBe(artifact.uncompressedBytes);
  });

  it('does not claim a root folder for a loose file', async () => {
    const artifact = await readUploadedArtifact(textFile('SKILL.md', 'x'));

    expect(artifact.rootFolderName).toBeUndefined();
  });
});

describe('readUploadedArtifact — zip bundles', () => {
  it('reads every entry with its path', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('SKILL.md', '---\nname: demo\n---\nBody');
      zip.file('scripts/run.sh', 'echo hi');
    });

    const artifact = await readUploadedArtifact(file);
    const paths = artifact.files.map((f) => f.path).sort();

    expect(paths).toEqual(['SKILL.md', 'scripts/run.sh']);
  });

  it('skips directory entries', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.folder('scripts')?.file('run.sh', 'echo hi');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.files.every((f) => !f.path.endsWith('/'))).toBe(true);
    expect(artifact.files).toHaveLength(1);
  });

  it('discards __MACOSX entries', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('SKILL.md', 'x');
      zip.file('__MACOSX/._SKILL.md', 'junk');
    });

    const artifact = await readUploadedArtifact(file);

    // These are added by macOS Archive Utility, not by the author. Counting
    // them would report noise findings about files the author never wrote.
    expect(artifact.files.map((f) => f.path)).toEqual(['SKILL.md']);
  });

  it('detects a single wrapping folder as the bundle root', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('my-skill/SKILL.md', 'x');
      zip.file('my-skill/scripts/run.sh', 'y');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.rootFolderName).toBe('my-skill');
  });

  it('reports no root folder when entries sit at the top level', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('SKILL.md', 'x');
      zip.file('scripts/run.sh', 'y');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.rootFolderName).toBeUndefined();
  });

  it('reports no root folder when entries sit under different folders', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('one/SKILL.md', 'x');
      zip.file('two/run.sh', 'y');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.rootFolderName).toBeUndefined();
    // A sibling folder is deliberate grouping by the author, so the bundle is
    // left whole rather than narrowed to the folder holding SKILL.md.
    expect(artifact.files.map((f) => f.path)).toEqual(['one/SKILL.md', 'two/run.sh']);
  });

  it('names a lone markdown upload SKILL.md whatever the file is called', async () => {
    // Browsers rename repeat downloads, so "SKILL (1).md" is the usual way a
    // single skill reaches the tool. Matching the literal name rejected it.
    const file = new File([new TextEncoder().encode('---\nname: x\n---\nbody')], 'SKILL (1).md');

    const artifact = await readUploadedArtifact(file);

    expect(artifact.files.map((f) => f.path)).toEqual(['SKILL.md']);
    expect(artifact.fileName).toBe('SKILL (1).md');
  });

  it('narrows an M365 agent-skill package to its declared skill folder', async () => {
    const file = await zipFile('package.zip', (zip) => {
      zip.file('manifest.json', '{}');
      zip.file('color.png', 'x');
      zip.file('outline.png', 'y');
      zip.file('skills/test-planner/SKILL.md', 'z');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.rootFolderName).toBe('skills/test-planner');
    // Teams packaging is not a skill resource. Keeping it would raise a
    // PKG-ORPHAN for the manifest and both icons.
    expect(artifact.files.map((f) => f.path)).toEqual(['skills/test-planner/SKILL.md']);
  });

  it('leaves a multi-skill bundle whole', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('manifest.json', '{}');
      zip.file('skills/a/SKILL.md', 'x');
      zip.file('skills/b/SKILL.md', 'y');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.rootFolderName).toBeUndefined();
    expect(artifact.files).toHaveLength(3);
  });

  it('marks unknown extensions as binary and does not decode them', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('SKILL.md', 'x');
      zip.file('assets/logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    });

    const artifact = await readUploadedArtifact(file);
    const png = artifact.files.find((f) => f.path.endsWith('.png'));

    expect(png?.isBinary).toBe(true);
    expect(png?.text).toBeUndefined();
  });

  it('treats a text-extension file containing NUL bytes as binary', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      // A .json extension is no guarantee of text — a mislabelled binary would
      // otherwise be scanned as if it were source.
      zip.file('data.json', new Uint8Array([0x7b, 0x00, 0x7d]));
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.files[0].isBinary).toBe(true);
    expect(artifact.files[0].text).toBeUndefined();
  });

  it('sums uncompressed bytes across entries', async () => {
    const file = await zipFile('bundle.zip', (zip) => {
      zip.file('a.md', 'aaaaa');
      zip.file('b.md', 'bbb');
    });

    const artifact = await readUploadedArtifact(file);

    expect(artifact.uncompressedBytes).toBe(8);
  });

  it('refuses an archive that expands past the uncompressed ceiling', async () => {
    // The upload dialog caps the compressed size only. A highly compressible
    // payload passes that cap and still expands far enough to take the tab down.
    const file = await zipFile('bomb.zip', (zip) => {
      // 'a' repeated compresses to almost nothing, so 2 × 64 MB stays a tiny zip.
      for (let i = 0; i < 2; i += 1) zip.file(`pad-${i}.md`, 'a'.repeat(64 * 1024 * 1024));
    });

    await expect(readUploadedArtifact(file)).rejects.toThrow(/expands beyond/i);
  }, 60_000);

  it('refuses an archive holding more entries than a skill bundle needs', async () => {
    const file = await zipFile('many.zip', (zip) => {
      for (let i = 0; i < 5001; i += 1) zip.file(`f-${i}.md`, 'x');
    });

    await expect(readUploadedArtifact(file)).rejects.toThrow(/more than the 5000/i);
  }, 60_000);
});

describe('readUploadedArtifact — hashing', () => {
  it('gives identical bytes the same hash', async () => {
    const first = await readUploadedArtifact(textFile('SKILL.md', 'same'));
    const second = await readUploadedArtifact(textFile('SKILL.md', 'same'));

    expect(first.hash).toBe(second.hash);
  });

  it('gives different bytes a different hash', async () => {
    const first = await readUploadedArtifact(textFile('SKILL.md', 'one'));
    const second = await readUploadedArtifact(textFile('SKILL.md', 'two'));

    expect(first.hash).not.toBe(second.hash);
  });

  it('produces a 64-character hex digest', async () => {
    const artifact = await readUploadedArtifact(textFile('SKILL.md', 'x'));

    expect(artifact.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashUploadedFile', () => {
  it('matches the hash the full read produces, or the already-reviewed guard never fires', async () => {
    const file = textFile('skill.md', '---\nname: demo\n---\nBody.');

    const [quick, full] = await Promise.all([hashUploadedFile(file), readUploadedArtifact(file)]);

    expect(quick).toBe(full.hash);
  });

  it('gives the same hash for identical bytes uploaded under different names', async () => {
    const a = textFile('a.md', 'same bytes');
    const b = textFile('b.md', 'same bytes');

    expect(await hashUploadedFile(a)).toBe(await hashUploadedFile(b));
  });

  it('gives a different hash once a single character changes', async () => {
    const before = await hashUploadedFile(textFile('a.md', 'same bytes'));
    const after = await hashUploadedFile(textFile('a.md', 'same byteS'));

    expect(before).not.toBe(after);
  });
});