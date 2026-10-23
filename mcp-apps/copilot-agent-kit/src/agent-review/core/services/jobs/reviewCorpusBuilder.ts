/**
 * Builds the review corpus uploaded to `cat_inputfile` (spec 014 §0.4).
 *
 * One corpus per review, one entry in `components` per skill bundle. The
 * workflow's Loop sends exactly one component per agent-node call, so each
 * component is budgeted with the same primitives the AI Prompt path uses.
 *
 * Redaction runs here, before anything is written to Dataverse — the corpus
 * must not become a hole in the policy `persistedSkillReview` enforces at save
 * time.
 */
import type { SkillBundle } from '../../contracts/SkillBundle.js';
import type { GroundedSkillFinding } from '../../contracts/Findings.js';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel.js';
import { buildStandardResourceExcerpts } from '../skill/tokenBudget.js';
import { redactSecrets, sanitizeFindingEvidence } from '../skill/resourceScanners.js';
import type {
  ReviewCorpus,
  SkillReviewCorpusComponent,
  ReviewJobKind,
  CorpusManifestEntry,
} from '../../contracts/ReviewJob.js';

/** Evidence fields are capped to match the persistence contract. */
const MAX_EVIDENCE_CHARS = 160;

/**
 * Every capability name the agent actually has. The agent node resolves
 * references in skill text against this list, so a missing entry produces a
 * false "unavailable capability" finding.
 */
export function collectConfiguredCapabilities(
  model: AgentsExperienceModel,
): string[] {
  const names = [
    ...model.tools.map((t) => t.displayName ?? t.name),
    /*
      Skills count as capabilities. On the Copilot Studio path a sibling skill
      is something the agent really can call; on the artifact path this carries
      the runtime's built-in skills (Cowork's `pptx`, `docx` and so on). Leaving
      them out made every reference to one look like a call to a capability the
      agent does not have, which raised a false high-severity SKL-09.
    */
    ...model.skills.map((s) => s.frontmatterName ?? s.name),
    ...model.connectedAgents.map((a) => a.displayName ?? a.name),
    ...model.knowledge.map((k) => k.name),
    ...(model.topics ?? []).map(topic => topic.name),
  ];
  return [...new Set(names.filter((n): n is string => !!n && n.trim().length > 0))];
}

/** Project bundle manifest entries, dropping fields the agent cannot use. */
function projectManifest(bundle: SkillBundle): CorpusManifestEntry[] {
  return bundle.manifest.map((m) => ({
    path: m.path,
    kind: m.kind,
    language: m.language,
    sizeBytes: m.sizeBytes,
    sha256: m.sha256,
    isBinary: m.isBinary,
    referencedBy: m.referencedBy,
    analysisStatus: m.analysisStatus,
  }));
}

/** Redact a deterministic finding before it leaves the browser. */
function sanitizeFinding(f: GroundedSkillFinding): Record<string, unknown> {
  return {
    id: f.id,
    ruleId: f.ruleId,
    family: f.family,
    severity: f.severity,
    resourcePath: f.resourcePath,
    evidence: sanitizeFindingEvidence(f.evidence ?? '', MAX_EVIDENCE_CHARS),
    fact: sanitizeFindingEvidence(f.fact ?? '', MAX_EVIDENCE_CHARS),
  };
}

/**
 * Builds one corpus component from an assembled skill bundle.
 *
 * @param bundle - The assembled bundle (markdown, manifest, resources).
 * @param findings - Deterministic L0/scanner findings for this bundle.
 * @param capabilities - Every capability name the parent agent has.
 * @param index - Position in the corpus, preserved for diagnostics.
 */
export function buildCorpusComponent(
  bundle: SkillBundle,
  findings: GroundedSkillFinding[],
  capabilities: string[],
  index: number,
): SkillReviewCorpusComponent {
  const { excerpts } = buildStandardResourceExcerpts(bundle, findings);

  return {
    componentIndex: index,
    kind: 'InlineAgentSkill',
    skillComponentId: bundle.skillComponentId,
    skillComponentUniqueId: bundle.skillComponentUniqueId,
    skillSchemaName: bundle.skillSchemaName,
    skillName: bundle.skillName,
    source: bundle.source,
    bundleHash: bundle.bundleHash,
    parentDescription: bundle.parentDescription
      ? redactSecrets(bundle.parentDescription)
      : undefined,
    skill_markdown: redactSecrets(bundle.skillMarkdown),
    agent_instructions: redactSecrets(bundle.agentInstructions),
    sibling_descriptions: bundle.siblingDescriptions.map((s) => ({
      name: s.name,
      description: s.description ? redactSecrets(s.description) : undefined,
    })),
    resource_manifest: projectManifest(bundle),
    resource_excerpts: excerpts.map((e) => ({
      path: e.path,
      content: redactSecrets(e.content),
      truncated: e.truncated,
    })),
    configuredCapabilities: capabilities,
    deterministic_findings: findings.map(sanitizeFinding),
  };
}

/**
 * Builds the whole-review corpus for upload.
 *
 * @param bundles - Every assembled skill bundle in the review.
 * @param findingsByBundle - Deterministic findings keyed by skill schema name.
 * @param model - Parsed agent model, used for the capability list.
 * @param context - Review identity written into the corpus header.
 */
export function buildReviewCorpus(
  bundles: SkillBundle[],
  findingsByBundle: Map<string, GroundedSkillFinding[]>,
  model: AgentsExperienceModel,
  context: {
    correlationId: string;
    botId: string;
    botName: string;
    sourceEnvironment: string;
    /** Injected timestamp used by host-neutral preparation. */
    generatedOn?: string;
    /**
     * Which workflow branch judges this corpus.
     *
     * The workflow reads this field and routes to a different agent node. A
     * tenant agent review is `StandardSkillBundle`: many skills, one component
     * each, judged whole. An upload is `ArtifactBundle`: one archive cut into
     * portions, where each component holds part of the file set and the agent
     * must be told not to report the rest as missing.
     *
     * Defaults to `StandardSkillBundle`, so a caller that says nothing keeps
     * exactly the behaviour it had before this field existed.
     */
    jobKind?: ReviewJobKind;
  },
): ReviewCorpus {
  const capabilities = collectConfiguredCapabilities(model);

  const components = bundles.map((bundle, i) =>
    buildCorpusComponent(
      bundle,
      findingsByBundle.get(bundle.skillSchemaName) ?? [],
      capabilities,
      i,
    ),
  );

  return {
    schemaVersion: 1,
    jobKind: context.jobKind ?? 'StandardSkillBundle',
    generatedBy: 'CopilotStudioKitMakers/agent-review-tool',
    generatedOn: context.generatedOn ?? new Date().toISOString(),
    review: {
      correlationId: context.correlationId,
      botId: context.botId,
      botName: context.botName,
      sourceEnvironment: context.sourceEnvironment,
      componentCount: components.length,
    },
    components,
  };
}
