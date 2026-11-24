/** The upgrade readiness report lists this number of topics and tools with Power Fx, at most. */
export const UPGRADE_READINESS_POWER_FX_LIMIT = 50;

const VARIABLE_REFERENCE = /^\s*(?:Topic|System|Global|Env|User|Conversation|Bot)\./;
const FUNCTION_CALL = /^\s*[A-Za-z][A-Za-z0-9]*\(/;
const CURLY_BRACE_SEGMENT = /\{([^{}]*)\}/g;

function countInText(text: string): number {
  if (text.trimStart().startsWith('=')) return 1;
  let count = 0;
  // matchAll copies the regular expression, so the shared global expression keeps no state.
  for (const match of text.matchAll(CURLY_BRACE_SEGMENT)) {
    const segment = match[1];
    if (VARIABLE_REFERENCE.test(segment) || FUNCTION_CALL.test(segment)) count += 1;
  }
  return count;
}

function countInValue(value: unknown, seen: WeakSet<object>): number {
  if (typeof value === 'string') return countInText(value);
  if (value === null || typeof value !== 'object') return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
  return children.reduce<number>((total, item) => total + countInValue(item, seen), 0);
}

/**
 * Count the Power Fx expressions in a parsed YAML value.
 *
 * This is a deterministic estimate, not a Power Fx parser. A text that starts with "="
 * is 1 expression. In other text, each {...} segment that starts with a variable
 * reference or a function call is 1 expression.
 * Each object is counted 1 time, so YAML aliases and cycles are safe.
 */
export function countPowerFxExpressions(value: unknown): number {
  return countInValue(value, new WeakSet<object>());
}
