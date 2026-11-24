import type { EvaluationResultVM } from './model-assessment';

export const CONVERSATION_SUFFIX = ' (Conversation)';

const nameKey = (name: string | undefined) => (name ?? '').trim().toLowerCase();
const setKey = (result: EvaluationResultVM) =>
  result.testSetId?.trim().toLowerCase() || `name:${nameKey(result.testSet)}`;

/**
 * Give every evaluation set a unique display name. Copilot Studio allows two
 * sets (e.g. a single-response set and a conversation set) to share a name; the
 * views group by name, so without this their results would merge into one set.
 * Colliding conversation sets are labelled "(Conversation)"; any remaining
 * collisions are numbered in a stable (set id) order.
 */
export function withUniqueTestSetNames(
  results: EvaluationResultVM[],
  agentByRun: ReadonlyMap<string, string | undefined> = new Map(),
): EvaluationResultVM[] {
  const scope = (result: EvaluationResultVM) =>
    (result.runId && agentByRun.get(result.runId.toLowerCase())?.toLowerCase()) || '';
  const setsByName = new Map<string, Map<string, { name: string; multiTurn: boolean }>>();
  for (const result of results) {
    const name = result.testSet?.trim();
    if (!name) continue;
    const group = `${scope(result)}|${nameKey(name)}`;
    const sets = setsByName.get(group) ?? new Map<string, { name: string; multiTurn: boolean }>();
    const key = setKey(result);
    const set = sets.get(key) ?? { name, multiTurn: false };
    set.multiTurn ||= Boolean(result.multiTurn);
    sets.set(key, set);
    setsByName.set(group, sets);
  }

  const labels = new Map<string, string>();
  for (const [group, sets] of setsByName) {
    if (sets.size < 2) continue;
    const agent = group.slice(0, group.indexOf('|'));
    const mixed = new Set([...sets.values()].map((set) => set.multiTurn)).size > 1;
    const draft = [...sets]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, set]) => [key, mixed && set.multiTurn ? `${set.name}${CONVERSATION_SUFFIX}` : set.name] as const);
    const seen = new Map<string, number>();
    for (const [key, label] of draft) {
      const count = (seen.get(nameKey(label)) ?? 0) + 1;
      seen.set(nameKey(label), count);
      labels.set(`${agent}|${key}`, count > 1 ? `${label} (${count})` : label);
    }
  }
  if (labels.size === 0) return results;
  return results.map((result) => {
    const label = result.testSet?.trim() ? labels.get(`${scope(result)}|${setKey(result)}`) : undefined;
    return label && label !== result.testSet ? { ...result, testSet: label } : result;
  });
}
