/**
 * Packaging, bundle hygiene and size-limit rules (spec 018, groups A and B).
 *
 * These answer "will this install at all?" — the questions worth answering
 * before any judgement about writing quality, because a bundle that cannot load
 * gains nothing from a well-argued critique of its prose.
 */
import type {
  ArtifactFinding,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { resolveCatalogue } from '../data/catalogueResolver';
import { buildFinding } from './findingFactory';
import {
  extensionOf,
  filesWhere,
  findFile,
  lineOf,
  parseFrontmatter,
  readString,
  stripRoot,
} from './artifactUtils';

/** Copilot Cowork limits for files alongside SKILL.md. */
export const BUNDLE_LIMITS = {
  maxCompanionBytes: 10 * 1024 * 1024,
  maxCompanionFiles: 20,
  maxCompanionFileBytes: 5 * 1024 * 1024,
  maxDescriptionChars: 1024,
} as const;

/** Paths that are development artefacts rather than part of the skill. */
const NOISE_PATTERNS: Array<{ test: RegExp; label: string }> = [
  { test: /(^|\/)node_modules\//i, label: 'dependency directory' },
  { test: /(^|\/)\.git\//i, label: 'version-control directory' },
  { test: /(^|\/)\.vscode\//i, label: 'editor settings' },
  { test: /(^|\/)\.idea\//i, label: 'editor settings' },
  { test: /(^|\/)__pycache__\//i, label: 'compiled Python cache' },
  { test: /(^|\/)\.DS_Store$/i, label: 'macOS metadata' },
  { test: /(^|\/)Thumbs\.db$/i, label: 'Windows metadata' },
  { test: /(^|\/)\.env(\.|$)/i, label: 'environment file' },
  { test: /(^|\/)dist\//i, label: 'build output' },
  { test: /(^|\/)build\//i, label: 'build output' },
  { test: /\.log$/i, label: 'log file' },
];

const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const PROSE_PATH_PROMISE_RE =
  /\b(?:see|read|open|consult|refer\s+to)\s+`([^`\s]+)`/gi;

/**
 * What SKILL.md refers to, split by how much the reference actually promises.
 *
 * The two rules that consume this ask different questions, and conflating them
 * is what produced false positives in both directions:
 *
 * - `promised` answers "the author said this file exists — does it?" Only
 *   unambiguous references qualify, so PKG-LINK never accuses a sound bundle.
 * - `mentioned` answers "is this bundled file used at all?" Every path-shaped
 *   token qualifies, however weakly, so PKG-ORPHAN never calls a script that a
 *   documented command runs "never referenced".
 */
interface ReferenceScan {
  promised: Set<string>;
}

/** Trim a raw token to a comparable bundle-relative path, or null if it is not one. */
function normaliseReference(raw: string): string | null {
  const token = raw.trim().replace(/[.,;:!]+$/, '');
  if (!token) return null;
  if (/^[a-z]+:\/\//i.test(token) || token.startsWith('#') || token.startsWith('mailto:')) {
    return null;
  }
  // A command-line switch such as `--out=report.json` is a flag, not a path.
  if (token.startsWith('-')) return null;
  const cleaned = token.replace(/^\.\//, '').split('#')[0].split('?')[0];
  if (!cleaned) return null;
  // Path-shaped means a directory separator or a file extension. Bare prose
  // words are neither, and a token such as `scripts/` is a folder, not a file.
  const hasExtension = /\.[a-z0-9]{1,5}$/i.test(cleaned);
  const hasSeparator = cleaned.includes('/') && !cleaned.endsWith('/');
  return hasExtension || hasSeparator ? cleaned : null;
}

/**
 * Collect what SKILL.md refers to.
 *
 * Three kinds of reference are treated differently, because they carry
 * different amounts of evidence:
 *
 * 1. A markdown link is explicit syntax for "this file exists". Always promised.
 * 2. A lone path in backticks — `` `references/policy.md` `` — promises a file
 *    only when it names a directory. A bare `` `observations.json` `` is just as
 *    likely a file the skill writes at run time as one it ships, and a skill
 *    that documents its own output should not be told the output is missing.
 * 3. A token inside a command line — `` `python scripts/run.py --out out.json` ``
 *    — cannot be classified at all: `scripts/run.py` is an input and `out.json`
 *    is an output, and nothing in the text distinguishes them. These prove use,
 *    never absence.
 */
function collectReferences(markdown: string): ReferenceScan {
  const promised = new Set<string>();

  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const raw = match[1] ?? '';
    const path = normaliseReference(raw);
    if (!path) continue;
    promised.add(path);
  }

  for (const match of markdown.matchAll(PROSE_PATH_PROMISE_RE)) {
    const path = normaliseReference(match[1] ?? '');
    if (path?.includes('/')) promised.add(path);
  }

  return { promised };
}

/**
 * Does a reference name a file that is in the bundle?
 *
 * Authors write partial paths. SKILL.md says `` `index.md` `` about a file that
 * sits at `references/snapshot-history/index.md`, and an exact-match test calls
 * that a broken link. Both rules resolve through here so they cannot disagree
 * about the same reference — previously one rule matched leniently and the
 * other exactly, so a file could be "missing" and "unreferenced" at once.
 */
function resolvesToBundleFile(target: string, bundlePaths: ReadonlySet<string>): boolean {
  const wanted = target.toLowerCase();
  if (wanted.includes('*') || wanted.includes('?')) {
    const pattern = wanted
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    const matcher = new RegExp(`(?:^|/)${pattern}$`, 'i');
    return [...bundlePaths].some((path) => matcher.test(path));
  }
  for (const path of bundlePaths) {
    const candidate = path.toLowerCase();
    if (candidate === wanted) return true;
    if (candidate.endsWith(`/${wanted}`)) return true;
    if (wanted.endsWith(`/${candidate}`)) return true;
  }
  return false;
}

export interface PackagingContext {
  artifact: UploadedArtifact;
  runtimes: TargetRuntime[];
}

/**
 * The selected runtimes whose published contract requires `requirement`.
 *
 * Scoping a packaging finding to a runtime is a compatibility claim, so it is
 * only made where the runtime actually publishes the requirement. Copilot
 * Studio documents `SKILL.md` with `name` and `description`; Cowork and Scout
 * publish a tool list instead, and no comparable package contract, so nothing
 * is claimed on their behalf.
 *
 * An empty result is deliberate and safe: an unscoped finding still reaches the
 * reader through the findings list, the rubric and the recommendation. It just
 * does not turn into "will not run" on a runtime that never published the rule.
 *
 * @param runtimes - The runtimes the reviewer selected.
 * @param requirement - The entry file name, or a required frontmatter key.
 */
function contractRuntimes(runtimes: TargetRuntime[], requirement: string): TargetRuntime[] {
  return runtimes.filter((runtime) => {
    const contract = resolveCatalogue(runtime).skillContract;
    if (!contract) return false;
    return (
      contract.entryFile.toLowerCase() === requirement.toLowerCase() ||
      contract.requiredFrontmatter.includes(requirement)
    );
  });
}

/**
 * Run every packaging, hygiene and limit rule.
 *
 * Returns findings only. Scoring happens elsewhere, so this stays pure and can
 * be unit-tested without constructing a whole review.
 */
export function evaluatePackaging({ artifact, runtimes }: PackagingContext): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
  const skillFile = findFile(artifact, 'SKILL.md');
  const skillPath = skillFile ? stripRoot(skillFile.path, artifact.rootFolderName) : 'SKILL.md';
  const markdown = skillFile?.text ?? '';

  // A missing file and a malformed one are different problems. Falling through
  // to the frontmatter rules would report "SKILL.md does not begin with
  // frontmatter" about a file that is not in the bundle at all.
  if (!skillFile) {
    findings.push(
      buildFinding({
        ruleId: 'PKG-REQ',
        resourcePath: 'SKILL.md',
        evidence: 'The bundle contains no SKILL.md, so there is no skill definition to load.',
        instanceKey: 'skill-md',
        runtimes: contractRuntimes(runtimes, 'SKILL.md'),
      }),
    );
    return [...findings, ...evaluateLimits(artifact, runtimes)];
  }

  // ── Frontmatter ────────────────────────────────────────────────────────
  const frontmatter = parseFrontmatter(markdown);

  if (!frontmatter.present || frontmatter.parseError) {
    findings.push(
      buildFinding({
        ruleId: 'PKG-FM',
        resourcePath: skillPath,
        evidence: frontmatter.parseError
          ? `The frontmatter block could not be parsed: ${frontmatter.parseError}`
          : 'SKILL.md does not begin with a --- delimited YAML frontmatter block.',
        // Unparsable frontmatter means no required key can be read, so it fails
        // the contract as surely as a missing key does.
        runtimes: contractRuntimes(runtimes, 'SKILL.md'),
      }),
    );
    // Every remaining frontmatter rule reads values this block should have
    // provided. Reporting each of them as "missing" would bury the one finding
    // that actually explains the problem.
    return [
      ...findings,
      ...evaluateHygiene(artifact, markdown, skillPath),
      ...evaluateLimits(artifact, runtimes),
    ];
  }

  const name = readString(frontmatter.data, 'name');
  const description = readString(frontmatter.data, 'description');

  if (!name) {
    findings.push(
      buildFinding({
        ruleId: 'PKG-REQ',
        resourcePath: skillPath,
        evidence: 'The frontmatter has no name field.',
        instanceKey: 'name',
        runtimes: contractRuntimes(runtimes, 'name'),
      }),
    );
  }
  if (!description) {
    findings.push(
      buildFinding({
        ruleId: 'PKG-REQ',
        resourcePath: skillPath,
        evidence: 'The frontmatter has no description field.',
        instanceKey: 'description',
        runtimes: contractRuntimes(runtimes, 'description'),
      }),
    );
  }

  // Name pattern is per-runtime, because the runtimes do not agree on it.
  if (name) {
    for (const runtime of runtimes) {
      const catalogue = resolveCatalogue(runtime);
      if (catalogue.namePattern && !catalogue.namePattern.test(name)) {
        findings.push(
          buildFinding({
            ruleId: 'PKG-SLUG',
            resourcePath: skillPath,
            evidence: `name: "${name}" — ${catalogue.runtime} accepts ${catalogue.namePatternLabel}.`,
            runtimes: [runtime],
            instanceKey: runtime,
            line: lineOf(markdown, name),
          }),
        );
      }
    }

    const rootPathParts = artifact.rootFolderName?.split(/[\\/]/).filter(Boolean);
    const containingFolderName = rootPathParts?.[rootPathParts.length - 1];
    if (containingFolderName && containingFolderName !== name) {
      findings.push(
        buildFinding({
          ruleId: 'PKG-NAME',
          resourcePath: skillPath,
          evidence: `Frontmatter name is "${name}" but the containing folder is "${containingFolderName}".`,
        }),
      );
    }
  }

  if (
    description &&
    runtimes.includes('cowork') &&
    description.length > BUNDLE_LIMITS.maxDescriptionChars
  ) {
    findings.push(
      buildFinding({
        ruleId: 'LIM-DESC',
        resourcePath: skillPath,
        evidence:
          `The description is ${description.length} characters. Copilot Cowork requires ` +
          `1-1024 characters.`,
        runtimes: ['cowork'],
      }),
    );
  }

  return [
    ...findings,
    ...evaluateHygiene(artifact, markdown, skillPath),
    ...evaluateLimits(artifact, runtimes),
  ];
}

/** Noise, orphaned files and broken in-bundle references. */
function evaluateHygiene(
  artifact: UploadedArtifact,
  markdown: string,
  skillPath: string,
): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];

  const noisy = filesWhere(artifact, (relative) =>
    NOISE_PATTERNS.some((p) => p.test.test(relative)),
  );
  // Grouped into one finding per category. One row per node_modules file would
  // produce thousands of identical rows and drown every other finding.
  const byLabel = new Map<string, string[]>();
  for (const file of noisy) {
    const relative = stripRoot(file.path, artifact.rootFolderName);
    const label = NOISE_PATTERNS.find((p) => p.test.test(relative))?.label ?? 'development artefact';
    byLabel.set(label, [...(byLabel.get(label) ?? []), relative]);
  }
  for (const [label, paths] of byLabel) {
    findings.push(
      buildFinding({
        ruleId: 'PKG-NOISE',
        evidence: `${paths.length} file(s) from a ${label}, for example ${paths.slice(0, 3).join(', ')}.`,
        severity: label === 'environment file' ? 'medium' : 'low',
        instanceKey: label,
      }),
    );
  }

  if (!markdown) return findings;

  const { promised } = collectReferences(markdown);
  const bundlePaths = new Set(
    artifact.files.map((f) => stripRoot(f.path, artifact.rootFolderName)),
  );

  for (const target of promised) {
    if (!resolvesToBundleFile(target, bundlePaths)) {
      findings.push(
        buildFinding({
          ruleId: 'PKG-LINK',
          resourcePath: skillPath,
          evidence: `SKILL.md references "${target}", which is not in the bundle.`,
          instanceKey: target,
          line: lineOf(markdown, target),
        }),
      );
    }
  }

  return findings;
}

/** Copilot Cowork companion-file size and count limits. */
function evaluateLimits(
  artifact: UploadedArtifact,
  runtimes: TargetRuntime[],
): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
  if (!runtimes.includes('cowork')) return findings;

  const companions = artifact.files.filter(
    (file) => stripRoot(file.path, artifact.rootFolderName).toLowerCase() !== 'skill.md',
  );
  const companionBytes = companions.reduce((total, file) => total + file.bytes, 0);

  if (companionBytes > BUNDLE_LIMITS.maxCompanionBytes) {
    findings.push(
      buildFinding({
        ruleId: 'LIM-SIZE',
        evidence:
          `The companion files total ${formatBytes(companionBytes)}. Copilot Cowork allows ` +
          `${formatBytes(BUNDLE_LIMITS.maxCompanionBytes)} per skill.`,
        runtimes: ['cowork'],
      }),
    );
  }

  if (companions.length > BUNDLE_LIMITS.maxCompanionFiles) {
    findings.push(
      buildFinding({
        ruleId: 'LIM-FILES',
        evidence:
          `The skill contains ${companions.length} companion files. Copilot Cowork allows ` +
          `${BUNDLE_LIMITS.maxCompanionFiles}; SKILL.md is excluded from this count.`,
        runtimes: ['cowork'],
      }),
    );
  }

  for (const file of companions) {
    const relative = stripRoot(file.path, artifact.rootFolderName);
    if (file.bytes > BUNDLE_LIMITS.maxCompanionFileBytes) {
      findings.push(
        buildFinding({
          ruleId: 'LIM-FILESIZE',
          resourcePath: relative,
          evidence:
            `"${relative}" is ${formatBytes(file.bytes)}. Copilot Cowork companion files must be ` +
            `${formatBytes(BUNDLE_LIMITS.maxCompanionFileBytes)} or smaller.`,
          runtimes: ['cowork'],
          instanceKey: relative,
        }),
      );
    }
  }

  return findings;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Exported for the shape rules, which need the same body the packaging rules parsed. */
export function readSkillBody(artifact: UploadedArtifact): { body: string; path: string } {
  const skillFile = findFile(artifact, 'SKILL.md');
  const markdown = skillFile?.text ?? '';
  const { body } = parseFrontmatter(markdown);
  return {
    body,
    path: skillFile ? stripRoot(skillFile.path, artifact.rootFolderName) : 'SKILL.md',
  };
}

/** Exported so the orphan rule and the AI payload builder agree on what a text file is. */
export function isTextResource(path: string): boolean {
  const ext = extensionOf(path);
  return ['md', 'txt', 'json', 'yaml', 'yml', 'ts', 'js', 'py', 'ps1', 'sh', 'csv', 'html', 'css'].includes(ext);
}
