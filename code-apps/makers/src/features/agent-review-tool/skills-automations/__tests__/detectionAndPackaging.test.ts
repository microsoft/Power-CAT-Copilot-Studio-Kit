/**
 * Detection and packaging rule tests.
 *
 * Detection order is the part worth pinning: an automation installer zip and a
 * skill bundle can both contain JSON and Markdown, so the tie-break decides
 * which set of rules an upload is judged by. Getting it wrong scores an
 * artifact against a rubric that was never meant for it.
 */
import { describe, expect, it } from 'vitest';
import { detectArtifactKind } from '../services/artifactDetector';
import { BUNDLE_LIMITS, evaluatePackaging } from '../services/packagingRules';
import { artifact, binaryFile, file, goodSkillMarkdown, hasRule, skillArtifact } from './fixtures';
import type { TargetRuntime } from '../contracts/ArtifactReview';

const ALL_RUNTIMES: TargetRuntime[] = ['cowork', 'scout', 'copilot-studio'];
const COWORK_COMPANION_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 5 * 1024 * 1024,
} as const;

describe('detectArtifactKind', () => {
  it('identifies a skill from SKILL.md', () => {
    const detection = detectArtifactKind(skillArtifact());
    expect(detection.kind).toBe('skill');
    expect(detection.primaryPath).toBe('SKILL.md');
  });

  it('identifies a Scout automation from a schedule-bearing JSON file', () => {
    const detection = detectArtifactKind(
      artifact([
        file(
          'automation.json',
          JSON.stringify({ name: 'x', steps: [{ label: 'a', prompt: 'b' }], schedule: { kind: 'interval', intervalMinutes: 60 } }),
        ),
      ]),
    );
    expect(detection.kind).toBe('automation');
  });

  it('rejects INSTALL.md plus JSON as unsupported instead of inventing an artifact type', () => {
    const detection = detectArtifactKind(
      artifact([file('INSTALL.md', '# Install\n\nRun the setup.'), file('config.json', '{"setting":1}')]),
    );
    expect(detection.kind).toBeUndefined();
    expect(detection.reason).toContain('SKILL.md');
    expect(detection.reason).not.toContain('installer');
  });

  it('treats a bundle containing both SKILL.md and INSTALL.md as a skill', () => {
    // The tie-break matters: judging a skill by installer rules would report
    // packaging problems it does not have, and miss the ones it does.
    const detection = detectArtifactKind(
      artifact([
        file('SKILL.md', goodSkillMarkdown()),
        file('INSTALL.md', '# Install'),
        file('config.json', '{"a":1}'),
      ]),
    );
    expect(detection.kind).toBe('skill');
  });

  it('reports no kind, with a reason, when nothing matches', () => {
    const detection = detectArtifactKind(artifact([file('notes.txt', 'hello')]));
    expect(detection.kind).toBeUndefined();
    expect(detection.reason).toBeTruthy();
  });
});

describe('evaluatePackaging', () => {
  const run = (
    a: Parameters<typeof evaluatePackaging>[0]['artifact'],
    runtimes: TargetRuntime[] = ALL_RUNTIMES,
  ) => evaluatePackaging({ artifact: a, runtimes });

  it('passes a well-formed bundle without packaging findings', () => {
    const findings = run(skillArtifact());
    expect(findings.filter((f) => f.severity === 'critical' || f.severity === 'high')).toHaveLength(0);
  });

  it('flags a missing SKILL.md as a missing file, not as malformed frontmatter', () => {
    const findings = run(artifact([file('README.md', 'hi')]));
    expect(hasRule(findings, 'PKG-REQ')).toBe(true);
    expect(hasRule(findings, 'PKG-FM')).toBe(false);
  });

  it('flags missing frontmatter', () => {
    expect(hasRule(run(skillArtifact('# No frontmatter here\n\nJust a body.')), 'PKG-FM')).toBe(true);
  });

  it('does not pile on other frontmatter rules once frontmatter is missing entirely', () => {
    // One clear cause beats five findings that all describe the same problem.
    const findings = run(skillArtifact('# No frontmatter\n\nBody.'));
    expect(hasRule(findings, 'PKG-FM')).toBe(true);
    expect(hasRule(findings, 'PKG-NAME')).toBe(false);
    expect(hasRule(findings, 'PKG-SLUG')).toBe(false);
  });

  it('flags a name that is not a lowercase slug', () => {
    expect(hasRule(run(skillArtifact(goodSkillMarkdown({ name: 'Release Notes Writer' }))), 'PKG-SLUG')).toBe(true);
  });

  it.each(['cowork', 'copilot-studio'] as TargetRuntime[])(
    'rejects leading, trailing and consecutive hyphens for %s',
    (runtime) => {
      for (const name of ['-leading', 'trailing-', 'double--hyphen']) {
        const finding = run(
          skillArtifact(goodSkillMarkdown({ name })),
          [runtime],
        ).find((candidate) => candidate.ruleId === 'PKG-SLUG');

        expect(finding?.runtimes).toEqual([runtime]);
      }
    },
  );

  it('does not invent a Scout name constraint that Scout does not publish', () => {
    const findings = run(
      skillArtifact(goodSkillMarkdown({ name: 'Release Notes Writer' })),
      ['scout'],
    );

    expect(hasRule(findings, 'PKG-SLUG')).toBe(false);
  });

  it('compares a nested M365 skill name with the leaf folder only', () => {
    const markdown = goodSkillMarkdown({ name: 'copilot-studio-test-planner' });
    const packaged = artifact(
      [file('skills/copilot-studio-test-planner/SKILL.md', markdown)],
      { rootFolderName: 'skills/copilot-studio-test-planner' },
    );

    expect(hasRule(run(packaged), 'PKG-NAME')).toBe(false);
  });

  it('still flags a real mismatch in a nested M365 skill folder', () => {
    const markdown = goodSkillMarkdown({ name: 'different-name' });
    const packaged = artifact(
      [file('skills/copilot-studio-test-planner/SKILL.md', markdown)],
      { rootFolderName: 'skills/copilot-studio-test-planner' },
    );

    expect(hasRule(run(packaged), 'PKG-NAME')).toBe(true);
  });

  it('applies the 1-1024 description contract only to Cowork', () => {
    const long = 'Use when '.padEnd(BUNDLE_LIMITS.maxDescriptionChars + 50, 'x');
    const findings = run(skillArtifact(goodSkillMarkdown({ description: long })));
    const limit = findings.find((finding) => finding.ruleId === 'LIM-DESC');

    expect(limit?.runtimes).toEqual(['cowork']);
    expect(limit?.evidence).toContain('1-1024');
  });

  it('counts at most 20 Cowork companion files and excludes SKILL.md', () => {
    const allowed = Array.from(
      { length: COWORK_COMPANION_LIMITS.maxFiles },
      (_, i) => file(`refs/doc-${i}.md`, 'x'),
    );
    const tooMany = [...allowed, file('refs/one-too-many.md', 'x')];

    expect(hasRule(run(skillArtifact(goodSkillMarkdown(), allowed)), 'LIM-FILES')).toBe(false);
    const finding = run(skillArtifact(goodSkillMarkdown(), tooMany)).find(
      (candidate) => candidate.ruleId === 'LIM-FILES',
    );
    expect(finding?.runtimes).toEqual(['cowork']);
  });

  it('applies the 5 MB Cowork limit to companion files, not SKILL.md', () => {
    const big = binaryFile('assets/model.bin', COWORK_COMPANION_LIMITS.maxFileBytes + 1);
    const finding = run(skillArtifact(goodSkillMarkdown(), [big])).find(
      (candidate) => candidate.ruleId === 'LIM-FILESIZE',
    );
    expect(finding?.runtimes).toEqual(['cowork']);

    const largeSkill = file(
      'SKILL.md',
      goodSkillMarkdown(),
      { bytes: COWORK_COMPANION_LIMITS.maxFileBytes + 1 },
    );
    expect(hasRule(run(artifact([largeSkill])), 'LIM-FILESIZE')).toBe(false);
  });

  it('applies the 10 MB Cowork total to companions only', () => {
    const companions = [
      binaryFile('assets/a.bin', 4 * 1024 * 1024),
      binaryFile('assets/b.bin', 4 * 1024 * 1024),
      binaryFile('assets/c.bin', 3 * 1024 * 1024),
    ];
    const finding = run(skillArtifact(goodSkillMarkdown(), companions)).find(
      (candidate) => candidate.ruleId === 'LIM-SIZE',
    );

    expect(finding?.runtimes).toEqual(['cowork']);
  });

  it('does not apply Cowork companion limits to Scout or Copilot Studio', () => {
    const companions = Array.from(
      { length: COWORK_COMPANION_LIMITS.maxFiles + 1 },
      (_, i) => binaryFile(`assets/file-${i}.bin`, COWORK_COMPANION_LIMITS.maxFileBytes + 1),
    );
    const findings = run(
      skillArtifact(goodSkillMarkdown(), companions),
      ['scout', 'copilot-studio'],
    );

    expect(findings.some((finding) => finding.ruleId.startsWith('LIM-'))).toBe(false);
  });

  it('does not emit the undocumented folder-depth rule', () => {
    const deep = file('a/b/c/d/e/f/deep.md', 'x');
    expect(hasRule(run(skillArtifact(goodSkillMarkdown(), [deep])), 'LIM-DEPTH')).toBe(false);
  });

  it('does not reject frontmatter keys without an authoritative exhaustive allowlist', () => {
    const markdown = goodSkillMarkdown().replace('allowed-tools:', 'compatibility: Requires git\nallowed-tools:');
    expect(hasRule(run(skillArtifact(markdown)), 'PKG-META')).toBe(false);
  });

  it('groups many files from one noise category into a single finding', () => {
    const noise = [
      file('node_modules/a/index.js', 'x'),
      file('node_modules/b/index.js', 'x'),
      file('node_modules/c/index.js', 'x'),
      file('node_modules/d/index.js', 'x'),
    ];
    const noiseFindings = run(skillArtifact(goodSkillMarkdown(), noise)).filter(
      (f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-NOISE',
    );
    // One row per node_modules file would drown every other finding on the report.
    expect(noiseFindings).toHaveLength(1);
    expect(noiseFindings[0].severity).toBe('low');
  });

  it('keeps an environment file above ordinary bundle clutter without making it blocking', () => {
    const finding = run(skillArtifact(goodSkillMarkdown(), [file('.env', 'EXAMPLE=true')])).find(
      (candidate) => candidate.ruleId === 'PKG-NOISE',
    );

    expect(finding?.severity).toBe('medium');
  });

  it('keeps distinct noise categories as distinct findings', () => {
    const noise = [file('.DS_Store', 'x'), file('node_modules/pkg/index.js', 'x'), file('.git/config', 'x')];
    const noiseFindings = run(skillArtifact(goodSkillMarkdown(), noise)).filter(
      (f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-NOISE',
    );
    expect(noiseFindings).toHaveLength(3);
  });

  it('does not claim a resource is unused from incomplete static reachability', () => {
    const orphan = file('references/unused.md', 'Nothing links to this.');
    expect(hasRule(run(skillArtifact(goodSkillMarkdown(), [orphan])), 'PKG-ORPHAN')).toBe(false);
  });

  it('does not treat README or LICENSE as orphans', () => {
    // Both are conventionally present and never linked from SKILL.md.
    const findings = run(
      skillArtifact(goodSkillMarkdown(), [file('README.md', 'About'), file('LICENSE', 'MIT')]),
    );
    const orphans = findings.filter((f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-ORPHAN');
    expect(orphans.some((f) => (f.resourcePath ?? '').includes('README'))).toBe(false);
    expect(orphans.some((f) => (f.resourcePath ?? '').includes('LICENSE'))).toBe(false);
  });

  it('flags a link to a file that is not in the bundle', () => {
    const md = goodSkillMarkdown({ body: '## Steps\n\nSee [the guide](references/missing.md).' });
    expect(hasRule(run(skillArtifact(md)), 'PKG-LINK')).toBe(true);
  });

  it('does not read a command line in backticks as a file reference', () => {
    // A skill writes its own commands in backticks. Capturing the whole command
    // reports a high-severity missing file on a line that is entirely correct,
    // and drags packaging to nought on a sound bundle.
    const md = goodSkillMarkdown({
      body: '## Steps\n\n1. `python scripts/run.py --out report.json`\n2. `--snapshot snapshot.json`',
    });
    const findings = run(skillArtifact(md, [file('scripts/run.py', 'print(1)')]));
    const links = findings.filter((f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-LINK');
    expect(links).toEqual([]);
    // The script the command runs is used, so it must not also be an orphan.
    // Suppressing the link finding by refusing to read command lines at all
    // simply moved the false positive to the other rule.
    const orphans = findings.filter((f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-ORPHAN');
    expect(orphans).toEqual([]);
  });

  it('still resolves a bare path in backticks to the bundled file', () => {
    // The tightened pattern must not stop the orphan rule seeing a real
    // reference, or every referenced script becomes an orphan instead.
    const md = goodSkillMarkdown({ body: '## Steps\n\nRun `scripts/run.py` first.' });
    const findings = run(skillArtifact(md, [file('scripts/run.py', 'print(1)')]));
    const ruleIds = findings.map((f) => f.ruleId ?? f.id.split(':')[0]);
    expect(ruleIds).not.toContain('PKG-LINK');
    expect(ruleIds).not.toContain('PKG-ORPHAN');
  });

  it('resolves a bare file name to a file that sits deeper in the tree', () => {
    // Authors write `index.md` about a file at references/history/index.md. An
    // exact-match test called that a broken link, so a correct bundle collected
    // one high-severity finding per abbreviated reference.
    const md = goodSkillMarkdown({ body: '## Steps\n\nStart from `index.md`.' });
    const findings = run(
      skillArtifact(md, [file('references/history/index.md', '# Index')]),
    );
    const ruleIds = findings.map((f) => f.ruleId ?? f.id.split(':')[0]);
    expect(ruleIds).not.toContain('PKG-LINK');
    expect(ruleIds).not.toContain('PKG-ORPHAN');
  });

  it('does not report a file the skill writes at run time as missing', () => {
    // `observations.json` is an output the skill documents, not a resource it
    // ships. A bare name carries no evidence either way, so claiming it is
    // missing invents a defect in a sound bundle.
    const md = goodSkillMarkdown({
      body: '## Steps\n\nWrite your notes to `observations.json` before continuing.',
    });
    const links = run(skillArtifact(md)).filter(
      (f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-LINK',
    );
    expect(links).toEqual([]);
  });

  it('reports a missing path when prose explicitly tells the reader to see it', () => {
    const md = goodSkillMarkdown({
      body: '## Steps\n\nSee `references/history/README.md` for the archive.',
    });
    expect(hasRule(run(skillArtifact(md)), 'PKG-LINK')).toBe(true);
  });

  it('does not treat an archive-internal path as a promised bundle file', () => {
    const md = goodSkillMarkdown({
      body: '## Steps\n\nWrite the tracked-change XML to `word/document.xml` inside the DOCX archive.',
    });
    expect(hasRule(run(skillArtifact(md)), 'PKG-LINK')).toBe(false);
  });

  it('never reports the same file as both missing and unreferenced', () => {
    // The two rules answer the same question about a path and once resolved it
    // differently — one exactly, one by suffix — so a bundled file could be
    // called missing by one rule and unused by the other in a single review.
    const md = goodSkillMarkdown({
      body: '## Steps\n\nRun `python scripts/run.py --catalog references/catalog.yaml`, then read `index.md`.',
    });
    const findings = run(
      skillArtifact(md, [
        file('scripts/run.py', 'print(1)'),
        file('references/catalog.yaml', 'a: 1'),
        file('references/history/index.md', '# Index'),
      ]),
    );
    const rules = findings.map((f) => f.ruleId ?? f.id.split(':')[0]);
    expect(rules).not.toContain('PKG-LINK');
    expect(rules).not.toContain('PKG-ORPHAN');
  });

  it('treats a referenced sub-folder as covering the files inside it', () => {
    // An archive of timestamped captures cannot be listed file by file, and the
    // list would go stale on the next capture. Pointing at the folder is the
    // reference, so its contents are not dead weight.
    const md = goodSkillMarkdown({
      body: '## Steps\n\nFor a shipped example, target `references/snapshot-history/`.',
    });
    const findings = run(
      skillArtifact(md, [
        file('references/snapshot-history/2026-07-14-capture.json', '{}'),
        file('references/snapshot-history/2026-07-14-capture.md', '# Capture'),
      ]),
    );
    const rules = findings.map((f) => f.ruleId ?? f.id.split(':')[0]);
    expect(rules).not.toContain('PKG-ORPHAN');
  });

  it('resolves a wildcard reference to matching bundled files', () => {
    const findings = run(
      skillArtifact(
        goodSkillMarkdown({
          body: 'Read `knowledge/*.docx` before assessing the use case.',
        }),
        [
          binaryFile('knowledge/rubric.docx', 100),
          binaryFile('knowledge/categories.docx', 100),
        ],
      ),
    );

    expect(hasRule(findings, 'PKG-LINK')).toBe(false);
    expect(findings.filter((finding) => finding.ruleId === 'PKG-ORPHAN')).toHaveLength(0);
  });

  it('recognizes an explicitly referenced HTML template as used', () => {
    const findings = run(
      skillArtifact(
        goodSkillMarkdown({
          body: 'Copy `assets/UseCase_Assessment_Report_TEMPLATE.html` byte-for-byte.',
        }),
        [file('assets/UseCase_Assessment_Report_TEMPLATE.html', '<html></html>')],
      ),
    );

    expect(hasRule(findings, 'PKG-ORPHAN')).toBe(false);
  });

  it('treats files imported by a referenced script as used bundle dependencies', () => {
    const md = goodSkillMarkdown({
      body: '## Steps\n\nRun `python scripts/convert.py INPUT --to FORMAT`.',
    });
    const findings = run(
      skillArtifact(md, [
        file('scripts/convert.py', 'import blocks\nimport render\n'),
        file('scripts/blocks.py', 'class Block: pass\n'),
        file('scripts/render.py', 'def to_text(blocks): return ""\n'),
      ]),
    );
    const orphanPaths = findings
      .filter((finding) => (finding.ruleId ?? finding.id).includes('PKG-ORPHAN'))
      .map((finding) => finding.resourcePath);

    expect(orphanPaths).toEqual([]);
  });

  it('does not infer non-use from a top-level folder mention', () => {
    const md = goodSkillMarkdown({
      body: '## Bundled files\n\n- `references/` — the curated docs.',
    });
    const findings = run(
      skillArtifact(md, [file('references/probe-catalog.md', '# Probes')]),
    );
    expect(hasRule(findings, 'PKG-ORPHAN')).toBe(false);
  });
});
