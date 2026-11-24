import { useMemo } from 'react';

import type { ConnectedAgentInfo } from '../../contracts/connected-agent';
import type { MCPServerInfo, ProcessedTurn, StepExecution } from '../../contracts/transcript';
import type { ComponentInfo } from '../../services/botcomponents-service';
import { componentColor } from '../../theme/component-colors';
import { GENERATIVE_THINKING_TASK_ID } from '../../contracts/generative-markers';
import type { FlowStep } from '../../contracts/flow-step';
import { buildFlowSteps } from '../../utils/build-flow-steps';
import {
  execTimeToMs,
  guessStepSubtitle,
  resolveExecutionTimeString,
  resolveStepName,
} from '../../utils/step-classification';
import { fmtMs as fmtDuration } from '../../utils/format-ms';
import { countSteps, stepDurationMs } from '../../utils/timeline-insights';
import { activityTimestampMs } from '../../utils/transcript/timestamp';
import { hasStepTiming, turnTimeBounds } from '../../utils/turn-timing';

export interface WorkflowNodeInfo {
  id: string;
  title: string;
  subtitle: string;
  failed: boolean;
  turnNumber: number;
  /**
   * The `buildFlowSteps` payload backing this node. Carries every field the
   * legacy debug panel used to render type-specific details, so the detail pane
   * can show the same data without re-deriving it.
   */
  flowStep?: FlowStep;
  /** Turn that owns the activities/executions this node was derived from. */
  sourceTurn?: ProcessedTurn;
  /** Connected-agent invocation that owns this node. */
  connectedAgent?: ConnectedAgentInfo;
}

export interface WorkflowCanvasProps {
  /** Processed transcript turns to render as grouped execution-flow turns. */
  turns: ProcessedTurn[];
  /** Optional botcomponent lookup used to replace schema names with friendly names. */
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  /** Connected-agent metadata used to populate nested child steps when available. */
  connectedAgents?: ConnectedAgentInfo[];
  /** Uses the 340px node-width variant for embedded/Activities layouts. */
  compact?: boolean;
  /** Enables node/header buttons and selection callbacks. Defaults to read-only. */
  clickable?: boolean;
  /** Currently selected workflow node id, rendered with the design current state. */
  selectedNodeId?: string;
  /** Called when a workflow node or connected-agent group header is selected. */
  onNodeSelect?: (node: WorkflowNodeInfo) => void;
  /** Selects the first selectable node once when a rendered turn set is opened. */
  autoSelectFirst?: boolean;
  /** Shows Raw JSON / Inspect buttons in each turn header. Defaults to true. */
  showTurnActions?: boolean;
  /** Optional Raw JSON action for a turn. */
  onShowRawTurn?: (turn: WorkflowTurn) => void;
  /** Optional Inspect action for a turn. */
  onInspectTurn?: (turn: WorkflowTurn) => void;
  /** Turn selected by cross-tab navigation. */
  selectedTurnId?: string;
  /** Dataverse organization URL used to open connected-agent transcript records. */
  environmentUrl?: string;
  className?: string;
  /** Captured presentation: retain recorded reasoning and honest empty startup groups. */
  offlineMode?: boolean;
}

export interface WorkflowStats {
  /** Timed executable steps. Diagnostic rows such as variables and intent traces are excluded. */
  steps: number;
  agentHandoffs: number;
  failed: number;
}

export interface WorkflowTurn {
  id: string;
  turnNumber: number;
  userText: string;
  assistantTurn: ProcessedTurn;
  rows: WorkflowRow[];
  durationMs: number;
  failedCount: number;
  hasError: boolean;
}

export interface WorkflowNode {
  offlineReasoning?: StepExecution['offlineReasoning'];
  id: string;
  title: string;
  subtitle: string;
  color: string;
  failed: boolean;
  duration: string;
  durationMs: number;
  thought?: string;
  isReasoning?: boolean;
  turnNumber: number;
  /** Composite `taskDialogId:stepId` used to correlate with `buildFlowSteps`. */
  stepKey?: string;
  flowStep?: FlowStep;
  sourceTurn?: ProcessedTurn;
  connectedAgent?: ConnectedAgentInfo;
}

export type WorkflowRow =
  | { kind: 'standalone'; node: WorkflowNode }
  | { kind: 'reason'; node: WorkflowNode }
  | {
      kind: 'agent';
      node: WorkflowNode;
      children: WorkflowNode[];
      connectedAgent?: ConnectedAgentInfo;
      childTranscriptState?: 'not-loaded' | 'loading' | 'loaded' | 'error';
      childTranscriptError?: string;
    };

interface WorkflowModel {
  turns: WorkflowTurn[];
  stats: WorkflowStats;
  types: string[];
}

interface AgentEntry {
  node: WorkflowNode;
  children: WorkflowNode[];
  invokeExec: StepExecution;
  row: Extract<WorkflowRow, { kind: 'agent' }>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function flowStepActivityIdentity(flowStep: FlowStep, turn: ProcessedTurn): string {
  // A DialogTracing activity can contain multiple branches; its ID alone
  // would collapse them. Keep each recorded action and execution occurrence.
  if (flowStep.kind === 'condition') return flowStep.key;
  const activity =
    typeof flowStep.activityIndex === 'number'
      ? turn.activities[flowStep.activityIndex]
      : undefined;
  if (activity?.id) return `${flowStep.kind}:activity:${activity.id}`;
  if (activity) {
    return [
      flowStep.kind,
      activity.name ?? activity.valueType ?? activity.type,
      activity.timestamp ?? '',
      JSON.stringify(activity.value ?? null),
    ].join(':');
  }
  return `${flowStep.kind}:step:${flowStep.key}:${flowStep.taskDialogId ?? ''}:${flowStep.stepId ?? ''}`;
}

function buildAgentOwnership(turn: ProcessedTurn): Map<string, string> {
  const owner = new Map<string, string>();
  const activities = Array.isArray(turn.activities) ? turn.activities : [];
  const planParentStepByPlanId = new Map<string, string>();

  for (const activity of activities) {
    if (activity.name !== 'DynamicPlanReceived' && activity.valueType !== 'DynamicPlanReceived') continue;
    const value = asRecord(activity.value);
    const planId = readString(value, 'planIdentifier') ?? '';
    const parentStepId = readString(value, 'parentPlanStepIdentifier') ?? '';
    if (planId && parentStepId) planParentStepByPlanId.set(planId, parentStepId);
  }

  const agentStepIds = new Set<string>();
  for (const activity of activities) {
    if (activity.name !== 'DynamicPlanStepTriggered' && activity.valueType !== 'DynamicPlanStepTriggered') continue;
    const value = asRecord(activity.value);
    const stepId = readString(value, 'stepId') ?? '';
    const taskDialogId = readString(value, 'taskDialogId') ?? '';
    const planIdentifier = readString(value, 'planIdentifier') ?? '';
    const rawType = readString(value, 'type') ?? '';
    if (!stepId || !taskDialogId) continue;

    const isAgent =
      rawType === 'Agent' ||
      taskDialogId.includes('.agent.') ||
      taskDialogId.includes('InvokeConnectedAgentTaskAction');

    if (isAgent) {
      agentStepIds.add(stepId);
      owner.set(stepId, stepId);
      continue;
    }

    const parentPlanStepId = planParentStepByPlanId.get(planIdentifier) ?? '';
    const owningAgent = owner.get(parentPlanStepId) ?? (agentStepIds.has(parentPlanStepId) ? parentPlanStepId : '');
    if (owningAgent) owner.set(stepId, owningAgent);
  }

  return owner;
}

function makeConnectedAgentMap(connectedAgents: ConnectedAgentInfo[] | undefined): Map<string, ConnectedAgentInfo> {
  const map = new Map<string, ConnectedAgentInfo>();
  for (const agent of connectedAgents ?? []) {
    if (agent.stepId) map.set(`step:${agent.stepId}`, agent);
    if (agent.dialogSchemaName) map.set(`tdi:${agent.dialogSchemaName}`, agent);
    if (agent.botSchemaName) map.set(`bot:${agent.botSchemaName}`, agent);
  }
  return map;
}

function isFailure(exec: StepExecution): boolean {
  const state = String(exec.state ?? '').toLowerCase();
  return state === 'failed' || state === 'error' || state === 'faulted' || state === 'blocked' || !!exec.errorMessage || !!exec.blockedError;
}

function stepType(exec: StepExecution, componentNameBySchemaName?: Record<string, ComponentInfo>): string {
  return (
    exec.subtitle?.trim() ||
    guessStepSubtitle(exec.taskDialogId, exec.type, componentNameBySchemaName?.[exec.taskDialogId], exec.observation) ||
    'Step'
  );
}

function toWorkflowNode(
  exec: StepExecution,
  turn: ProcessedTurn,
  turnNumber: number,
  componentNameBySchemaName?: Record<string, ComponentInfo>,
  offlineMode = false,
): WorkflowNode {
  const subtitle = stepType(exec, componentNameBySchemaName);
  const execTime = resolveExecutionTimeString(exec);
  const durationMs = execTime ? execTimeToMs(execTime) : stepDurationMs(exec);
  return {
    id: `${turn.id}:${exec.taskDialogId}:${exec.stepId || exec.triggeredAt || ''}`,
    title: exec.displayName?.trim() || resolveStepName(exec.taskDialogId, componentNameBySchemaName),
    subtitle,
    color: componentColor(subtitle),
    failed: isFailure(exec),
    duration: exec.taskDialogId === GENERATIVE_THINKING_TASK_ID && !offlineMode ? '' :
      !hasStepTiming(exec) ? 'Unknown' : fmtDuration(durationMs),
    durationMs,
    thought: exec.thought?.trim() || undefined,
    offlineReasoning: offlineMode ? exec.offlineReasoning : undefined,
    isReasoning: offlineMode && !!exec.offlineReasoning,
    turnNumber,
    stepKey: `${exec.taskDialogId ?? ''}:${exec.stepId ?? ''}`,
  };
}

function mcpNodes(
  turn: ProcessedTurn,
  turnNumber: number,
  componentNameBySchemaName?: Record<string, ComponentInfo>,
): WorkflowNode[] {
  const servers: MCPServerInfo[] = turn.debugInfo?.mcpServers?.length
    ? turn.debugInfo.mcpServers
    : turn.debugInfo?.mcpServerInfo
      ? [turn.debugInfo.mcpServerInfo]
      : [];
  if (!servers.length || !turn.activities.some((activity) => activity.name === 'DynamicServerInitialize')) return [];

  return servers.map((server) => {
    const schemaName = server.schemaName ?? '';
    const initActivity = turn.activities.find((activity) => {
      const dialog = readString(asRecord(activity.value), 'dialogSchemaName') ?? '';
      return activity.name === 'DynamicServerInitialize' && (!schemaName || dialog === schemaName);
    });
    const toolsActivity = turn.activities.find((activity) => {
      const dialog = readString(asRecord(activity.value), 'dialogSchemaName') ?? '';
      return activity.name === 'DynamicServerToolsList' && (!schemaName || dialog === schemaName);
    });
    const start = activityTimestampMs(initActivity);
    const end = activityTimestampMs(toolsActivity);
    const timingKnown = start !== undefined && end !== undefined && end >= start;
    const durationMs = timingKnown ? end - start : 0;
    const info = schemaName ? componentNameBySchemaName?.[schemaName] : undefined;
    // Keep MCP initialization distinct from executable tools in the flow and
    // detail pane. The title still comes from the component display metadata.
    const title = info?.modelDisplayName?.trim() || info?.name?.trim() || server.name || 'MCP Server';
    const subtitle = 'MCP server';
    return {
      id: `${turn.id}:mcp:${schemaName || server.name}`,
      title,
      subtitle,
      color: componentColor(subtitle),
      failed: false,
      duration: timingKnown ? fmtDuration(durationMs) : 'Unknown',
      durationMs,
      turnNumber,
      stepKey: `mcp:server:${schemaName || server.name}`,
    };
  });
}

function childTopicSourceTurn(
  agent: ConnectedAgentInfo,
  topic: ConnectedAgentInfo['childTopics'][number],
): ProcessedTurn | undefined {
  for (const turn of agent.childTranscript ?? []) {
    const executions = turn.debugInfo?.stepExecutions ?? [];
    if (
      executions.some((exec) =>
        topic.stepId
          ? exec.stepId === topic.stepId
          : exec.taskDialogId === topic.schemaId,
      )
    ) {
      return turn;
    }

    const servers = turn.debugInfo?.mcpServers?.length
      ? turn.debugInfo.mcpServers
      : turn.debugInfo?.mcpServerInfo
        ? [turn.debugInfo.mcpServerInfo]
        : [];
    if (servers.some((server) => server.schemaName === topic.schemaId)) return turn;
  }
  return undefined;
}

function childTopicFlowStep(
  topic: ConnectedAgentInfo['childTopics'][number],
  sourceTurn: ProcessedTurn | undefined,
  componentNameBySchemaName?: Record<string, ComponentInfo>,
): FlowStep | undefined {
  if (!sourceTurn) return undefined;
  const mcpTools = sourceTurn.debugInfo?.mcpTools ?? [];
  const steps = buildFlowSteps(
    sourceTurn,
    componentNameBySchemaName,
    mcpTools,
    sourceTurn.debugInfo?.mcpServerInfo?.name,
  );
  return steps.find((step) => {
    if (topic.stepId && step.stepId === topic.stepId) return true;
    if (step.kind === 'mcp') return step.mcpServerSchemaName === topic.schemaId;
    return !topic.stepId && step.taskDialogId === topic.schemaId;
  });
}

export function buildWorkflowModel(
  turns: ProcessedTurn[],
  componentNameBySchemaName?: Record<string, ComponentInfo>,
  connectedAgents?: ConnectedAgentInfo[],
  offlineMode = false,
): WorkflowModel {
  const agentInfoByKey = makeConnectedAgentMap(connectedAgents);
  const workflowTurns: WorkflowTurn[] = [];
  const seenTypes = new Set<string>();
  const types: string[] = [];
  let turnNumber = 0;
  let lastUserText = '';

  // Group each user turn with the assistant turns that follow it. Both parsers
  // attach `stepExecutions` to the *user* turn, so an assistant-only walk finds
  // nothing — `TopicFlowDiagram` in the host feature iterates every turn for the
  // same reason. Grouping keeps one diagram per exchange while reading steps off
  // whichever turn actually carries them.
  const groups: Array<{ user: string; source: ProcessedTurn[] }> = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      lastUserText = (turn.content ?? '').trim();
      groups.push({ user: lastUserText, source: [turn] });
      continue;
    }
    if (turn.role !== 'assistant') continue;
    if (groups.length) groups[groups.length - 1].source.push(turn);
    else groups.push({ user: '', source: [turn] });
  }

  for (const group of groups) {
    const execsForGroup = group.source.flatMap((t) => t.debugInfo?.stepExecutions ?? []);
    if (!execsForGroup.length && !group.user && !offlineMode) continue;
    const turn = group.source[0];
    lastUserText = group.user;
    if (turn.role === 'user') turnNumber += 1;

    const ownerByStepId = new Map<string, string>();
    for (const t of group.source) for (const [k, v] of buildAgentOwnership(t)) ownerByStepId.set(k, v);
    const execs = execsForGroup
      .filter((exec) => exec.taskDialogId && (offlineMode || exec.taskDialogId !== GENERATIVE_THINKING_TASK_ID))
      .sort((a, b) => {
        const aTime = a.triggeredAt ? Date.parse(a.triggeredAt) : 0;
        const bTime = b.triggeredAt ? Date.parse(b.triggeredAt) : 0;
        return aTime && bTime ? aTime - bTime : 0;
      });
    if (offlineMode) {
      const byKey = new Map(execs.map(exec => [`${exec.taskDialogId}:${exec.stepId}`, exec]));
      for (const exec of execs) {
        let parentKey = exec.parentStepKey;
        const seen = new Set<string>();
        while (parentKey && !seen.has(parentKey)) {
          seen.add(parentKey);
          const parent = byKey.get(parentKey);
          if (!parent) break;
          const type = stepType(parent, componentNameBySchemaName);
          if (type === 'Connected agent' || type === 'Child agent') {
            if (!ownerByStepId.has(exec.stepId)) ownerByStepId.set(exec.stepId, parent.stepId);
            break;
          }
          parentKey = parent.parentStepKey;
        }
      }
    }

    const rows: WorkflowRow[] = [];
    const agentByStepId = new Map<string, AgentEntry>();
    const seenTopLevel = new Set<string>();
    const seenChildrenPerAgent = new Map<string, Set<string>>();

    for (const node of group.source.flatMap((t) => mcpNodes(t, turnNumber, componentNameBySchemaName))) {
      rows.push({ kind: 'standalone', node });
      if (!seenTypes.has(node.subtitle)) {
        seenTypes.add(node.subtitle);
        types.push(node.subtitle);
      }
    }

    for (const exec of execs) {
      if (exec.taskDialogId === 'P:CaptureContextTool' || exec.taskDialogId === 'P:SendMessageTool') continue;
      const subtitle = stepType(exec, componentNameBySchemaName);
      const isAgent = subtitle === 'Connected agent' || subtitle === 'Child agent';
      const owner = ownerByStepId.get(String(exec.stepId)) ?? '';
      const isChildOfAgent = !isAgent && owner.length > 0 && agentByStepId.has(owner);

      if (!seenTypes.has(subtitle)) {
        seenTypes.add(subtitle);
        types.push(subtitle);
      }

      if (isChildOfAgent) {
        const seen = seenChildrenPerAgent.get(owner) ?? new Set<string>();
        const childKey = exec.stepId || exec.taskDialogId;
        if (seen.has(childKey)) continue;
        seen.add(childKey);
        seenChildrenPerAgent.set(owner, seen);
        agentByStepId.get(owner)?.children.push(toWorkflowNode(exec, turn, turnNumber, componentNameBySchemaName, offlineMode));
        continue;
      }

      const topLevelKey = exec.stepId || exec.taskDialogId;
      if (seenTopLevel.has(topLevelKey)) continue;
      seenTopLevel.add(topLevelKey);

      const node = toWorkflowNode(exec, turn, turnNumber, componentNameBySchemaName, offlineMode);
      if (isAgent) {
        const row: Extract<WorkflowRow, { kind: 'agent' }> = {
          kind: 'agent',
          node,
          children: [],
        };
        const entry: AgentEntry = { node, children: row.children, invokeExec: exec, row };
        agentByStepId.set(String(exec.stepId), entry);
        seenChildrenPerAgent.set(String(exec.stepId), new Set<string>());
        rows.push(row);
      } else {
        rows.push({ kind: node.offlineReasoning ? 'reason' : 'standalone', node });
      }
    }

    for (const entry of agentByStepId.values()) {
      const info =
        agentInfoByKey.get(`step:${String(entry.invokeExec.stepId)}`) ??
        agentInfoByKey.get(`tdi:${entry.invokeExec.taskDialogId}`) ??
        agentInfoByKey.get(`bot:${entry.invokeExec.taskDialogId}`);
      if (!info) continue;

      entry.row.connectedAgent = info;
      entry.node.connectedAgent = info;
      entry.row.childTranscriptState = info.isFetching
        ? 'loading'
        : info.fetchError
          ? 'error'
          : info.isFetched
            ? 'loaded'
            : 'not-loaded';
      entry.row.childTranscriptError = info.fetchError;

      const resolvedAgentName =
        componentNameBySchemaName?.[info.dialogSchemaName]?.modelDisplayName?.trim() ||
        componentNameBySchemaName?.[info.dialogSchemaName]?.name?.trim() ||
        componentNameBySchemaName?.[info.botSchemaName]?.modelDisplayName?.trim() ||
        componentNameBySchemaName?.[info.botSchemaName]?.name?.trim() ||
        '';
      if (resolvedAgentName) entry.node.title = resolvedAgentName;
      else if (!entry.invokeExec.displayName?.trim() && info.displayName?.trim()) entry.node.title = info.displayName.trim();

      if (entry.children.length > 0) {
        for (const child of entry.children) child.connectedAgent = info;
        continue;
      }

      const childSeen = new Set<string>();
      for (let index = 0; index < (info.childTopics ?? []).length; index += 1) {
        const topic = info.childTopics[index];
        if (!topic) continue;
        const baseKey = topic.schemaId || topic.displayName || 'step';
        const key = topic.stepId ? `${baseKey}:${topic.stepId}` : `${baseKey}:${index}`;
        if (childSeen.has(key)) continue;
        childSeen.add(key);

        const isReasoning = topic.schemaId === GENERATIVE_THINKING_TASK_ID || offlineMode && !!topic.offlineReasoning;
        const subtitle = isReasoning
          ? 'Reasoning'
          : guessStepSubtitle(topic.schemaId, topic.type, componentNameBySchemaName?.[topic.schemaId], topic.observation) || 'Step';
        if (!isReasoning && !seenTypes.has(subtitle)) {
          seenTypes.add(subtitle);
          types.push(subtitle);
        }
        const infoForTopic = componentNameBySchemaName?.[topic.schemaId];
        const title = isReasoning
          ? 'Reasoning'
          : infoForTopic?.modelDisplayName?.trim() || infoForTopic?.name?.trim() || topic.displayName || topic.schemaId;
        const durationMs = typeof topic.executionTimeSeconds === 'number' ? topic.executionTimeSeconds * 1000 : execTimeToMs(topic.executionTime);
        const sourceTurn = childTopicSourceTurn(info, topic);
        const flowStep = childTopicFlowStep(topic, sourceTurn, componentNameBySchemaName);
        entry.children.push({
          id: `${entry.node.id}:child:${key}`,
          title,
          subtitle,
          color: componentColor(subtitle),
          failed: String(topic.state ?? '').toLowerCase() === 'failed',
          duration: (!isReasoning || offlineMode) && durationMs > 0 ? fmtDuration(durationMs) : '',
          durationMs: isReasoning && !offlineMode ? 0 : durationMs,
          thought: topic.thought?.trim() || undefined,
          isReasoning,
          offlineReasoning: offlineMode ? topic.offlineReasoning : undefined,
          turnNumber,
          stepKey: flowStep
            ? flowStep.kind === 'mcp'
              ? flowStep.key
              : `${flowStep.taskDialogId ?? ''}:${flowStep.stepId ?? ''}`
            : topic.stepId
              ? `${topic.schemaId}:${topic.stepId}`
              : topic.schemaId,
          flowStep,
          sourceTurn,
          connectedAgent: info,
        });
      }
    }

    // ---------------------------------------------------------------------
    // Merge in the diagnostic node kinds the exec-only walk cannot see.
    //
    // `buildFlowSteps` emits executable steps and diagnostic kinds, including
    // recorded condition branches and grouped topic traces. Building nodes
    // from `stepExecutions` alone only ever produces `step`/`mcp`, silently
    // dropping reasoning traces, intent recognition, variable assignments,
    // errors and generative-answers metadata. Here the flow steps drive the
    // ordering and supply each node's detail payload, while the exec-derived
    // rows above keep the connected-agent nesting they already resolved.
    // ---------------------------------------------------------------------
    const flowSteps: FlowStep[] = [];
    const turnByFlowKey = new Map<string, ProcessedTurn>();
    const seenFlowStepActivities = new Set<string>();
    const traceStepByTopic = new Map<string, FlowStep>();
    for (const t of group.source) {
      // The MCP arguments matter: `buildFlowSteps` resolves an MCP tool step's
      // display name from `llmIdentifierPrefix` on the matching entry in the
      // turn's tools list, falling back to the server name. Passing empty
      // values (as this call previously did) silently degraded every MCP tool
      // call to its raw taskDialogId and suppressed the server-init nodes.
      const mcpTools = Array.isArray(t.debugInfo?.mcpTools) ? t.debugInfo.mcpTools : [];
      const mcpServerFallbackName = t.debugInfo?.mcpServerInfo?.name;
      for (const fs of buildFlowSteps(t, componentNameBySchemaName, mcpTools, mcpServerFallbackName)) {
        if (fs.kind === 'trace') {
          const topicIdentity = fs.title.trim().toLocaleLowerCase();
          const existing = traceStepByTopic.get(topicIdentity);
          if (existing) {
            existing.traceActivities = [
              ...(existing.traceActivities ?? []),
              ...(fs.traceActivities ?? []),
            ];
            const count = existing.traceActivities.length;
            existing.statusText = `${count} activit${count === 1 ? 'y' : 'ies'}`;
            continue;
          }
          traceStepByTopic.set(topicIdentity, fs);
        }
        const identity = flowStepActivityIdentity(fs, t);
        if (seenFlowStepActivities.has(identity)) continue;
        seenFlowStepActivities.add(identity);
        flowSteps.push(fs);
        if (!turnByFlowKey.has(fs.key)) turnByFlowKey.set(fs.key, t);
      }
    }

    const rowByStepKey = new Map<string, WorkflowRow>();
    const allNodes: WorkflowNode[] = [];
    // Step keys already consumed as children of a connected-agent group. A
    // diagnostic FlowStep for one of these must not also be synthesised as a
    // top-level row, or the same step renders twice — once nested and once
    // standalone.
    const childStepKeys = new Set<string>();
    const agentHeaderNodes = new Set<WorkflowNode>();
    for (const row of rows) {
      allNodes.push(row.node);
      if (row.node.stepKey && !rowByStepKey.has(row.node.stepKey)) rowByStepKey.set(row.node.stepKey, row);
      if (row.kind === 'agent') {
        agentHeaderNodes.add(row.node);
        allNodes.push(...row.children);
        for (const child of row.children) {
          if (child.stepKey) childStepKeys.add(child.stepKey);
        }
      }
    }
    const nodeByStepKey = new Map<string, WorkflowNode>();
    for (const node of allNodes) {
      if (node.stepKey && !nodeByStepKey.has(node.stepKey)) nodeByStepKey.set(node.stepKey, node);
    }

    const orderedRows: WorkflowRow[] = [];
    const emittedRows = new Set<WorkflowRow>();

    for (const flowStep of flowSteps) {
      const owningTurn = turnByFlowKey.get(flowStep.key) ?? turn;
      const stepKey =
        flowStep.kind === 'mcp' || flowStep.kind === 'trace' || flowStep.kind === 'condition'
          ? flowStep.key
          : `${flowStep.taskDialogId ?? ''}:${flowStep.stepId ?? ''}`;
      const matchedNode = nodeByStepKey.get(stepKey);

      if (matchedNode) {
        matchedNode.flowStep = flowStep;
        matchedNode.sourceTurn = owningTurn;
        if (!matchedNode.thought && flowStep.thought) matchedNode.thought = flowStep.thought;
        // Adopt the label the source computed for MCP **tool calls**.
        // `toWorkflowNode` names a node via `resolveStepName`, which for an
        // `MCP:` task id returns only the raw trailing tool identifier, whereas
        // `buildFlowSteps` resolves the friendly `llmIdentifierPrefix` (falling
        // back to the server name). Other step kinds keep their existing names,
        // which already match the source flow diagram, and the connected-agent
        // group header keeps its agent name.
        const isMcpToolCall = String(flowStep.taskDialogId ?? '').startsWith('MCP:');
        if (isMcpToolCall && !agentHeaderNodes.has(matchedNode) && flowStep.title?.trim()) {
          matchedNode.title = flowStep.title.trim();
        }
        const matchedRow = rowByStepKey.get(stepKey);
        if (matchedRow && !emittedRows.has(matchedRow)) {
          emittedRows.add(matchedRow);
          orderedRows.push(matchedRow);
        }
        continue;
      }

      // No exec-derived node: this is a diagnostic kind, so synthesise one.
      if (flowStep.kind === 'step' || flowStep.kind === 'code') continue;
      // `mcpNodes()` already owns MCP server cards for this turn; synthesising
      // one here would emit a second card for the same server whenever the two
      // key derivations disagree.
      if (flowStep.kind === 'mcp') continue;
      // Already rendered nested under its connected agent.
      if (childStepKeys.has(stepKey)) continue;
      const subtitle = flowStep.subtitle?.trim() || 'Diagnostic';

      // Reasoning (ThinkingTrace) renders as inline plain text rather than a
      // clickable card — the same treatment the legacy debug panel gave it, and
      // the same treatment Copilot Studio itself uses.
      if (flowStep.kind === 'thinking') {
        if (!flowStep.thought?.trim()) continue;
        const thinkingExec = execsForGroup.find(
          (exec) => exec.taskDialogId === GENERATIVE_THINKING_TASK_ID && String(exec.stepId ?? '') === String(flowStep.stepId ?? ''),
        );
        const thinkingMs = thinkingExec && hasStepTiming(thinkingExec) ? stepDurationMs(thinkingExec) : undefined;
        orderedRows.push({
          kind: 'reason',
          node: {
            id: `${turn.id}:${flowStep.key}`,
            title: flowStep.title || 'Reasoning',
            subtitle,
            color: componentColor(subtitle),
            failed: false,
            duration: thinkingMs !== undefined ? fmtDuration(thinkingMs) : '',
            durationMs: thinkingMs ?? 0,
            thought: flowStep.thought,
            turnNumber,
            stepKey,
            flowStep,
            sourceTurn: owningTurn,
          },
        });
        continue;
      }

      if (!seenTypes.has(subtitle)) {
        seenTypes.add(subtitle);
        types.push(subtitle);
      }
      orderedRows.push({
        kind: 'standalone',
        node: {
          id: `${turn.id}:${flowStep.key}`,
          title: flowStep.title || subtitle,
          subtitle,
          color: componentColor(subtitle),
          failed: flowStep.kind === 'error' || flowStep.finishedState === 'failed',
          duration: flowStep.duration ?? '',
          durationMs: 0,
          thought: flowStep.thought,
          turnNumber,
          stepKey,
          flowStep,
          sourceTurn: owningTurn,
        },
      });
    }

    for (const row of rows) {
      if (emittedRows.has(row)) continue;
      orderedRows.push(row);
    }
    for (const node of allNodes) {
      if (!node.sourceTurn) node.sourceTurn = turn;
    }
    rows.length = 0;
    rows.push(...orderedRows);

    const failedCount = rows.reduce((count, row) => {
      const childFailures = row.kind === 'agent' ? row.children.filter((child) => child.failed).length : 0;
      return count + (row.node.failed ? 1 : 0) + childFailures;
    }, 0);

    if (rows.length || group.user || offlineMode) {
      const { startMs, endMs } = turnTimeBounds(group.source);
      workflowTurns.push({
        id: turn.id,
        turnNumber,
        userText: lastUserText,
        assistantTurn: turn,
        rows,
        durationMs: endMs - startMs,
        failedCount,
        hasError: failedCount > 0,
      });
    }
  }

  const stats = workflowTurns.reduce<WorkflowStats>(
    (acc, turn) => {
      for (const row of turn.rows) {
        if (row.kind === 'agent') {
          acc.agentHandoffs += 1;
        }
      }
      acc.failed += turn.failedCount;
      return acc;
    },
    { steps: countSteps(turns), agentHandoffs: 0, failed: 0 },
  );

  return { turns: workflowTurns, stats, types };
}


export function useWorkflowCanvasModel(
  turns: ProcessedTurn[],
  componentNameBySchemaName?: Record<string, ComponentInfo>,
  connectedAgents?: ConnectedAgentInfo[],
  offlineMode = false,
): WorkflowModel {
  return useMemo(
    () => buildWorkflowModel(turns, componentNameBySchemaName, connectedAgents, offlineMode),
    [turns, componentNameBySchemaName, connectedAgents, offlineMode],
  );
}
