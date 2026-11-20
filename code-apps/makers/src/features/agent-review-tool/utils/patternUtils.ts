/**
 * Pattern Utilities
 *
 * Implements pattern categorization and severity logic from pcf-extracted-logic.md Section 3.
 *
 * Key features:
 * - Categorize patterns by description keywords
 * - Calculate severity based on topic count thresholds
 * - Apply category-specific severity rules
 * - Decide whether a captured population is complete enough to assess a pattern against
 */

/**
 * The shared "can this pattern be assessed at all?" test for Standard local patterns.
 *
 * A population is incomplete when the capture could not be read at all
 * (`configurationAvailable === false`), or when it contains components the classifier
 * could not identify. Either way an empty resource list is unproven, so a pattern must
 * report `not-assessed` rather than claim a pass it cannot evidence.
 *
 * Structural on purpose: Stage A output reaches these rules as both `ParsedBotData` and
 * `LocalStageAOutput`, which are separate declarations of the same two fields.
 *
 * Deliberately narrower than two nearby checks that are NOT interchangeable with it:
 * `standardRuleDefinition.ts` also requires `parsingErrors` to be empty, and
 * `standardReviewCorpus`'s topic rules also require every topic's `ParseStatus` to be
 * readable. Sites that test `configurationAvailable` alone are narrower again, and
 * deliberately tolerate unknown components. Do not collapse those into this helper.
 */
export function isPopulationIncomplete(data: {
  configurationAvailable?: boolean;
  unknownComponents?: readonly unknown[];
}): boolean {
  return data.configurationAvailable === false || (data.unknownComponents?.length ?? 0) > 0;
}

/**
 * Pattern category type
 */
export type PatternCategory =
  | 'Model Naming'
  | 'Model Description'
  | 'Input Variables'
  | 'Output Variables'
  | 'Architecture'
  | 'Orchestration'
  | 'Evaluation'
  | 'Unknown';

/**
 * Category order for sorting patterns
 */
export const PATTERN_CATEGORY_ORDER: PatternCategory[] = [
  'Model Naming',
  'Model Description',
  'Input Variables',
  'Output Variables',
  'Architecture',
  'Orchestration',
  'Evaluation',
  'Unknown',
];

/**
 * Inherent category per pattern name.
 * Explicit map so category is never derived from keyword matching for known patterns.
 * categorizePattern() is still used as a fallback for unknown AI patterns.
 */
export const PATTERN_INHERENT_CATEGORY: Record<string, PatternCategory> = {
  // Local patterns (Stage A)
  'Missing Model Name':                   'Model Naming',
  'Missing Model Description':            'Model Description',
  'Missing Input Variable Name':          'Input Variables',
  'Missing Input Variable Description':   'Input Variables',
  'Missing Output Variable Name':         'Output Variables',
  'Missing Output Variable Description':  'Output Variables',
  'Excessive Tools Usage':                'Architecture',
  'Missing Tool Description':             'Architecture',
  'Duplicate Tool Descriptions':          'Architecture',
  'Inadequate Test Cases':                'Evaluation',
  'Missing Child Agent Description':      'Architecture',
  'Child Agent Architecture Sprawl':      'Architecture',
  'Invalid Topic Reference':              'Orchestration',
  // AI patterns (Stage B)
  'Unclear Topic Name':                   'Model Naming',
  'Unclear Topic Description':            'Model Description',
  'Unclear Model Name':                   'Model Naming',
  'Unclear Model Description':            'Model Description',
  'Unclear Input Variable Name':          'Input Variables',
  'Unclear Input Variable Description':   'Input Variables',
  'Unclear Output Variable Name':         'Output Variables',
  'Unclear Output Variable Description':  'Output Variables',
  'Overlapping Topic Descriptions':       'Model Description',
  'Missing Trigger Phrases':              'Orchestration',
  'Tool Routing Gap':                     'Architecture',
};

/**
 * Inherent severity per pattern name.
 * Severity = the impact if this pattern fails — constant regardless of topic count or pass/fail status.
 * Topic count drives the Topics column only.
 */
export const PATTERN_INHERENT_SEVERITY: Record<string, 'High' | 'Medium' | 'Low'> = {
  // Local patterns (Stage A)
  'Missing Model Name':                   'High',
  'Missing Model Description':            'High',
  'Missing Input Variable Name':          'Medium',
  'Missing Input Variable Description':   'Medium',
  'Missing Output Variable Name':         'Medium',
  'Missing Output Variable Description':  'Medium',
  'Excessive Tools Usage':                'High',
  'Missing Tool Description':             'Medium',
  'Duplicate Tool Descriptions':          'Medium',
  'Inadequate Test Cases':                'Medium',
  'Missing Child Agent Description':      'High',
  'Child Agent Architecture Sprawl':      'Medium',
  'Invalid Topic Reference':              'Medium',
  // AI patterns (Stage B)
  'Unclear Topic Name':                   'High',
  'Unclear Topic Description':            'High',
  'Unclear Model Name':                   'High',
  'Unclear Model Description':            'High',
  'Unclear Input Variable Name':          'Medium',
  'Unclear Input Variable Description':   'Medium',
  'Unclear Output Variable Name':         'Medium',
  'Unclear Output Variable Description':  'Medium',
  'Overlapping Topic Descriptions':       'High',
  'Missing Trigger Phrases':              'Medium',
  'Tool Routing Gap':                     'High',
};

const LEGACY_PATTERN_NAME_MAP: Record<string, string> = {
  'Unclear Topic Name': 'Unclear Model Name',
  'Unclear Topic Description': 'Unclear Model Description',
};

/** Resolve a legacy Stage B rule name to its canonical modern meaning. */
export function getCanonicalPatternName(patternName: string): string {
  return LEGACY_PATTERN_NAME_MAP[patternName] ?? patternName;
}

/**
 * Categorize a pattern based on its description
 *
 * Uses keyword matching to determine the appropriate category.
 *
 * @param patternDescription - Pattern description text
 * @returns Pattern category
 *
 * @example
 * ```ts
 * const category = categorizePattern("Missing model name");
 * // Returns: "Model Naming"
 * ```
 */
export function categorizePattern(
  patternDescription: string
): PatternCategory {
  if (!patternDescription) {
    return 'Unknown';
  }

  const desc = patternDescription.toLowerCase();

  // Model Naming patterns
  if (
    desc.includes('model name') ||
    desc.includes('modelname') ||
    desc.includes('missing name') ||
    desc.includes('topic name')
  ) {
    return 'Model Naming';
  }

  // Model Description patterns
  if (
    desc.includes('model description') ||
    desc.includes('modeldescription') ||
    desc.includes('description is missing') ||
    desc.includes('description missing') ||
    desc.includes('topic description')
  ) {
    return 'Model Description';
  }

  // Input Variables patterns
  if (
    desc.includes('input variable') ||
    desc.includes('input param') ||
    desc.includes('inputvariable')
  ) {
    return 'Input Variables';
  }

  // Output Variables patterns
  if (
    desc.includes('output variable') ||
    desc.includes('output param') ||
    desc.includes('outputvariable')
  ) {
    return 'Output Variables';
  }

  // Architecture patterns
  if (
    desc.includes('tool') ||
    desc.includes('action') ||
    desc.includes('connector') ||
    desc.includes('complexity') ||
    desc.includes('architecture') ||
    desc.includes('routing gap') ||
    desc.includes('scope boundary')
  ) {
    return 'Architecture';
  }

  // Orchestration patterns (routing, overlap, trigger phrases)
  if (
    desc.includes('overlapping') ||
    desc.includes('overlap') ||
    desc.includes('ambiguous routing') ||
    desc.includes('trigger phrase') ||
    desc.includes('routing ambiguity') ||
    desc.includes('orchestration')
  ) {
    return 'Orchestration';
  }

  // Evaluation patterns
  if (
    desc.includes('test') ||
    desc.includes('testcase') ||
    desc.includes('evaluation') ||
    desc.includes('coverage')
  ) {
    return 'Evaluation';
  }

  return 'Unknown';
}

/**
 * Get inherent severity for a pattern by name.
 *
 * Severity = the impact if this pattern fails.
 * Constant per pattern — independent of topic count and pass/fail status.
 * Unknown AI patterns default to Medium.
 *
 * @param patternName - Pattern name
 * @returns Severity level
 *
 * @example
 * ```ts
 * const severity = getPatternSeverity('Missing Model Name');
 * // Returns: "High"
 * ```
 */
export function getPatternSeverity(
  patternName: string,
): 'High' | 'Medium' | 'Low' {
  return PATTERN_INHERENT_SEVERITY[patternName] ?? 'Medium';
}

/**
 * Get severity badge color for UI display
 *
 * @param severity - Severity level
 * @returns Fluent UI badge color
 *
 * @example
 * ```ts
 * const color = getSeverityColor('High');
 * // Returns: "danger"
 * ```
 */
export function getSeverityColor(
  severity: 'High' | 'Medium' | 'Low'
): 'danger' | 'warning' | 'informative' {
  switch (severity) {
    case 'High':
      return 'danger';
    case 'Medium':
      return 'warning';
    case 'Low':
      return 'informative';
  }
}

/**
 * Get status badge color for UI display
 *
 * @param status - Pass/Fail status string
 * @returns Fluent UI badge color
 *
 * @example
 * ```ts
 * const color = getStatusColor('Pass');
 * // Returns: "success"
 * ```
 */
export function getStatusColor(
  status: 'Pass' | 'Fail'
): 'success' | 'danger' {
  return status === 'Pass' ? 'success' : 'danger';
}

/**
 * Sort patterns for display grid
 *
 * Multi-level sort order from pcf-extracted-logic.md Section 5.1:
 * 1. Category (Model Naming → Model Description → ... → Unknown)
 * 2. Severity (High → Medium → Low)
 * 3. Status (Fail → Pass)
 * 4. Name (Alphabetical)
 *
 * @param patterns - Array of pattern display rows
 * @returns Sorted array
 *
 * @example
 * ```ts
 * const sorted = sortPatterns(patterns);
 * // Patterns sorted by category, then severity, then status, then name
 * ```
 */
export function sortPatterns<T extends {
  category: PatternCategory;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Pass' | 'Fail';
  patternName: string;
}>(patterns: T[]): T[] {
  return [...patterns].sort((a, b) => {
    // Primary sort: Category
    const categoryDiff =
      PATTERN_CATEGORY_ORDER.indexOf(a.category) -
      PATTERN_CATEGORY_ORDER.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;

    // Secondary sort: Severity
    const severityOrder = { High: 0, Medium: 1, Low: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Tertiary sort: Status (Fail patterns first)
    const statusOrder = { Fail: 0, Pass: 1 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Final sort: Pattern name alphabetically
    return a.patternName.localeCompare(b.patternName);
  });
}

/**
 * Count patterns by severity
 *
 * @param patterns - Array of pattern display rows
 * @returns Counts object
 *
 * @example
 * ```ts
 * const counts = countPatternsBySeverity(patterns);
 * console.log(counts.high, counts.medium, counts.low);
 * ```
 */
export function countPatternsBySeverity(
  patterns: Array<{ severity: 'High' | 'Medium' | 'Low' }>
): { high: number; medium: number; low: number } {
  return patterns.reduce(
    (acc, pattern) => {
      if (pattern.severity === 'High') acc.high++;
      else if (pattern.severity === 'Medium') acc.medium++;
      else acc.low++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

/**
 * Count patterns by status
 *
 * @param patterns - Array of pattern display rows
 * @returns Counts object
 *
 * @example
 * ```ts
 * const counts = countPatternsByStatus(patterns);
 * console.log(counts.pass, counts.fail);
 * ```
 */
export function countPatternsByStatus(
  patterns: Array<{ status: 'Pass' | 'Fail' }>
): { pass: number; fail: number } {
  return patterns.reduce(
    (acc, pattern) => {
      if (pattern.status === 'Pass') acc.pass++;
      else acc.fail++;
      return acc;
    },
    { pass: 0, fail: 0 }
  );
}
