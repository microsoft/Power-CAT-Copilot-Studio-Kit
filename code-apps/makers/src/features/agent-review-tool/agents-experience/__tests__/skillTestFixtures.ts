import type {
  SkillBundle,
  SkillBundleResource,
  SkillBundleReviewResult,
} from "../contracts/SkillBundle";
import type { SkillResourceEvaluation, DeepSkillBundleEvaluation, StandardSkillBundleEvaluation, SkillBundleEvaluation } from "../contracts/SkillEvaluation";
import type { AgentsExperienceReviewPayload, PersistedCopilotReviewPayload, PersistedSkillBundleReview } from "../../contracts/ReviewResult";
import type { GroundedFinding, GroundedSkillFinding } from "../contracts/Findings";
import type { AgentsExperienceModel } from "../contracts/AgentsExperienceModel";
import type { CopilotReviewPersistenceInput } from "../services/skill/persistedSkillReview";

const HASH = "a".repeat(64);

export function textResource(
  path: string,
  content: string,
  overrides: Partial<SkillBundleResource> = {},
): SkillBundleResource {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  const language: SkillBundleResource["language"] =
    extension === ".py" ? "python" :
    extension === ".html" || extension === ".htm" ? "html" :
    extension === ".md" ? "markdown" :
    extension === ".json" ? "json" :
    extension === ".yaml" || extension === ".yml" ? "yaml" : "text";
  const kind: SkillBundleResource["kind"] =
    language === "python" ? "script" :
    language === "html" ? "template" :
    language === "markdown" || language === "text" ? "reference" :
    language === "json" || language === "yaml" ? "data" : "other";

  return {
    id: `resource-${path}`,
    componentIdUnique: `unique-${path}`,
    originalPath: path,
    normalizedPath: path,
    extension,
    kind,
    language,
    sizeBytes: new TextEncoder().encode(content).length,
    sha256: HASH,
    isBinary: false,
    decodeStatus: "decoded",
    textContent: content,
    referencedBy: [],
    analysisStatus: "downloaded",
    chunks: [],
    issues: [],
    ...overrides,
  };
}

export const resource = textResource;

export function bundle(overrides: Partial<SkillBundle> = {}): SkillBundle {
  const resources = overrides.resources ?? [];
  return {
    skillComponentId: "skill-parent",
    skillComponentUniqueId: "skill-parent-unique",
    skillSchemaName: "agent.skill.skill-creator",
    skillName: "skill-creator",
    source: "zip-bundle",
    bundleMarker: "agent.file.bundle",
    skillMarkdown: "---\nname: skill-creator\ndescription: Use when creating skills.\n---\n# Steps",
    skillMarkdownHash: HASH,
    agentInstructions: "Be safe.",
    siblingDescriptions: [],
    manifest: resources.map((item) => ({
      path: item.normalizedPath,
      kind: item.kind,
      language: item.language,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      isBinary: item.isBinary,
      referencedBy: item.referencedBy,
      analysisStatus: item.analysisStatus,
    })),
    resources,
    retrievalIssues: [],
    bundleHash: HASH,
    ...overrides,
  };
}

export function bundleWithDuplicatePaths(): SkillBundle {
  return bundle({
    resources: [
      textResource("scripts/run.py", "print('first')"),
      textResource("Scripts/run.py", "print('second')"),
    ],
  });
}

export function bundleWithLargeResources(): SkillBundle {
  return bundle({
    skillMarkdown: "Run scripts/referenced.py.",
    resources: [
      textResource("scripts/referenced.py", "x".repeat(200)),
      textResource("references/unreferenced.md", "y".repeat(200)),
    ],
  });
}

// ---------------------------------------------------------------------------
// Task 10: Persistence test fixtures
// ---------------------------------------------------------------------------

function makeGroundedFinding(overrides: Partial<GroundedFinding> = {}): GroundedFinding {
  return {
    id: 'TOL-01', family: 'Tools', severity: 'warning',
    title: 'Test finding', fact: 'test evidence', why: 'test', fix: 'fix',
    referenceId: 'ms-agents-overview', ai: false,
    ...overrides,
  };
}

function makeSkillFinding(overrides: Partial<GroundedSkillFinding> = {}): GroundedSkillFinding {
  return {
    id: 'BND-01', family: 'Skills', severity: 'medium',
    title: 'Test finding', fact: 'test evidence', why: 'test', fix: 'fix it',
    referenceId: 'ms-skills-overview', ai: false,
    ruleId: 'BND-01', evidence: 'test evidence', recommendation: 'fix it',
    fixSteps: [{ order: 1, action: 'fix it' }],
    referenceIds: ['ms-skills-overview'], confidence: 'high',
    ...overrides,
  };
}

function makeReviewResult(overrides: Partial<SkillBundleReviewResult> = {}): SkillBundleReviewResult {
  return {
    status: 'complete',
    mode: 'standard',
    skillName: 'skill-creator',
    skillSchemaName: 'agent.skill.skill-creator',
    deterministicFindings: [makeSkillFinding()],
    blocked: false,
    ...overrides,
  };
}

function makeMinimalPayload(
  overrides: Partial<AgentsExperienceReviewPayload> = {},
): AgentsExperienceReviewPayload {
  return {
    model: {
      agentSettings: { instructions: 'Be safe.', raw: {} },
      tools: [], skills: [], connectedAgents: [], knowledge: [],
      evaluationSets: [], testCases: [], multiTurnCases: [],
      triggers: [], unknownKinds: [],
    },
    findings: [makeGroundedFinding()],
    skillEvaluations: [],
    skillBundleReviews: [makeReviewResult()],
    bundleRetrievalIssues: [],
    coverage: [{ name: 'tools', kind: 'Tool', cases: 2 }],
    score: { grounded: 80, passed: 20, warnings: 2, errors: 1, evaluated: 23 },
    ...overrides,
  };
}

/** Payload containing raw resource textContent + SAS URLs that must be stripped. */
export function copilotPayloadWithRawResourceContent(): CopilotReviewPersistenceInput {
  const resourceWithContent = textResource("scripts/run.py", "print('hello world')", {
    analysisStatus: 'completed',
  });
  // Add a fake SAS URL in referencedBy to test URL stripping
  const finding = makeSkillFinding({
    evidence: 'Network call to https://storage.blob.core.windows.net/container?sig=secret123&sv=2023',
  });
  const b = bundle({ resources: [resourceWithContent] });
  const review = makeReviewResult({
    deterministicFindings: [finding],
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });

  return {
    payload: makeMinimalPayload({ skillBundleReviews: [review] }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

/** Payload with repeated info-severity evidence that exceeds the memo limit. */
export function copilotPayloadWithRepeatedInfoEvidence(totalSize: number): CopilotReviewPersistenceInput {
  // Generate enough info findings to push the payload past totalSize
  const infoFindings: GroundedSkillFinding[] = [];
  const evidenceChunk = 'Info finding evidence: ' + 'x'.repeat(100);
  const estimatedFindingSize = JSON.stringify(makeSkillFinding({ severity: 'info', evidence: evidenceChunk })).length;
  const count = Math.ceil(totalSize / estimatedFindingSize) + 50;

  for (let i = 0; i < count; i++) {
    infoFindings.push(makeSkillFinding({
      id: `BND-INFO-${i}`,
      ruleId: `BND-INFO-${i}`,
      severity: 'info',
      evidence: `${evidenceChunk}-${i}`,
      fact: `${evidenceChunk}-${i}`,
    }));
  }

  // Also add one high finding to ensure it survives compaction
  infoFindings.push(makeSkillFinding({
    id: 'BND-HIGH-KEEP',
    ruleId: 'BND-HIGH-KEEP',
    severity: 'high',
    evidence: 'Critical network call',
    fact: 'Critical network call',
  }));

  const b = bundle();
  const review = makeReviewResult({
    deterministicFindings: infoFindings,
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });

  return {
    payload: makeMinimalPayload({ skillBundleReviews: [review] }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

// ---------------------------------------------------------------------------
// Deep review fixtures with nested evidence for sanitization tests
// ---------------------------------------------------------------------------

/** Build a deep review result with secret/SAS evidence injected at every nesting level. */
export function copilotPayloadWithDeepSecretEvidence(): CopilotReviewPersistenceInput {
  const secretEvidence = 'api_key = "sk-supersecret-longvalue" found in config';
  const sasEvidence = 'fetches from https://storage.blob.core.windows.net/data?sig=secret123&sv=2024';
  const longEvidence = 'A'.repeat(300);

  const deepFinding = makeSkillFinding({
    evidence: secretEvidence,
    fact: sasEvidence,
    why: 'Found at https://store.blob.core.windows.net/x?sig=abc',
  });

  const deepResource: SkillResourceEvaluation = {
    resourcePath: 'scripts/run.py',
    status: 'complete',
    riskLevel: 'critical',
    readiness: 'unsupported',
    observedBehaviors: [{ kind: 'network', evidence: sasEvidence }],
    dependencies: [{ name: 'requests', kind: 'pip', evidence: longEvidence }],
    externalEndpoints: [{ value: 'https://api.example.com', evidence: secretEvidence }],
    capabilities: [{ kind: 'secret-access', evidence: secretEvidence }],
    runtimeAssumptions: [{ statement: 'Assumes env vars', evidence: sasEvidence }],
    findings: [deepFinding],
    purposeAlignment: { matches: false, rationale: 'password = "hunter2" in config' },
    analyzedChunks: 1,
    totalChunks: 1,
    referenceIds: ['cwe-78'],
  };

  const deepEval: DeepSkillBundleEvaluation = {
    status: 'complete',
    synthesisLevel: 'final',
    resources: [deepResource],
    crossFileChains: [],
    findings: [deepFinding],
    operationalAssumptions: [{ statement: 'token = "secret-tok-999"', resourcePaths: ['scripts/run.py'] }],
    summary: 'Critical issues found.',
    referenceIds: ['cwe-78'],
  };

  const stdFinding = makeSkillFinding({
    evidence: longEvidence,
    fact: longEvidence,
  });

  const stdEval: StandardSkillBundleEvaluation = {
    status: 'complete',
    dimensions: [{ key: 'Clarity', score: 5, rationale: 'ok' }],
    findings: [stdFinding],
    resourcePurposeAlignment: [{ resourcePath: 'scripts/run.py', matches: false, rationale: 'password = "hunter2"' }],
    operationalAssumptions: [{ statement: 'safe', evidence: secretEvidence }],
    unreviewedResources: [],
    summary: 'Needs work',
    referenceIds: ['ms-skills-create'],
  };

  const b = bundle({ resources: [textResource('scripts/run.py', 'print("hello")', { analysisStatus: 'completed' })] });
  const review = makeReviewResult({
    deterministicFindings: [makeSkillFinding({ evidence: secretEvidence, fact: sasEvidence })],
    standardEvaluation: stdEval,
    deepEvaluation: deepEval,
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
    mode: 'deep',
  });

  return {
    payload: makeMinimalPayload({
      skillBundleReviews: [review],
      findings: [makeGroundedFinding({ fact: sasEvidence })],
    }),
    bundles: [b],
    mode: 'deep',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

// ---------------------------------------------------------------------------
// Task 10 gap-fix fixtures
// ---------------------------------------------------------------------------

/**
 * Payload whose bundle contains duplicate case-insensitive paths long enough
 * to produce a BND-01 integrity finding with evidence > 160 chars.
 * Tests that deterministic.integrity.findings are sanitized before persistence.
 */
export function copilotPayloadWithUnsanitizedIntegrityFindings(): CopilotReviewPersistenceInput {
  // Long enough for the generated path-collision evidence to exceed 160 characters.
  const longPath = `scripts/${'very-long-resource-name-integrity-test-'.repeat(3)}config.py`;

  const b = bundle({
    resources: [
      textResource(longPath, 'print("first")'),
      // Same path with uppercase first letter triggers case-insensitive BND-01 duplicate
      textResource(longPath.replace('scripts/', 'Scripts/'), 'print("second")'),
    ],
  });
  const review = makeReviewResult({
    deterministicFindings: [],
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });
  return {
    payload: makeMinimalPayload({ skillBundleReviews: [review] }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

/**
 * Payload with populated legacy skillEvaluations (SkillBundleEvaluation) that
 * contain raw secrets and SAS URLs in nested safety findings, resource
 * findings, cross-skill conflict evidence, and rationale/summary strings.
 * Tests that every nested field is sanitized before persistence.
 */
export function copilotPayloadWithLegacySkillEvaluations(): CopilotReviewPersistenceInput {
  const secretEvidence = 'api_key = "sk-supersecret-longvalue" found in config.py';
  const sasEvidence = 'reference to https://storage.blob.core.windows.net/data?sig=secret123&sv=2024';
  const longEvidence = 'A'.repeat(200);

  const evaluation: SkillBundleEvaluation = {
    name: 'test-skill',
    descriptionPresent: true,
    descriptionStatesWhen: true,
    descriptionRationale: 'password = "hunter2" improves clarity',
    dimensions: [{ key: 'Clarity', score: 8, rationale: 'api_key = "sk-supersecret-longvalue" in steps' }],
    overallScorePercent: 75,
    band: 'Good',
    sizeLabel: '1 KB',
    structureOk: true,
    safety: {
      flagged: true,
      severity: 'high',
      findings: [{
        id: 'SF-01',
        target: 'config.py',
        category: 'Secret',
        severity: 'high',
        evidence: secretEvidence,
        rationale: 'Hardcoded api_key = "sk-supersecret-longvalue" found.',
        recommendation: 'Use environment variables.',
        reference: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
      }],
    },
    resources: [{
      path: 'scripts/run.py',
      kind: 'script',
      language: 'python',
      declaredPurpose: 'api_key = "sk-supersecret-longvalue" auth',
      matchesSkill: true,
      riskLevel: 'high',
      findings: [{
        id: 'RF-01',
        target: 'scripts/run.py',
        category: 'Network',
        severity: 'medium',
        evidence: longEvidence,
        rationale: 'password = "hunter2" was found in the resource.',
        recommendation: 'Remove hardcoded credentials.',
        reference: 'https://owasp.org/',
      }],
      rationale: 'Outbound calls use password = "hunter2" for auth.',
    }],
    bundleIntegrity: {
      referencedButMissing: [],
      presentButUnreferenced: [],
      progressiveDisclosureOk: true,
      rationale: 'All referenced resources are present.',
    },
    crossSkillConflicts: [{
      withSkill: 'other-skill',
      type: 'overlap',
      evidence: sasEvidence,
      severity: 'warning',
      rationale: 'Both skills use the same https://storage.blob.core.windows.net/data endpoint.',
    }],
    citations: [],
    summary: 'Issues found: api_key = "sk-supersecret-longvalue" and external blob access.',
  };

  const b = bundle();
  const review = makeReviewResult({
    deterministicFindings: [],
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });

  return {
    payload: makeMinimalPayload({
      skillBundleReviews: [review],
      skillEvaluations: [evaluation],
    }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

/**
 * Payload containing a GroundedSkillFinding with custom referenceIds and fixSteps.
 * Used to test that buildReviewViewModel maps fix steps and multiple references correctly.
 */
export function copilotPayloadWithResourceFinding(opts: {
  ruleId: string;
  referenceIds: import('../contracts/references').ReferenceId[];
  fixSteps: Array<{ order: number; action: string }>;
}): AgentsExperienceReviewPayload {
  const finding = makeSkillFinding({
    id: opts.ruleId,
    ruleId: opts.ruleId,
    severity: 'high',
    referenceId: opts.referenceIds[0],
    referenceIds: opts.referenceIds,
    fixSteps: opts.fixSteps,
  });
  return makeMinimalPayload({ findings: [finding] });
}

/**
 * Payload with a deep review result containing a scripts/run.py resource.
 * Used to verify that buildCopilotSkillExportRows strips raw textContent.
 */
export function copilotPayloadWithDeepReviewFixture(): CopilotReviewPersistenceInput {
  const b = bundle({
    resources: [textResource('scripts/run.py', 'print("hello world")', { analysisStatus: 'completed' })],
  });
  const review = makeReviewResult({
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });
  return {
    payload: makeMinimalPayload({ skillBundleReviews: [review] }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

/**
 * Payload where both bundleRetrievalIssues (top-level) and per-bundle
 * retrievalIssues contain SAS URL messages that must be redacted before
 * persistence.
 */
export function copilotPayloadWithSasRetrievalIssues(): CopilotReviewPersistenceInput {
  const sasMessage =
    'Failed to download from https://storage.blob.core.windows.net/skills?sig=secret123&sv=2024&se=2024-01-01';

  const b = bundle({
    retrievalIssues: [
      { code: 'download-failed', message: sasMessage, severity: 'error' },
    ],
  });
  const review = makeReviewResult({
    deterministicFindings: [],
    skillSchemaName: b.skillSchemaName,
    skillName: b.skillName,
  });

  return {
    payload: makeMinimalPayload({
      skillBundleReviews: [review],
      bundleRetrievalIssues: [
        { code: 'bundle-retrieval-failed', message: sasMessage, severity: 'error' },
      ],
    }),
    bundles: [b],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

// ---------------------------------------------------------------------------
// Task 1 (spec 013 remediation): model sanitization fixtures
// ---------------------------------------------------------------------------

/** Secret literal shared by every model-sanitization fixture text surface. */
export const MODEL_SECRET_MARKER = 'sk-model-secret';

/**
 * Full {@link AgentsExperienceModel} with a secret/SAS URL injected into every
 * persisted free-text surface, plus fields that exercise empty-string and
 * undefined-optional edge cases. Used by `sanitizeModelForPersistence` tests.
 */
export function modelWithSecretsEverywhere(): AgentsExperienceModel {
  return {
    agentSettings: {
      instructions:
        `Follow these steps. password="${MODEL_SECRET_MARKER}" then token='${MODEL_SECRET_MARKER}-2'. ` +
        'Visit https://example.com/docs for reference.',
      raw: { nested: { apiKey: 'sk-raw-secret', deeper: { sig: 'sig=model-secret-in-raw' } } },
    },
    tools: [
      {
        name: 'tool-with-secret', schemaname: 'tool.schema.1', kind: 'ConnectorTool',
        displayName: `Tool One password="${MODEL_SECRET_MARKER}"`,
        description: `Calls out using secret="${MODEL_SECRET_MARKER}" internally.`,
      },
      {
        name: 'tool-without-optional-fields', schemaname: 'tool.schema.2', kind: 'McpTool',
        description: '',
      },
    ],
    skills: [
      {
        name: 'skill-with-secret', schemaname: 'skill.schema.1',
        markdown:
          `# Skill\npassword="${MODEL_SECRET_MARKER}"\n` +
          'https://storage.blob.core.windows.net/container?sig=model-secret&sv=2023',
        frontmatterName: `Skill Title secret="${MODEL_SECRET_MARKER}".`,
        frontmatterDescription: `Frontmatter secret="${MODEL_SECRET_MARKER}"`,
        body: `Body token="${MODEL_SECRET_MARKER}" and ordinary text https://example.com/help.`,
        componentId: 'comp-skill-1', componentIdUnique: 'compu-skill-1',
        source: 'inline-markdown', resourceCount: 0,
      },
      {
        name: 'skill-without-optional-fields', schemaname: 'skill.schema.2',
        markdown: '', body: '',
        componentId: 'comp-skill-2', componentIdUnique: 'compu-skill-2',
        source: 'inline-markdown', resourceCount: 0,
      },
    ],
    connectedAgents: [
      {
        name: 'connected-agent-1', schemaname: 'agent.schema.1',
        displayName: 'Connected Agent',
        description: `Uses mixed-case key PassWord="${MODEL_SECRET_MARKER}-mixed-case" for auth.`,
      },
      { name: 'connected-agent-2', schemaname: 'agent.schema.2' },
    ],
    knowledge: [],
    evaluationSets: [
      {
        name: 'eval-set-1', schemaname: 'set.schema.1', graders: ['PromptGrader'],
        displayName: `Eval Set password="${MODEL_SECRET_MARKER}"`,
        graderDetails: [
          {
            kind: 'PromptGrader', configured: true,
            name: `Correctness Judge secret="${MODEL_SECRET_MARKER}".`,
            instructions: `Rubric with secret="${MODEL_SECRET_MARKER}" in it.`,
            labels: [
              {
                name: 'Pass',
                description: `Label desc secret="${MODEL_SECRET_MARKER}".`,
                outcome: `Outcome token="${MODEL_SECRET_MARKER}".`,
              },
              { name: 'Fail' },
            ],
          },
          // Ordinary (non-secret) grader name must pass through unchanged.
          { kind: 'ToolCallGrader', configured: true, name: 'target_tool_schema_name' },
          // No `name` at all: must stay undefined, not become ''.
          { kind: 'ContainsAnyGrader', configured: true },
        ],
      },
      { name: 'eval-set-2', schemaname: 'set.schema.2', graders: [] },
    ],
    testCases: [
      {
        name: 'case-with-secret', schemaname: 'case.schema.1',
        input: `User says secret="${MODEL_SECRET_MARKER}" please help.`,
        expected: `Agent responds without leaking token="${MODEL_SECRET_MARKER}".`,
        expectedKeywords: ['keyword-one', `contains secret="${MODEL_SECRET_MARKER}" too`],
      },
      { name: 'case-without-optional-fields', schemaname: 'case.schema.2' },
    ],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [
      {
        schemaname: 'unknown.schema.1', componenttype: '99',
        warning: `Unhandled component; token="${MODEL_SECRET_MARKER}" present.`,
      },
    ],
  };
}

/** Minimal Microsoft Copilot harness persistence input whose model carries secrets on every text surface. */
export function copilotPayloadWithSecretsInModel(): CopilotReviewPersistenceInput {
  return {
    payload: makeMinimalPayload({
      model: modelWithSecretsEverywhere(),
      skillBundleReviews: [],
    }),
    bundles: [],
    mode: 'standard',
    startedAt: '2026-07-14T00:00:00Z',
    completedAt: '2026-07-14T00:01:00Z',
  };
}

// ---------------------------------------------------------------------------
// Task 12 review-fix fixtures
// ---------------------------------------------------------------------------

/** Minimal PersistedSkillBundleReview carrying only the fields needed by buildFindingExportRows. */
function makeMinimalPersistedBundleReview(
  skillName: string,
  findings: GroundedSkillFinding[],
): PersistedSkillBundleReview {
  return { skillName, findings } as unknown as PersistedSkillBundleReview;
}

/**
 * Build a minimal PersistedCopilotReviewPayload for buildFindingExportRows tests.
 *
 * @param opts.topLevelFindings - Authoritative findings (what the page renders).
 * @param opts.skillBundleFindings - Per-bundle findings for skill attribution.
 */
export function buildPersistedPayloadForFindingExport(opts: {
  topLevelFindings: Array<GroundedFinding | GroundedSkillFinding>;
  skillBundleFindings?: Array<{ skillName: string; findings: GroundedSkillFinding[] }>;
}): PersistedCopilotReviewPayload {
  const minimalModel: AgentsExperienceReviewPayload['model'] = {
    agentSettings: { instructions: '', raw: {} },
    tools: [], skills: [], connectedAgents: [], knowledge: [],
    evaluationSets: [], testCases: [], multiTurnCases: [],
    triggers: [], unknownKinds: [],
  };
  return {
    model: minimalModel,
    findings: opts.topLevelFindings,
    skillEvaluations: [],
    coverage: [],
    score: { grounded: 100, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
    skillBundleReviews: (opts.skillBundleFindings ?? []).map(b =>
      makeMinimalPersistedBundleReview(b.skillName, b.findings),
    ),
    skillReviewMode: 'standard',
    persistenceIssues: [],
  };
}
