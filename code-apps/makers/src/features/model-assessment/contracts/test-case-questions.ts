import yaml from 'js-yaml';

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function texts(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []));
}

/**
 * Extract every user question from a Copilot Studio test case (botcomponent
 * `data`). Multi-turn cases (`kind: MultiTurnEvaluationCase`) return each user
 * turn in conversation order; single-turn cases return their row inputs.
 * Unparseable data yields an empty list so callers can fall back.
 */
export function parseTestCaseQuestions(data: string | undefined): string[] {
  return parseTestCase(data).questions;
}

/** Questions plus whether the test case is a multi-turn conversation. */
export function parseTestCase(data: string | undefined): { questions: string[]; multiTurn: boolean } {
  const none = { questions: [], multiTurn: false };
  if (!data?.trim()) return none;
  let payload: unknown;
  try {
    payload = yaml.load(data);
  } catch {
    return none;
  }
  if (!isNode(payload)) return none;

  if (Array.isArray(payload.activities)) {
    const questions = payload.activities.flatMap((entry) => {
      const activity = isNode(entry) && isNode(entry.activity) ? entry.activity : undefined;
      const value = activity && isNode(activity.value) ? activity.value : undefined;
      const from = value && isNode(value.from) ? value.from : undefined;
      const role = typeof from?.role === 'string' ? from.role.toLowerCase() : '';
      // Copilot Studio stores the text next to `value`; older cases nest it inside.
      return value && role === 'user' ? texts(value.text ?? activity?.text) : [];
    });
    return { questions, multiTurn: true };
  }
  if (Array.isArray(payload.rows)) {
    return { questions: payload.rows.flatMap((row) => (isNode(row) ? texts(row.input) : [])), multiTurn: false };
  }
  return { questions: [], multiTurn: payload.kind === 'MultiTurnEvaluationCase' };
}

/** Questions to display for a result: all turns when known, else the saved question. */
export function displayQuestions(result: { questions?: string[]; question?: string }): string[] {
  if (result.questions?.length) return result.questions;
  const single = result.question?.trim();
  return single ? [single] : [];
}
