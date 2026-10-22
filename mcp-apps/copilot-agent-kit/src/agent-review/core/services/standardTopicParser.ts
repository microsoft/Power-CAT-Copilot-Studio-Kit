import type { AeStandardTopic } from '../contracts/AgentsExperienceModel.js';
import type { BotComponent } from '../contracts/BotComponent.js';
import {
  normalizeStandardIdentity, ReviewSourceError,
  type StandardAction, type StandardDocument, type StandardJsonValue,
} from '../contracts/StandardReview.js';

function jsonValue(value: unknown, ancestors = new Set<object>(), depth = 0): value is StandardJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || depth > 128 || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  const next = new Set(ancestors).add(value);
  return Object.values(value).every(child => jsonValue(child, next, depth + 1));
}

function object(value: StandardJsonValue | undefined): StandardDocument | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

const nonempty = (value: StandardJsonValue | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function parseStandardTopic(component: BotComponent, value: unknown): AeStandardTopic {
  if (!jsonValue(value) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReviewSourceError('INVALID_SOURCE', `Component "${component.name}" must contain an acyclic JSON-compatible document.`);
  }
  const document: StandardDocument = value;
  const kind = document.kind;
  if (kind !== 'AdaptiveDialog' && kind !== 'TaskDialog' && kind !== 'AgentDialog') {
    throw new ReviewSourceError('UNSUPPORTED_COMPONENT', `Component kind "${String(kind)}" has no Standard topic evaluator.`);
  }
  if (!normalizeStandardIdentity(component.botcomponentid) || !normalizeStandardIdentity(component.componentidunique)
      || !component.schemaname.trim()) {
    throw new ReviewSourceError('INVALID_SOURCE', `Component "${component.name}" has no complete stable identity.`);
  }
  const beginDialog = object(document.beginDialog);
  if (kind !== 'TaskDialog' && (!beginDialog || !nonempty(beginDialog.kind))) {
    throw new ReviewSourceError('INVALID_SOURCE', `${kind} "${component.name}" has no valid beginDialog.`);
  }
  if (kind === 'AgentDialog' && !nonempty(object(document.settings)?.instructions)) {
    throw new ReviewSourceError('INVALID_SOURCE', `AgentDialog "${component.name}" has no instructions.`);
  }
  const task = object(document.action);
  if (kind === 'TaskDialog' && (!task || !nonempty(task.kind))) {
    throw new ReviewSourceError('INVALID_SOURCE', `TaskDialog "${component.name}" has no executable action.`);
  }

  const actions: StandardAction[] = [];
  const actionIds = new Set<string>();
  const addAction = (value: StandardJsonValue, path: string): void => {
    const action = object(value);
    if (!action || !nonempty(action.kind) || (action.id !== undefined && !nonempty(action.id))) {
      throw new ReviewSourceError('INVALID_SOURCE', `Action "${path}" in "${component.name}" has no valid kind or ID.`);
    }
    if (typeof action.id === 'string') {
      if (actionIds.has(action.id)) {
        throw new ReviewSourceError('INVALID_SOURCE', `Action ID "${action.id}" in "${component.name}" is duplicated.`);
      }
      actionIds.add(action.id);
    }
    actions.push({
      ...(typeof action.id === 'string' ? { id: action.id } : {}),
      kind: action.kind, path, document: action,
    });
    walkDialog(action, path);
  };
  const walkDialog = (dialog: StandardDocument, path: string): void => {
    // Only dialog-owned arrays are executable actions. Card JSON and schemas
    // can also contain "actions", but they are retained data, not dialog nodes.
    const branchKey = dialog.kind === 'ConditionGroup' ? 'conditions'
      : dialog.kind === 'SwitchCondition' ? 'cases' : undefined;
    for (const [key, child] of Object.entries(dialog)) {
      if (key === 'actions' || key === 'elseActions') {
        const childPath = `${path}/${key}`;
        if (!Array.isArray(child)) {
          throw new ReviewSourceError('INVALID_SOURCE', `"${childPath}" in "${component.name}" must be an action array.`);
        }
        child.forEach((action, index) => addAction(action, `${childPath}/${index}`));
      } else if (key === branchKey) {
        if (!Array.isArray(child)) {
          throw new ReviewSourceError('INVALID_SOURCE', `"${path}/${key}" in "${component.name}" must be a branch array.`);
        }
        child.forEach((value, index) => {
          const branch = object(value);
          if (!branch) {
            throw new ReviewSourceError('INVALID_SOURCE', `Branch "${path}/${key}/${index}" in "${component.name}" must be an object.`);
          }
          walkDialog(branch, `${path}/${key}/${index}`);
        });
      }
    }
  };
  if (kind === 'TaskDialog') addAction(document.action, '/action');
  else walkDialog(beginDialog!, '/beginDialog');
  const sourceText = component.data || component.content;
  if (!sourceText.trim()) {
    throw new ReviewSourceError('INVALID_SOURCE', `Component "${component.name}" has no reviewable source.`);
  }
  return {
    name: component.name, schemaname: component.schemaname, kind,
    componentId: component.botcomponentid, componentIdUnique: component.componentidunique,
    description: component.description
      || (typeof document.modelDescription === 'string' ? document.modelDescription : undefined),
    document, sourceText, sourceField: component.data ? 'data' : 'content',
    ...(component.content && component.content !== sourceText ? { componentContent: component.content } : {}),
    actions,
  };
}
