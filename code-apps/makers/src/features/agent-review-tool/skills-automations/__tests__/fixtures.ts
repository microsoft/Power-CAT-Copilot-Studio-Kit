/**
 * Shared fixture helpers for the skills-and-automations review tests.
 *
 * Building an `UploadedArtifact` by hand in every test buries the one line that
 * actually differs between cases, so the builders here take only what the test
 * is about and fill the rest with defaults.
 */
import type { UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';

export function file(path: string, text: string, overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    path,
    bytes: overrides.bytes ?? new TextEncoder().encode(text).length,
    text,
    isBinary: false,
    ...overrides,
  };
}

export function binaryFile(path: string, bytes: number): UploadedFile {
  return { path, bytes, isBinary: true };
}

export function artifact(files: UploadedFile[], overrides: Partial<UploadedArtifact> = {}): UploadedArtifact {
  const uncompressed = files.reduce((total, f) => total + f.bytes, 0);
  return {
    fileName: 'test-bundle.zip',
    files,
    compressedBytes: Math.round(uncompressed / 2),
    uncompressedBytes: uncompressed,
    hash: 'test-hash-0000',
    ...overrides,
  };
}

/** A SKILL.md that passes every deterministic rule, as a baseline to mutate. */
export function goodSkillMarkdown(overrides: { name?: string; description?: string; body?: string } = {}): string {
  const name = overrides.name ?? 'release-notes-writer';
  const description =
    overrides.description ??
    'Use when the user asks to draft release notes from merged pull requests. Reads the merge log for a tag range, groups changes by area and produces a reviewer-ready summary in Markdown.';
  const body =
    overrides.body ??
    [
      '## Purpose',
      '',
      'Turn a range of merged pull requests into release notes.',
      '',
      '## Steps',
      '',
      '1. Read the merge log between the two tags.',
      '2. Group the changes by area.',
      '3. Write one line per change in plain language.',
      '',
      '## Output',
      '',
      'A Markdown document with one section per area.',
    ].join('\n');

  return ['---', `name: ${name}`, `description: ${description}`, 'allowed-tools:', '  - bash', '---', '', body].join(
    '\n',
  );
}

export function skillArtifact(markdown = goodSkillMarkdown(), extra: UploadedFile[] = []): UploadedArtifact {
  return artifact([file('SKILL.md', markdown), ...extra]);
}

export function automationArtifact(automation: unknown, path = 'automation.json'): UploadedArtifact {
  return artifact([file(path, JSON.stringify(automation, null, 2))]);
}

/** A schedule that is valid on its own, so schedule tests change one field only. */
export function validAutomation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'daily-standup-digest',
    description: 'Collects yesterday’s merged pull requests and posts a digest.',
    steps: [
      { label: 'Collect merges', prompt: 'List the pull requests merged in the last 24 hours.' },
      { label: 'Write digest', prompt: 'Summarise the merges into a short digest, grouped by area.' },
    ],
    schedule: { kind: 'interval', intervalMinutes: 60 },
    ...overrides,
  };
}

export function findingIds(findings: readonly { ruleId?: string; id: string }[]): string[] {
  return findings.map((f) => f.ruleId ?? f.id.split(':')[0]);
}

export function hasRule(findings: readonly { ruleId?: string; id: string }[], ruleId: string): boolean {
  return findingIds(findings).includes(ruleId);
}
