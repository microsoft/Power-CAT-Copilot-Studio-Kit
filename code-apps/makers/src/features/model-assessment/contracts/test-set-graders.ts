import yaml from 'js-yaml';

/** A Business Classification test method (Copilot Studio `PromptGrader`): its name and the labels it can assign. */
export interface ClassificationGrader {
  name?: string;
  labels: string[];
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Business Classification test methods of a test set definition (botcomponent `data`), in definition order. */
export function parseClassificationGraders(data: string | undefined): ClassificationGrader[] {
  if (!data?.trim()) return [];
  let payload: unknown;
  try {
    payload = yaml.load(data);
  } catch {
    return [];
  }
  if (!isNode(payload) || !Array.isArray(payload.graders)) return [];
  return payload.graders.flatMap((grader): ClassificationGrader[] => {
    if (!isNode(grader) || grader.kind !== 'PromptGrader') return [];
    const labels = Array.isArray(grader.labels)
      ? grader.labels.flatMap((label) => {
        const name = isNode(label) ? text(label.name) : undefined;
        return name ? [name] : [];
      })
      : [];
    const name = text(grader.name);
    return [{ ...(name ? { name } : {}), labels }];
  });
}

const assignedLabel = (reason: string | undefined) => {
  try {
    const label = (JSON.parse(reason ?? '') as { data?: { label?: unknown } } | null)?.data?.label;
    return text(label);
  } catch {
    return undefined;
  }
};

/**
 * Name of the test method behind a Business Classification result when its test set has several,
 * so they read "Business Classification (PII)" instead of "Business Classification (2)".
 * Copilot Studio reports every method as "CustomLabels" and the flow numbers repeats
 * ("CustomLabels#2"), so the method is found by the label it assigned, else by position.
 */
export function classificationGraderName(
  metric: string | undefined,
  reason: string | undefined,
  graders: ClassificationGrader[] | undefined,
): string | undefined {
  const identity = /^customlabels(?:#(\d+))?$/i.exec(metric?.trim() ?? '');
  if (!identity || !graders || graders.length < 2) return undefined;
  const label = assignedLabel(reason);
  const byLabel = label ? graders.filter((grader) => grader.labels.some((item) => same(item, label))) : [];
  const grader = byLabel.length === 1 ? byLabel[0] : graders[Number(identity[1] ?? 1) - 1];
  return grader?.name;
}
