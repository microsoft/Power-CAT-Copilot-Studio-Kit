import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  composeReview,
  prepareReview,
  readWorkflowResults,
  type BotComponent,
  type FinalizationSnapshot,
  type Guid,
  type PrepareReviewPorts,
  type ReviewJobItemRow,
  type ReviewSourceSnapshot,
} from '../index.js';

const guid = (value: string): Guid => value as Guid;

const component: BotComponent = {
  botcomponentid: 'skill-component',
  botid: 'bot-id',
  componenttype: '9',
  content: '',
  data: `kind: InlineAgentSkill
content: |
  ---
  name: sample-skill
  description: Use when a user needs a careful sample workflow.
  ---
  # Sample skill
  Follow the documented sample workflow.`,
  name: 'sample-skill',
  componentidunique: 'skill-component-unique',
  schemaname: 'sample.skill',
};

const source: ReviewSourceSnapshot = {
  configuration: JSON.stringify({
    agentSettings: {
      instructions: 'Help users with the documented sample workflow.',
      rawSecret: 'password=do-not-serialize',
    },
  }),
  components: [component],
  resources: [],
};

const input = {
  botId: guid('00000000-0000-4000-8000-000000000001'),
  botName: 'Sample agent',
  componentIdUnique: guid('00000000-0000-4000-8000-000000000002'),
  sourceEnvironmentId: guid('00000000-0000-4000-8000-000000000003'),
  sourceEnvironmentName: 'Sample environment',
  startedAt: '2026-08-23T00:00:00.000Z',
};

const fixedPorts: PrepareReviewPorts = {
  clock: { now: () => new Date('2026-08-23T00:01:00.000Z') },
  ids: {
    randomUUID: () => guid('00000000-0000-4000-8000-000000000004'),
  },
  hash: {
    sha256: async (bytes) => `sha256-${bytes.length}`,
  },
};

const standardRow = (
  overrides: Partial<ReviewJobItemRow> = {},
): ReviewJobItemRow => ({
  cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000010'),
  cat_skillname: 'sample-skill',
  cat_componentindex: 0,
  createdon: '2026-08-23T00:02:00.000Z',
  cat_resultjson: JSON.stringify({
    skillName: 'sample-skill',
    status: 'complete',
    dimensions: [
      { key: 'Clarity', score: 9, rationale: 'Clear.' },
      { key: 'Actionability', score: 9, rationale: 'Actionable.' },
      { key: 'Scope discipline', score: 9, rationale: 'Scoped.' },
      { key: 'Composability', score: 9, rationale: 'Composable.' },
    ],
    findings: [],
    resourcePurposeAlignment: [],
    operationalAssumptions: [],
    unreviewedResources: [],
    summary: 'Complete.',
  }),
  ...overrides,
});

function allTypeScriptFiles(url: URL): string[] {
  const directory = fileURLToPath(url);
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}\\${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...allTypeScriptFiles(new URL(`${entry.name}/`, url)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('shared review operations', () => {
  it('prepares the characterized model, rules, bundles, and corpus', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);

    expect(prepared.correlationId).toBe(fixedPorts.ids.randomUUID());
    expect(prepared.componentCount).toBe(1);
    expect(prepared.corpus.components).toHaveLength(1);
    expect(prepared.corpus.finalizationSnapshot.version).toBe(1);
    expect(prepared.corpus.finalizationSnapshot.coreVersion)
      .toBe('0.1.0-modern-review.0');
    expect(prepared.corpus.finalizationSnapshot.sourceRevision).toBe('4fd618cd');
    expect(prepared.corpus.finalizationSnapshot.model.agentSettings.raw).toEqual({});
    expect(JSON.stringify(prepared.corpus.finalizationSnapshot))
      .not.toContain('do-not-serialize');
  });

  it('does not import host-only modules', () => {
    const files = allTypeScriptFiles(new URL('../', import.meta.url));
    const packageSource = files.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(packageSource).not.toMatch(
      /@microsoft\/power-apps|generated\/services|@modelcontextprotocol|react|localStorage|new File/,
    );
  });

  it('keeps newest usable component and stage rows and rejects reserved resource rows', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);
    const old = standardRow({
      cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000011'),
      createdon: '2026-08-23T00:01:00.000Z',
    });
    const malformed = standardRow({
      cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000012'),
      createdon: '2026-08-23T00:03:00.000Z',
      cat_resultjson: '{',
    });
    const resource = standardRow({
      cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000013'),
      cat_componentindex: 1000,
    });

    const results = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [malformed, resource, old, standardRow()],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'unavailable',
    });

    expect(results.skillResults).toHaveLength(1);
    expect(results.discardedDuplicateItemIds).toContain(old.cat_agentreviewjobitemid);
    expect(results.rejectedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: malformed.cat_agentreviewjobitemid }),
      expect.objectContaining({ itemId: resource.cat_agentreviewjobitemid }),
    ]));
    expect(results.orchestration).toEqual({
      state: 'unavailable',
      reason: 'missing-row',
    });
    expect(results.instructionCoverage).toEqual({
      state: 'unavailable',
      reason: 'missing-row',
    });
  });

  it('classifies malformed 9000 and 9001 rows as unavailable', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);
    const orchestration = standardRow({
      cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000014'),
      cat_componentindex: 9000,
      cat_resultjson: '{',
    });
    const instructionCoverage = standardRow({
      cat_agentreviewjobitemid: guid('00000000-0000-4000-8000-000000000015'),
      cat_componentindex: 9001,
      cat_resultjson: 'null',
    });

    const results = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [orchestration, instructionCoverage],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'unavailable',
    });

    expect(results.orchestration).toEqual({
      state: 'unavailable',
      reason: 'malformed-row',
    });
    expect(results.instructionCoverage).toEqual({
      state: 'unavailable',
      reason: 'malformed-row',
    });
  });

  it('never uses stage fallback for a missing standard skill result', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);
    const fallbackAi = {
      invokeCrossSkillOrchestrator: vi.fn(async () => ({
        evaluation: {
          status: 'complete' as const,
          findings: [],
          summary: '',
          referenceIds: [],
        },
        issues: [],
      })),
      invokeInstructionCoverage: vi.fn(async () => ({
        elements: [
          { key: 'role' as const, present: false, evidence: '' },
          { key: 'tone' as const, present: false, evidence: '' },
          { key: 'boundaries' as const, present: false, evidence: '' },
          { key: 'ambiguity' as const, present: false, evidence: '' },
          { key: 'escalation' as const, present: false, evidence: '' },
        ],
        citationIds: [{ id: 'ms-authoring-instructions' as const }],
      })),
    };

    const results = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'fallback',
    }, { fallbackAi });

    expect(results.skillResults).toEqual([]);
    expect(fallbackAi.invokeCrossSkillOrchestrator).toHaveBeenCalledTimes(1);
    expect(fallbackAi.invokeInstructionCoverage).toHaveBeenCalledTimes(1);
    expect(results.orchestration.state).toBe('complete');
    expect(results.instructionCoverage.state).toBe('complete');
  });

  it('classifies failed stage fallback without failing workflow normalization', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);
    const fallbackAi = {
      invokeCrossSkillOrchestrator: vi.fn(async () => {
        throw new Error('unavailable');
      }),
      invokeInstructionCoverage: vi.fn(async () => {
        throw new Error('unavailable');
      }),
    };

    const results = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'fallback',
    }, { fallbackAi });

    expect(results.orchestration).toEqual({
      state: 'failed',
      reason: 'fallback-failed',
    });
    expect(results.instructionCoverage).toEqual({
      state: 'failed',
      reason: 'fallback-failed',
    });
  });

  it('rejects fallback policy without a fallback AI port', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);

    await expect(readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'fallback',
    })).rejects.toThrow('fallbackAi');
  });

  it('salvages a failed foreach when a usable component row exists', async () => {
    const prepared = await prepareReview(input, source, fixedPorts);

    const workflow = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'failed',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: 'One foreach iteration failed.',
      },
      rows: [standardRow()],
      snapshot: prepared.corpus.finalizationSnapshot,
      missingAiStagePolicy: 'unavailable',
    });

    expect(workflow.disposition).toBe('salvaged-partial');
  });

  it('reconstructs persisted resource metrics after snapshot serialization', async () => {
    const resourceSource: ReviewSourceSnapshot = {
      ...source,
      components: [{
        ...component,
        data: `${component.data}
  Read [the guide](guide.md) and [the required notes](empty.txt).`,
      }],
      resources: [
        {
          row: {
            botcomponentid: 'guide-resource',
            componentidunique: 'guide-resource-unique',
            parentbotid: 'bot-id',
            parentbotcomponentid: 'skill-component',
            name: 'guide.md',
            schemaname: 'sample.skill.guide',
            componenttype: 13,
            componentstate: 0,
            statecode: 0,
            statuscode: 1,
            versionnumber: 1,
            modifiedon: '2026-08-23T00:00:00.000Z',
          },
          bytes: new TextEncoder().encode('A useful resource.'),
        },
        {
          row: {
            botcomponentid: 'empty-resource',
            componentidunique: 'empty-resource-unique',
            parentbotid: 'bot-id',
            parentbotcomponentid: 'skill-component',
            name: 'empty.txt',
            schemaname: 'sample.skill.empty',
            componenttype: 13,
            componentstate: 0,
            statecode: 0,
            statuscode: 1,
            versionnumber: 1,
            modifiedon: '2026-08-23T00:00:00.000Z',
          },
          bytes: new Uint8Array(),
        },
      ],
    };
    const prepared = await prepareReview(input, resourceSource, fixedPorts);
    const expectedStats = prepared.corpus.finalizationSnapshot
      .bundles[0].resourceStats;
    expect(expectedStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceId: 'guide-resource',
        textLength: 'A useful resource.'.length,
        chunkCount: 0,
        isEmpty: false,
      }),
      expect.objectContaining({
        resourceId: 'empty-resource',
        textLength: 0,
        chunkCount: 0,
        isEmpty: true,
      }),
    ]));
    const snapshot = JSON.parse(
      JSON.stringify(prepared.corpus.finalizationSnapshot),
    ) as FinalizationSnapshot;
    expect(snapshot.bundles[0].resourceStats).toEqual(expectedStats);
    const workflow = await readWorkflowResults({
      job: {
        jobId: guid('00000000-0000-4000-8000-000000000020'),
        correlationId: prepared.correlationId,
        status: 'succeeded',
        completedAt: '2026-08-23T00:03:00.000Z',
        errorMessage: null,
      },
      rows: [standardRow()],
      snapshot,
      missingAiStagePolicy: 'unavailable',
    });

    const completed = await composeReview({ snapshot, workflow });

    expect(JSON.parse(completed.persisted.json)).toEqual(completed.persisted.payload);
    expect(completed.persisted.payload.skillBundleReviews[0].coverage)
      .toEqual(expect.objectContaining({
        resourcesTotal: 2,
        chunksTotal: 0,
      }));
    expect(
      completed.persisted.payload.skillBundleReviews[0]
        .deterministic.integrity.findings,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'BND-03',
        resourcePath: 'empty.txt',
      }),
    ]));
    expect(completed.record.cat_reviewresultjson).toContain('"execution"');
    expect(completed.review.durationMs).toBe(180_000);
  });
});
