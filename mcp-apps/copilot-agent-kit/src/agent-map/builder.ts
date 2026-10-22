import {
  analyzeSkillCapabilityReferences,
  isStandardTopicComponent,
  type AgentsExperienceModel,
  type ReviewCorpusComponent,
  type SkillReviewCorpusComponent,
  type SkillCapabilityReference,
} from "../agent-review/core/index.js";
import type {
  AgentMapDiagnostic,
  AgentMapEdge,
  AgentMapGraph,
  AgentMapNode,
  AgentMapNodeCategory,
} from "./types.js";

function key(value: string | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function mapId(category: AgentMapNodeCategory, value: string): string {
  const safe = value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${category}:${safe || "unnamed"}`;
}

function details(values: Record<string, unknown>): AgentMapNode["details"] {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
      || (Array.isArray(value) && value.every((item) => typeof item === "string"))),
  ) as AgentMapNode["details"];
}

function capabilityTarget(
  nodes: AgentMapNode[],
  reference: SkillCapabilityReference,
): AgentMapNode | undefined {
  const candidates = nodes.filter((node) =>
    node.category === reference.category
    && (
      (reference.targetComponentIdUnique
        && node.componentIdUnique === reference.targetComponentIdUnique)
      || (reference.targetComponentId && node.componentId === reference.targetComponentId)
      || key(node.schemaName) === key(reference.targetSchemaName)
    ));
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function buildDeterministicAgentMap(input: {
  agentId: string;
  agentName: string;
  agentIconBase64?: string;
  agentIcons?: Record<string, string>;
  environmentId: string;
  environmentName: string;
  model: AgentsExperienceModel;
  corpusComponents: ReviewCorpusComponent[];
}): AgentMapGraph {
  const { model } = input;
  const nodes: AgentMapNode[] = [];
  const edges: AgentMapEdge[] = [];
  const diagnostics: AgentMapDiagnostic[] = [];
  const rootId = mapId("agent", input.agentId);

  const addNode = (node: AgentMapNode) => {
    if (!nodes.some((candidate) => candidate.id === node.id)) nodes.push(node);
  };
  const addEdge = (edge: Omit<AgentMapEdge, "id">) => {
    const id = `${edge.source}|${edge.target}|${edge.provenance}`;
    if (!edges.some((candidate) => candidate.id === id)) edges.push({ ...edge, id });
  };
  const addComponent = (node: AgentMapNode) => {
    addNode({
      ...node,
      parentId: node.parentId ?? rootId,
      depth: node.depth ?? 1,
    });
    addEdge({
      source: rootId,
      target: node.id,
      relationship: "contains",
      provenance: "structural",
      evidence: "Configured directly on the selected agent.",
      confidence: 1,
    });
  };

  addNode({
    id: rootId,
    category: "agent",
    depth: 0,
    label: input.agentName,
    subtitle: model.harness === "standard"
      ? "Standard Copilot Studio agent"
      : model.agentSettings.modelSeries ?? "GitHub Copilot agent",
    componentId: input.agentId,
    iconBase64: input.agentIconBase64,
    description: model.agentSettings.instructions,
    details: details({
      "Model series": model.agentSettings.modelSeries ?? "Not captured",
      "Web search": model.agentSettings.enableWebSearch ?? false,
      Memory: model.agentSettings.enableMemory ?? false,
      Tools: model.tools.length,
      Skills: model.skills.length,
      ...((model.topics?.length ?? 0) > 0 ? { Topics: model.topics!.length } : {}),
      Knowledge: model.knowledge.length,
      "Connected agents": model.connectedAgents.length,
      Triggers: model.triggers.length,
      "Evaluation sets": model.evaluationSets.length,
      "Test cases": model.testCases.length,
    }),
    warnings: model.agentSettings.instructions.trim() ? [] : ["Instructions are empty."],
  });

  model.tools.forEach((tool) => addComponent({
    id: mapId("tool", tool.componentIdUnique ?? tool.componentId ?? tool.schemaname),
    category: "tool",
    label: tool.displayName ?? tool.name,
    subtitle: tool.kind === "McpTool" ? "MCP tool" : "Connector tool",
    componentId: tool.componentId,
    componentIdUnique: tool.componentIdUnique,
    schemaName: tool.schemaname,
    description: tool.description,
    details: details({
      Kind: tool.kind,
      Authentication: tool.authMode ?? "Not captured",
      Connector: tool.connectorId ?? "Not captured",
      Operation: tool.operationId ?? "Not captured",
      "Connection reference": tool.connectionReference ?? "Not captured",
    }),
    warnings: tool.connectionReference ? [] : ["Connection reference is missing."],
  }));

  model.skills.forEach((skill) => addComponent({
    id: mapId("skill", skill.componentIdUnique ?? skill.componentId ?? skill.schemaname),
    category: "skill",
    label: skill.frontmatterName ?? skill.name,
    subtitle: skill.source === "zip-bundle" ? "Skill bundle" : "Inline skill",
    componentId: skill.componentId,
    componentIdUnique: skill.componentIdUnique,
    schemaName: skill.schemaname,
    description: skill.frontmatterDescription,
    details: details({
      Source: skill.source,
      "Supporting resources": skill.resourceCount,
      "Bundle marker": skill.bundleMarker ?? "None",
    }),
    warnings: [],
  }));

  model.topics?.forEach((topic) => {
    const topicNodeId = mapId("topic", topic.componentIdUnique);
    addComponent({
      id: topicNodeId,
      category: "topic",
      label: topic.name,
      subtitle: topic.kind,
      componentId: topic.componentId,
      componentIdUnique: topic.componentIdUnique,
      schemaName: topic.schemaname,
      description: topic.description,
      details: details({
        Kind: topic.kind,
        "Source field": topic.sourceField,
        "Original source": topic.sourceText,
        "Original document": JSON.stringify(topic.document, null, 2),
        "Component content": topic.componentContent,
        Actions: topic.actions.length,
      }),
      warnings: [],
    });
    topic.actions.forEach((action) => {
      const node: AgentMapNode = {
        id: `${mapId("action", topic.componentIdUnique)}:${encodeURIComponent(action.path)}`,
        category: "action",
        label: action.id ?? action.kind,
        subtitle: action.kind,
        componentId: topic.componentId,
        componentIdUnique: topic.componentIdUnique,
        actionPath: action.path,
        schemaName: topic.schemaname,
        parentId: topicNodeId,
        depth: 2,
        details: details({
          Kind: action.kind,
          "Action ID": action.id,
          "Action path": action.path,
          "Original action": JSON.stringify(action.document, null, 2),
        }),
        warnings: [],
      };
      addNode(node);
      addEdge({
        source: node.parentId!,
        target: node.id,
        relationship: "contains action",
        provenance: "structural",
        evidence: `Original ${topic.kind} action at ${action.path}.`,
        confidence: 1,
      });
    });
  });

  model.knowledge.forEach((source) => addComponent({
    id: mapId("knowledge", source.componentIdUnique ?? source.componentId ?? source.schemaname),
    category: "knowledge",
    label: source.name,
    subtitle: source.sourceKind ?? "Knowledge source",
    componentId: source.componentId,
    componentIdUnique: source.componentIdUnique,
    schemaName: source.schemaname,
    details: details({ "Source kind": source.sourceKind ?? "Not captured" }),
    warnings: [],
  }));

  model.connectedAgents.forEach((agent) => addComponent({
    id: mapId("connected-agent", agent.componentIdUnique ?? agent.componentId ?? agent.schemaname),
    category: "connected-agent",
    label: agent.displayName ?? agent.name,
    subtitle: "Connected agent",
    componentId: agent.componentId,
    componentIdUnique: agent.componentIdUnique,
    schemaName: agent.schemaname,
    targetAgentSchemaName: agent.botSchemaName,
    iconBase64: agent.botSchemaName
      ? input.agentIcons?.[key(agent.botSchemaName)]
      : undefined,
    description: agent.description,
    details: details({
      "Target schema": agent.botSchemaName ?? "Not captured",
      "History type": agent.historyTypeKind ?? "Not captured",
    }),
    warnings: agent.botSchemaName ? [] : ["Target agent schema is missing."],
  }));

  model.triggers.forEach((trigger) => addComponent({
    id: mapId("trigger", trigger.componentIdUnique ?? trigger.componentId ?? trigger.schemaname),
    category: "trigger",
    label: trigger.name,
    subtitle: trigger.kind ?? "Trigger",
    componentId: trigger.componentId,
    componentIdUnique: trigger.componentIdUnique,
    schemaName: trigger.schemaname,
    details: details({
      Kind: trigger.kind ?? "Not captured",
      "Flow ID": trigger.flowId ?? "Not captured",
    }),
    warnings: [],
  }));

  model.evaluationSets.forEach((set) => addComponent({
    id: mapId("evaluation-set", set.componentIdUnique ?? set.componentId ?? set.id ?? set.schemaname),
    category: "evaluation-set",
    label: set.displayName ?? set.name,
    subtitle: "Evaluation set",
    componentId: set.componentId ?? set.id,
    componentIdUnique: set.componentIdUnique,
    schemaName: set.schemaname,
    details: details({
      Graders: set.graders,
      "Configured graders": set.graderDetails?.filter((grader) => grader.configured).length ?? 0,
    }),
    warnings: set.graderDetails?.some((grader) => !grader.configured)
      ? ["One or more graders are not configured."]
      : [],
  }));

  model.testCases.forEach((testCase) => addComponent({
    id: mapId("test-case", testCase.componentIdUnique ?? testCase.componentId ?? testCase.schemaname),
    category: "test-case",
    label: testCase.name,
    subtitle: testCase.multiTurn ? "Multi-turn test" : "Test case",
    componentId: testCase.componentId,
    componentIdUnique: testCase.componentIdUnique,
    schemaName: testCase.schemaname,
    description: testCase.input,
    details: details({
      Input: testCase.input ?? "Not captured",
      Expected: testCase.expected ?? "Not captured",
      Turns: testCase.turns ?? 1,
      Source: testCase.source ?? "Not captured",
      "Expected capabilities": (testCase.expectedTools ?? []).map((step) => step.schemaName),
    }),
    warnings: [],
  }));

  model.unknownKinds.forEach((unknown) => addComponent({
    id: mapId("unknown", unknown.componentIdUnique ?? unknown.componentId ?? unknown.schemaname),
    category: "unknown",
    label: unknown.schemaname,
    subtitle: unknown.kind ?? "Unresolved component",
    componentId: unknown.componentId,
    componentIdUnique: unknown.componentIdUnique,
    schemaName: unknown.schemaname,
    description: unknown.warning,
    details: details({
      Kind: unknown.kind ?? "Unavailable",
      "Component type": unknown.componenttype,
    }),
    warnings: [unknown.warning],
  }));

  model.skills.forEach((skill) => {
    const skillNode = nodes.find((node) =>
      node.category === "skill" && key(node.schemaName) === key(skill.schemaname));
    if (!skillNode) return;
    const corpusComponent = input.corpusComponents
      .filter((component): component is SkillReviewCorpusComponent => !isStandardTopicComponent(component))
      .find((component) =>
      key(component.skillSchemaName) === key(skill.schemaname)
      || component.skillComponentId === skill.componentId);
    const markdown = corpusComponent?.skill_markdown ?? skill.markdown;
    if (!markdown.trim()) {
      diagnostics.push({
        code: "skill-reference-evidence-unavailable",
        severity: "info",
        sourceId: skillNode.id,
        message: "No assembled skill text was available for deterministic reference analysis.",
      });
      return;
    }
    const analysis = analyzeSkillCapabilityReferences(markdown, model);
    analysis.issues.forEach((issue) => diagnostics.push({
      code: issue.code,
      severity: "warning",
      sourceId: skillNode.id,
      message: `"${issue.matchedName}" matched multiple configured components, so no relationship was drawn.`,
    }));
    analysis.references.forEach((reference) => {
      const target = capabilityTarget(nodes, reference);
      if (!target) {
        diagnostics.push({
          code: "skill-reference-target-unresolved",
          severity: "warning",
          sourceId: skillNode.id,
          message: `"${reference.matchedName}" could not be resolved to one configured component.`,
        });
        return;
      }
      const exact = reference.matchKind !== "strong";
      addEdge({
        source: skillNode.id,
        target: target.id,
        relationship: reference.category === "tool"
          ? "possibly references tool"
          : "possibly references knowledge",
        provenance: exact ? "textual-exact" : "textual-strong",
        evidence: `SKILL.md line ${reference.lineNumber}: ${reference.evidence}`,
        confidence: exact ? 1 : 0.85,
      });
    });
  });

  const skillNodes = nodes.filter((node) => node.category === "skill");
  const skillReferenceEdges = edges.filter((edge) => edge.provenance !== "structural");
  const linkedSkillIds = new Set(skillReferenceEdges.map((edge) => edge.source));
  return {
    agent: {
      id: input.agentId,
      name: input.agentName,
      environmentId: input.environmentId,
      environmentName: input.environmentName,
    },
    nodes,
    edges,
    diagnostics,
    summary: {
      nodeCount: nodes.length,
      componentCount: nodes.length - 1,
      edgeCount: edges.length,
      unresolvedCount: nodes.filter((node) => node.category === "unknown").length,
      skillReferenceCount: skillReferenceEdges.length,
      linkedSkillCount: skillNodes.filter((node) => linkedSkillIds.has(node.id)).length,
      unlinkedSkillCount: skillNodes.filter((node) => !linkedSkillIds.has(node.id)).length,
    },
  };
}

function summarizeGraph(
  nodes: AgentMapNode[],
  edges: AgentMapEdge[],
): AgentMapGraph["summary"] {
  const skillNodes = nodes.filter((node) => node.category === "skill");
  const skillReferenceEdges = edges.filter((edge) => edge.provenance !== "structural");
  const linkedSkillIds = new Set(skillReferenceEdges.map((edge) => edge.source));
  return {
    nodeCount: nodes.length,
    componentCount: Math.max(0, nodes.length - 1),
    edgeCount: edges.length,
    unresolvedCount: nodes.filter((node) => node.category === "unknown").length,
    skillReferenceCount: skillReferenceEdges.length,
    linkedSkillCount: skillNodes.filter((node) => linkedSkillIds.has(node.id)).length,
    unlinkedSkillCount: skillNodes.filter((node) => !linkedSkillIds.has(node.id)).length,
  };
}

/** Merge one live connected-agent snapshot as a bounded second level. */
export function expandConnectedAgentMap(
  current: AgentMapGraph,
  sourceNodeId: string,
  child: AgentMapGraph,
): AgentMapGraph {
  const baseNodes = current.nodes
    .filter((node) => !node.id.startsWith("expanded:"))
    .map((node) => {
      if (node.category !== "connected-agent") return { ...node };
      const nextDetails = { ...node.details };
      for (const key of [
        "Resolved agent ID",
        "Loaded components",
        "Target instructions",
        "Snapshot source",
      ]) {
        delete nextDetails[key];
      }
      return { ...node, details: nextDetails };
    });
  const baseIds = new Set(baseNodes.map((node) => node.id));
  const baseEdges = current.edges.filter((edge) =>
    baseIds.has(edge.source) && baseIds.has(edge.target));
  const source = baseNodes.find((node) =>
    node.id === sourceNodeId && node.category === "connected-agent");
  const childRoot = child.nodes.find((node) => node.category === "agent");
  if (!source || !childRoot) return current;

  const idMap = new Map<string, string>([[childRoot.id, sourceNodeId]]);
  for (const node of child.nodes) {
    if (node.id === childRoot.id) continue;
    idMap.set(node.id, `expanded:${sourceNodeId}:${node.id}`);
  }

  const childNodes = child.nodes
    .filter((node) => node.id !== childRoot.id)
    .map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      parentId: node.parentId
        ? idMap.get(node.parentId) ?? sourceNodeId
        : sourceNodeId,
      depth: (node.depth ?? 1) + 1,
      details: {
        ...node.details,
        "Snapshot source": `Connected agent ${child.agent.name}`,
      },
    }));
  const childEdges = child.edges.flatMap((edge) => {
    const sourceId = idMap.get(edge.source);
    const targetId = idMap.get(edge.target);
    if (!sourceId || !targetId) return [];
    return [{
      ...edge,
      id: `expanded:${sourceNodeId}:${edge.id}`,
      source: sourceId,
      target: targetId,
      evidence: edge.provenance === "structural"
        ? `Loaded from connected agent ${child.agent.name}.`
        : edge.evidence,
    }];
  });
  const nodes = [
    ...baseNodes.map((node) => node.id === sourceNodeId
      ? {
          ...node,
          details: {
            ...node.details,
            "Resolved agent ID": child.agent.id,
            "Loaded components": child.summary.componentCount,
            "Snapshot source": "Loaded from the source environment on selection",
          },
          warnings: [],
        }
      : node),
    ...childNodes,
  ];
  const edges = [...baseEdges, ...childEdges];
  return {
    ...current,
    nodes,
    edges,
    diagnostics: [
      ...current.diagnostics.filter((item) =>
        !item.sourceId || baseIds.has(item.sourceId)),
      ...child.diagnostics.map((item) => ({
        ...item,
        sourceId: item.sourceId ? idMap.get(item.sourceId) ?? sourceNodeId : sourceNodeId,
      })),
    ],
    summary: summarizeGraph(nodes, edges),
  };
}
