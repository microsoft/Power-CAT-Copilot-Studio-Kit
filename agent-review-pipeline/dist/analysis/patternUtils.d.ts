/**
 * Pattern categorization and severity helpers.
 */
export type PatternCategory = 'Model Naming' | 'Model Description' | 'Input Variables' | 'Output Variables' | 'Architecture' | 'Orchestration' | 'Evaluation' | 'Unknown';
export declare const PATTERN_CATEGORY_ORDER: PatternCategory[];
export declare const PATTERN_INHERENT_CATEGORY: Record<string, PatternCategory>;
export declare const PATTERN_INHERENT_SEVERITY: Record<string, 'High' | 'Medium' | 'Low'>;
/**
 * Categorize a pattern description.
 */
export declare function categorizePattern(patternDescription: string): PatternCategory;
/**
 * Get inherent severity for a pattern by name.
 */
export declare function getPatternSeverity(patternName: string): 'High' | 'Medium' | 'Low';
