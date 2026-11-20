/**
 * The AI stage adapter (spec 018).
 *
 * This is the seam between the uploaded-artifact review and the modern
 * workflow that every other review's judgement runs on. The properties worth
 * pinning are the ones a future change could silently break:
 *
 * - findings come back tagged `source: 'ai'` and runtime-agnostic, so the
 *   scorer weights them correctly and no AI finding claims to be a platform
 *   compatibility fact;
 * - the workflow job is primed with the real deterministic layer, not an empty
 *   map, because the agent is asked to build on it;
 * - an unavailable or blocked backend throws, which the pipeline turns into a
 *   partial review that keeps its deterministic findings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillBundleReviewResult } from '../../agents-experience/contracts/SkillBundle';

const resolveReviewAiProvider = vi.fn(() => 'workflow' as 'workflow' | 'prompt');
const prime = vi.fn(async () => undefined);
const executeSkillBundleReview = vi.fn();
const createWorkflowReviewAiPort = vi.fn(() => ({
  port: { invokeStandardSkillBundleEvaluator: vi.fn() },
  provider: { prime },
}));
const createPromptReviewAiPort = vi.fn(() => ({
  invokeStandardSkillBundleEvaluator: vi.fn(),
  invokeSkillBundleEvaluator: vi.fn(),
}));

vi.mock('../../agents-experience/services/ai-providers/reviewAiBackend', () => ({
  resolveReviewAiProvider: () => resolveReviewAiProvider(),
  logReviewBackend: vi.fn(),
}));

vi.mock('../../agents-experience/services/ai-providers/ReviewAiProvider', () => ({
  createWorkflowReviewAiPort: (o: unknown) => createWorkflowReviewAiPort(o as never),
  createPromptReviewAiPort: () => createPromptReviewAiPort(),
}));

vi.mock('../../agents-experience/services/SkillBundleReviewService', () => ({
  executeSkillBundleReview: (...args: unknown[]) => executeSkillBundleReview(...args),
  computeDeterministicFindingsByBundle: () => new Map([['sample-skill', [{ id: 'PKG-REQ:x' }]]]),
}));

import { createArtifactAiStage } from '../services/artifactAiStage';
import { SYNTHETIC_ID_PREFIX } from '../services/uploadBundleAdapter';
import { file, skillArtifact } from './fixtures';
import type { TargetRuntime } from '../contracts/ArtifactReview';

/**
 * Runtimes the author selected. Cowork publishes a tool surface, so the
 * capability model these tests exercise is a grounded one.
 */
const RUNTIMES: readonly TargetRuntime[] = ['cowork'];

function result(over: Partial<SkillBundleReviewResult> = {}): SkillBundleReviewResult {
  return {
    status: 'complete',
    mode: 'standard',
    skillName: 'sample-skill',
    skillSchemaName: 'sample-skill',
    deterministicFindings: [],
    blocked: false,
    ...over,
  } as SkillBundleReviewResult;
}

const aiFinding = {
  id: 'SHP-TRIGGER:SKILL.md',
  ruleId: 'SHP-TRIGGER',
  severity: 'medium',
  dimension: 'quality',
  title: 'The trigger is vague',
  resourcePath: 'SKILL.md',
};

describe('createArtifactAiStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveReviewAiProvider.mockReturnValue('workflow');
    executeSkillBundleReview.mockResolvedValue(
      result({ standardEvaluation: { findings: [aiFinding] } as never }),
    );
  });

  it('tags every returned finding as AI-sourced and runtime-agnostic', async () => {
    const { findings } = await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    expect(findings).toHaveLength(1);
    expect(findings[0].source).toBe('ai');
    // Empty means "applies to every selected runtime". An AI judgement about
    // wording is not a per-platform compatibility claim.
    expect(findings[0].runtimes).toEqual([]);
    expect(findings[0].ruleId).toBe('SHP-TRIGGER');
  });

  it('derives a stable synthetic bot id from the artifact hash', async () => {
    const artifact = skillArtifact();
    await createArtifactAiStage()(artifact, RUNTIMES, []);

    expect(createWorkflowReviewAiPort).toHaveBeenCalledWith(
      expect.objectContaining({ botId: `${SYNTHETIC_ID_PREFIX}${artifact.hash}` }),
    );
  });

  it('primes the workflow job with real deterministic findings', async () => {
    await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    expect(prime).toHaveBeenCalledTimes(1);
    const [, findingsByBundle] = prime.mock.calls[0] as unknown as [
      unknown,
      Map<string, unknown[]>,
    ];
    expect(findingsByBundle.get('sample-skill')).toHaveLength(1);
  });

  it('never requests a deep review for a single uploaded artifact', async () => {
    await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    const [, deps] = executeSkillBundleReview.mock.calls[0];
    expect(deps.deepProvisioned).toBe(false);
    expect(deps.standardProvisioned).toBe(true);
  });

  it('does not prime a workflow when the prompt backend is selected', async () => {
    resolveReviewAiProvider.mockReturnValue('prompt');

    await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    expect(createWorkflowReviewAiPort).not.toHaveBeenCalled();
    expect(createPromptReviewAiPort).toHaveBeenCalled();
    expect(prime).not.toHaveBeenCalled();
  });

  it('throws when the backend reports the stage unavailable', async () => {
    executeSkillBundleReview.mockResolvedValue(result({ status: 'unavailable' }));

    await expect(createArtifactAiStage()(skillArtifact(), RUNTIMES, [])).rejects.toThrow(/not available/i);
  });

  it('throws when the artifact was blocked from reaching a model', async () => {
    executeSkillBundleReview.mockResolvedValue(result({ status: 'blocked', blocked: true }));

    await expect(createArtifactAiStage()(skillArtifact(), RUNTIMES, [])).rejects.toThrow(/cannot be sent/i);
  });

  it('throws when the AI call failed, so the caller cannot read it as a clean pass', async () => {
    // This is the shape SkillBundleReviewService returns when the AI call
    // throws: partial, an error, and no evaluation. Resolving `[]` here would
    // let the caller score the AI-dependent dimensions 5/5 and recommend
    // submitting an artifact that was never actually reviewed.
    executeSkillBundleReview.mockResolvedValue(
      result({ status: 'partial', error: 'network unreachable' }),
    );

    const stage = createArtifactAiStage();
    await expect(stage(skillArtifact(), RUNTIMES, [])).rejects.toThrow(/did not complete/i);
    // The underlying reason must survive into the message, otherwise the user
    // is told the review failed with no way to tell whether it is worth a retry.
    await expect(stage(skillArtifact(), RUNTIMES, [])).rejects.toThrow(/network unreachable/i);
  });

  it('throws when the evaluation is missing even without a reported error', async () => {
    executeSkillBundleReview.mockResolvedValue(result({ status: 'partial' }));

    await expect(createArtifactAiStage()(skillArtifact(), RUNTIMES, [])).rejects.toThrow(
      /returned no evaluation/i,
    );
  });

  it('returns an empty list when the AI genuinely found nothing', async () => {
    executeSkillBundleReview.mockResolvedValue(
      result({
        status: 'partial',
        standardEvaluation: {
          status: 'complete',
          findings: [],
          dimensions: [
            { key: 'Clarity', score: 78, rationale: 'The trigger is understandable but broad.' },
            { key: 'Actionability', score: 88, rationale: 'The steps are executable.' },
          ],
        } as never,
      }),
    );

    const output = await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    expect(output).toEqual({
      findings: [],
      assessment: {
        status: 'complete',
        portionsAssessed: 1,
        dimensions: [
          { key: 'Clarity', score: 10, rationale: 'The trigger is understandable but broad.' },
          { key: 'Actionability', score: 10, rationale: 'The steps are executable.' },
        ],
      },
    });
  });

  it('keeps a deduction only when it has exact evidence and a concrete improvement', async () => {
    const evidence = 'Use when writing release notes.';
    const improvement = 'Name the requests that should not trigger this skill.';
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          status: 'complete',
          findings: [{ ...aiFinding, evidence, fact: evidence }],
          dimensions: [
            {
              key: 'Clarity',
              score: 78,
              rationale: 'The trigger is broad.',
              evidence,
              improvement,
            },
          ],
        } as never,
      }),
    );

    const output = await createArtifactAiStage()(
      skillArtifact(`---\nname: sample-skill\ndescription: ${evidence}\n---\n\nBody.`),
      RUNTIMES,
      [],
    );

    expect(output.assessment.dimensions).toEqual([
      {
        key: 'Clarity',
        score: 7.8,
        rationale: 'The trigger is broad.',
        evidence,
        improvement,
      },
    ]);
  });

  it('repairs a missing resource path from exact evidence', async () => {
    const evidence = 'Run the approved workflow.';
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [
            {
              ...aiFinding,
              id: 'SKL-10',
              ruleId: 'SKL-10',
              resourcePath: undefined,
              evidence,
            },
          ],
        } as never,
      }),
    );

    const { findings } = await createArtifactAiStage()(
      skillArtifact(`---\nname: sample-skill\ndescription: d\n---\n\n${evidence}`),
      RUNTIMES,
      [],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].resourcePath).toBe('SKILL.md');
    expect(findings[0].line).toBe(6);
  });

  it('drops a pathless finding when its evidence is not in the artifact', async () => {
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [
            {
              ...aiFinding,
              id: 'SKL-09',
              ruleId: 'SKL-09',
              resourcePath: undefined,
              evidence: 'This text is not in the upload.',
            },
          ],
        } as never,
      }),
    );

    await expect(createArtifactAiStage()(skillArtifact(), RUNTIMES, [])).resolves.toMatchObject({
      findings: [],
    });
  });

  it('drops an AI defect claim for a fixed read-only metadata probe', async () => {
    const evidence = 'requests.head("https://pypi.org/pypi/example/json", timeout=5)';
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [
            {
              ...aiFinding,
              id: 'SCR-NET-01:scripts/version.py',
              ruleId: 'SCR-NET-01',
              severity: 'high',
              dimension: 'safety',
              resourcePath: 'scripts/version.py',
              evidence,
              safetyDisposition: 'blocking',
            },
          ],
        } as never,
      }),
    );
    const artifact = skillArtifact(undefined, [file('scripts/version.py', evidence)]);

    const { findings } = await createArtifactAiStage()(artifact, RUNTIMES, []);

    expect(findings.map((finding) => finding.ruleId)).not.toContain('SCR-NET-01');
  });

  it('drops an AI claim about an archived theme script rejected by the scanner', async () => {
    const evidence = '<script>document.documentElement.dataset.theme = "dark";</script>';
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [
            {
              ...aiFinding,
              id: 'HTML-SCRIPT-01:references/snapshot-history/index.html',
              ruleId: 'HTML-SCRIPT-01',
              severity: 'critical',
              dimension: 'safety',
              resourcePath: 'references/snapshot-history/index.html',
              evidence,
              safetyDisposition: 'blocking',
            },
          ],
        } as never,
      }),
    );
    const artifact = skillArtifact(undefined, [
      file('references/snapshot-history/index.html', evidence),
    ]);

    await expect(createArtifactAiStage()(artifact, RUNTIMES, [])).resolves.toMatchObject({
      findings: [],
    });
  });

  it('withholds flagged files from the bundle sent to the model', async () => {
    const artifact = skillArtifact(undefined, [
      { path: 'scripts/deploy.sh', bytes: 40, text: 'TOKEN=abc', isBinary: false },
    ]);

    await createArtifactAiStage()(artifact, RUNTIMES, ['scripts/deploy.sh']);

    const [bundle] = executeSkillBundleReview.mock.calls[0];
    const withheld = bundle.resources.find(
      (r: { normalizedPath: string }) => r.normalizedPath === 'scripts/deploy.sh',
    );

    // The file must still appear — dropping it would let a skill hide a
    // resource from review by embedding a credential in it.
    expect(withheld).toBeDefined();
    // Absent, not empty-stringed: a consumer must not read "excluded" as
    // "this file has no content".
    expect(withheld.textContent).toBeUndefined();
    expect(withheld.analysisStatus).toBe('skipped');
    expect(withheld.issues[0].code).toBe('content-withheld');
  });

  it('forwards readable files as downloaded, not already AI-assessed', async () => {
    const artifact = skillArtifact(undefined, [
      { path: 'reference.md', bytes: 20, text: 'Some guidance.', isBinary: false },
    ]);

    await createArtifactAiStage()(artifact, RUNTIMES, []);

    const [bundle] = executeSkillBundleReview.mock.calls[0];
    const resource = bundle.resources.find(
      (r: { normalizedPath: string }) => r.normalizedPath === 'reference.md',
    );
    expect(resource.textContent).toBe('Some guidance.');
    expect(resource.analysisStatus).toBe('downloaded');
  });
});

/*
 * The agent-node prompt (spec 014, SKL-09) raises a high-severity finding when a
 * step names a tool absent from `configuredCapabilities`, and — unlike the
 * deterministic rule — it has no "only when something matched" guard. Priming it
 * with an empty capability list therefore made every tool a skill legitimately
 * names look unavailable, so essentially every upload collected a false
 * high-severity finding and a depressed score.
 *
 * Runtime selection and skill declarations are author intent, not evidence of
 * the parent agent's configured capabilities.
 */
describe('createArtifactAiStage — artifact capability isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveReviewAiProvider.mockReturnValue('workflow');
    executeSkillBundleReview.mockResolvedValue(
      result({ standardEvaluation: { findings: [] } as never }),
    );
  });

  function primedCapabilities(): string[] {
    const [, , model] = prime.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { tools: Array<{ name: string }> },
    ];
    return model.tools.map((t) => t.name);
  }

  it('does not treat the selected runtime catalogue as configured capability evidence', async () => {
    await createArtifactAiStage()(skillArtifact(), ['cowork'], []);

    expect(primedCapabilities()).toEqual([]);
  });

  it('does not infer Scout aliases as configured capabilities', async () => {
    await createArtifactAiStage()(skillArtifact(), ['scout'], []);

    expect(primedCapabilities()).toEqual([]);
  });

  it("does not treat a skill's declaration as proof of agent configuration", async () => {
    await createArtifactAiStage()(skillArtifact(), ['cowork'], []);

    expect(primedCapabilities()).toEqual([]);
  });

  it('keeps the capability model empty across multiple selected runtimes', async () => {
    await createArtifactAiStage()(skillArtifact(), ['cowork', 'scout'], []);

    expect(primedCapabilities()).toEqual([]);
  });

  it('drops SKL-09 when no selected runtime publishes a tool surface', async () => {
    // Copilot Studio configures tools per agent, so an upload cannot be
    // resolved against a catalogue. Reporting "unavailable capability" there
    // would state a fact the tool cannot know.
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [{ ...aiFinding, id: 'SKL-09:SKILL.md', ruleId: 'SKL-09' }],
        } as never,
      }),
    );

    const { findings } = await createArtifactAiStage()(
      skillArtifact('---\nname: sample-skill\ndescription: d\n---\n\nBody.'),
      ['copilot-studio'],
      [],
    );

    expect(findings.map((f) => f.ruleId)).not.toContain('SKL-09');
  });

  it('drops SKL-09 when Copilot Studio is included with catalogued runtimes', async () => {
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [{ ...aiFinding, id: 'SKL-09:SKILL.md', ruleId: 'SKL-09' }],
        } as never,
      }),
    );

    const { findings } = await createArtifactAiStage()(
      skillArtifact(),
      ['cowork', 'scout', 'copilot-studio'],
      [],
    );

    expect(findings.map((f) => f.ruleId)).not.toContain('SKL-09');
  });

  it('drops SKL-09 from every artifact-only review', async () => {
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [{ ...aiFinding, id: 'SKL-09:SKILL.md', ruleId: 'SKL-09' }],
        } as never,
      }),
    );

    const { findings } = await createArtifactAiStage()(skillArtifact(), ['cowork'], []);

    expect(findings.map((f) => f.ruleId)).not.toContain('SKL-09');
  });

  it('never drops an unrelated finding while filtering', async () => {
    executeSkillBundleReview.mockResolvedValue(
      result({
        standardEvaluation: {
          findings: [aiFinding, { ...aiFinding, id: 'SKL-09:x', ruleId: 'SKL-09' }],
        } as never,
      }),
    );

    const { findings } = await createArtifactAiStage()(
      skillArtifact('---\nname: sample-skill\ndescription: d\n---\n\nBody.'),
      ['copilot-studio'],
      [],
    );

    expect(findings.map((f) => f.ruleId)).toEqual(['SHP-TRIGGER']);
  });
});

/*
 * Portion splitting (the review-time reduction).
 *
 * A large archive used to be sent as one corpus component, so the workflow's
 * Loop — which runs at a parallelism of 20 — had exactly one thing to do and
 * the review took as long as one very large prompt. Splitting the archive into
 * several components lets that Loop actually work, which is where the time
 * saving comes from.
 *
 * The properties pinned here are the ones that would turn a speed gain into a
 * quality loss, which the change is explicitly not allowed to do:
 * - every portion is primed into ONE job, because separate jobs would not be
 *   parallelised by the Loop and would cost more for no gain;
 * - the job keeps the archive's own name, since that is what the user sees;
 * - a portion that produced no judgement fails the review instead of quietly
 *   contributing nothing, which is the silent loss this work exists to remove;
 * - a finding raised by two portions is reported once, at its worst severity.
 */
describe('createArtifactAiStage — portion splitting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resolveReviewAiProvider.mockReturnValue('workflow');
    executeSkillBundleReview.mockResolvedValue(
      result({ standardEvaluation: { findings: [aiFinding] } as never }),
    );
  });

  /** An archive whose resources cannot fit one corpus component. */
  function largeArtifact(fileCount = 20) {
    const body = 'x'.repeat(9_000);
    return skillArtifact(
      undefined,
      Array.from({ length: fileCount }, (_, i) => file(`references/doc-${i}.md`, body)),
    );
  }

  function jobKindPassedToWorkflow(): string | undefined {
    const [options] = createWorkflowReviewAiPort.mock.calls[0] as unknown as [
      { jobKind?: string },
    ];
    return options.jobKind;
  }

  it('sends a large archive as several portions when the flag is on', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');

    await createArtifactAiStage()(largeArtifact(), RUNTIMES, []);

    const [portions] = prime.mock.calls[0] as unknown as [unknown[]];
    expect(portions.length).toBeGreaterThan(1);
    // One prime call, so one job with many components. Priming twice would
    // create two jobs, which the Loop cannot parallelise against each other.
    expect(prime).toHaveBeenCalledTimes(1);
    expect(executeSkillBundleReview).toHaveBeenCalledTimes(portions.length);
    expect(jobKindPassedToWorkflow()).toBe('ArtifactBundle');
  });

  it('routes a small archive through the artifact-specific workflow branch', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');

    await createArtifactAiStage()(skillArtifact(), RUNTIMES, []);

    const [portions] = prime.mock.calls[0] as unknown as [unknown[]];
    expect(portions).toHaveLength(1);
    expect(jobKindPassedToWorkflow()).toBe('ArtifactBundle');
  });

  it('does not split at all while the flag is off', async () => {
    // Stubbed rather than left to the ambient default. A developer who sets
    // VITE_ARTIFACT_REVIEW_PORTIONS in their own .env.local to exercise the
    // split in the browser would otherwise turn this test green for the wrong
    // reason, and it is the only test that proves the flag still gates.
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', '');

    await createArtifactAiStage()(largeArtifact(), RUNTIMES, []);

    const [portions] = prime.mock.calls[0] as unknown as [unknown[]];
    expect(portions).toHaveLength(1);
    expect(jobKindPassedToWorkflow()).toBe('ArtifactBundle');
  });

  it('does not split on the prompt backend, which has no loop to parallelise', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');
    resolveReviewAiProvider.mockReturnValue('prompt');

    await createArtifactAiStage()(largeArtifact(), RUNTIMES, []);

    // Splitting here would buy N times the model calls and none of the time
    // saving, because nothing runs those calls concurrently.
    expect(executeSkillBundleReview).toHaveBeenCalledTimes(1);
  });

  it('keeps the archive name on the job even when it is split', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');

    await createArtifactAiStage()(largeArtifact(), RUNTIMES, []);

    const [options] = createWorkflowReviewAiPort.mock.calls[0] as unknown as [
      { botName: string },
    ];
    // A portion label here would surface in the job list and in progress text,
    // where the user would read it as a different artifact.
    expect(options.botName).toBe('release-notes-writer');
  });

  it('fails the review when a portion produced no judgement', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');
    executeSkillBundleReview
      .mockResolvedValueOnce(result({ standardEvaluation: { findings: [] } as never }))
      .mockResolvedValue(result({ status: 'partial', error: 'model timeout' }));

    // Reporting a score with part of the archive unreviewed would be exactly
    // the silent loss this split was built to remove.
    await expect(createArtifactAiStage()(largeArtifact(), RUNTIMES, [])).rejects.toThrow(
      /model timeout/i,
    );
  });

  it('reports a finding raised by two portions once, at its worst severity', async () => {
    vi.stubEnv('VITE_ARTIFACT_REVIEW_PORTIONS', 'true');
    // Every portion carries the same SKILL.md, so a finding against it is
    // expected from several portions at once.
    executeSkillBundleReview
      .mockResolvedValueOnce(
        result({
          standardEvaluation: { findings: [{ ...aiFinding, severity: 'low' }] } as never,
        }),
      )
      .mockResolvedValue(
        result({
          standardEvaluation: { findings: [{ ...aiFinding, severity: 'high' }] } as never,
        }),
      );

    const { findings } = await createArtifactAiStage()(largeArtifact(), RUNTIMES, []);

    expect(findings).toHaveLength(1);
    // De-duplicating must never soften a verdict.
    expect(findings[0].severity).toBe('high');
  });
});
