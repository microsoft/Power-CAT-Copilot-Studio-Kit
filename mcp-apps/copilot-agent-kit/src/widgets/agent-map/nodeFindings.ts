import type { FindingView } from "../../agent-review/ui/components/viewTypes.js";
import type { AgentMapViewNode } from "./agentMapViewModel.js";

function componentKey(value: string | undefined): string {
  return (value ?? "").trim().replace(/^\{(.+)\}$/, "$1").toLowerCase();
}

const severityOrder = { error: 0, warning: 1, info: 2 } as const;

/** The reviewed agent itself. Its findings are all the findings of the review. */
export function isRootAgentNode(node: Pick<AgentMapViewNode, "category" | "parentId">): boolean {
  return node.category === "agent" && !node.parentId;
}

export function getNodeFindings(
  findings: readonly FindingView[],
  node: Pick<AgentMapViewNode, "category" | "parentId" | "componentIdUnique" | "actionPath">,
): { scope: "agent" | "component" | "unavailable"; findings: FindingView[] } {
  const sort = (items: readonly FindingView[]) =>
    [...items].sort((left, right) => severityOrder[left.sev] - severityOrder[right.sev]);
  if (isRootAgentNode(node)) {
    return { scope: "agent", findings: sort(findings) };
  }
  const identity = componentKey(node.componentIdUnique);
  if (!identity || (node.category === "action" && !node.actionPath)
    || (findings.length > 0 && !findings.some(finding => componentKey(finding.componentIdUnique)))) {
    return { scope: "unavailable", findings: [] };
  }
  return {
    scope: "component",
    findings: sort(findings.filter(finding =>
      componentKey(finding.componentIdUnique) === identity
      && (node.category !== "action" || (!!node.actionPath && finding.actionPath === node.actionPath)))),
  };
}

export interface NodeFindingBadge {
  /** All findings linked to the node: the same list that opening the node shows. */
  count: number;
  errors: number;
  warnings: number;
  info: number;
  /** The highest severity in the list. */
  severity: FindingView["sev"];
  /** For example "2 findings: 1 error, 1 warning". */
  label: string;
}

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The count badge of a map node, or undefined when the node has no component-level findings. */
export function getNodeFindingBadge(
  findings: readonly FindingView[],
  node: Pick<AgentMapViewNode, "category" | "parentId" | "componentIdUnique" | "actionPath">,
): NodeFindingBadge | undefined {
  const attribution = getNodeFindings(findings, node);
  if (attribution.scope !== "component" || !attribution.findings.length) return undefined;
  const linked = attribution.findings;
  const errors = linked.filter(finding => finding.sev === "error").length;
  const warnings = linked.filter(finding => finding.sev === "warning").length;
  const info = linked.length - errors - warnings;
  const parts = [
    errors ? countText(errors, "error", "errors") : "",
    warnings ? countText(warnings, "warning", "warnings") : "",
    info ? `${info} info` : "",
  ].filter(Boolean);
  return {
    count: linked.length,
    errors,
    warnings,
    info,
    severity: errors ? "error" : warnings ? "warning" : "info",
    label: `${countText(linked.length, "finding", "findings")}: ${parts.join(", ")}`,
  };
}
