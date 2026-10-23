/**
 * Adapts the live AgentsExperienceReviewPayload into the view-model the ported
 * mock components consume. Pure and synchronous.
 */
import type {
  AeSkill,
  CopilotReviewDisplayPayload,
  PersistedSkillBundleReview,
  SkillBundleReviewResult,
  SkillBundleReviewStatus,
  SkillResourceEvaluation,
} from '../../core/index.js';
import {
  distinctGraders,
  formatGrader,
  normalizeStandardIdentity,
  normalizeSkillDimensionScore,
} from '../../core/index.js';
import { findingToView } from './viewMappers.js';
import { buildChecksView } from './checksModel.js';
import { buildSkillsGroupedView } from './skillsGroupedModel.js';
import { prettyModelSeries } from '../model/modelDisplay.js';
import type {
  ReviewViewModel, SkillView, CapabilityChip, ReviewSummaryView,
  QualifiedScoreView, SkillBundleScoresView, SkillResourceRowView, SkillEvaluationState,
  SkillResourceAnalysisView,
} from './viewTypes.js';

const CHIP_COLORS = { tool: '#0F6CBD', mcp: '#8764B8', agent: '#C239B3', knw: '#0E7878' };

/** Type guard: check whether a bundle review is the persisted form (has scores + manifest). */
function isPersistedBundleReview(
  r: SkillBundleReviewResult | PersistedSkillBundleReview,
): r is PersistedSkillBundleReview {
  return 'scores' in r && 'manifest' in r;
}

/** Maps the canonical bundle-review status (runtime or persisted — same enum) to the truthful UI state. */
const EVALUATION_STATE_BY_STATUS: Record<SkillBundleReviewStatus, SkillEvaluationState> = {
  complete: 'evaluated',
  partial: 'partial',
  unavailable: 'unavailable',
  blocked: 'blocked',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** Fixed, non-fabricated reason messages shown when a skill has no real grade. */
const EVALUATION_MESSAGE_BY_STATE: Partial<Record<SkillEvaluationState, string>> = {
  unavailable: 'The AI rubric evaluator was not available for this skill.',
  blocked: 'AI evaluation was withheld because of an unmitigated safety finding.',
  failed: 'AI evaluation failed for this skill.',
  cancelled: 'AI evaluation was cancelled before it completed.',
  partial: 'AI evaluation returned a partial result for this skill.',
};

/** Resolve the bundle review that belongs to `skill` by stable schema identity, never by display name (Task 2). */
function resolveBundleReview(
  skill: AeSkill,
  reviews: Array<SkillBundleReviewResult | PersistedSkillBundleReview>,
): SkillBundleReviewResult | PersistedSkillBundleReview | undefined {
  const bySchema = reviews.find(r => r.skillSchemaName === skill.schemaname);
  if (bySchema) return bySchema;
  // Persisted-only fallback: componentIdUnique survives re-schema-naming across re-imports.
  return reviews.find(r => isPersistedBundleReview(r) && r.skillComponentUniqueId === skill.componentIdUnique);
}

function mapQualifiedScore(score: PersistedSkillBundleReview['scores']['quality']): QualifiedScoreView {
  return {
    value: score.value,
    status: score.status,
    coveragePercent: score.coveragePercent,
    note: score.note,
  };
}

function mapScoresView(
  scores: PersistedSkillBundleReview['scores'],
  dimensions: ReadonlyArray<{ score: number }>,
): SkillBundleScoresView {
  const qualityValue = dimensions.length > 0
    ? Math.round(
      dimensions.reduce(
        (total, dimension) => total + normalizeSkillDimensionScore(dimension.score),
        0,
      ) / dimensions.length * 10,
    )
    : scores.quality.value;

  return {
    quality: {
      ...mapQualifiedScore(scores.quality),
      value: qualityValue,
    },
    integrity: mapQualifiedScore(scores.integrity),
    safety: mapQualifiedScore(scores.safety),
    readiness: mapQualifiedScore(scores.readiness),
    safetyGate: scores.safetyGate,
  };
}

function mapResourceRows(
  manifest: PersistedSkillBundleReview['manifest'],
  findings: PersistedSkillBundleReview['findings'],
): SkillResourceRowView[] {
  return manifest.map(entry => {
    const findingCount = findings.filter(f => f.resourcePath === entry.path).length;
    const reviewCoverage =
      entry.analysisStatus === 'completed' ? 'Complete' :
      entry.analysisStatus === 'partial' ? 'Partial' :
      entry.analysisStatus === 'oversized' ? 'Oversized' :
      entry.analysisStatus === 'failed' ? 'Failed' :
      entry.analysisStatus === 'skipped' ? 'Skipped' :
      entry.analysisStatus === 'cancelled' ? 'Cancelled' : 'Not reviewed';
    return {
      path: entry.path,
      kind: entry.kind,
      language: entry.language,
      sizeBytes: entry.sizeBytes,
      analysisStatus: entry.analysisStatus,
      riskLevel: entry.riskLevel,
      readiness: entry.readiness,
      findingCount,
      reviewCoverage,
    };
  });
}

function mapResourceAnalyses(
  review: PersistedSkillBundleReview,
): SkillResourceAnalysisView[] {
  const mapResource = (
    resource: SkillResourceEvaluation,
    source: 'standard' | 'deep',
  ): SkillResourceAnalysisView => ({
    path: resource.resourcePath,
    source,
    evaluationStatus: resource.status,
    riskLevel: resource.riskLevel,
    readiness: resource.readiness,
    analyzedChunks: resource.analyzedChunks,
    totalChunks: resource.totalChunks,
    observedBehaviors: resource.observedBehaviors.map(item => ({ ...item })),
    dependencies: resource.dependencies.map(item => ({ ...item })),
    externalEndpoints: resource.externalEndpoints.map(item => ({ ...item })),
    capabilities: resource.capabilities.map(item => ({ ...item })),
    runtimeAssumptions: resource.runtimeAssumptions.map(item => ({ ...item })),
    findings: resource.findings.map(finding => ({
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      evidence: finding.evidence,
      why: finding.why,
      fix: finding.fix,
    })),
    purposeAlignment: { ...resource.purposeAlignment },
    parseError: resource.parseError,
  });

  return [
    ...(review.standard?.resources?.map(resource => mapResource(resource, 'standard')) ?? []),
    ...(review.deep?.resources.map(resource => mapResource(resource, 'deep')) ?? []),
  ];
}

/** Detect the Anthropic-style `<!-- bic:source=… -->` provenance marker in a skill's markdown. */
/**
 * The skill's authoring source, as shown on the Source tab.
 *
 * `bic:source=` is an optional hint some skills carry. A zip-bundle skill does
 * not carry it -- its content is a `bic:bundle` marker -- so sniffing alone
 * labelled every bundle "inline", which is the opposite of the truth. The
 * parsed model already knows, so it is trusted first.
 */
function skillSourceLabel(skill: { markdown: string; source?: string }): string {
  const hint = /<!--\s*bic:source=(\w+)\s*-->/.exec(skill.markdown);
  if (hint?.[1]) return hint[1];
  if (skill.source === 'zip-bundle') return 'zip-bundle';
  return 'inline';
}

export function buildReviewViewModel(
  payload: CopilotReviewDisplayPayload,
  reviewedBy: string,
  durationMs: number,
  agentName = 'Agent',
): ReviewViewModel {
  const m = payload.model;
  const findings = payload.findings.map(findingToView);

  const refCounts = { learn: 0, owasp: 0, anthropic: 0, mitreCwe: 0 };
  for (const f of findings) {
    if (f.source === 'Microsoft Learn') refCounts.learn += 1;
    else if (f.source === 'OWASP') refCounts.owasp += 1;
    else if (f.source === 'MITRE CWE') refCounts.mitreCwe += 1;
    else refCounts.anthropic += 1;
  }

  // Canonical bundle reviews (Task 2): typed union, no `unknown` escape hatch.
  const bundleReviews = payload.skillBundleReviews ?? [];

  // Skills view: resolve each skill's evaluation by stable schema identity and
  // map its canonical dimensions/state truthfully — never a synthetic value.
  const skills: SkillView[] = m.skills.map(skill => {
    const skillName = skill.frontmatterName ?? skill.name;
    const review = resolveBundleReview(skill, bundleReviews);
    const persistedReview = review && isPersistedBundleReview(review) ? review : undefined;
    const runtimeReview = review && !isPersistedBundleReview(review) ? review : undefined;
    // Legacy (pre-canonical-bundle-review) payloads only ever recorded skillEvaluations by name.
    const legacyEvaluation = payload.skillEvaluations.find(e => e.name === skillName);
    const injectionFinding = payload.findings.find(f => f.id === 'SKL-05' && f.title.includes(skillName));

    const canonicalDimensions =
      persistedReview?.standard?.dimensions
      ?? runtimeReview?.standardEvaluation?.dimensions
      ?? legacyEvaluation?.dimensions
      ?? [];

    const evaluationState: SkillEvaluationState = review
      ? EVALUATION_STATE_BY_STATUS[review.status]
      : (legacyEvaluation ? 'evaluated' : 'unavailable');
    const evaluationMessage = EVALUATION_MESSAGE_BY_STATE[evaluationState];

    return {
      id: skill.componentIdUnique,
      schemaName: skill.schemaname,
      name: skillName,
      description: skill.frontmatterDescription ?? '(no description)',
      source: skillSourceLabel(skill),
      safetyFlagged: !!injectionFinding || (legacyEvaluation?.safety.flagged ?? false),
      safetyFindingId: injectionFinding ? 'SKL-05' : undefined,
      safetyDisposition: injectionFinding?.safetyDisposition,
      sizeLabel: legacyEvaluation?.sizeLabel ?? `${(new TextEncoder().encode(skill.markdown).length / 1024).toFixed(1)} KB`,
      dimensions: canonicalDimensions.map(d => ({ key: d.key, score: d.score, rationale: d.rationale })),
      evaluationState,
      evaluationMessage,
      markdown: skill.markdown,
      mode: persistedReview?.mode,
      scores: persistedReview
        ? mapScoresView(persistedReview.scores, canonicalDimensions)
        : undefined,
      resourceRows: persistedReview ? mapResourceRows(persistedReview.manifest, persistedReview.findings) : undefined,
      resourceManifest: persistedReview?.manifest.map(entry => ({
        path: entry.path,
        kind: entry.kind,
        language: entry.language,
        sizeBytes: entry.sizeBytes,
        referencedBy: [...entry.referencedBy],
        analysisStatus: entry.analysisStatus,
        riskLevel: entry.riskLevel,
        readiness: entry.readiness,
      })),
      resourceAnalyses: persistedReview ? mapResourceAnalyses(persistedReview) : undefined,
      files: persistedReview?.sourceFiles,
      sourceFiles: persistedReview?.sourceFiles,
      skillDefinitionSource:
        persistedReview?.skillDefinitionSource
        ?? (skill.source === 'inline-markdown' ? skill.markdown : undefined),
      skillDefinitionSourceOmission: persistedReview?.skillDefinitionSourceOmission,
    };
  });

  const coveredCount = payload.coverage.filter(c => c.cases > 0).length;

  const checks = buildChecksView(
    payload.ruleResults,
    findings,
    // Lets a review saved before rule instances carried their subject resolve
    // one from the schema name already inside its instance keys.
    new Map(m.skills.map(s => [s.schemaname, { name: s.name, componentIdUnique: s.componentIdUnique }])),
  );

  /*
   * Two units, kept separate on purpose.
   *
   *  - CHECKS: how much was examined. `checks.totals` is preferred because it
   *    includes per-skill check instances; `score.evaluated` counts engine
   *    rules only and therefore under-reports. Legacy reviews persisted no
   *    outcomes, so those fall back to the stored score.
   *  - FINDINGS: what was reported. Always counted from the findings
   *    themselves, so the rail always agrees with the Review findings tab.
   *
   * They deliberately do not reconcile: one check can raise several findings
   * (TOL-02 raised 2 in a single run) and some findings come from per-skill
   * checks. The rail labels each row with its unit rather than implying they
   * are slices of one total.
   */
  const severityTally = payload.findings.reduce(
    (acc, f) => {
      if (f.severity === 'error') acc.errors += 1;
      else if (f.severity === 'warning') acc.warnings += 1;
      else acc.infos += 1;
      return acc;
    },
    { errors: 0, warnings: 0, infos: 0 },
  );

  const checkTotals = checks.recorded
    ? { passed: checks.totals.passed, evaluated: checks.totals.evaluated }
    : { passed: payload.score.passed, evaluated: payload.score.evaluated };

  const summary: ReviewSummaryView = {
    agentName,
    ...(m.harness === undefined ? {} : { harness: m.harness }),
    score: payload.score.grounded,
    passed: checkTotals.passed,
    warnings: severityTally.warnings,
    errors: severityTally.errors,
    infos: severityTally.infos,
    notApplicable: checks.recorded
      ? checks.totals.notApplicable + checks.totals.failed
      : 0,
    countsAreChecks: checks.recorded,
    rulesEvaluated: checkTotals.evaluated,
    model: m.agentSettings.modelSeries ? prettyModelSeries(m.agentSettings.modelSeries) : 'Default',
    memoryEnabled: m.agentSettings.enableMemory === true,
    webSearchEnabled: m.agentSettings.enableWebSearch === true,
    duration: formatDuration(durationMs),
    reviewedBy,
    refCounts,
    capabilitiesCovered: coveredCount,
    capabilitiesTotal: payload.coverage.length,
    testCases: m.testCases.length,
    multiTurnCases: m.multiTurnCases.length,
    graders: distinctGraders(m.evaluationSets).map(formatGrader).join(', ') || 'none',
    evaluationSets: m.evaluationSets.length,
    scoreBasisVersion: payload.score.basisVersion,
    scoreStatus: payload.score.status,
    pillars: payload.score.pillars,
    instructionCoverageStatus: payload.analysisStatus?.instructionCoverage,
  };

  const capabilityChips: CapabilityChip[] = [];
  const connectorCount = m.tools.filter(t => t.kind === 'ConnectorTool').length;
  const mcpCount = m.tools.filter(t => t.kind === 'McpTool').length;
  if (connectorCount) capabilityChips.push({ kind: 'tool', label: 'Connector tools', count: connectorCount, color: CHIP_COLORS.tool });
  if (mcpCount) capabilityChips.push({ kind: 'mcp', label: 'MCP tools', count: mcpCount, color: CHIP_COLORS.mcp });
  if (m.skills.length) capabilityChips.push({ kind: 'skill', label: 'Skills', count: m.skills.length, color: '#7C3AED' });
  if (m.connectedAgents.length) capabilityChips.push({ kind: 'agent', label: 'Connected agents', count: m.connectedAgents.length, color: CHIP_COLORS.agent });
  if (m.knowledge.length || m.agentSettings.enableWebSearch) {
    capabilityChips.push({ kind: 'knw', label: 'Knowledge', count: m.knowledge.length + (m.agentSettings.enableWebSearch ? 1 : 0), color: CHIP_COLORS.knw });
  }

  return {
    summary,
    findings,
    checks,
    coverage: payload.coverage,
    // Pre-declared-coverage reviews persisted no basis; those were name-matched.
    coverageBasis: payload.coverageBasis ?? 'inferred',
    coverageSets: payload.coverageSets ?? [],
    skills,
    ...((m.topics?.length || payload.topicReviews?.length) ? {
      topicReviews: (m.topics ?? []).map(topic => payload.topicReviews?.find(review =>
        normalizeStandardIdentity(review.componentIdUnique) !== undefined
        && normalizeStandardIdentity(review.componentIdUnique) === normalizeStandardIdentity(topic.componentIdUnique)) ?? {
        componentIdUnique: topic.componentIdUnique, componentKind: topic.kind, name: topic.name,
        status: 'unavailable' as const, summary: '',
        reason: 'The saved review has no Standard evaluator result.', validationIssues: [],
      }),
    } : {}),
    skillsGrouped: buildSkillsGroupedView(payload, skills),
    capabilityChips,
  };
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
