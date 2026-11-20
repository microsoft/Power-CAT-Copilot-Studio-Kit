import type { ProcessedTurn } from '../contracts/transcript';
import type { ComponentInfo } from '../services/botcomponents-service';
import { flowDefinitionId } from './flow-run-links';

export function hasHarnessToolSteps(turns: ProcessedTurn[]): boolean {
  return turns.some(turn => turn.debugInfo?.stepExecutions?.some(step => step.toolKind === 'tool'));
}

export type HarnessToolReference = { taskDialogId: string; displayName?: string };

/** One resolver per bot-scoped metadata snapshot; repeated calls never reparse YAML. */
export function createHarnessFlowResolver(components: Record<string, ComponentInfo>) {
  const entries = Object.entries(components);
  const resolutions = new Map<string, string | undefined>();
  const flowSchemas = new Map<string, boolean>();
  return (step: HarnessToolReference): string | undefined => {
    const key = JSON.stringify([step.taskDialogId, step.displayName ?? '']);
    if (resolutions.has(key)) return resolutions.get(key);
    const matches = entries.filter(([schema, component]) => {
      if (schema === step.taskDialogId) return true;
      const leaf = schema.split('.tool.')[1];
      if (!leaf) return false;
      // Short harness names omit the generated suffix. Never guess across collisions.
      const suffix = leaf.slice(step.taskDialogId.length);
      return (leaf === step.taskDialogId || (leaf.startsWith(step.taskDialogId) && /^_[a-z0-9_]+$/i.test(suffix)))
        && !!step.displayName && component.name === step.displayName;
    });
    if (matches.length > 1) {
      throw new Error(`Multiple components match tool "${step.displayName || step.taskDialogId}". Flow links are unavailable.`);
    }
    const match = matches[0];
    if (match && !flowSchemas.has(match[0])) {
      flowSchemas.set(match[0], !!flowDefinitionId(match[1]));
    }
    const schema = match && flowSchemas.get(match[0]) ? match[0] : undefined;
    resolutions.set(key, schema);
    return schema;
  };
}

/** Components must belong to this transcript's agent, never a global short-name map. */
export function resolveHarnessFlowSteps(
  turns: ProcessedTurn[],
  components: Record<string, ComponentInfo>,
): ProcessedTurn[] {
  const resolve = createHarnessFlowResolver(components);
  return turns.map(turn => !turn.debugInfo?.stepExecutions ? turn : {
    ...turn,
    debugInfo: {
      ...turn.debugInfo,
      stepExecutions: turn.debugInfo.stepExecutions.map(step => {
        if (step.toolKind !== 'tool') return step;
        const schema = resolve(step);
        if (!schema) return step;
        return { ...step, taskDialogId: schema, type: 'Flow', subtitle: 'Flow' };
      }),
    },
  });
}
