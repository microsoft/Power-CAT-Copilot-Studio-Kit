/**
 * Skill bundle persistence projection and sanitization (Task 10).
 *
 * Projects transient Task 8/9 execution results into the exact persisted
 * contracts. Strips raw source, text content, SAS URLs, prompt payloads,
 * hidden reasoning, and secret values. Sanitizes every persisted finding
 * and observation at every nesting level. Evidence/fact ≤160 chars.
 * Compacts until ≤ maxChars in priority order. Never silently drops
 * protected findings.
 */
import type { GroundedFinding, GroundedSkillFinding } from '../../contracts/Findings';
import type { ReferenceId } from '../../contracts/references';
import { REFERENCES } from '../../contracts/references';
import type {
  SkillBundle,
  SkillBundleResource,
  SkillReviewMode,
  RetrievalIssue,
  SkillBundleScores,
  SkillBundleReviewResult,
} from '../../contracts/SkillBundle';
import type {
  StandardSkillBundleEvaluation,
  DeepSkillBundleEvaluation,
  SkillResourceEvaluation,
  SkillBundleEvaluation,
  CrossSkillOrchestrationEvaluation,
} from '../../contracts/SkillEvaluation';
import type {
  AgentsExperienceReviewPayload,
  PersistedResourceManifest,
  PersistedSkillBundleReview,
  PersistedCopilotReviewPayload,
  PersistedCopilotReviewResult,
} from '../../../contracts/ReviewResult';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import { analyzeBundleIntegrity, type BundleIntegrityResult } from './bundleIntegrity';
import { calculateSkillBundleScores, type SkillBundleScoringInput } from './skillBundleScoring';
import { AI_MODEL_IDS } from '../../../contracts/Constants';
import { sanitizeFindingEvidence, redactSecrets } from './resourceScanners';
import { computeResourceReviewCoverage, getResourceReviewAssessment } from './resourceReviewCoverage';
import {
  redactCopilotGuidance, withCopilotFindingGuidance, type CopilotGuidanceContext,
} from '../copilotContextualGuidance';
import { modelWithCapturedSkillText } from '../copilotSkillCapture';
import { readCopilotAiNarrative, readInstructionFindingNarrative } from '../copilotAiNarrative';
import { WORKFLOW_SERVED_MODEL_ID } from '../ai-providers/reviewAiPortCore';

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** Input to buildPersistedCopilotReview. Combines runtime payload with bundle context. */
export interface CopilotReviewPersistenceInput {
  payload: AgentsExperienceReviewPayload;
  bundles: SkillBundle[];
  mode: SkillReviewMode;
  startedAt: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EVIDENCE_CHARS = 160;
const MAX_SKILL_DEFINITION_SOURCE_CHARS = 64_000;

// ---------------------------------------------------------------------------
// Sanitization helpers (reuse sanitizeFindingEvidence from resourceScanners)
// ---------------------------------------------------------------------------

/** Sanitize an evidence/fact field to ≤160 chars with secret + SAS redaction. */
const sanitizeEvidenceField = (text: string): string => sanitizeFindingEvidence(text, MAX_EVIDENCE_CHARS);

/** Redact secrets and SAS URLs from non-evidence text without truncating. */
const redactField = redactSecrets;

/**
 * Redact an optional free-text field. Preserves `undefined` for fields that
 * were never populated so persistence doesn't fabricate empty strings, but
 * still redacts (and preserves) genuinely empty strings.
 */
const redactOptional = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : redactSecrets(value);

/**
 * Project the complete Microsoft Copilot harness {@link AgentsExperienceModel} into a
 * persistence-safe copy: redacts secrets/SAS URLs from every free-text
 * surface and discards `agentSettings.raw` (unbounded, unvetted maker JSON)
 * entirely. Does not mutate `model` — every modified branch is a fresh
 * object/array so the caller's runtime payload remains usable for reopen.
 * Structural identifiers (`name`/`schemaname`/`kind`/`componentId`, and
 * `AeGrader.labels[].name`, the outcome bucket's key) are left untouched;
 * only maker-authored prose is redacted.
 */
function sanitizeModelForPersistence(model: AgentsExperienceModel): AgentsExperienceModel {
  return {
    ...model,
    agentSettings: {
      ...model.agentSettings,
      instructions: redactSecrets(model.agentSettings.instructions),
      raw: {},
    },
    tools: model.tools.map(tool => ({
      ...tool,
      displayName: redactOptional(tool.displayName),
      description: redactOptional(tool.description),
    })),
    skills: model.skills.map(skill => ({
      ...skill,
      markdown: redactSecrets(skill.markdown),
      body: redactSecrets(skill.body),
      frontmatterName: redactOptional(skill.frontmatterName),
      frontmatterDescription: redactOptional(skill.frontmatterDescription),
    })),
    connectedAgents: model.connectedAgents.map(agent => ({
      ...agent,
      displayName: redactOptional(agent.displayName),
      description: redactOptional(agent.description),
    })),
    evaluationSets: model.evaluationSets.map(set => ({
      ...set,
      displayName: redactOptional(set.displayName),
      graderDetails: set.graderDetails?.map(grader => ({
        ...grader,
        // PromptGrader's `name` is maker-supplied free text (ToolCallGrader
        // reuses the same field for a tool identifier, but redacting an
        // identifier that happens to contain no secret pattern is a no-op).
        name: redactOptional(grader.name),
        instructions: redactOptional(grader.instructions),
        // label.name is the outcome bucket's identifier (e.g. "Pass"/"Fail"),
        // not maker prose — intentionally left unredacted; only its
        // free-text description/outcome need redaction.
        labels: grader.labels?.map(label => ({
          ...label,
          description: redactOptional(label.description),
          outcome: redactOptional(label.outcome),
        })),
      })),
    })),
    testCases: model.testCases.map(testCase => ({
      ...testCase,
      input: redactOptional(testCase.input),
      expected: redactOptional(testCase.expected),
      expectedKeywords: testCase.expectedKeywords?.map(redactSecrets),
    })),
    // Optional on the model: add the key only when the capture had workflow tools.
    // IQ capabilities and hooks hold no maker prose, so the `...model` spread keeps them.
    ...(model.workflowTools ? {
      workflowTools: model.workflowTools.map(tool => ({
        ...tool,
        displayName: redactOptional(tool.displayName),
        description: redactOptional(tool.description),
      })),
    } : {}),
    unknownKinds: model.unknownKinds.map(kind => ({
      ...kind,
      warning: redactSecrets(kind.warning),
    })),
  };
}

/** Sanitize a single GroundedSkillFinding for persistence. */
function sanitizeSkillFinding(f: GroundedSkillFinding): GroundedSkillFinding {
  return {
    ...sanitizeGroundedFinding(f),
    evidence: sanitizeEvidenceField(f.evidence),
    recommendation: redactField(f.recommendation),
    fixSteps: f.fixSteps.map(s => ({ ...s, action: redactField(s.action) })),
  };
}

/** Sanitize a single GroundedFinding for persistence. */
function sanitizeGroundedFinding<T extends GroundedFinding | GroundedSkillFinding>(f: T): T {
  const coverageAdvice = readInstructionFindingNarrative(f);
  const narrative = coverageAdvice.provided ? coverageAdvice.narrative : undefined;
  const advice = coverageAdvice.provided ? {
    findingTitle: narrative?.findingTitle, findingFact: narrative?.fact,
    whyItMatters: narrative?.whyItMatters, makerAction: narrative?.makerAction,
    acceptanceCheck: narrative?.acceptanceCheck, suggestedText: narrative?.suggestedText,
  } : f;
  return {
    ...f,
    title: redactField(f.title),
    fact: sanitizeEvidenceField(f.fact),
    why: redactField(f.why),
    fix: redactField(f.fix),
    findingTitle: redactOptional(advice.findingTitle),
    findingFact: redactOptional(advice.findingFact),
    whyItMatters: redactOptional(advice.whyItMatters),
    makerAction: redactOptional(advice.makerAction),
    acceptanceCheck: redactOptional(advice.acceptanceCheck),
    suggestedText: redactOptional(advice.suggestedText),
    remediation: f.remediation ? redactCopilotGuidance(f.remediation) : undefined,
  };
}

/** Sanitize the agent-level cross-skill orchestration evaluation for persistence. */
function sanitizeOrchestrationEvaluation(
  orch: CrossSkillOrchestrationEvaluation,
): CrossSkillOrchestrationEvaluation {
  return {
    ...orch,
    findings: orch.findings.map(f => {
      const narrative = readCopilotAiNarrative(f);
      return {
        ...f,
        evidence: sanitizeEvidenceField(f.evidence),
        rationale: redactField(f.rationale),
        recommendation: redactField(f.recommendation),
        fixSteps: f.fixSteps.map(s => ({ ...s, action: redactField(s.action) })),
        findingTitle: redactOptional(narrative?.findingTitle),
        fact: redactOptional(narrative?.fact),
        whyItMatters: redactOptional(narrative?.whyItMatters),
        makerAction: redactOptional(narrative?.makerAction),
        acceptanceCheck: redactOptional(narrative?.acceptanceCheck),
        suggestedText: redactOptional(narrative?.suggestedText),
      };
    }),
    summary: redactField(orch.summary),
    parseError: orch.parseError !== undefined ? redactField(orch.parseError) : undefined,
  };
}

/**
 * Sanitizes a cross-skill orchestration result for durable storage.
 */
export function buildPersistedCrossSkillOrchestration(
  orchestration: CrossSkillOrchestrationEvaluation,
): CrossSkillOrchestrationEvaluation {
  return sanitizeOrchestrationEvaluation(orchestration);
}

/** Sanitize Standard evaluation nested findings and evidence fields. */
function sanitizeStandardEvaluation(std: StandardSkillBundleEvaluation): StandardSkillBundleEvaluation {
  return {
    ...std,
    findings: std.findings.map(sanitizeSkillFinding),
    resourcePurposeAlignment: std.resourcePurposeAlignment.map(r => ({
      ...r,
      rationale: redactField(r.rationale),
    })),
    operationalAssumptions: std.operationalAssumptions.map(a => ({
      ...a,
      statement: redactField(a.statement),
      evidence: sanitizeEvidenceField(a.evidence),
    })),
    unreviewedResources: std.unreviewedResources.map(r => ({
      ...r,
      reason: redactField(r.reason),
    })),
    resources: std.resources?.map(sanitizeResourceEvaluation),
    summary: redactField(std.summary),
    parseError: std.parseError !== undefined ? redactField(std.parseError) : undefined,
  };
}

/** Sanitize a resource evaluation at every displayable nesting level. */
function sanitizeResourceEvaluation(res: SkillResourceEvaluation): SkillResourceEvaluation {
  return {
    ...res,
    findings: res.findings.map(sanitizeSkillFinding),
    observedBehaviors: res.observedBehaviors.map(o => ({
      ...o,
      kind: redactField(o.kind),
      evidence: sanitizeEvidenceField(o.evidence),
    })),
    dependencies: res.dependencies.map(d => ({
      ...d,
      name: redactField(d.name),
      kind: redactField(d.kind),
      evidence: d.evidence ? sanitizeEvidenceField(d.evidence) : d.evidence,
    })),
    externalEndpoints: res.externalEndpoints.map(e => ({
      ...e,
      value: redactField(e.value),
      evidence: sanitizeEvidenceField(e.evidence),
    })),
    capabilities: res.capabilities.map(c => ({
      ...c,
      evidence: sanitizeEvidenceField(c.evidence),
    })),
    runtimeAssumptions: res.runtimeAssumptions.map(r => ({
      ...r,
      statement: redactField(r.statement),
      evidence: sanitizeEvidenceField(r.evidence),
    })),
    purposeAlignment: {
      ...res.purposeAlignment,
      rationale: redactField(res.purposeAlignment.rationale),
    },
    parseError: res.parseError !== undefined ? redactField(res.parseError) : undefined,
  };
}

/** Sanitize Deep bundle evaluation at every nesting level. */
function sanitizeDeepEvaluation(deep: DeepSkillBundleEvaluation): DeepSkillBundleEvaluation {
  return {
    ...deep,
    resources: deep.resources.map(sanitizeResourceEvaluation),
    crossFileChains: deep.crossFileChains.map(chain => ({
      ...chain,
      behavior: redactField(chain.behavior),
    })),
    findings: deep.findings.map(sanitizeSkillFinding),
    operationalAssumptions: deep.operationalAssumptions.map(a => ({
      ...a,
      statement: redactField(a.statement),
    })),
    summary: redactField(deep.summary),
    parseError: deep.parseError !== undefined ? redactField(deep.parseError) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/** Project the BundleIntegrityResult with each finding sanitized for persistence. */
function sanitizeIntegrityResult(integrityResult: BundleIntegrityResult): BundleIntegrityResult {
  return {
    ...integrityResult,
    findings: integrityResult.findings.map(sanitizeSkillFinding),
  };
}

/** Redact SAS URLs and secrets from a RetrievalIssue message before persistence. */
function sanitizeRetrievalIssue(issue: RetrievalIssue): RetrievalIssue {
  return {
    ...issue,
    message: redactField(issue.message),
  };
}

/**
 * Sanitize a legacy SkillBundleEvaluation before persistence.
 * Redacts secrets and SAS URLs from all nested safety findings, resource
 * findings, cross-skill conflict evidence, and AI-derived rationale/summary
 * strings. Evidence fields are truncated to ≤160 chars.
 * Scores, identity fields (name, band, percentages), and flags are preserved.
 */
function sanitizeSkillBundleEvaluation(evaluation: SkillBundleEvaluation): SkillBundleEvaluation {
  return {
    ...evaluation,
    descriptionRationale: redactField(evaluation.descriptionRationale),
    dimensions: evaluation.dimensions.map(d => ({
      ...d,
      rationale: redactField(d.rationale),
    })),
    safety: {
      ...evaluation.safety,
      findings: evaluation.safety.findings.map(f => ({
        ...f,
        evidence: sanitizeEvidenceField(f.evidence),
        rationale: redactField(f.rationale),
        recommendation: redactField(f.recommendation),
      })),
    },
    resources: evaluation.resources.map(r => ({
      ...r,
      declaredPurpose: redactField(r.declaredPurpose),
      rationale: redactField(r.rationale),
      findings: r.findings.map(f => ({
        ...f,
        evidence: sanitizeEvidenceField(f.evidence),
        rationale: redactField(f.rationale),
        recommendation: redactField(f.recommendation),
      })),
    })),
    crossSkillConflicts: evaluation.crossSkillConflicts.map(c => ({
      ...c,
      evidence: sanitizeEvidenceField(c.evidence),
      rationale: redactField(c.rationale),
    })),
    bundleIntegrity: {
      ...evaluation.bundleIntegrity,
      rationale: redactField(evaluation.bundleIntegrity.rationale),
    },
    summary: redactField(evaluation.summary),
  };
}

/** Project a SkillBundleResource to PersistedResourceManifest. */
function projectManifest(
  resource: SkillBundleResource,
  reviewResult: SkillBundleReviewResult,
): PersistedResourceManifest {
  const assessment = getResourceReviewAssessment(
    { ...resource, path: resource.normalizedPath },
    reviewResult.mode,
    reviewResult.standardEvaluation,
    reviewResult.deepEvaluation,
    reviewResult.aiBackend === 'workflow' && reviewResult.mode === 'standard',
  );

  return {
    path: resource.normalizedPath,
    kind: resource.kind,
    language: resource.language,
    sizeBytes: resource.sizeBytes,
    sha256: resource.sha256,
    referencedBy: resource.referencedBy,
    analysisStatus: assessment.analysisStatus,
    riskLevel: assessment.riskLevel,
    readiness: assessment.readiness,
  };
}

/** Extract integrity scoring counts from a bundle integrity analysis. */
function extractIntegrityCounts(
  bundle: SkillBundle,
  integrityResult: ReturnType<typeof analyzeBundleIntegrity>,
): SkillBundleScoringInput['integrity'] {
  let pathTraversalCount = 0;
  let duplicatePathCount = 0;

  for (const f of integrityResult.findings) {
    if (f.ruleId === 'BND-01') {
      if (f.title.startsWith('Duplicate')) duplicatePathCount++;
      else pathTraversalCount++;
    }
  }

  const unreadableReferencedCount = integrityResult.findings.filter(
    f => f.ruleId === 'BND-03' || f.ruleId === 'BND-07',
  ).length;

  const emptyResourceCount = bundle.resources.filter(
    r => r.textContent !== undefined && r.textContent.trim().length === 0,
  ).length;

  return {
    pathTraversalCount,
    duplicatePathCount,
    missingReferencedCount: integrityResult.referencedButMissing.length,
    unreadableReferencedCount,
    unreferencedTextCount: integrityResult.presentButUnreferenced.length,
    lacksProgressiveDisclosure: !integrityResult.progressiveDisclosureOk,
    emptyResourceCount,
  };
}

/** Build readiness issues from the selected resource evaluation. */
function extractReadinessIssues(
  review: SkillBundleReviewResult,
): SkillBundleScoringInput['readinessIssues'] {
  const issues: SkillBundleScoringInput['readinessIssues'] = [];
  const resources = review.mode === 'deep'
    ? review.deepEvaluation?.resources ?? review.standardEvaluation?.resources ?? []
    : review.standardEvaluation?.resources ?? [];

  // Resources that the whole-skill pass could not excerpt are only genuinely
  // unreviewed when the deep phases did not subsequently analyse them. Without
  // this reconciliation an excerpt-budget omission would penalise readiness for a
  // file that was, in fact, fully analysed.
  const deepAnalysedPaths = new Set(
    resources
      .filter(r => r.status === 'complete' || r.status === 'partial')
      .map(r => r.resourcePath),
  );

  if (review.standardEvaluation?.unreviewedResources) {
    for (const ur of review.standardEvaluation.unreviewedResources) {
      if (deepAnalysedPaths.has(ur.resourcePath)) continue;
      issues.push({ kind: 'unreviewed-referenced-resource', resourcePath: ur.resourcePath });
    }
  }

  for (const resource of resources) {
    if (resource.readiness === 'unsupported') {
      issues.push({ kind: 'unsupported-runtime', resourcePath: resource.resourcePath });
    }
    if (resource.readiness === 'needs-configuration') {
      issues.push({ kind: 'external-service-configuration', resourcePath: resource.resourcePath });
    }
    if (resource.status === 'partial') {
      issues.push({ kind: 'partial-resource', resourcePath: resource.resourcePath });
    }
    if (['failed', 'skipped', 'cancelled'].includes(resource.status)) {
      issues.push({ kind: 'unreviewed-referenced-resource', resourcePath: resource.resourcePath });
    }
  }

  return issues;
}

/** Compute resource coverage statistics from a bundle. */
function computeResourceCoverage(
  bundle: SkillBundle,
  review: SkillBundleReviewResult,
): PersistedSkillBundleReview['coverage'] {
  return computeResourceReviewCoverage(
    bundle.resources.map(resource => ({
      path: resource.normalizedPath,
      originalPath: resource.originalPath,
      analysisStatus: resource.analysisStatus,
      chunksTotal: resource.chunks.length,
    })),
    review.mode,
    review.standardEvaluation,
    review.deepEvaluation,
    review.aiBackend === 'workflow' && review.mode === 'standard',
  );
}

/** Type guard: check if a string is a valid registered reference ID. */
function isReferenceId(id: string): id is ReferenceId {
  return id in REFERENCES;
}

/** Collect unique citations from findings by resolving reference IDs. */
function collectCitations(
  findings: GroundedSkillFinding[],
): PersistedSkillBundleReview['citations'] {
  const seen = new Set<string>();
  const citations: PersistedSkillBundleReview['citations'] = [];

  for (const f of findings) {
    const refIds: string[] = f.referenceIds ?? (f.referenceId ? [f.referenceId] : []);
    for (const id of refIds) {
      if (seen.has(id)) continue;
      if (!isReferenceId(id)) continue;
      const ref = REFERENCES[id];
      seen.add(id);
      citations.push({ id, title: ref.title, url: ref.url, source: ref.source });
    }
  }

  return citations;
}

/** Simple deterministic hash of a string (for reviewInputHash). */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Map SkillBundleReviewResult status to the persisted status (Task 2/5: preserved 1:1, not collapsed). */
function mapPersistedStatus(
  status: SkillBundleReviewResult['status'],
): PersistedSkillBundleReview['status'] {
  return status;
}

/**
 * Retain only a complete redacted bundled SKILL.md. A partial source could be
 * mistaken for the reviewed definition, so oversized text is omitted.
 */
function projectSkillDefinitionSource(
  bundle: SkillBundle,
): Pick<PersistedSkillBundleReview, 'skillDefinitionSource' | 'skillDefinitionSourceOmission'> {
  if (bundle.source !== 'zip-bundle') {
    return {};
  }

  const redactedSource = redactField(bundle.skillMarkdown);
  if (redactedSource.length > MAX_SKILL_DEFINITION_SOURCE_CHARS) {
    return { skillDefinitionSourceOmission: 'too-large' };
  }

  return { skillDefinitionSource: redactedSource };
}

// ---------------------------------------------------------------------------
// Core projection
// ---------------------------------------------------------------------------

/** Project a single bundle + review result pair into a persisted review. */
function projectSkillBundleReview(
  bundle: SkillBundle,
  review: SkillBundleReviewResult,
  mode: SkillReviewMode,
  startedAt: string,
  completedAt: string,
  guidanceContext?: CopilotGuidanceContext,
): PersistedSkillBundleReview {
  const integrityResult = analyzeBundleIntegrity(bundle);

  // Merge all findings for scoring: deterministic + standard + deep
  const allFindings: GroundedSkillFinding[] = [
    ...review.deterministicFindings,
    ...(review.standardEvaluation?.findings ?? []),
    ...(review.deepEvaluation?.findings ?? []),
  ];

  const coverage = computeResourceCoverage(bundle, review);

  const scoringInput: SkillBundleScoringInput = {
    dimensions: review.standardEvaluation?.dimensions ?? [],
    integrity: extractIntegrityCounts(bundle, integrityResult),
    resourcesTotal: bundle.resources.length,
    resourcesReviewed: coverage.resourcesReviewed,
    findings: allFindings.map(f => ({
      severity: f.severity,
      resourcePath: f.resourcePath,
      evidence: f.evidence,
      safetyDisposition: f.safetyDisposition,
    })),
    readinessIssues: extractReadinessIssues(review),
  };

  const scores: SkillBundleScores = calculateSkillBundleScores(scoringInput);
  const workflow = review.aiBackend === 'workflow';
  const wholeSkillOnly = workflow && mode === 'standard';

  // Sanitize all findings for persistence
  const sanitizeWithGuidance = (finding: GroundedSkillFinding) => sanitizeSkillFinding(
    guidanceContext ? withCopilotFindingGuidance(finding, guidanceContext, bundle.skillComponentUniqueId) : finding,
  );
  const sanitizedFindings = allFindings.map(sanitizeWithGuidance);
  const sanitizedDeterministic = review.deterministicFindings.map(sanitizeWithGuidance);

  return {
    schemaVersion: 1,
    skillComponentId: bundle.skillComponentId,
    skillComponentUniqueId: bundle.skillComponentUniqueId,
    skillSchemaName: review.skillSchemaName,
    skillName: review.skillName,
    bundleHash: bundle.bundleHash,
    reviewInputHash: simpleHash(`${bundle.bundleHash}:${mode}`),
    mode,
    status: !wholeSkillOnly && review.status === 'complete' && coverage.resourcesReviewed < coverage.resourcesTotal
      ? 'partial' : mapPersistedStatus(review.status),
    startedAt,
    completedAt,
    promptVersions: {
      standard: workflow ? WORKFLOW_SERVED_MODEL_ID : AI_MODEL_IDS.SKILL_BUNDLE_EVAL,
      resource: mode === 'deep'
        ? workflow ? WORKFLOW_SERVED_MODEL_ID : AI_MODEL_IDS.SKILL_RESOURCE_EVAL : undefined,
      fileSynthesis: mode === 'deep' && !workflow ? AI_MODEL_IDS.SKILL_FILE_SYNTHESIS : undefined,
      bundleSynthesis: mode === 'deep' && !workflow ? AI_MODEL_IDS.SKILL_DEEP_BUNDLE_SYNTHESIS : undefined,
    },
    manifest: bundle.resources.map(r => projectManifest(r, review)),
    sourceFiles: [
      // SKILL.md is the skill definition, not a resource, so it is absent from
      // `manifest` -- which is why the file count read 3 where the designer
      // shows 4. The Source view needs the whole bundle, so it is added here.
      {
        path: 'SKILL.md',
        sizeBytes: new TextEncoder().encode(bundle.skillMarkdown).length,
        language: 'markdown' as const,
        isSkillDefinition: true,
      },
      ...bundle.resources.map(r => ({
        path: r.normalizedPath || r.originalPath,
        sizeBytes: r.sizeBytes,
        language: r.language,
        kind: r.kind,
      })),
    ],
    ...projectSkillDefinitionSource(bundle),
    retrievalIssues: bundle.retrievalIssues.map(sanitizeRetrievalIssue),
    deterministic: {
      findings: sanitizedDeterministic,
      integrity: sanitizeIntegrityResult(integrityResult),
    },
    capabilityReferences: review.capabilityReferences?.map(reference => ({
      ...reference,
      evidence: sanitizeEvidenceField(reference.evidence),
    })),
    capabilityReferenceIssues: review.capabilityReferenceIssues?.map(issue => ({
      ...issue,
      evidence: sanitizeEvidenceField(issue.evidence),
    })),
    standard: review.standardEvaluation ? sanitizeStandardEvaluation(review.standardEvaluation) : undefined,
    deep: review.deepEvaluation ? sanitizeDeepEvaluation(review.deepEvaluation) : undefined,
    findings: sanitizedFindings,
    scores,
    coverage,
    citations: collectCitations(allFindings),
  };
}

/**
 * Projects one transient skill review into the sanitized durable contract.
 */
export function buildPersistedSkillBundleReview(
  bundle: SkillBundle,
  review: SkillBundleReviewResult,
  startedAt: string,
  completedAt: string,
): PersistedSkillBundleReview {
  return projectSkillBundleReview(
    bundle,
    review,
    review.mode,
    startedAt,
    completedAt,
  );
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/**
 * Compact the persisted payload until JSON serialization ≤ maxChars.
 * Priority order:
 * 1. Remove duplicate secondary evidence from lower-severity findings
 * 2. Remove retained skill-definition source and record the omission
 * 3. Cap each resource to five non-finding coverage observations
 * 4. Cap informational retrieval issues to ten per bundle
 * 5. Never drop protected fields (high/critical findings, rule/reference/fix, scores, metadata, status/coverage)
 *
 * @returns persistenceIssues documenting any compaction applied.
 */
function compactPayload(
  payload: unknown,
  reviews: PersistedSkillBundleReview[],
  maxChars: number,
): RetrievalIssue[] {
  const issues: RetrievalIssue[] = [];
  const resourcesFor = (review: PersistedSkillBundleReview): SkillResourceEvaluation[] => [
    ...(review.standard?.resources ?? []),
    ...(review.deep?.resources ?? []),
  ];

  let json = JSON.stringify(payload);
  if (json.length <= maxChars) return issues;

  // Pass 1: remove duplicate secondary evidence from low-severity findings
  // across main findings AND nested standard/deep findings.
  for (const review of reviews) {
    const seen = new Set<string>();
    review.findings = review.findings.filter(f => {
      if (f.severity === 'critical' || f.severity === 'high') return true;
      const key = `${f.ruleId}|${f.evidence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Also compact nested standard.findings
    if (review.standard?.findings) {
      const stdSeen = new Set<string>();
      review.standard.findings = review.standard.findings.filter(f => {
        if (f.severity === 'critical' || f.severity === 'high') return true;
        const key = `${f.ruleId}|${f.evidence}`;
        if (stdSeen.has(key)) return false;
        stdSeen.add(key);
        return true;
      });
    }
    // Also compact nested deep.findings.
    if (review.deep) {
      const deepSeen = new Set<string>();
      review.deep.findings = review.deep.findings.filter(f => {
        if (f.severity === 'critical' || f.severity === 'high') return true;
        const key = `${f.ruleId}|${f.evidence}`;
        if (deepSeen.has(key)) return false;
        deepSeen.add(key);
        return true;
      });
    }
    // Standard and deep evaluations share the same resource contract.
    for (const resource of resourcesFor(review)) {
      const resSeen = new Set<string>();
      resource.findings = resource.findings.filter(f => {
        if (f.severity === 'critical' || f.severity === 'high') return true;
        const key = `${f.ruleId}|${f.evidence}`;
        if (resSeen.has(key)) return false;
        resSeen.add(key);
        return true;
      });
    }
  }

  json = JSON.stringify(payload);
  if (json.length <= maxChars) {
    issues.push({ code: 'persisted-payload-compacted', message: 'Duplicate low-severity evidence removed.', severity: 'info' });
    return issues;
  }

  // Pass 2: prefer findings and scores over retained source when near the memo limit.
  for (const review of reviews) {
    if (review.skillDefinitionSource !== undefined) {
      delete review.skillDefinitionSource;
      review.skillDefinitionSourceOmission = 'payload-budget';
    }
  }

  json = JSON.stringify(payload);
  if (json.length <= maxChars) {
    issues.push({
      code: 'persisted-payload-compacted',
      message: 'Bundled skill-definition source omitted to fit the memo budget.',
      severity: 'info',
    });
    return issues;
  }

  // Pass 3: cap non-finding observations for standard and deep resources.
  for (const review of reviews) {
    for (const resource of resourcesFor(review)) {
      if (resource.observedBehaviors.length > 5) {
        resource.observedBehaviors = resource.observedBehaviors.slice(0, 5);
      }
      if (resource.dependencies.length > 5) {
        resource.dependencies = resource.dependencies.slice(0, 5);
      }
      if (resource.externalEndpoints.length > 5) {
        resource.externalEndpoints = resource.externalEndpoints.slice(0, 5);
      }
      if (resource.capabilities.length > 5) {
        resource.capabilities = resource.capabilities.slice(0, 5);
      }
      if (resource.runtimeAssumptions.length > 5) {
        resource.runtimeAssumptions = resource.runtimeAssumptions.slice(0, 5);
      }
    }
  }

  json = JSON.stringify(payload);
  if (json.length <= maxChars) {
    issues.push({ code: 'persisted-payload-compacted', message: 'Resource observations capped to five per resource.', severity: 'info' });
    return issues;
  }

  // Pass 4: cap informational retrieval issues to ten per bundle
  for (const review of reviews) {
    const infoIssues = review.retrievalIssues.filter(i => i.severity === 'info');
    if (infoIssues.length > 10) {
      const nonInfo = review.retrievalIssues.filter(i => i.severity !== 'info');
      review.retrievalIssues = [...nonInfo, ...infoIssues.slice(0, 10)];
    }
  }

  json = JSON.stringify(payload);
  if (json.length <= maxChars) {
    issues.push({ code: 'persisted-payload-compacted', message: 'Informational retrieval issues capped to ten per bundle.', severity: 'info' });
    return issues;
  }

  // Pass 5: trim info/low-severity findings aggressively (preserve all high/critical)
  // Applies to main findings, deterministic, standard, deep, and all resource findings.
  for (const review of reviews) {
    // Helper: trim low/info findings from an array, preserving high/critical + required fields
    const trimFindings = (arr: typeof review.findings) => {
      const hc = arr.filter(f => f.severity === 'critical' || f.severity === 'high');
      const med = arr.filter(f => f.severity === 'medium');
      const li = arr.filter(f => f.severity === 'low' || f.severity === 'info');
      return [...hc, ...med, ...li.slice(0, Math.max(5, Math.floor(li.length / 4)))];
    };

    // Compact main findings
    review.findings = trimFindings(review.findings);

    // Compact deterministic findings in sync
    review.deterministic.findings = trimFindings(review.deterministic.findings);

    // Compact nested standard findings
    if (review.standard?.findings) {
      review.standard.findings = trimFindings(review.standard.findings);
    }

    // Compact nested deep findings.
    if (review.deep) {
      review.deep.findings = trimFindings(review.deep.findings);
    }
    for (const resource of resourcesFor(review)) {
      resource.findings = trimFindings(resource.findings);
    }
  }

  json = JSON.stringify(payload);
  if (json.length <= maxChars) {
    issues.push({ code: 'persisted-payload-compacted', message: 'Low-severity findings trimmed to fit memo budget.', severity: 'info' });
    return issues;
  }

  // Protected fields still exceed limit — throw
  throw new Error('Review result exceeds the Dataverse persistence limit');
}

/**
 * Compacts persisted skill reviews inside a larger payload and enforces its JSON budget.
 */
export function compactPersistedSkillReviewsInPayload(
  payload: unknown,
  reviews: PersistedSkillBundleReview[],
  maxChars: number,
): RetrievalIssue[] {
  return compactPayload(payload, reviews, maxChars);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Project transient execution results into the persisted review payload.
 *
 * Strips raw source, text content, SAS URLs, prompt payloads, and hidden
 * reasoning. Sanitizes evidence to 160 chars. Compacts until ≤ maxChars.
 *
 * @param input - Runtime payload + bundle context.
 * @param maxChars - Maximum JSON serialization length (default 900,000).
 * @returns Persisted payload + pre-serialized JSON.
 */
export function buildPersistedCopilotReview(
  input: CopilotReviewPersistenceInput,
  maxChars = 900_000,
): PersistedCopilotReviewResult {
  const { payload, bundles, mode, startedAt, completedAt } = input;
  const reviews = payload.skillBundleReviews ?? [];
  const guidanceContext = {
    model: modelWithCapturedSkillText(payload.model, bundles), skillBundleReviews: reviews,
  };

  // Build a lookup from schema name to bundle
  const bundleBySchema = new Map<string, SkillBundle>();
  for (const b of bundles) {
    bundleBySchema.set(b.skillSchemaName, b);
  }

  // Project each review+bundle pair into a persisted review
  const persistedReviews: PersistedSkillBundleReview[] = [];
  for (const review of reviews) {
    const bundle = bundleBySchema.get(review.skillSchemaName);
    if (!bundle) continue;
    persistedReviews.push(
      projectSkillBundleReview(bundle, review, review.mode, startedAt, completedAt, guidanceContext),
    );
  }

  // Sanitize top-level findings
  const sanitizedFindings: Array<GroundedFinding | GroundedSkillFinding> = payload.findings.map(f => {
    const finding = withCopilotFindingGuidance(f, guidanceContext);
    if ('ruleId' in finding) return sanitizeSkillFinding(finding);
    return sanitizeGroundedFinding(finding);
  });

  const persistedPayload: PersistedCopilotReviewPayload = {
    model: sanitizeModelForPersistence(payload.model),
    findings: sanitizedFindings,
    skillEvaluations: payload.skillEvaluations.map(sanitizeSkillBundleEvaluation),
    bundleRetrievalIssues: (payload.bundleRetrievalIssues ?? []).map(sanitizeRetrievalIssue),
    crossSkillOrchestration: payload.crossSkillOrchestration
      ? sanitizeOrchestrationEvaluation(payload.crossSkillOrchestration)
      : undefined,
    skillBundleReviews: persistedReviews,
    skillReviewMode: mode,
    coverage: payload.coverage,
    coverageBasis: payload.coverageBasis,
    coverageSets: payload.coverageSets,
    score: payload.score,
    analysisStatus: payload.analysisStatus,
    // Without this the "All checks" tab can never populate: it reports every
    // rule that ran including the ones that passed, and the allowlist above
    // silently dropped the only field carrying that. A saved review then said
    // "run before per-check results were recorded -- re-run to see it", and
    // re-running did not help because the next save dropped it too, while the
    // summary rail contradicted it with "13 of 25 passed" from `score`.
    //
    // Cheap to keep: four short strings per rule, ~25 rules, and `compactPayload`
    // can trim it first if a future review ever approaches the memo budget.
    ruleResults: payload.ruleResults?.map(result => ({
      ...result,
      ...(result.reason ? { reason: redactSecrets(result.reason) } : {}),
    })),
    persistenceIssues: [],
  };

  // Compact until within budget
  const compactionIssues = compactPayload(
    persistedPayload,
    persistedPayload.skillBundleReviews,
    maxChars,
  );
  persistedPayload.persistenceIssues = compactionIssues;

  // Final serialization — verify the persistenceIssues array itself doesn't
  // push the payload over the limit. Re-compact if needed.
  let json = JSON.stringify(persistedPayload);
  if (json.length > maxChars) {
    // Re-run compaction with the updated persistenceIssues in place.
    const additionalIssues = compactPayload(
      persistedPayload,
      persistedPayload.skillBundleReviews,
      maxChars,
    );
    persistedPayload.persistenceIssues = [...compactionIssues, ...additionalIssues];
    json = JSON.stringify(persistedPayload);
    // If protected fields + persistenceIssues still exceed, the error propagates
    // from compactPayload above. Belt-and-suspenders guard:
    if (json.length > maxChars) {
      throw new Error('Review result exceeds the Dataverse persistence limit');
    }
  }

  return { payload: persistedPayload, json };
}
