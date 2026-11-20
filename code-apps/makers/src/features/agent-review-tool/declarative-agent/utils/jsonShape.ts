/** A parsed JSON object. */
export interface JsonObject {
  [key: string]: unknown;
}

/** Returns true for a JSON object, but not for an array or null. */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the value when it is a JSON object, otherwise an empty object. */
export function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

/** Returns the value when it is an array, otherwise an empty array. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Returns the trimmed text of a string value, otherwise an empty string. */
export function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Visits JSON string values with their exact paths, without following cycles. */
export function visitJsonStrings(
  value: unknown,
  visit: (text: string, path: string, key?: string) => void,
  path = '$',
  key?: string,
  ancestors = new WeakSet<object>(),
): void {
  if (typeof value === 'string') {
    visit(value, path, key);
    return;
  }
  if (value === null || typeof value !== 'object' || ancestors.has(value)) return;
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => visitJsonStrings(child, visit, `${path}[${index}]`, undefined, ancestors));
  } else if (isObject(value)) {
    for (const [name, child] of Object.entries(value)) {
      const segment = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
        ? `.${name}`
        : `['${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
      visitJsonStrings(child, visit, `${path}${segment}`, name, ancestors);
    }
  }
  ancestors.delete(value);
}
