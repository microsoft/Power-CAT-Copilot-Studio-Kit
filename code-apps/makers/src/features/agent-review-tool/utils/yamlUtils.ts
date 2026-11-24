/**
 * YAML Preprocessing Utilities
 *
 * Implements the 5 YAML preprocessing transformations from pcf-extracted-logic.md Section 4.1:
 * 1. Tab Replacement
 * 2. Indentation Normalization
 * 3. Large Indent Jump Detection
 * 4. Special Character Quoting
 * 5. Empty Line Preservation
 *
 * These transformations prepare raw YAML content for reliable parsing by js-yaml.
 */

/**
 * Preprocess YAML content to normalize formatting
 *
 * Applies 5 transformations to ensure consistent parsing:
 * - Replaces tabs with 2 spaces
 * - Normalizes indentation to even numbers
 * - Caps large indent jumps to prevent parsing errors
 * - Quotes keys starting with special characters (@, &, *, !, |, >, %) and values
 *   starting with a YAML reserved indicator (@ or backtick)
 * - Preserves empty lines
 *
 * @param content - Raw YAML string
 * @returns Preprocessed YAML string
 *
 * @example
 * ```ts
 * const raw = "model:\n\tname: MyAgent\n   description: Test";
 * const processed = preprocessYaml(raw);
 * // Tabs replaced, indentation normalized
 * ```
 */
/**
 * YAML 1.2.2 section 5.3 reserves exactly two indicators, `c-reserved ::= '@' | '`'`,
 * and its Example 5.10 makes the consequence explicit: "Reserved indicators can't
 * start a plain scalar." A single occurrence is a parse error for the whole document,
 * not just that line. Copilot Studio emits such values as connector output property
 * names (`propertyName: @odata.nextLink`), which would otherwise discard the entire
 * tool definition; quoting restores the string with its value unchanged.
 *
 * Deliberately narrower than the key-side rule below. The other indicators are legal
 * in value position and quoting them would corrupt valid YAML: `&` anchors and `*`
 * aliases (spec Example 5.6), `|` and `>` block scalars (Example 5.7), `!` tags.
 * Only the first character matters, so an interior `@` such as `user@contoso` is left
 * alone, exactly as the spec allows.
 */
const RESERVED_SCALAR_START = /^[@`]/;

/** Transformation 4, value side. `valueAndRest` still carries its leading colon. */
function quoteReservedValue(valueAndRest: string): string {
  const value = valueAndRest.slice(1).trim();
  if (!RESERVED_SCALAR_START.test(value)) {
    return valueAndRest;
  }
  return `: '${value.replace(/'/g, "''")}'`;
}

export function preprocessYaml(content: string): string {
  if (!content || content.trim() === '') {
    return content;
  }

  const lines = content.split('\n');
  const processed: string[] = [];
  let previousIndent = 0;

  for (const line of lines) {
    // Transformation 1: Replace ALL tabs with 2 spaces
    let processedLine = line.replace(/\t/g, '  ');

    // Transformation 5: Preserve empty lines
    if (processedLine.trim() === '') {
      processed.push(processedLine);
      continue;
    }

    // Transformation 2: Indentation Normalization
    // Count leading spaces
    const leadingSpaces = processedLine.match(/^\s*/)?.[0].length ?? 0;
    let spaceCount = leadingSpaces;

    // Round to nearest even number
    if (spaceCount % 2 !== 0) {
      spaceCount = Math.floor(spaceCount / 2) * 2;
    }

    // Transformation 3: Large Indent Jump Detection
    // Cap to previous + 2 if jump is too large
    if (spaceCount > previousIndent + 4) {
      console.warn(
        `Large indent jump detected (${previousIndent} → ${spaceCount}), capping to ${previousIndent + 2}`
      );
      spaceCount = previousIndent + 2;
    }

    // Update previous indent
    previousIndent = spaceCount;

    // Extract key and rest of line
    const trimmedLine = processedLine.trim();
    const colonIndex = trimmedLine.indexOf(':');

    if (colonIndex > 0) {
      const key = trimmedLine.substring(0, colonIndex);
      const valueAndRest = quoteReservedValue(trimmedLine.substring(colonIndex));
      const adjustedSpace = ' '.repeat(spaceCount);

      // Transformation 4: Special Character Quoting
      // Quote keys starting with @, &, *, !, |, >, %, and values starting with a
      // YAML reserved indicator (see quoteReservedValue above).
      if (/^[@&*!|>%]/.test(key) && !/^['"]/.test(key)) {
        processedLine = `${adjustedSpace}'${key}'${valueAndRest}`;
      } else {
        processedLine = `${adjustedSpace}${key}${valueAndRest}`;
      }
    } else {
      // Not a key-value line, just adjust spacing
      processedLine = ' '.repeat(spaceCount) + trimmedLine;
    }

    processed.push(processedLine);
  }

  return processed.join('\n');
}

/**
 * Extract agent instructions from parsed YAML or raw content
 *
 * Tries multiple field names in priority order, then falls back to regex patterns.
 *
 * Priority order for parsed object:
 * 1. instructions
 * 2. systemInstructions
 * 3. prompt
 * 4. agentInstructions
 * 5. instruction
 * 6. systemPrompt
 *
 * @param parsedYaml - Parsed YAML object
 * @param rawContent - Raw YAML string (for regex fallback)
 * @returns Agent instructions string or empty string
 *
 * @example
 * ```ts
 * const instructions = extractAgentInstructions(parsed, raw);
 * if (instructions) {
 *   console.log('Found instructions:', instructions);
 * }
 * ```
 */
export function extractAgentInstructions(
  parsedYaml: Record<string, unknown>,
  rawContent: string
): string {
  // Try parsed object fields first (priority order)
  const instructions =
    parsedYaml?.instructions ??
    parsedYaml?.systemInstructions ??
    parsedYaml?.prompt ??
    parsedYaml?.agentInstructions ??
    parsedYaml?.instruction ??
    parsedYaml?.systemPrompt;

  if (instructions && typeof instructions === 'string') {
    return instructions.trim();
  }

  // Fallback: Regex extraction from raw content
  const patterns = [
    // Pattern 1: Standard YAML format
    /(?:^|\n)\s*(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,

    // Pattern 2: With leading space
    /(?:^|\n)\s+(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,

    // Pattern 3: Multiline format
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*\n\s+([\s\S]+?)(?=\n\S|\n\s*\w+\s*:|$)/i,

    // Pattern 4: Most permissive
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([^\n]*(?:\n(?!\w+:)[^\n]*)*)/i,
  ];

  for (const pattern of patterns) {
    const match = rawContent.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted) {
        return extracted;
      }
    }
  }

  return '';
}

/**
 * Validate YAML content structure
 *
 * Checks for basic YAML validity without parsing:
 * - Not empty
 * - Contains at least one key-value pair
 * - No obvious syntax errors
 *
 * @param content - YAML content to validate
 * @returns true if content appears valid
 *
 * @example
 * ```ts
 * if (!isValidYamlStructure(content)) {
 *   throw new Error('Invalid YAML structure');
 * }
 * ```
 */
export function isValidYamlStructure(content: string): boolean {
  if (!content || content.trim() === '') {
    return false;
  }

  // Check for at least one key-value pair
  const hasKeyValuePair = /^\s*[\w-]+\s*:/m.test(content);
  if (!hasKeyValuePair) {
    return false;
  }

  // Check for obvious syntax errors
  // Count opening/closing brackets and braces
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;

  if (openBrackets !== closeBrackets || openBraces !== closeBraces) {
    return false;
  }

  return true;
}

interface ExtractedVariable {
  VariableName: string;
  displayName?: string;
  VariableDescription?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract variables from standard object or legacy array metadata.
 *
 * Populated property/legacy descriptions take precedence. For inputs only,
 * taskInputs supplies a fallback from the first nonblank AutomaticTaskInput
 * description with an exact propertyName match. Output callers omit it.
 *
 * @param vars - Variables object or array
 * @param taskInputs - Optional top-level input bindings
 * @returns Declared variables, retaining missing metadata for missing-field checks
 */
export function extractVariables(
  vars: unknown,
  taskInputs?: unknown,
): ExtractedVariable[] {
  let extracted: ExtractedVariable[];

  if (isRecord(vars)) {
    extracted = Object.entries(vars).map(([key, value]) => {
      const varValue = isRecord(value) ? value : undefined;
      return {
        VariableName: key,
        displayName: stringValue(varValue?.displayName),
        VariableDescription: stringValue(varValue?.description),
      };
    });
  } else if (Array.isArray(vars)) {
    extracted = vars.map((item: unknown) => {
      if (typeof item === 'string') {
        return { VariableName: item };
      }
      const varValue = isRecord(item) ? item : undefined;
      const descriptions = [stringValue(varValue?.description), stringValue(varValue?.VariableDescription)];
      return {
        VariableName: stringValue(varValue?.name) || stringValue(varValue?.VariableName) || '',
        displayName: stringValue(varValue?.displayName),
        VariableDescription: descriptions.find(description => description?.trim()) ?? descriptions[0] ?? descriptions[1],
      };
    });
  } else {
    return [];
  }

  if (!Array.isArray(taskInputs)) return extracted;

  const descriptions = new Map<string, string>();
  for (const input of taskInputs) {
    if (
      isRecord(input)
      && input.kind === 'AutomaticTaskInput'
      && typeof input.propertyName === 'string'
      && input.propertyName.trim()
      && typeof input.description === 'string'
      && input.description.trim()
      && !descriptions.has(input.propertyName)
    ) {
      descriptions.set(input.propertyName, input.description);
    }
  }

  return extracted.map(variable => {
    if (variable.VariableDescription?.trim()) return variable;
    const description = descriptions.get(variable.VariableName);
    return description === undefined
      ? variable
      : { ...variable, VariableDescription: description };
  });
}
