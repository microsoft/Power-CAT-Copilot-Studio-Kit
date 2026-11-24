import type { FlowStep } from "../contracts/flow-step";
import type { ComponentInfo } from "../services/botcomponents-service";
import { readableNodeIdentifier, topicNodes } from "./topic-node-metadata";

type Branch = NonNullable<FlowStep["conditionBranch"]>;
type AuthoredLabel = { branchName?: string; groupName?: string };
const labelCache = new WeakMap<ComponentInfo, { rawData?: string; labels: Map<string, AuthoredLabel> }>();

function branchKey(groupId: string, branchId: string): string {
  return `${groupId}\0${branchId}`;
}

function authoredLabel(component: ComponentInfo | undefined, branch: Branch): AuthoredLabel | undefined {
  if (!component?.rawData || !branch.groupId || !branch.branchId) return undefined;
  let cached = labelCache.get(component);
  if (!cached || cached.rawData !== component.rawData) {
    const labels = new Map<string, AuthoredLabel>();
    for (const node of topicNodes(component)) {
      if ("kind" in node && node.kind === "ConditionGroup" && "id" in node && typeof node.id === "string"
        && "conditions" in node && Array.isArray(node.conditions)) {
        const groupName = "displayName" in node && typeof node.displayName === "string"
          && node.displayName.trim() !== node.id ? node.displayName.trim() : undefined;
        if (groupName) labels.set(branchKey(node.id, `${node.id}ElseActions`), { groupName });
        const conditions: unknown[] = node.conditions;
        for (const condition of conditions) {
          if (!condition || typeof condition !== "object") continue;
          if ("id" in condition && typeof condition.id === "string") {
            const branchName = "displayName" in condition && typeof condition.displayName === "string"
              && condition.displayName.trim() !== condition.id ? condition.displayName.trim() : undefined;
            if (branchName || groupName) labels.set(branchKey(node.id, condition.id), { branchName, groupName });
          }
        }
      }
    }
    cached = { rawData: component.rawData, labels };
    labelCache.set(component, cached);
  }
  return cached.labels.get(branchKey(branch.groupId, branch.branchId));
}

function readableCondition(expression: string | undefined): string | undefined {
  const text = expression?.trim().replace(/^=\s*/, "");
  if (!text) return undefined;
  const variable = "((?:Topic|Global|System)\\.[A-Za-z_][\\w]*(?:\\.[A-Za-z_][\\w]*)*)";
  const blank = text.match(new RegExp(`^(!\\s*)?IsBlank\\(\\s*${variable}\\s*\\)$`, "i"));
  const notBlank = text.match(new RegExp(`^Not\\(\\s*IsBlank\\(\\s*${variable}\\s*\\)\\s*\\)$`, "i"));
  if (blank || notBlank) {
    const name = blank ? blank[2] : notBlank![1];
    return `${readableNodeIdentifier(name.replace(/^(Topic|Global|System)\./i, ""), false)} is ${notBlank || blank?.[1] ? "not blank" : "blank"}`;
  }
  // Keep complex Power Fx intact rather than guessing its meaning.
  return text;
}

export function resolveConditionBranchTitle(branch: Branch, component?: ComponentInfo): string {
  const recordedName = branch.displayName?.trim();
  const friendlyRecordedName = recordedName && recordedName !== branch.branchId
    && recordedName !== branch.groupId ? recordedName : undefined;
  const authored = friendlyRecordedName ? undefined : authoredLabel(component, branch);
  const label = friendlyRecordedName || authored?.branchName;
  if (label) return branch.isElse ? `Else: ${label}` : label;
  const fallback = branch.isElse ? "Else branch" : readableCondition(branch.expression)
    || readableNodeIdentifier(branch.branchId || recordedName || "")
    || "Recorded branch";
  return authored?.groupName ? `${authored.groupName}: ${fallback}` : fallback;
}
