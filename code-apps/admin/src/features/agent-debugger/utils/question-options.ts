import type { Activity } from "../contracts/transcript";
import type { ComponentInfo } from "../services/botcomponents-service";
import { topicNodes } from "./topic-node-metadata";

export interface QuestionOptions {
  nodeId: string;
  topicId: string;
  prompt: string;
  messageId?: string;
  options: Array<{ id: string; label: string }>;
  selectedId?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Resolve only traced questions; configuration is not evidence that a node ran. */
export function collectQuestionOptions(
  activities: readonly Activity[],
  components: Record<string, ComponentInfo> = {},
): QuestionOptions[] {
  const results: QuestionOptions[] = [];
  const definitions = new Map<string, { node: Record<string, unknown>; options: QuestionOptions["options"]; entityId?: string } | null>();
  let lastMessage: Activity | undefined;
  let pending: QuestionOptions | undefined;
  let session: string | undefined;

  for (const activity of activities) {
    if (activity.mergedSessionKey !== session) {
      lastMessage = undefined;
      pending = undefined;
      session = activity.mergedSessionKey;
    }
    if (activity.type === "message") lastMessage = activity;
    if (activity.name !== "DialogTracing" && activity.valueType !== "DialogTracing") continue;
    const actions = record(activity.value)?.actions;
    if (!Array.isArray(actions)) continue;
    for (const raw of actions) {
      const action = record(raw);
      if (action?.actionType !== "Question") continue;
      const nodeId = text(action.actionId);
      const topicId = text(action.topicId);
      if (!nodeId || !topicId) continue;
      const key = JSON.stringify([topicId, action.dialogComponentId, nodeId]);
      if (!definitions.has(key)) {
        const component = components[topicId];
        const matchesComponent = !component?.botComponentId || !action.dialogComponentId
          || component.botComponentId.toLowerCase() === String(action.dialogComponentId).toLowerCase();
        const nodes = matchesComponent
          ? topicNodes(component).filter(node => node.kind === "Question" && node.id === nodeId) : [];
        const node = nodes.length === 1 ? nodes[0] : undefined;
        const entity = record(node?.entity);
        const entityId = text(entity?.entityId);
        const list = entity?.kind === "ClosedListEntity" ? entity
          : entity?.kind === "ClosedListEntityReference" && entityId
            ? topicNodes(components[entityId]).find(item => item.kind === "ClosedListEntity") : undefined;
        const items = Array.isArray(list?.items) ? list.items : [];
        const options = items.flatMap(item => {
          const value = record(item);
          const id = text(value?.id);
          const label = text(value?.displayName);
          return id && label ? [{ id, label }] : [];
        });
        const selectedItems = entity?.selectedItems;
        const filtered = Array.isArray(selectedItems)
          ? selectedItems.flatMap(id => {
            const option = options.find(item => item.id === id);
            return option ? [option] : [];
          }) : options;
        // Do not show a partial list when configuration no longer resolves every ID.
        const complete = !Array.isArray(selectedItems) || filtered.length === selectedItems.length;
        definitions.set(key, node && filtered.length && complete ? { node, options: filtered, entityId } : null);
      }
      const definition = definitions.get(key);
      if (!definition) {
        pending = undefined;
        continue;
      }
      const prompt = text(definition.node.prompt) ?? nodeId;
      const isPromptMessage = lastMessage?.type === "message"
        && (lastMessage.from?.role === 0 || lastMessage.from?.role === "bot")
        && lastMessage.text?.trim() === prompt
        && !!activity.replyToId && activity.replyToId === lastMessage.replyToId;
      let question = pending?.nodeId === nodeId && pending.topicId === topicId ? pending : undefined;
      if (isPromptMessage && lastMessage?.id !== question?.messageId) question = undefined;
      if (!question) {
        question = { nodeId, topicId, prompt, options: definition.options,
          messageId: isPromptMessage ? lastMessage?.id : undefined };
        results.push(question);
      }
      pending = question;
      const variable = text(definition.node.variable)?.replace(/^init:/, "");
      const variableMatch = variable?.match(/^(Topic|Global)\.(.+)$/);
      const state = record(action.variableState);
      const scope = record(state?.[variableMatch?.[1] === "Global" ? "globalState" : "dialogState"]);
      const answer = variableMatch ? record(scope?.[variableMatch[2]]) : undefined;
      const answerType = record(answer?.type);
      if (answer?.$kind === "OptionDataValue" && answerType?.$kind === "ClosedListOptionSet"
        && definition.entityId && answerType.schemaName === definition.entityId
        && definition.options.some(option => option.id === answer.value)) {
        question.selectedId = String(answer.value);
      }
    }
  }
  return results;
}
