/**
 * Shape, runtime and orchestrator tests.
 *
 * The orchestrator cases carry the most weight. A review that quietly reports a
 * lower score when the AI stage fails would be worse than one that reports
 * nothing, because the author would act on a number nobody measured.
 *
 * The fake secrets are split into string parts, so that secret scanners do not
 * report them.
 */
import { describe, expect, it, vi } from 'vitest';
import { evaluateShape } from '../services/shapeRules';
import { decideRecommendation, dimensionForFinding, recommend, reviewArtifact } from '../services/artifactReviewService';
import { toSkillBundle } from '../services/uploadBundleAdapter';
import { scanForSecrets } from '../services/secretScanner';
import { resolveStaleness } from '../contracts/PlatformCatalogue';
import { resolveCatalogue } from '../data/catalogueResolver';
import type {
  ArtifactFinding,
  ArtifactReviewProgress,
  ArtifactReviewResult,
  RubricDimensionScore,
  RuntimeVerdict,
} from '../contracts/ArtifactReview';
import { artifact, file, goodSkillMarkdown, hasRule, skillArtifact } from './fixtures';

const COWORK_BODY_ADVICE_WORDS = 3000;

describe('evaluateShape', () => {
  it('passes a skill written to the shape of the published corpus', () => {
    expect(evaluateShape(skillArtifact())).toHaveLength(0);
  });

  it('flags a description that does not state an activation trigger', () => {
    const md = goodSkillMarkdown({
      description:
        'A helpful assistant for release engineering that knows about tags, merge logs and the way our teams like to group changes into readable sections for a release.',
    });
    const finding = evaluateShape(skillArtifact(md)).find(
      (candidate) => candidate.ruleId === 'SHP-TRIGGER',
    );

    expect(finding?.severity).toBe('medium');
  });

  it('accepts the official purpose-then-trigger description pattern', () => {
    const md = goodSkillMarkdown({
      description:
        'Generates a full test plan and evaluation set for a Microsoft Copilot Studio agent. Use when the user asks to create a test plan, build an evaluation set, or write regression tests for an agent.',
    });

    expect(hasRule(evaluateShape(skillArtifact(md)), 'SHP-TRIGGER')).toBe(false);
  });

  it('does not turn a concise non-empty description into a corpus failure', () => {
    expect(hasRule(evaluateShape(skillArtifact(goodSkillMarkdown({ description: 'Use when writing notes.' }))), 'SHP-DESCLEN')).toBe(false);
  });

  it('places description findings on the frontmatter description line', () => {
    const findings = evaluateShape(
      skillArtifact(goodSkillMarkdown({ description: 'A brief helper.' })),
    ).filter((finding) => finding.ruleId === 'SHP-TRIGGER' || finding.ruleId === 'SHP-DESCLEN');

    expect(findings).toHaveLength(1);
    expect(findings.every((finding) => finding.line === 3)).toBe(true);
  });

  it('leaves official description length enforcement to packaging rules', () => {
    const long = `Use when the user asks for release notes. ${'Extra detail. '.repeat(60)}`;
    expect(hasRule(evaluateShape(skillArtifact(goodSkillMarkdown({ description: long }))), 'SHP-DESCLEN')).toBe(false);
  });

  it('uses Cowork official word-count guidance instead of a line-count heuristic', () => {
    const body = `## Purpose\n\n${'word '.repeat(COWORK_BODY_ADVICE_WORDS + 1)}`;
    const finding = evaluateShape(
      skillArtifact(goodSkillMarkdown({ body })),
      ['cowork', 'scout', 'copilot-studio'],
    ).find((candidate) => candidate.ruleId === 'SHP-BODYLEN');

    expect(finding?.runtimes).toEqual(['cowork']);
    expect(finding?.severity).toBe('low');
    expect(finding?.evidence).toContain('advice');
    expect(finding?.evidence).toContain('words');
  });

  it('does not score optional heading guidance as a defect', () => {
    const body = 'Just a wall of prose with no structure at all, running on for a while.';
    expect(hasRule(evaluateShape(skillArtifact(goodSkillMarkdown({ body }))), 'SHP-HEADINGS')).toBe(false);
  });

  it('recognises ordered Step headings as numbered workflow steps', () => {
    const body = [
      '## Retrieval steps',
      '### Step 1 — Same-lab scoped search',
      'Query the narrow index.',
      '### Step 2 — Same-domain broader search',
      'Broaden the query.',
      '### Step 3 — Format the suggestion',
      'Return the result.',
    ].join('\n\n');

    const findings = evaluateShape(skillArtifact(goodSkillMarkdown({ body })), ['cowork']);

    expect(hasRule(findings, 'SHP-STEPS')).toBe(false);
  });

});

describe('resolveStaleness', () => {
  it('reports a fresh snapshot as fresh, with no note', () => {
    const catalogue = resolveCatalogue('cowork');
    const result = resolveStaleness(catalogue, new Date(catalogue.snapshotDate));
    expect(result.isStale).toBe(false);
    expect(result.note).toBeUndefined();
  });

  it('reports an old snapshot as stale, with a note the reader can act on', () => {
    const result = resolveStaleness(resolveCatalogue('cowork'), new Date('2030-01-01T00:00:00.000Z'));
    expect(result.isStale).toBe(true);
    expect(result.note).toBeTruthy();
  });
});

describe('toSkillBundle', () => {
  it('keeps a withheld file in the manifest, with its content removed', () => {
    // Dropping the file would let a skill hide a resource simply by putting a
    // credential in it.
    const uploaded = skillArtifact(goodSkillMarkdown(), [
      file('scripts/deploy.sh', 'export GITHUB_TOKEN="ghp_' + 'aBcD1234efGH5678ijKL90mnOP12qrST3456"'),
    ]);
    const scan = scanForSecrets(uploaded);
    const bundle = toSkillBundle({ artifact: uploaded, withheldPaths: scan.withheldPaths });

    const withheld = bundle.resources.find((r) => r.normalizedPath.includes('deploy.sh'));
    expect(withheld).toBeDefined();
    expect(withheld?.textContent).toBeUndefined();
    expect(withheld?.issues.some((i) => i.code === 'content-withheld')).toBe(true);
  });

  it('marks the synthetic identifier so an upload is never mistaken for a deployed agent', () => {
    const bundle = toSkillBundle({ artifact: skillArtifact(), withheldPaths: new Set() });
    expect(bundle.skillComponentId.startsWith('upload:')).toBe(true);
  });
});

describe('context-aware artifact safety review', () => {
  const allRuntimes = ['cowork', 'scout', 'copilot-studio'] as const;

  it('does not block a benign bundle on contextual scanner matches', async () => {
    const uploaded = skillArtifact(goodSkillMarkdown(), [
      file(
        'scripts/version.py',
        [
          'import os',
          'import requests',
          'import tempfile',
          'temp_path = tempfile.NamedTemporaryFile(delete=False).name',
          'requests.head("https://pypi.org/pypi/example/json", timeout=5)',
          'os.remove(temp_path)',
          'print("Use ../archive as the example path")',
        ].join('\n'),
      ),
      file(
        'references/snapshot-history/index.html',
        [
          '<a href="https://learn.microsoft.com/">Documentation</a>',
          '<script>document.documentElement.dataset.theme = "dark";</script>',
        ].join('\n'),
      ),
      file('references/index.md', '<!-- generated index: do not edit -->\n\n# Reference index'),
    ]);

    const result = await reviewArtifact({
      artifact: uploaded,
      runtimes: [...allRuntimes],
    });
    const contextualRules = new Set([
      'SCR-CMD-01',
      'SCR-DESTR-01',
      'SCR-TRAV-01',
      'HTML-SCRIPT-01',
      'HTML-REMOTE-01',
      'MD-COMMENT-01',
    ]);

    expect(result.findings.filter((finding) => contextualRules.has(finding.ruleId))).toEqual([]);
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain('SCR-NET-01');
    expect(result.scores.safety.value).toBeGreaterThan(0);
    expect(result.recommendation).not.toBe('keep-private');
    expect(result.runtimeVerdicts.every((verdict) => verdict.verdict !== 'will-not-run')).toBe(true);
  });

  it('still blocks a bundle containing confirmed shell injection', async () => {
    const uploaded = skillArtifact(goodSkillMarkdown(), [
      file(
        'scripts/run.py',
        'subprocess.run(f"deploy {user_supplied_target}", shell=True)',
      ),
    ]);

    const result = await reviewArtifact({
      artifact: uploaded,
      runtimes: [...allRuntimes],
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        ruleId: 'SCR-CMD-01',
        severity: 'critical',
        runtimes: [],
      }),
    );
    expect(result.recommendation).toBe('keep-private');
    expect(result.runtimeVerdicts.every((verdict) => verdict.verdict !== 'will-not-run')).toBe(true);
  });
});

describe('reviewArtifact', () => {
  const runtimes = ['cowork'] as const;

  it('fails cleanly, with a reason, when the upload cannot be identified', async () => {
    const result = await reviewArtifact({ artifact: artifact([file('notes.txt', 'hello')]), runtimes: [...runtimes] });
    expect(result.status).toBe('failed');
    expect(result.artifactKind).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it('reports partial, not complete, when the AI stage did not run', async () => {
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes] });
    expect(result.status).toBe('partial');
    expect(result.aiAvailable).toBe(false);
  });

  it('reports null, not zero, for dimensions only the AI can judge', async () => {
    // Zero would read as "this is bad". Null reads as "this was not assessed",
    // and only one of those is true when the stage did not run.
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes] });
    const taskFocus = result.dimensions.find((d) => d.id === 'task-focus');
    expect(taskFocus?.score).toBeNull();
    expect(taskFocus?.assessment).toMatch(/not assessed/i);
  });

  it('reports complete once the AI stage succeeds', async () => {
    const result = await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      {
        runAiStage: async () => ({
          findings: [],
          assessment: {
            status: 'complete' as const,
            portionsAssessed: 1,
            dimensions: [
              { key: 'Clarity' as const, score: 6, rationale: 'The writing is mostly clear.' },
              { key: 'Actionability' as const, score: 8, rationale: 'The steps are executable.' },
              { key: 'Scope discipline' as const, score: 4, rationale: 'The skill covers two jobs.' },
              { key: 'Composability' as const, score: 10, rationale: 'The skill composes cleanly.' },
            ],
          },
        }),
      },
    );
    expect(result.status).toBe('complete');
    expect(result.aiAvailable).toBe(true);
    expect(result.dimensions.find((d) => d.id === 'trigger-clarity')?.score).toBe(3);
    expect(result.dimensions.find((d) => d.id === 'instruction-quality')?.score).toBe(4);
    expect(result.dimensions.find((d) => d.id === 'task-focus')?.score).toBe(2);
    expect(result.aiAssessment?.dimensions.find((d) => d.key === 'Composability')).toEqual({
      key: 'Composability',
      score: 10,
      rationale: 'The skill composes cleanly.',
    });
  });

  it('degrades to partial, and says why, when the AI stage throws', async () => {
    const result = await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      {
        runAiStage: async () => {
          throw new Error('the workflow timed out');
        },
      },
    );
    expect(result.status).toBe('partial');
    expect(result.aiAvailable).toBe(false);
    expect(result.error).toContain('timed out');
  });

  /*
    Reservation is what makes a review visible while it runs. It has to happen
    before the AI stage, because the whole point is to have a record of a review
    that the browser may not live long enough to finish.
  */
  it('announces the review before the slow stage starts', async () => {
    const order: string[] = [];

    await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      {
        onReserve: (reserved) => {
          order.push(`reserve:${reserved.status}`);
        },
        runAiStage: async () => {
          order.push('ai');
          return [];
        },
      },
    );

    expect(order).toEqual(['reserve:in-progress', 'ai']);
  });

  it('gives the announced review a start time, and does not date it as reviewed', async () => {
    // `reviewedAt` on a running row would claim an assessment exists. The two
    // timestamps are kept apart so the grid can tell "started" from "reviewed".
    let reserved: ArtifactReviewResult | undefined;

    await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      {
        onReserve: (value) => {
          reserved = value;
        },
        runAiStage: async () => [],
      },
    );

    expect(reserved?.startedAt).toEqual(expect.any(String));
    expect(reserved?.artifactHash).toBe(skillArtifact().hash);
  });

  it('announces once, not once per runtime', async () => {
    const onReserve = vi.fn();

    await reviewArtifact(
      { artifact: skillArtifact(), runtimes: ['cowork', 'scout'] },
      { onReserve, runAiStage: async () => [] },
    );

    expect(onReserve).toHaveBeenCalledTimes(1);
  });

  it('does not announce a review that has no slow stage to survive', async () => {
    // A deterministic-only run finishes in milliseconds. A row saying "running"
    // would be gone before anyone read it, so it is pure noise.
    const onReserve = vi.fn();

    await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes] }, { onReserve });

    expect(onReserve).not.toHaveBeenCalled();
  });

  it('still completes the review when the announcement cannot be written', async () => {
    // Reservation is a visibility aid. Letting it abort a review would trade a
    // paid, working feature for a convenience.
    const result = await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      {
        onReserve: () => {
          throw new Error('Dataverse unavailable');
        },
        runAiStage: async () => [],
      },
    );

    expect(result.status).toBe('complete');
  });

  it('does not let safety read as cleared when only the deterministic checks ran', async () => {
    // Safety carries the most weight and is described as judging destructive or
    // exfiltrating behaviour, which only the AI stage assesses. A bare "no
    // issues found" there is a clearance the review did not earn.
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes] });
    const safety = result.dimensions.find((d) => d.id === 'safety-evidence');
    expect(safety?.score).not.toBeNull();
    expect(safety?.assessment).toMatch(/AI review stage did not run/i);
  });

  it('keeps the safety assessment unqualified once the AI stage has run', async () => {
    const result = await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes] },
      { runAiStage: async () => [] },
    );
    const safety = result.dimensions.find((d) => d.id === 'safety-evidence');
    expect(safety?.assessment).not.toMatch(/did not run/i);
  });

  it('still scores safety from a real deterministic finding when the AI stage is absent', async () => {
    // The caveat must not become a reason to stop counting evidence the
    // deterministic scan genuinely produced.
    const result = await reviewArtifact({
      artifact: skillArtifact(goodSkillMarkdown(), [
        file('scripts/deploy.sh', 'export GITHUB_TOKEN="ghp_' + '0123456789abcdef0123456789abcdef0123"'),
      ]),
      runtimes: [...runtimes],
    });
    const safety = result.dimensions.find((d) => d.id === 'safety-evidence');
    expect(safety?.score).toBeLessThan(5);
  });

  it('never sends a withheld file to the AI stage', async () => {
    let seen: readonly string[] = [];
    const uploaded = skillArtifact(goodSkillMarkdown(), [
      file('scripts/deploy.sh', 'export GITHUB_TOKEN="ghp_' + 'aBcD1234efGH5678ijKL90mnOP12qrST3456"'),
    ]);
    await reviewArtifact(
      { artifact: uploaded, runtimes: [...runtimes] },
      {
        runAiStage: async (_a, _runtimes, withheld) => {
          seen = withheld;
          return [];
        },
      },
    );
    expect(seen).toContain('scripts/deploy.sh');
  });

  it('produces one verdict per selected runtime', async () => {
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: ['cowork', 'scout'] });
    expect(result.runtimeVerdicts.map((v) => v.runtime)).toEqual(['cowork', 'scout']);
  });

  it('can report a Cowork-only issue while Scout runs cleanly', async () => {
    // The whole reason verdicts are per runtime rather than averaged. LIM-DESC
    // is scoped to Cowork alone, so Scout has to stay clean on the very same
    // artifact rather than inheriting its neighbour's verdict.
    const md = goodSkillMarkdown({
      description: `Use when the user asks to draft release notes. ${'Adds detail. '.repeat(90)}`,
    }).replace('allowed-tools:', 'compatibility: Copilot Cowork, Microsoft Scout\nallowed-tools:');
    const result = await reviewArtifact({
      artifact: skillArtifact(md),
      runtimes: ['cowork', 'scout'],
    });
    const cowork = result.runtimeVerdicts.find((v) => v.runtime === 'cowork');
    const scout = result.runtimeVerdicts.find((v) => v.runtime === 'scout');
    expect(cowork?.verdict).toBe('runs-with-issues');
    expect(scout?.verdict).toBe('runs');
  });

  it('stamps every verdict with the catalogue version it was judged against', async () => {
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes] });
    for (const verdict of result.runtimeVerdicts) {
      expect(verdict.catalogueVersion).toBeTruthy();
      expect(verdict.catalogueSnapshotDate).toBeTruthy();
    }
  });

  // Regression, from a real review of the published agent-harness-explorer
  // skill. It scored 94%, every runtime read "Will not run" with an identical
  // 49/100, and the tool told the author to keep it private. The cause was a
  // broken documentation link: a packaging defect names no runtime, but an
  // unscoped finding used to apply to all of them, which produced a
  // compatibility claim out of a missing markdown file.
  //
  // Three runtimes agreeing on one score was the giveaway. They agreed because
  // there was no runtime evidence to disagree about.
  it('does not turn a packaging defect into a runtime compatibility failure', async () => {
    const md = goodSkillMarkdown({
      body: ['## Purpose', '', 'Do the thing.', '', 'See [the history](references/snapshot-history/README.md).'].join(
        '\n',
      ),
    });
    const result = await reviewArtifact({ artifact: skillArtifact(md), runtimes: ['cowork', 'scout'] });

    // The finding is real and must still be reported.
    expect(hasRule(result.findings, 'PKG-LINK')).toBe(true);

    for (const verdict of result.runtimeVerdicts) {
      expect(verdict.verdict).not.toBe('will-not-run');
    }
    expect(result.recommendation).not.toBe('keep-private');
  });

  it('does not turn package acceptance into a Copilot Studio targeting claim', async () => {
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: ['copilot-studio'] });
    const studio = result.runtimeVerdicts.find((v) => v.runtime === 'copilot-studio');

    expect(studio?.verdict).toBe('not-evaluated');
    expect(studio?.score).toBeNull();
    expect(studio?.basis).toBe('none');
  });

  it('fails Copilot Studio when the package contract is not met', async () => {
    // Copilot Studio requires a description: it is what the orchestration
    // runtime matches a request against, so a skill without one loads and is
    // then never invoked. Cowork and Scout publish no comparable contract, so
    // nothing is claimed on their behalf.
    const md = goodSkillMarkdown().replace(/^description:.*$/m, '');
    const result = await reviewArtifact({
      artifact: skillArtifact(md),
      runtimes: ['cowork', 'scout', 'copilot-studio'],
    });

    const missing = result.findings.filter(
      (f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-REQ' && f.evidence.includes('description'),
    );

    expect(missing.length).toBeGreaterThan(0);
    expect([...new Set(missing.flatMap((f) => f.runtimes))]).toEqual(['copilot-studio']);
  });

  // "Not evaluated" is an outcome for one upload, not a permanent state, and the
  // two tests below are what stop the runtime being dropped as dead weight.
  // Cowork and Copilot Studio both publish strict skill-name rules. Scout does
  // not publish an exact slug contract, so it must not inherit either rule.
  it('applies strict name rules only to runtimes with published contracts', async () => {
    const md = goodSkillMarkdown({ name: 'release-notes-writer-' });
    const result = await reviewArtifact({
      artifact: skillArtifact(md),
      runtimes: ['cowork', 'scout', 'copilot-studio'],
    });

    const slug = result.findings.filter((f) => (f.ruleId ?? f.id.split(':')[0]) === 'PKG-SLUG');

    expect(slug.length).toBeGreaterThan(0);
    expect([...new Set(slug.flatMap((f) => f.runtimes))]).toEqual(['cowork', 'copilot-studio']);
  });

  it('gives Copilot Studio a real verdict once a finding does apply to it', async () => {
    const md = goodSkillMarkdown({ name: 'release-notes-writer-' });
    const result = await reviewArtifact({ artifact: skillArtifact(md), runtimes: ['copilot-studio'] });
    const studio = result.runtimeVerdicts.find((v) => v.runtime === 'copilot-studio');

    expect(studio?.verdict).not.toBe('not-evaluated');
    expect(studio?.score).not.toBeNull();
  });

  it('reports progress through the stages, ending at complete', async () => {
    const seen: ArtifactReviewProgress[] = [];
    await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes], onProgress: (p) => seen.push(p) },
      { runAiStage: async () => [] },
    );
    expect(seen.at(-1)?.stage).toBe('complete');
    expect(seen.at(-1)?.percent).toBe(100);
    expect(seen.every((p) => p.message.length > 0)).toBe(true);
  });

  it('returns cancelled when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await reviewArtifact({ artifact: skillArtifact(), runtimes: [...runtimes], signal: controller.signal });
    expect(result.status).toBe('cancelled');
  });

  it('returns cancelled when the abort lands during the AI stage', async () => {
    // Aborting mid-review must not still produce a score. The user asked it to
    // stop, and a partial score reads as a judgement.
    const controller = new AbortController();
    const result = await reviewArtifact(
      { artifact: skillArtifact(), runtimes: [...runtimes], signal: controller.signal },
      {
        runAiStage: async () => {
          controller.abort();
          return [];
        },
      },
    );
    expect(result.status).toBe('cancelled');
  });

  it('keeps one row when the AI stage restates a deterministic finding', async () => {
    // A repeated id would break DataGrid's row keys and count the same problem
    // twice against the score.
    const md = goodSkillMarkdown().replace('  - bash', '  - bash\n  - browser_navigate');
    const result = await reviewArtifact(
      { artifact: skillArtifact(md), runtimes: [...runtimes] },
      {
        runAiStage: async () => {
          const first = await reviewArtifact({ artifact: skillArtifact(md), runtimes: [...runtimes] });
          return first.findings.slice(0, 1);
        },
      },
    );
    const ids = result.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('dimensionForFinding', () => {
  const finding = (ruleId: string) => ({ ruleId, id: `${ruleId}:x` }) as ArtifactFinding;

  it.each([
    ['PKG-ORPHAN', 'packaging-quality'],
    ['LIM-SIZE', 'packaging-quality'],
    ['SEC-SECRET', 'safety-evidence'],
    ['SHP-TRIGGER', 'trigger-clarity'],
    ['SHP-BODYLEN', 'task-focus'],
    ['SHP-HEADINGS', 'instruction-quality'],
    ['AUTO-UNATTENDED', 'safety-evidence'],
    ['RT-TOOL', 'portability'],
    ['COWORK-BROWSER', 'portability'],
  ])('maps %s to %s', (ruleId, expected) => {
    expect(dimensionForFinding(finding(ruleId))).toBe(expected);
  });
});

describe('recommend', () => {
  const dim = (score: number | null): RubricDimensionScore => ({
    id: 'clarity',
    score,
    assessment: 'stub',
  });

  const verdict = (value: RuntimeVerdict['verdict']): RuntimeVerdict => ({
    runtime: 'cowork',
    verdict: value,
    score: null,
    findingIds: [],
    catalogueVersion: 'test',
    catalogueSnapshotDate: '2026-01-01',
  });

  const finding = (severity: ArtifactFinding['severity']): ArtifactFinding => ({
    id: `stub-${severity}`,
    ruleId: 'STUB',
    severity,
    title: 'stub',
    detail: 'stub',
    remediation: 'stub',
    runtimes: [],
    source: 'deterministic',
  });

  it('does not use hidden runtime verdicts for an artifact recommendation', () => {
    const perfect = [dim(5), dim(5), dim(5)];

    expect(recommend(perfect, [verdict('runs'), verdict('will-not-run')], [])).toBe('submit');
  });

  it('asks for a revision when a single dimension scores below 3, however high the average', () => {
    // 2, 5, 5 averages 4, which clears the mean threshold on its own. The
    // lowest-dimension floor is what stops one bad area hiding behind good ones.
    expect(recommend([dim(2), dim(5), dim(5)], [verdict('runs')], [])).toBe('revise');
  });

  it('asks for a revision when every dimension clears 3 but the average is under 4', () => {
    expect(recommend([dim(3), dim(3), dim(4)], [verdict('runs')], [])).toBe('revise');
  });

  it('asks for a revision when nothing could be assessed, rather than passing it by default', () => {
    expect(recommend([dim(null), dim(null)], [verdict('runs')], [])).toBe('revise');
  });

  it('clears an artifact for sharing only on both thresholds and a clean runtime', () => {
    expect(recommend([dim(3), dim(4), dim(5)], [verdict('runs')], [])).toBe('submit');
  });

  it('treats runs-with-issues as shareable, because the artifact still runs', () => {
    expect(recommend([dim(4), dim(4), dim(4)], [verdict('runs-with-issues')], [])).toBe('submit');
  });

  it('keeps a artifact private on a confirmed critical finding, whatever the runtimes say', () => {
    // A safety blocker does not stop an artifact running. It stops it being
    // handed out. That distinction is why the finding is read here directly
    // rather than borrowed from a runtime verdict.
    expect(recommend([dim(5), dim(5), dim(5)], [verdict('runs')], [finding('critical')])).toBe('keep-private');
  });

  it('asks for a revision on a confirmed high finding rather than suppressing the artifact', () => {
    expect(recommend([dim(5), dim(5), dim(5)], [verdict('runs')], [finding('high')])).toBe('revise');
  });

  // Regression. A real review of the published agent-harness-explorer skill
  // scored 94% and was told "Keep private" on the strength of one broken
  // documentation link. The link was genuinely broken, but a packaging defect
  // names no runtime, so it should never have reached a compatibility verdict.
  // Revise is the honest answer: fix the reference, then publish.
  it('asks for a revision, not privacy, when a strong artifact has one packaging defect', () => {
    const strong = [dim(5), dim(5), dim(5), dim(4), dim(4)];

    expect(recommend(strong, [verdict('runs'), verdict('not-evaluated')], [finding('high')])).toBe('revise');
  });

  // The badge in the history grid carries a tooltip explaining what earned the
  // verdict, and the results banner repeats it. Both call
  // `decideRecommendation`, so the explanation cannot describe a rule the
  // decision no longer applies. Those reasons are pinned in the block below.
});

describe('decideRecommendation', () => {
  const dim = (score: number | null): RubricDimensionScore => ({
    id: 'clarity',
    score,
    assessment: 'stub',
  });

  const verdict = (value: RuntimeVerdict['verdict']): RuntimeVerdict => ({
    runtime: 'cowork',
    verdict: value,
    score: null,
    findingIds: [],
    catalogueVersion: 'test',
    catalogueSnapshotDate: '2026-01-01',
  });

  const finding = (severity: ArtifactFinding['severity'], title = 'stub finding'): ArtifactFinding =>
    ({
      id: `stub-${severity}`,
      ruleId: 'STUB',
      severity,
      title,
      runtimes: [],
      source: 'deterministic',
    }) as ArtifactFinding;

  // The label and the reason are produced by one call, so they cannot drift.
  it('agrees with recommend on every path', () => {
    const cases: [RubricDimensionScore[], RuntimeVerdict[], ArtifactFinding[]][] = [
      [[dim(5)], [verdict('will-not-run')], []],
      [[dim(5)], [verdict('runs')], [finding('critical')]],
      [[dim(null)], [verdict('runs')], []],
      [[dim(5)], [verdict('runs')], [finding('high')]],
      [[dim(2), dim(5)], [verdict('runs')], []],
      [[dim(3), dim(4)], [verdict('runs')], []],
      [[dim(4), dim(5)], [verdict('runs')], []],
    ];

    for (const [d, v, f] of cases) {
      expect(decideRecommendation(d, v, f).recommendation).toBe(recommend(d, v, f));
    }
  });

  it('names the finding that blocked it, rather than listing the rules', () => {
    // "Either a dimension scored below 3, or the average is under 4, or a
    // confirmed high finding is open" makes the reader work out which one
    // fired. Naming it answers the question they actually asked.
    const reason = decideRecommendation(
      [dim(5), dim(5)],
      [verdict('runs')],
      [finding('high', 'Broken reference in SKILL.md')],
    ).reason;

    expect(reason).toContain('Broken reference in SKILL.md');
    expect(reason).toContain('before publishing');
    expect(reason).toContain('Then review again');
    expect(reason).not.toContain('Either');
  });

  it('does not describe an unverified runtime verdict as a blocker', () => {
    expect(decideRecommendation([dim(5)], [verdict('will-not-run')], []).reason).not.toContain(
      'Cowork will not run',
    );
  });

  it('counts the blockers when naming one alone would mislead', () => {
    const reason = decideRecommendation(
      [dim(5)],
      [verdict('runs')],
      [finding('high', 'First problem'), finding('high', 'Second problem')],
    ).reason;

    expect(reason).toContain('2 confirmed');
    expect(reason).toContain('First problem');
    expect(reason).toContain('Then review again');
  });

  it('names the weak dimension when the score alone held it back', () => {
    const reason = decideRecommendation([dim(2), dim(5)], [verdict('runs')], []).reason;

    expect(reason).toContain('2 out of 5');
    expect(reason).toContain('the minimum is 3');
  });

  it('reports the average when every dimension cleared the floor but the mean did not', () => {
    expect(decideRecommendation([dim(3), dim(4)], [verdict('runs')], []).reason).toContain('3.5 out of 5');
  });

  it('says why a clean artifact passed, not just that it did', () => {
    const reason = decideRecommendation([dim(4), dim(5)], [verdict('runs')], []).reason;

    expect(reason).toContain('4.5 out of 5');
    expect(reason).toContain('no confirmed blocker');
  });

  it('gives a direct next step when a high finding needs a revision', () => {
    const reason = decideRecommendation(
      [dim(5), dim(5), dim(4)],
      [verdict('runs')],
      [finding('high', 'SKILL.md references a file that is not in the bundle')],
    ).reason;

    expect(reason).toContain('SKILL.md references a file that is not in the bundle');
    expect(reason).toContain('before publishing');
    expect(reason).toContain('Then review again');
    expect(reason).not.toContain('does not average away');
  });
});
