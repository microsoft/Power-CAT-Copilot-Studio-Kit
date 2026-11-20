import { load, YAMLException } from "js-yaml";
import type { ComponentInfo } from "../services/botcomponents-service";

type Node = Record<string, unknown>;
const cache = new WeakMap<ComponentInfo, { rawData: string; nodes: Node[] }>();

export function topicNodes(component: ComponentInfo | undefined): Node[] {
  if (!component?.rawData) return [];
  const existing = cache.get(component);
  if (existing?.rawData === component.rawData) return existing.nodes;
  let parsed: unknown;
  try {
    parsed = load(component.rawData);
  } catch (error) {
    if (!(error instanceof YAMLException)) throw error;
    console.warn("[AgentDebugger] Could not parse topic metadata; using transcript data.");
  }
  const nodes: Node[] = [];
  const seen = new Set<object>();
  const pending: unknown[] = [parsed];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (!Array.isArray(node)) nodes.push(node as Node);
    pending.push(...Object.values(node));
  }
  cache.set(component, { rawData: component.rawData, nodes });
  return nodes;
}

export function readableNodeIdentifier(value: string, stripSuffix = true): string {
  const withoutSuffix = stripSuffix ? value.replace(/_([A-Za-z0-9]{6,10})$/, (match, suffix: string) =>
    /\d/.test(suffix) && /[a-zA-Z]/.test(suffix) ? "" : match) : value;
  const words = withoutSuffix
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .split(/\s+/);
  return words.map((word, index) =>
    index === 0 ? word.charAt(0).toUpperCase() + word.slice(1)
      : /^[A-Z0-9]+$/.test(word) ? word : word.toLowerCase()).join(" ");
}
