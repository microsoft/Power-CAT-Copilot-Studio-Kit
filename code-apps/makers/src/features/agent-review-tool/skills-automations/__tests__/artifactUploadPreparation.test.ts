import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { prepareArtifactUpload } from '../services/artifactUploadPreparation';

async function zipFile(name: string, build: (zip: JSZip) => void): Promise<File> {
  const zip = new JSZip();
  build(zip);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], name, { type: 'application/zip' });
}

describe('prepareArtifactUpload', () => {
  it('returns an inline validation error for an INSTALL.md plus JSON archive', async () => {
    const file = await zipFile('unsupported.zip', (zip) => {
      zip.file('INSTALL.md', '# Install');
      zip.file('automation.json', JSON.stringify({ name: 'x', steps: [] }));
    });

    const prepared = await prepareArtifactUpload(file);

    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.error).toContain('unsupported package format');
      expect(prepared.error).toContain('SKILL.md');
    }
  });

  it('returns the parsed artifact for a supported skill archive', async () => {
    const file = await zipFile('skill.zip', (zip) => {
      zip.file('SKILL.md', '---\nname: skill\n---\n# Skill');
    });

    const prepared = await prepareArtifactUpload(file);

    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(prepared.artifact.files[0].path).toBe('SKILL.md');
  });

  it('returns a readable form error when an archive cannot be opened', async () => {
    const prepared = await prepareArtifactUpload(
      new File(['not a zip'], 'broken.zip', { type: 'application/zip' }),
    );

    expect(prepared.ok).toBe(false);
    if (!prepared.ok) expect(prepared.error.length).toBeGreaterThan(0);
  });
});
