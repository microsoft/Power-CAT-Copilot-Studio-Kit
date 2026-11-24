/**
 * Compliance Utilities
 *
 * Implements compliance criteria matching and issue grouping logic
 * from pcf-extracted-logic.md Section 8.
 *
 * Key features:
 * - Match AI-reported issue IDs to 12 compliance criteria
 * - Handle AI variations with fuzzy matching
 * - Apply missing instructions override
 * - Calculate severity display rules
 */

import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import type { ComplianceIssue } from '../contracts/StageOutputs';

/**
 * AI variation mappings for fuzzy matching
 *
 * Maps AI-generated issue ID prefixes to correct criteria IDs.
 */
const ISSUE_ID_VARIATIONS: Record<string, string> = {
  'formatting-accessibility': 'formatting-guidelines',
  'formatting-': 'formatting-guidelines',
  'citations-format': 'citations-and-sources',
  'citations-': 'citations-and-sources',
  'privacy-': 'privacy-and-sensitive-data',
  'accuracy-': 'accuracy-quality',
  'link-': 'link-safety',
  'advice-': 'advice-disclaimers',
  'scope-': 'scope-definition',
  'out-of-scope': 'out-of-scope-handling',
  'persona-': 'persona-and-tone',
  'fallback-': 'fallback-when-uncertain',
  'clarifying-': 'clarifying-questions',
  'prompt-injection': 'prompt-injection-resilience',
};

/**
 * Special issue ID for missing instructions
 */
export const MISSING_INSTRUCTIONS_ISSUE_ID = 'missing-instruction-input';

/**
 * Match an AI-reported issue criteriaId to a compliance criterion
 *
 * Uses exact prefix matching first, then fuzzy matching for AI variations.
 *
 * @param criteriaId - Criteria ID from AI response
 * @returns Matching criterion ID or undefined
 *
 * @example
 * ```ts
 * const criterionId = matchIssueToCriteria('formatting-accessibility');
 * // Returns: 'formatting-guidelines'
 * ```
 */
export function matchIssueToCriteria(criteriaId: string): string | undefined {
  if (typeof criteriaId !== 'string' || !criteriaId) {
    return undefined;
  }

  const criteriaIdLower = criteriaId.toLowerCase();

  // Try exact prefix match first (preferred)
  const exactMatch = COMPLIANCE_CRITERIA.find((c) =>
    criteriaIdLower.startsWith(c.id)
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  // Fuzzy matching for AI variations
  for (const [variation, criterionId] of Object.entries(ISSUE_ID_VARIATIONS)) {
    if (criteriaIdLower.includes(variation)) {
      return criterionId;
    }
  }

  return undefined;
}

/** Resolve explicit or legacy issue identifiers through the same supported alias map. */
export function resolveIssueCriterionId(issue: Pick<ComplianceIssue, 'id' | 'criteriaId'>): string | undefined {
  return matchIssueToCriteria(issue.criteriaId ?? '') ?? matchIssueToCriteria(issue.id);
}

/**
 * Group issues by compliance criteria
 *
 * Maps AI-reported issues to the 12 compliance criteria.
 *
 * @param issues - Issues from Stage C AI response
 * @returns Map of criterion ID to issues array
 *
 * @example
 * ```ts
 * const grouped = groupIssuesByCriteria(issues);
 * const privacyIssues = grouped.get('privacy-and-sensitive-data') || [];
 * ```
 */
export function groupIssuesByCriteria(
  issues: ComplianceIssue[]
): Map<string, ComplianceIssue[]> {
  const grouped = new Map<string, ComplianceIssue[]>();

  for (const issue of issues) {
    // PCF format uses only `id`; Code App format uses `criteriaId` — fall back to `id`
    const matchedCriteriaId = resolveIssueCriterionId(issue);
    if (matchedCriteriaId) {
      const existing = grouped.get(matchedCriteriaId) || [];
      grouped.set(matchedCriteriaId, [...existing, issue]);
    } else {
      // Unmapped issues go to "Unknown" bucket
      const existing = grouped.get('unknown') || [];
      grouped.set('unknown', [...existing, issue]);
    }
  }

  return grouped;
}

/**
 * Check if missing instructions issue exists
 *
 * If this issue is present, ALL 12 criteria are marked as Fail.
 *
 * @param issues - Issues from Stage C AI response
 * @returns true if missing instructions issue found
 *
 * @example
 * ```ts
 * if (hasMissingInstructions(issues)) {
 *   // Mark all criteria as failed
 * }
 * ```
 */
export function hasMissingInstructions(issues: ComplianceIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.id?.toLowerCase() === MISSING_INSTRUCTIONS_ISSUE_ID.toLowerCase() ||
      issue.criteriaId?.toLowerCase() === MISSING_INSTRUCTIONS_ISSUE_ID.toLowerCase()
  );
}

/**
 * Get effective severity for a compliance criterion
 *
 * Always uses inherentSeverity from constants — deterministic and consistent
 * regardless of what severity the AI model returned for the issue.
 * This ensures the displayed badge matches the weight used in scoring.
 *
 * @param criterion - Compliance criterion from Constants
 * @param _issues - Unused (kept for API compatibility)
 * @returns Criterion's inherent severity
 *
 * @example
 * ```ts
 * const severity = getCriterionSeverity(criterion, issues);
 * // Returns: criterion.inherentSeverity always
 * ```
 */
export function getCriterionSeverity(
  criterion: { inherentSeverity: 'High' | 'Medium' | 'Low' },
  _issues: ComplianceIssue[]
): 'High' | 'Medium' | 'Low' {
  return criterion.inherentSeverity;
}

/**
 * Get status for a compliance criterion
 *
 * @param issues - Issues for this criterion (empty if passed)
 * @returns Pass or Fail
 *
 * @example
 * ```ts
 * const status = getCriterionStatus(issues);
 * // Returns: "Pass" (no issues) or "Fail" (has issues)
 * ```
 */
export function getCriterionStatus(issues: ComplianceIssue[]): 'Pass' | 'Fail' {
  return issues.length === 0 ? 'Pass' : 'Fail';
}

/**
 * Get severity badge color for UI display
 *
 * @param severity - Severity level
 * @returns Fluent UI badge color
 *
 * @example
 * ```ts
 * const color = getSeverityBadgeColor('High');
 * // Returns: "danger"
 * ```
 */
export function getSeverityBadgeColor(
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
 * @param status - Pass/Fail status
 * @returns Fluent UI badge color
 *
 * @example
 * ```ts
 * const color = getStatusBadgeColor('Pass');
 * // Returns: "success"
 * ```
 */
export function getStatusBadgeColor(
  status: 'Pass' | 'Fail'
): 'success' | 'danger' {
  return status === 'Pass' ? 'success' : 'danger';
}

/**
 * Count compliance criteria by status
 *
 * @param criteria - Array of compliance display rows
 * @returns Counts object
 *
 * @example
 * ```ts
 * const counts = countComplianceByCriteria(criteria);
 * console.log(`Passed: ${counts.pass}, Failed: ${counts.fail}`);
 * ```
 */
export function countComplianceByStatus(
  criteria: Array<{ status: 'Pass' | 'Fail' }>
): { pass: number; fail: number } {
  return criteria.reduce(
    (acc, criterion) => {
      if (criterion.status === 'Pass') acc.pass++;
      else acc.fail++;
      return acc;
    },
    { pass: 0, fail: 0 }
  );
}

/**
 * Count compliance criteria by severity
 *
 * @param criteria - Array of compliance display rows
 * @returns Counts object
 *
 * @example
 * ```ts
 * const counts = countComplianceBySeverity(criteria);
 * console.log(`High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}`);
 * ```
 */
export function countComplianceBySeverity(
  criteria: Array<{ severity: 'High' | 'Medium' | 'Low' }>
): { high: number; medium: number; low: number } {
  return criteria.reduce(
    (acc, criterion) => {
      if (criterion.severity === 'High') acc.high++;
      else if (criterion.severity === 'Medium') acc.medium++;
      else acc.low++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
}
