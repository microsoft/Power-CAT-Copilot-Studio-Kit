/**
 * Pattern categorization and severity helpers.
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

export const PATTERN_INHERENT_CATEGORY: Record<string, PatternCategory> = {
  'Missing Model Name': 'Model Naming',
  'Missing Model Description': 'Model Description',
  'Missing Input Variable Name': 'Input Variables',
  'Missing Input Variable Description': 'Input Variables',
  'Missing Output Variable Name': 'Output Variables',
  'Missing Output Variable Description': 'Output Variables',
  'Excessive Tools Usage': 'Architecture',
  'Inadequate Test Cases': 'Evaluation',
  'Missing Child Agent Description': 'Architecture',
  'Child Agent Architecture Sprawl': 'Architecture',
  'Unclear Model Name': 'Model Naming',
  'Unclear Model Description': 'Model Description',
  'Unclear Input Variable Name': 'Input Variables',
  'Unclear Input Variable Description': 'Input Variables',
  'Unclear Output Variable Name': 'Output Variables',
  'Unclear Output Variable Description': 'Output Variables',
  'Overlapping Topic Descriptions': 'Model Description',
  'Tool Routing Gap': 'Architecture',
};

export const PATTERN_INHERENT_SEVERITY: Record<string, 'High' | 'Medium' | 'Low'> = {
  'Missing Model Name': 'High',
  'Missing Model Description': 'High',
  'Missing Input Variable Name': 'Medium',
  'Missing Input Variable Description': 'Medium',
  'Missing Output Variable Name': 'Medium',
  'Missing Output Variable Description': 'Medium',
  'Excessive Tools Usage': 'High',
  'Inadequate Test Cases': 'Medium',
  'Missing Child Agent Description': 'High',
  'Child Agent Architecture Sprawl': 'Medium',
  'Unclear Model Name': 'High',
  'Unclear Model Description': 'High',
  'Unclear Input Variable Name': 'Medium',
  'Unclear Input Variable Description': 'Medium',
  'Unclear Output Variable Name': 'Medium',
  'Unclear Output Variable Description': 'Medium',
  'Overlapping Topic Descriptions': 'High',
  'Tool Routing Gap': 'High',
};

/**
 * Categorize a pattern description.
 */
export function categorizePattern(patternDescription: string): PatternCategory {
  if (!patternDescription) {
    return 'Unknown';
  }

  const desc = patternDescription.toLowerCase();

  if (
    desc.includes('model name') ||
    desc.includes('modelname') ||
    desc.includes('missing name') ||
    desc.includes('topic name')
  ) {
    return 'Model Naming';
  }

  if (
    desc.includes('model description') ||
    desc.includes('modeldescription') ||
    desc.includes('description is missing') ||
    desc.includes('description missing') ||
    desc.includes('topic description')
  ) {
    return 'Model Description';
  }

  if (
    desc.includes('input variable') ||
    desc.includes('input param') ||
    desc.includes('inputvariable')
  ) {
    return 'Input Variables';
  }

  if (
    desc.includes('output variable') ||
    desc.includes('output param') ||
    desc.includes('outputvariable')
  ) {
    return 'Output Variables';
  }

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
 */
export function getPatternSeverity(patternName: string): 'High' | 'Medium' | 'Low' {
  return PATTERN_INHERENT_SEVERITY[patternName] ?? 'Medium';
}
