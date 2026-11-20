import { describe, expect, it, vi } from "vitest";
import {
  executeDeepSkillReview,
  type DeepSkillReviewDependencies,
} from "../services/skill/DeepSkillReviewOrchestrator";
import { mapWithConcurrency } from "../services/skill/concurrency";
import { mergeBatchFileResults } from "../services/skill/deepReviewHelpers";
import { bundle, textResource } from "./skillTestFixtures";
import type { SkillReviewProgress, ResourceChunk } from "../contracts/SkillBundle";
import type {
  StandardSkillBundleEvaluation,
  ResourceChunkEvaluation,
  SkillResourceEvaluation,
  DeepSkillBundleEvaluation,
} from "../contracts/SkillEvaluation";
import type { ResourcePromptPayload, FileSynthesisPromptPayload } from "../services/skill/SkillPromptPayloadBuilder";
import type { ChunkValidationResult, ResourceValidationResult, DeepBundleValidationResult } from "../services/skill/SkillEvaluationValidator";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const standardEvaluation: StandardSkillBundleEvaluation = {
  status: "complete",
  dimensions: [
    { key: "Clarity", score: 8, rationale: "Clear." },
    { key: "Actionability", score: 8, rationale: "Actionable." },
    { key: "Scope discipline", score: 8, rationale: "Bounded." },
    { key: "Composability", score: 8, rationale: "Compatible." },
  ],
  findings: [],
  resourcePurposeAlignment: [],
  operationalAssumptions: [],
  unreviewedResources: [],
  summary: "Valid.",
  referenceIds: [],
};

const chunkEvaluation = (
  resourcePath: string,
  chunkId: string,
): ResourceChunkEvaluation => ({
  resourcePath,
  chunkId,
  status: "complete",
  observedBehaviors: [],
  dependencies: [],
  externalEndpoints: [],
  capabilities: [],
  runtimeAssumptions: [],
  findings: [],
  purposeAlignment: { matches: true, rationale: "Matches declared purpose." },
  referenceIds: [],
});

function makeResourceEvaluation(
  resourcePath: string,
  totalChunks: number,
): SkillResourceEvaluation {
  return {
    resourcePath,
    status: "complete",
    riskLevel: "none",
    readiness: "ready",
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: true, rationale: "Aligned." },
    analyzedChunks: totalChunks,
    totalChunks,
    referenceIds: [],
  };
}

function makeDeepBundleEvaluation(
  resourcePaths: string[],
): DeepSkillBundleEvaluation {
  return {
    status: "complete",
    synthesisLevel: "final",
    resources: resourcePaths.map((p) => makeResourceEvaluation(p, 1)),
    crossFileChains: [],
    findings: [],
    operationalAssumptions: [],
    summary: "Deep synthesis complete.",
    referenceIds: [],
  };
}

function createDeepTestDependencies(
  options: { rejectChunkForPath?: string } = {},
): DeepSkillReviewDependencies {
  return {
    ai: {
      invokeSkillResourceChunkEvaluator: vi.fn(
        async (
          _payload: ResourcePromptPayload,
          chunk: ResourceChunk,
        ): Promise<ChunkValidationResult> => {
          if (
            options.rejectChunkForPath &&
            chunk.resourcePath === options.rejectChunkForPath
          ) {
            throw new Error(`Simulated failure for ${chunk.resourcePath}`);
          }
          return {
            findings: [],
            issues: [],
          };
        },
      ),
      invokeSkillFileSynthesizer: vi.fn(
        async (
          payload: FileSynthesisPromptPayload,
        ): Promise<ResourceValidationResult> => {
          const metadata = JSON.parse(payload.resource_metadata_json) as { path: string };
          return {
            evaluation: makeResourceEvaluation(metadata.path, 1),
            issues: [],
          };
        },
      ),
      invokeDeepSkillBundleSynthesizer: vi.fn(
        async (): Promise<DeepBundleValidationResult> => ({
          evaluation: makeDeepBundleEvaluation([]),
          issues: [],
        }),
      ),
    },
    deepProvisioned: true,
  };
}

// ---------------------------------------------------------------------------
// mapWithConcurrency tests
// ---------------------------------------------------------------------------

describe("mapWithConcurrency", () => {
  it("never runs more than four AI calls concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const ai = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return chunkEvaluation("scripts/run.py", "scripts-run-py-0");
    };
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, ai);
    expect(maxActive).toBe(4);
  });

  it("marks unscheduled work cancelled after abort", async () => {
    const controller = new AbortController();
    let started = 0;
    const results = await mapWithConcurrency(
      Array.from({ length: 6 }, (_, index) => index),
      2,
      async (item) => {
        started += 1;
        if (started === 2) controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 5));
        return item;
      },
      controller.signal,
    );
    expect(results.filter((item) => item.status === "cancelled")).toHaveLength(4);
  });

  it("returns fulfilled results in order", async () => {
    const items = [10, 20, 30];
    const results = await mapWithConcurrency(items, 2, async (x) => x * 2);
    expect(results).toEqual([
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 40 },
      { status: "fulfilled", value: 60 },
    ]);
  });

  it("captures rejected promises without stopping other work", async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 3, async (x) => {
      if (x === 2) throw new Error("boom");
      return x;
    });
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toEqual({ status: "rejected", reason: expect.any(Error) });
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("throws on non-positive limit", async () => {
    await expect(mapWithConcurrency([], 0, async () => null)).rejects.toThrow(
      "Concurrency limit must be a positive integer",
    );
  });
});

describe("mergeBatchFileResults", () => {
  it("keeps the file partial when any P2-F batch is partial", () => {
    const partialEvaluation = {
      ...makeResourceEvaluation("scripts/run.py", 2),
      status: "partial" as const,
    };

    const result = mergeBatchFileResults(
      [{ evaluation: partialEvaluation, issues: [] }],
      "scripts/run.py",
      2,
      2,
    );

    expect(result.status).toBe("partial");
  });
});

// ---------------------------------------------------------------------------
// executeDeepSkillReview tests
// ---------------------------------------------------------------------------

describe("executeDeepSkillReview", () => {
  it("passes complete validated chunk evaluations to P2-F", async () => {
    let chunkResultsJson = "";
    const deps: DeepSkillReviewDependencies = {
      ai: {
        invokeSkillResourceChunkEvaluator: vi.fn(async (_payload, chunk) => {
          const evaluation = {
            ...chunkEvaluation(chunk.resourcePath, chunk.chunkId),
            observedBehaviors: [
              { kind: "data-transform", evidence: chunk.content.slice(0, 20) },
            ],
          };
          return {
            evaluation,
            findings: evaluation.findings,
            issues: [],
          } as ChunkValidationResult & { evaluation: ResourceChunkEvaluation };
        }),
        invokeSkillFileSynthesizer: vi.fn(async (payload) => {
          chunkResultsJson = payload.chunk_results_json;
          const metadata = JSON.parse(payload.resource_metadata_json) as { path: string };
          return {
            evaluation: makeResourceEvaluation(metadata.path, 2),
            issues: [],
          };
        }),
        invokeDeepSkillBundleSynthesizer: vi.fn(async () => ({
          evaluation: makeDeepBundleEvaluation([]),
          issues: [],
        })),
      },
      deepProvisioned: true,
    };
    const longScript = Array.from(
      { length: 1_200 },
      (_, index) => `def function_${index}():\n    return ${index}\n`,
    ).join("\n");

    await executeDeepSkillReview(
      bundle({ resources: [textResource("scripts/large.py", longScript)] }),
      standardEvaluation,
      deps,
      vi.fn(),
    );

    const chunkResults = JSON.parse(chunkResultsJson) as ResourceChunkEvaluation[];
    expect(chunkResults.length).toBeGreaterThan(1);
    expect(chunkResults[0].observedBehaviors).toEqual([
      expect.objectContaining({ kind: "data-transform" }),
    ]);
  });
  it("returns failed status when deep prompts are not provisioned", async () => {
    const testBundle = bundle({
      resources: [textResource("scripts/a.py", "def a():\n    return 1")],
    });
    const deps: DeepSkillReviewDependencies = {
      ...createDeepTestDependencies(),
      deepProvisioned: false,
    };
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(result.status).toBe("failed");
    expect(result.parseError).toBe("DEEP_UNAVAILABLE");
  });

  it("completes a single-resource bundle end-to-end", async () => {
    const testBundle = bundle({
      resources: [textResource("scripts/a.py", "def a():\n    return 1")],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(result.status).toBe("complete");
    expect(result.resources.length).toBe(1);
    expect(result.resources[0].resourcePath).toBe("scripts/a.py");
  });

  it("marks the bundle partial when a single chunk is partial", async () => {
    const deps = createDeepTestDependencies();
    deps.ai.invokeSkillResourceChunkEvaluator = vi.fn(async (_payload, chunk) => {
      const evaluation = {
        ...chunkEvaluation(chunk.resourcePath, chunk.chunkId),
        status: "partial" as const,
      };
      return {
        evaluation,
        findings: [],
        issues: [],
      };
    });

    const result = await executeDeepSkillReview(
      bundle({
        resources: [textResource("scripts/a.py", "def a():\n    return 1")],
      }),
      standardEvaluation,
      deps,
      vi.fn(),
    );

    expect(result.status).toBe("partial");
    expect(result.resources[0].status).toBe("partial");
  });

  it("completes partially when one chunk prompt fails", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/a.py", "def a():\n    return 1"),
        textResource("scripts/b.py", "def b():\n    return 2"),
      ],
    });
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      createDeepTestDependencies({ rejectChunkForPath: "scripts/b.py" }),
      vi.fn(),
    );
    expect(result.status).toBe("partial");
    expect(
      result.resources.some(
        (item) => item.status === "partial" || item.status === "failed",
      ),
    ).toBe(true);
  });

  it("progress never moves backward and names the active resource", async () => {
    const events: SkillReviewProgress[] = [];
    await executeDeepSkillReview(
      bundle({
        resources: [textResource("scripts/a.py", "def a():\n    return 1")],
      }),
      standardEvaluation,
      createDeepTestDependencies(),
      (event) => events.push(event),
    );
    expect(
      events.every(
        (event, index) =>
          index === 0 || event.percent >= events[index - 1].percent,
      ),
    ).toBe(true);
    expect(events.some((event) => event.resourcePath)).toBe(true);
  });

  it("skips binary resources", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/a.py", "def a():\n    return 1"),
        {
          ...textResource("assets/logo.png", ""),
          isBinary: true,
          textContent: undefined,
          decodeStatus: "binary" as const,
        },
      ],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(result.status).toBe("partial");
    const binaryResult = result.resources.find(
      (r) => r.resourcePath === "assets/logo.png",
    );
    expect(binaryResult?.status).toBe("skipped");
  });

  it("respects AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const testBundle = bundle({
      resources: [textResource("scripts/a.py", "def a():\n    return 1")],
    });
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      createDeepTestDependencies(),
      vi.fn(),
      controller.signal,
    );
    expect(result.status).toBe("cancelled");
  });

  it("never invokes AI with concurrency greater than 4", async () => {
    let active = 0;
    let maxActive = 0;
    const deps: DeepSkillReviewDependencies = {
      ai: {
        invokeSkillResourceChunkEvaluator: vi.fn(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return { findings: [], issues: [] };
        }),
        invokeSkillFileSynthesizer: vi.fn(async (payload) => {
          const meta = JSON.parse(payload.resource_metadata_json) as { path: string };
          return { evaluation: makeResourceEvaluation(meta.path, 1), issues: [] };
        }),
        invokeDeepSkillBundleSynthesizer: vi.fn(async () => ({
          evaluation: makeDeepBundleEvaluation([]),
          issues: [],
        })),
      },
      deepProvisioned: true,
    };
    // Create many small resources to generate many chunks
    const resources = Array.from({ length: 8 }, (_, i) =>
      textResource(`scripts/file${i}.py`, `def fn${i}():\n    return ${i}`),
    );
    await executeDeepSkillReview(
      bundle({ resources }),
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("skips resources with failed decode status", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/a.py", "def a():\n    return 1"),
        {
          ...textResource("scripts/broken.py", ""),
          decodeStatus: "failed" as const,
          textContent: undefined,
        },
      ],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    const broken = result.resources.find(
      (r) => r.resourcePath === "scripts/broken.py",
    );
    expect(broken?.status).toBe("skipped");
  });

  it("does not send resources with high/critical findings to AI", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/safe.py", "def safe():\n    return 1"),
        textResource("scripts/dangerous.py", "import os\nos.system('rm -rf /')"),
      ],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    // Deep coverage is partial because the high-risk resource is intentionally excluded from AI.
    expect(result.status).toBe("partial");
    // Dangerous resource is skipped (high-risk exclusion)
    const dangerous = result.resources.find(
      (r) => r.resourcePath === "scripts/dangerous.py",
    );
    expect(dangerous?.status).toBe("skipped");
    // Safe resource is processed
    const safe = result.resources.find(
      (r) => r.resourcePath === "scripts/safe.py",
    );
    expect(safe?.status).toBe("complete");
  });

  // -------------------------------------------------------------------------
  // Path-normalization security gate: originalPath !== normalizedPath
  // -------------------------------------------------------------------------

  it("gates high-risk resource when originalPath has ./ prefix (no AI call)", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/safe.py", "def safe():\n    return 1"),
        textResource("scripts/dangerous.py", "import os\nos.system('rm -rf /')", {
          originalPath: "./scripts/dangerous.py",
        }),
      ],
    });
    const deps = createDeepTestDependencies();
    const chunkEvaluator = deps.ai.invokeSkillResourceChunkEvaluator as ReturnType<typeof vi.fn>;
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(result.status).toBe("partial");
    // Dangerous resource must be skipped even though originalPath differs
    const dangerous = result.resources.find(
      (r) => r.resourcePath === "scripts/dangerous.py",
    );
    expect(dangerous?.status).toBe("skipped");
    // AI was never called with dangerous resource content
    for (const call of chunkEvaluator.mock.calls) {
      const payload = call[0] as ResourcePromptPayload;
      const meta = JSON.parse(payload.resource_metadata_json) as { path: string };
      expect(meta.path).not.toBe("scripts/dangerous.py");
    }
  });

  it("gates high-risk resource when originalPath has backslash separators", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/safe.py", "def safe():\n    return 1"),
        textResource("scripts/dangerous.py", "import os\nos.system('rm -rf /')", {
          originalPath: "scripts\\dangerous.py",
        }),
      ],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    const dangerous = result.resources.find(
      (r) => r.resourcePath === "scripts/dangerous.py",
    );
    expect(dangerous?.status).toBe("skipped");
  });

  it("gates high-risk resource when originalPath is percent-encoded", async () => {
    const testBundle = bundle({
      resources: [
        textResource("scripts/dangerous.py", "import os\nos.system('rm -rf /')", {
          originalPath: "scripts%2Fdangerous.py",
        }),
      ],
    });
    const deps = createDeepTestDependencies();
    const result = await executeDeepSkillReview(
      testBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    const dangerous = result.resources.find(
      (r) => r.resourcePath === "scripts/dangerous.py",
    );
    expect(dangerous?.status).toBe("skipped");
  });

  it("forwards deterministic findings to P2-R when originalPath differs from normalizedPath", async () => {
    // Resource with a medium-severity remote-resource finding (eligible, not gated)
    // but originalPath has ./.
    const safeBundle = bundle({
      resources: [
        textResource("templates/panel.html", '<img src="https://example.test/panel.png">', {
          originalPath: "./templates/panel.html",
        }),
      ],
    });
    const deps = createDeepTestDependencies();
    const chunkEvaluator = deps.ai.invokeSkillResourceChunkEvaluator as ReturnType<typeof vi.fn>;
    const result = await executeDeepSkillReview(
      safeBundle,
      standardEvaluation,
      deps,
      vi.fn(),
    );
    expect(result.status).toBe("complete");
    // Verify the chunk evaluator was called and received deterministic findings
    expect(chunkEvaluator).toHaveBeenCalled();
    const payload = chunkEvaluator.mock.calls[0][0] as ResourcePromptPayload;
    const findings = JSON.parse(payload.deterministic_findings_json) as unknown[];
    // HTML-REMOTE-01 (medium) must be forwarded despite originalPath mismatch.
    expect(findings.length).toBeGreaterThan(0);
  });
});
