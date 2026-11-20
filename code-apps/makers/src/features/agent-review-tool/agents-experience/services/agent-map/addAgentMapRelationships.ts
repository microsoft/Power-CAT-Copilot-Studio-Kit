import type { AgentMapBuildInput } from '../../contracts/AgentMap';
import type {
  SkillCapabilityReference,
  SkillCapabilityReferenceIssue,
} from '../../contracts/SkillBundle';
import type { SkillCapabilityEdge } from '../../contracts/SkillEvaluation';
import {
  analyzeSkillCapabilityReferences,
  isSkillCapabilityReferenceSupported,
} from '../skill/skillCapabilityReferences';
import { AgentMapGraphBuilder } from './graphBuilderState';
import { evidenceNamesCapability } from '../skill/capabilityEvidence';
import type {
  AgentMapCapability,
  AgentMapNodeContext,
} from './agentMapNodeContext';
import { normalizeAgentMapKey, normalizeCapabilityName } from './agentMapUtils';

/** Confidence the model reports, mapped onto the graph's 0-1 edge weight. */
const MODEL_EDGE_CONFIDENCE: Record<SkillCapabilityEdge['confidence'], number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

const MODEL_EDGE_USAGES: SkillCapabilityEdge['usage'][] = [
  'read',
  'write',
  'invoke',
  'delegate',
  'reference',
];

const MODEL_EDGE_CONFIDENCES: SkillCapabilityEdge['confidence'][] = [
  'high',
  'medium',
  'low',
];

type AnyReview = NonNullable<AgentMapBuildInput['skillBundleReviews']>[number];

/**
 * Read TASK 7 edges from either review shape.
 *
 * Runtime results carry `standardEvaluation`; persisted ones carry `standard`.
 * Both hold the same `StandardSkillBundleEvaluation`, so the edges survive a
 * save/reopen without a dedicated persistence field.
 *
 * `undefined` means this review predates TASK 7. An empty or partial array is
 * not treated as complete coverage because structured model output can omit
 * valid relationships. Conservative text matching fills only targets that do
 * not already have a validated model edge.
 */
function modelCapabilityEdges(review: AnyReview | undefined): unknown[] | undefined {
  const record = review as { standardEvaluation?: unknown; standard?: unknown } | undefined;
  const evaluation = (record?.standardEvaluation ?? record?.standard) as
    { capabilityEdges?: unknown } | undefined;
  return Array.isArray(evaluation?.capabilityEdges) ? evaluation.capabilityEdges : undefined;
}

function isSkillCapabilityEdge(value: unknown): value is SkillCapabilityEdge {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.capabilityName === 'string' &&
    record.capabilityName.trim().length > 0 &&
    typeof record.evidence === 'string' &&
    record.evidence.trim().length > 0 &&
    MODEL_EDGE_USAGES.includes(record.usage as SkillCapabilityEdge['usage']) &&
    MODEL_EDGE_CONFIDENCES.includes(record.confidence as SkillCapabilityEdge['confidence'])
  );
}

function missingCapabilities(review: AnyReview | undefined): Array<{
  capabilityName: string;
  evidence: string;
}> {
  const record = review as { standardEvaluation?: unknown; standard?: unknown } | undefined;
  const evaluation = (record?.standardEvaluation ?? record?.standard) as
    { missingCapabilities?: Array<{ capabilityName: string; evidence: string }> } | undefined;
  return Array.isArray(evaluation?.missingCapabilities) ? evaluation.missingCapabilities : [];
}

/**
 * Match a model-named capability to a snapshot node.
 *
 * Tiers run strictest first so an exact authored identity always wins, and the
 * separator-insensitive tier only rescues names the model re-spelled.
 */
function findCapabilityByName(
  capabilities: AgentMapCapability[],
  capabilityName: string,
): AgentMapCapability[] {
  const wanted = normalizeAgentMapKey(capabilityName);
  if (!wanted) return [];
  const byLabel = capabilities.filter(capability =>
    normalizeAgentMapKey(capability.label) === wanted);
  if (byLabel.length > 0) return byLabel;
  const bySchemaName = capabilities.filter(capability =>
    normalizeAgentMapKey(capability.schemaName) === wanted);
  if (bySchemaName.length > 0) return bySchemaName;

  // Fallback: the model echoed the skill text's own spelling. Compare with word
  // separators folded, so `Display Audit` still finds `display-audit`.
  const loose = normalizeCapabilityName(capabilityName);
  if (!loose) return [];
  const byLooseLabel = capabilities.filter(capability =>
    normalizeCapabilityName(capability.label) === loose);
  if (byLooseLabel.length > 0) return byLooseLabel;
  return capabilities.filter(capability =>
    normalizeCapabilityName(capability.schemaName) === loose);
}

function findCapability(
  capabilities: AgentMapCapability[],
  reference: SkillCapabilityReference,
): AgentMapCapability[] {
  const byUniqueId = reference.targetComponentIdUnique
    ? capabilities.filter(capability =>
        capability.category === reference.category &&
        capability.componentIdUnique === reference.targetComponentIdUnique)
    : [];
  if (byUniqueId.length > 0) return byUniqueId;

  const byComponentId = reference.targetComponentId
    ? capabilities.filter(capability =>
        capability.category === reference.category &&
        capability.componentId === reference.targetComponentId)
    : [];
  if (byComponentId.length > 0) return byComponentId;

  const schemaName = normalizeAgentMapKey(reference.targetSchemaName);
  return capabilities.filter(capability =>
    capability.category === reference.category &&
    normalizeAgentMapKey(capability.schemaName) === schemaName);
}

function addIssueDiagnostic(
  builder: AgentMapGraphBuilder,
  sourceId: string,
  issue: SkillCapabilityReferenceIssue,
): void {
  builder.diagnostics.push({
    code: issue.code,
    severity: 'warning',
    sourceId,
    message:
      `"${issue.matchedName}" matched multiple configured components, so no relationship was drawn.`,
  });
}

/**
 * Draw the edges the reviewing agent asserted, and record capabilities a skill
 * names but the agent does not have.
 *
 * Every edge must carry evidence, so an edge without it is dropped upstream in
 * `mapCapabilityEdges` rather than drawn: a line on a diagram reads as fact, and
 * an unverifiable line is worse than a missing one.
 */
function addModelInferredEdges(
  builder: AgentMapGraphBuilder,
  context: AgentMapNodeContext,
  skillId: string,
  edges: unknown[],
  absent: Array<{ capabilityName: string; evidence: string }>,
): Set<string> {
  const resolvedTargetIds = new Set<string>();
  const resolvedEdges = new Map<string, {
    edge: SkillCapabilityEdge;
    target: AgentMapCapability;
  }>();

  edges.forEach(candidate => {
    if (!isSkillCapabilityEdge(candidate)) {
      builder.diagnostics.push({
        code: 'skill-capability-edge-invalid',
        severity: 'info',
        sourceId: skillId,
        message: 'The reviewer returned an incomplete capability relationship, so it was ignored.',
      });
      return;
    }
    const edge = candidate;

    // Re-check on read. A review saved before this rule existed still holds
    // edges that were never validated, and the map draws persisted edges
    // directly, so trusting the stored value would let a known-bad edge through.
    if (!edge.evidence || !evidenceNamesCapability(edge.capabilityName, edge.evidence)) {
      builder.diagnostics.push({
        code: 'skill-capability-evidence-rejected',
        severity: 'info',
        sourceId: skillId,
        message:
          `The evidence cited for "${edge.capabilityName}" does not name it, so no relationship was drawn.`,
      });
      return;
    }

    const targets = findCapabilityByName(context.capabilities, edge.capabilityName);
    if (targets.length !== 1) {
      builder.diagnostics.push({
        code: targets.length > 1
          ? 'skill-reference-target-ambiguous'
          : 'skill-reference-target-missing',
        severity: 'warning',
        sourceId: skillId,
        message: targets.length > 1
          ? `"${edge.capabilityName}" matched multiple snapshot components; no relationship was drawn.`
          : `"${edge.capabilityName}" was not present in the reviewed snapshot; no relationship was drawn.`,
      });
      return;
    }

    const [target] = targets;
    const current = resolvedEdges.get(target.id);
    if (
      !current ||
      MODEL_EDGE_CONFIDENCE[edge.confidence] >
        MODEL_EDGE_CONFIDENCE[current.edge.confidence]
    ) {
      resolvedEdges.set(target.id, { edge, target });
    }
  });

  resolvedEdges.forEach(({ edge, target }) => {
    resolvedTargetIds.add(target.id);
    builder.addEdge({
      source: skillId,
      target: target.id,
      relationship: `${edge.usage}s ${target.category}`,
      provenance: 'model-inferred',
      evidence: `Reviewer (${edge.confidence} confidence): ${edge.evidence}`,
      confidence: MODEL_EDGE_CONFIDENCE[edge.confidence],
      resolution: 'resolved',
      directed: true,
    });
  });

  // A skill that names a capability the agent lacks will fail at runtime. There
  // is no node to draw to, so it surfaces as a diagnostic instead of an edge.
  //
  // The model's claim is checked before it is repeated. It names capabilities in
  // whatever spelling the skill text used, so a configured component it merely
  // re-spelled would otherwise be reported to the maker as missing -- telling
  // them to fix something that is not broken.
  absent.forEach(item => {
    const configured = findCapabilityByName(context.capabilities, item.capabilityName);
    if (configured.length > 0) {
      builder.diagnostics.push({
        code: 'skill-capability-name-mismatch',
        severity: 'info',
        sourceId: skillId,
        message:
          `The reviewer called this capability "${item.capabilityName}", but the agent has it ` +
          `as "${configured[0].label}", so it was not reported as missing.`,
      });
      return;
    }
    builder.diagnostics.push({
      code: 'skill-capability-not-configured',
      severity: 'warning',
      sourceId: skillId,
      message:
        `This skill relies on "${item.capabilityName}", which the agent does not have: ${item.evidence}`,
    });
  });

  return resolvedTargetIds;
}

/** Add only conservative, persisted-or-reproducible Skill→Tool/Knowledge inferences. */
export function addAgentMapRelationships(
  input: AgentMapBuildInput,
  builder: AgentMapGraphBuilder,
  context: AgentMapNodeContext,
  evidenceContext: 'saved-review' | 'live-connected-agent' = 'saved-review',
): void {
  context.skills.forEach(({ id: skillId, skill }) => {
    const review = (input.skillBundleReviews ?? []).find(candidate =>
      normalizeAgentMapKey(candidate.skillSchemaName) === normalizeAgentMapKey(skill.schemaname));

    const declaredEdges = modelCapabilityEdges(review);
    const modelTargetIds = addModelInferredEdges(
      builder,
      context,
      skillId,
      declaredEdges ?? [],
      missingCapabilities(review),
    );

    let references: SkillCapabilityReference[];
    let issues: SkillCapabilityReferenceIssue[];
    const persistedReferences = review?.capabilityReferences;
    const usesPersistedEvidence = persistedReferences !== undefined;

    if (persistedReferences !== undefined) {
      references = persistedReferences;
      issues = review?.capabilityReferenceIssues ?? [];
    } else if (skill.source === 'inline-markdown') {
      const analysis = analyzeSkillCapabilityReferences(skill.markdown, input.model);
      references = analysis.references;
      issues = analysis.issues;
    } else {
      references = [];
      issues = [];
      builder.diagnostics.push({
        code: 'skill-reference-evidence-not-captured',
        severity: 'info',
        sourceId: skillId,
        message: evidenceContext === 'live-connected-agent'
          ? 'Skill-bundle reference evidence is unavailable for this live connected-agent snapshot.'
          : 'This saved bundle review predates persisted skill-reference evidence. Rerun the review to populate links.',
      });
    }

    issues.forEach(issue => addIssueDiagnostic(builder, skillId, issue));
    const drawnTargetIds = new Set(modelTargetIds);
    const orderedReferences = [...references].sort((left, right) =>
      Number(left.matchKind === 'strong') - Number(right.matchKind === 'strong'));

    orderedReferences.forEach(reference => {
      if (
        usesPersistedEvidence &&
        !isSkillCapabilityReferenceSupported(reference, input.model)
      ) {
        builder.diagnostics.push({
          code: 'skill-reference-evidence-rejected',
          severity: 'info',
          sourceId: skillId,
          message:
            `"${reference.matchedName}" no longer meets the conservative reference rules, so no relationship was drawn.`,
        });
        return;
      }

      const targets = findCapability(context.capabilities, reference);
      if (targets.length !== 1) {
        builder.diagnostics.push({
          code: targets.length > 1
            ? 'skill-reference-target-ambiguous'
            : 'skill-reference-target-missing',
          severity: 'warning',
          sourceId: skillId,
          message: targets.length > 1
            ? `${reference.targetSchemaName} matched multiple snapshot components; no relationship was drawn.`
            : `${reference.targetSchemaName} was not present in the reviewed snapshot; no relationship was drawn.`,
        });
        return;
      }

      const [target] = targets;
      if (drawnTargetIds.has(target.id)) return;

      const exact = reference.matchKind !== 'strong';
      builder.addEdge({
        source: skillId,
        target: target.id,
        relationship: reference.category === 'tool'
          ? 'possibly references tool'
          : 'possibly references knowledge',
        provenance: exact ? 'textual-exact' : 'textual-strong',
        evidence: `SKILL.md line ${reference.lineNumber}: ${reference.evidence}`,
        confidence: exact ? 1 : 0.85,
        resolution: 'resolved',
        sourceField: `SKILL.md:${reference.lineNumber}`,
        directed: true,
      });
      drawnTargetIds.add(target.id);
    });
  });
}
