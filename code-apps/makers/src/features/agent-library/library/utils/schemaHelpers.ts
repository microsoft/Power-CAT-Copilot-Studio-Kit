/**
 * Schema deduplication helpers for agent template import.
 *
 * Used to ensure unique bot schema names when importing templates
 * into an environment that may already have agents with the same name.
 */

/**
 * Returns `base` if it doesn't conflict with any existing schema name.
 * Otherwise appends `_2`, `_3`, ... until a free name is found.
 */
export function resolveUniqueSchemaName(base: string, existingSchemas: string[]): string {
  const taken = new Set(existingSchemas.map((s) => s.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let counter = 2;
  while (taken.has(`${base}${counter}`.toLowerCase())) counter++;
  return `${base}${counter}`;
}

/**
 * Strips the publisher prefix from a schema name.
 * E.g., stripSchemaPrefix("cat_hrpolicyagent", "cat") → "hrpolicyagent"
 */
export function stripSchemaPrefix(schemaName: string, prefix: string): string {
  const p = `${prefix}_`;
  return schemaName.startsWith(p) ? schemaName.slice(p.length) : schemaName;
}

/**
 * Sanitizes a name to only contain [A-Za-z0-9_].
 * E.g., "HR Policy & Benefits Q&A" → "HRPolicyBenefitsQA"
 */
export function sanitizeSolutionName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '');
}
