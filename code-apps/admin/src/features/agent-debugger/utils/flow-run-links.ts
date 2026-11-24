import type { FlowStep } from '../contracts/flow-step';
import type { ProcessedTurn, StepExecution } from '../contracts/transcript';
import type { ComponentInfo } from '../services/botcomponents-service';
import { topicNodes } from './topic-node-metadata';
import { normalizeTimestampMs } from './transcript/timestamp';

export const FLOW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FlowRunWindow = { from: string; to: string };

/** Resolve only explicit, unambiguous flow references, never display names. */
export function flowDefinitionId(component: ComponentInfo | undefined): string | undefined {
  const nodes = topicNodes(component).filter(node =>
    node.kind === 'InvokeFlowTaskAction' || node.kind === 'InvokeFlowAction' || node.kind === 'WorkflowTool',
  );
  const references = nodes.map(node => node.kind === 'WorkflowTool' ? node.workflowId : node.flowId);
  if (!references.length || references.some(id => typeof id !== 'string' || !FLOW_ID_PATTERN.test(id))) {
    return undefined;
  }
  const ids = new Set(references.map(id => String(id).toLowerCase()));
  return ids.size === 1 ? [...ids][0] : undefined;
}

/** Match the selected invocation, including child steps; never fall back to schema alone. */
export function flowStepExecution(turn: ProcessedTurn | null, step?: FlowStep): StepExecution | undefined {
  if (!step?.stepId || !step.taskDialogId) return undefined;
  const matches = (turn?.debugInfo?.stepExecutions ?? []).filter(exec =>
    exec.stepId === step.stepId && exec.taskDialogId === step.taskDialogId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** The orchestration interval includes input collection; Dataverse run times may lose fractions. */
export function flowRunWindow(execution: StepExecution | undefined): FlowRunWindow | undefined {
  if (execution?.blockedError) return undefined;
  const start = normalizeTimestampMs(execution?.triggeredAt);
  const end = normalizeTimestampMs(execution?.finishedAt);
  if (start === undefined || end === undefined || end < start) return undefined;
  const from = new Date(start - 1000);
  const to = new Date(end + 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return undefined;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/** Use the runtime run name, not the Dataverse flowrun row GUID. */
export function flowRunUrl(baseUrl: string, environmentId: string, flowId: string, runName: string): string {
  return `${flowHistoryUrl(baseUrl, environmentId, flowId)}/${encodeURIComponent(runName)}`;
}

export function flowHistoryUrl(baseUrl: string, environmentId: string, flowId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/environments/${encodeURIComponent(environmentId)}/flows/${encodeURIComponent(flowId)}/runs`;
}
