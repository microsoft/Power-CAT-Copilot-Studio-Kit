import type { AgentsExperienceModel, AeTool } from '../../contracts/AgentsExperienceModel';
import type {
  CostArchitectureFacts,
  CostOpportunity,
  EvidenceConfidence,
  PotentialImpact,
} from '../../contracts/CostEfficiency';

const IMPACT_RANK: Record<PotentialImpact, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const CONFIDENCE_RANK: Record<EvidenceConfidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function stableCompare(left: string, right: string): number {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedNames(values: Array<{ name: string }>): string[] {
  return values.map(value => value.name).sort(stableCompare);
}

interface DuplicateOperationGroup {
  connectorId: string;
  operationId: string;
  names: string[];
}

function duplicateOperationGroups(tools: AeTool[]): DuplicateOperationGroup[] {
  const groups = new Map<string, DuplicateOperationGroup>();
  const ordered = [...tools].sort((left, right) => stableCompare(
    `${left.connectorId ?? ''}:${left.operationId ?? ''}:${left.name}`,
    `${right.connectorId ?? ''}:${right.operationId ?? ''}:${right.name}`,
  ));

  for (const tool of ordered) {
    if (!tool.connectorId?.trim() || !tool.operationId?.trim()) continue;
    const key = `${normalized(tool.connectorId)}::${normalized(tool.operationId)}`;
    const group = groups.get(key);
    if (group) {
      group.names.push(tool.name);
      continue;
    }
    groups.set(key, {
      connectorId: tool.connectorId.trim(),
      operationId: tool.operationId.trim(),
      names: [tool.name],
    });
  }

  return [...groups.entries()]
    .filter(([, group]) => group.names.length > 1)
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([, group]) => ({
      ...group,
      names: [...group.names].sort(stableCompare),
    }));
}

function compareOpportunities(left: CostOpportunity, right: CostOpportunity): number {
  const impactDifference =
    IMPACT_RANK[right.potentialImpact] - IMPACT_RANK[left.potentialImpact];
  if (impactDifference !== 0) return impactDifference;

  const confidenceDifference =
    CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  if (confidenceDifference !== 0) return confidenceDifference;

  return stableCompare(left.id, right.id);
}

/** Collects direct saved-configuration facts without assigning runtime meaning. */
export function collectCostArchitectureFacts(
  model: AgentsExperienceModel,
): CostArchitectureFacts {
  const triggers = model.triggers ?? [];
  return {
    modelSeries: model.agentSettings.modelSeries,
    connectorTools: model.tools.filter(tool => tool.kind === 'ConnectorTool').length,
    mcpTools: model.tools.filter(tool => tool.kind === 'McpTool').length,
    skills: model.skills.length,
    knowledgeSources: model.knowledge.length,
    connectedAgents: model.connectedAgents.length,
    triggers: triggers.length,
    webSearchEnabled: model.agentSettings.enableWebSearch,
    evaluationSets: model.evaluationSets.length,
    testCases: model.testCases.length,
    toolAssertionCases: model.testCases.filter(
      testCase => (testCase.expectedTools?.length ?? 0) > 0,
    ).length,
  };
}

/** Builds ranked configuration opportunities with explicit quality safeguards. */
export function buildCostOpportunities(
  model: AgentsExperienceModel,
): CostOpportunity[] {
  const opportunities: CostOpportunity[] = [];
  const facts = collectCostArchitectureFacts(model);
  // Reviews saved before trigger extraction can omit this field.
  const triggerNames = sortedNames(model.triggers ?? []);

  if (triggerNames.length > 0) {
    opportunities.push({
      id: 'account-for-trigger-volume',
      title: 'Account for autonomous trigger volume',
      potentialImpact: 'high',
      confidence: 'high',
      evidenceLabel: 'configured',
      evidence: [
        `${triggerNames.length} trigger${triggerNames.length === 1 ? '' : 's'} configured: ${triggerNames.join(', ')}.`,
      ],
      recommendation:
        'Add expected trigger runs to the monthly task input. Review frequency and ownership before changing a schedule.',
      qualityRisk:
        'A lower trigger frequency can delay automated work or miss a required business window.',
      validationPlan:
        'Compare completed outcomes, run volume, and billed credits before and after a controlled schedule change.',
    });
  }

  if (facts.evaluationSets === 0 || facts.testCases === 0) {
    opportunities.push({
      id: 'establish-evaluation-baseline',
      title: 'Establish a quality baseline before cost changes',
      potentialImpact: 'high',
      confidence: 'high',
      evidenceLabel: 'configured',
      evidence: [
        `${facts.evaluationSets} evaluation sets and ${facts.testCases} test cases are configured.`,
      ],
      recommendation:
        'Create representative Light, Medium, and Heavy task cases before changing models, grounding, tools, or delegation.',
      qualityRisk:
        'A narrow baseline can hide regressions or favor one execution path.',
      validationPlan:
        'Record quality results and billed credits for the baseline, make one change, and rerun the same cases.',
      relatedRuleIds: ['EVL-01'],
    });
  } else if (model.tools.length > 0 && facts.toolAssertionCases === 0) {
    opportunities.push({
      id: 'add-tool-assertion-baseline',
      title: 'Add tool-selection checks to the evaluation baseline',
      potentialImpact: 'medium',
      confidence: 'high',
      evidenceLabel: 'configured',
      evidence: [
        `${model.tools.length} tools are configured, but no test case declares an expected tool step.`,
      ],
      recommendation:
        'Add representative cases that declare the expected tool for paths affected by a cost-oriented change.',
      qualityRisk:
        'Overly strict assertions can reject a valid alternative execution path.',
      validationPlan:
        'Run the same cases before and after one configuration change and compare tool selection, outcomes, and billed credits.',
    });
  }

  const duplicates = duplicateOperationGroups(model.tools);
  if (duplicates.length > 0) {
    opportunities.push({
      id: 'remove-duplicate-tool-operations',
      title: 'Remove or differentiate duplicate tool operations',
      potentialImpact: 'high',
      confidence: 'high',
      evidenceLabel: 'configured',
      evidence: duplicates.map(group =>
        `${group.names.join(' and ')} use ${group.connectorId}/${group.operationId}.`,
      ),
      recommendation:
        'Remove an accidental duplicate, or give each tool a distinct purpose and selection description.',
      qualityRisk:
        'A tool can use a different connection or business rule even when its operation is the same.',
      validationPlan:
        'Test every affected task path, confirm the required connection and outcome, and compare billed credits in a controlled run.',
      relatedRuleIds: ['TOL-05'],
    });
  }

  const weakToolNames = sortedNames(model.tools.filter(
    tool => !tool.description || tool.description.trim().split(/\s+/).length < 2,
  ));
  if (weakToolNames.length > 0) {
    opportunities.push({
      id: 'clarify-tool-selection',
      title: 'Clarify when each tool should be selected',
      potentialImpact: 'medium',
      confidence: 'high',
      evidenceLabel: 'configured',
      evidence: [
        `${weakToolNames.length} tool descriptions are missing or contain fewer than two words: ${weakToolNames.join(', ')}.`,
      ],
      recommendation:
        'Add clear when-to-use, when-not-to-use, and expected-outcome text to each description.',
      qualityRisk:
        'A description that is too narrow can prevent a valid tool selection.',
      validationPlan:
        'Use representative positive and negative cases to compare selection accuracy, task quality, and billed credits.',
      relatedRuleIds: ['TOL-02'],
    });
  }

  const connectedAgentNames = sortedNames(model.connectedAgents);
  if (connectedAgentNames.length > 0) {
    opportunities.push({
      id: 'bound-connected-agent-delegation',
      title: 'Bound connected-agent delegation',
      potentialImpact: 'medium',
      confidence: 'medium',
      evidenceLabel: 'configured',
      evidence: [
        `${connectedAgentNames.length} connected agent${connectedAgentNames.length === 1 ? '' : 's'} configured: ${connectedAgentNames.join(', ')}.`,
      ],
      recommendation:
        'Give each connected agent a narrow delegation description and review how much conversation history it needs.',
      qualityRisk:
        'Reducing delegated scope or context can lower completion quality for complex tasks.',
      validationPlan:
        'Test direct and delegated variants on the same tasks, then compare completion quality, step count, and billed credits.',
      relatedRuleIds: ['CON-03', 'CON-04'],
    });
  }

  if (facts.webSearchEnabled && facts.knowledgeSources > 0) {
    const knowledgeNames = sortedNames(model.knowledge);
    opportunities.push({
      id: 'scope-grounding-paths',
      title: 'Scope web and configured knowledge grounding',
      potentialImpact: 'medium',
      confidence: 'medium',
      evidenceLabel: 'configured',
      evidence: [
        `Web search is enabled and ${knowledgeNames.length} knowledge source${knowledgeNames.length === 1 ? '' : 's'} are configured: ${knowledgeNames.join(', ')}.`,
      ],
      recommendation:
        'Define which task types need web search and which should use configured knowledge. Do not disable a path without coverage tests.',
      qualityRisk:
        'Narrower grounding can reduce freshness, source coverage, or answer completeness.',
      validationPlan:
        'Run source-specific cases with one grounding change at a time and compare citations, answer quality, and billed credits.',
    });
  }

  return opportunities.sort(compareOpportunities);
}
