/**
 * Maker-facing names for the review rules.
 *
 * A rule only produces a title when it has something to say: `check()` returns `null` on a pass, so
 * a passing rule leaves no title anywhere in the review. That is fine for a findings list, where a
 * pass is silence, but the consolidated list shows passes too — and without these labels every
 * passing row would be headed by its internal id.
 *
 * Lives here rather than beside the rules because both the Agent Review Tool and the Architecture
 * Review Tool render the same rows and must call a check by the same name.
 */
const RULE_DISPLAY_LABELS: Record<string, string> = {
  'CON-01': 'Connected agent availability',
  'CON-02': 'Connected agent publish status',
  'CON-03': 'Delegation descriptions',
  'CON-04': 'Connected agent inventory',
  'EVL-01': 'Evaluation test set availability',
  'EVL-03': 'Evaluation grader configuration',
  'EVL-04': 'Expected responses for similarity grading',
  'EVL-05': 'Multi-turn evaluation coverage',
  'EVL-06': 'Evaluation result retention',
  'INS-01': 'Instruction completeness',
  'INS-07': 'Referenced capability availability',
  'INS-08': 'Citation behavior guidance',

  'KNW-01': 'Knowledge inventory',
  'KNW-02': 'Promised knowledge availability',
  'KNW-03': 'Work IQ usage',
  'KNW-04': 'Memory configuration',
  'WIQ-01': 'Work IQ workloads',
  'WIQ-02': 'Work IQ default workload scope',
  'WIQ-03': 'Work IQ write access',
  'WIQ-04': 'Work IQ preview workloads',
  'LCY-01': 'Agent harness',
  'LCY-02': 'Agent composition',
  'MDL-01': 'Model selection',
  'SKL-01': 'Skill name',
  'SKL-02': 'Skill description',
  'SKL-03': 'Skill instructions',
  'SKL-05': 'Skill safety',
  'SKL-07': 'Skill structure and size',
  'SKL-08': 'Cross-skill references',
  'SKL-09': 'Referenced capability availability',
  'SKL-11': 'Ordered execution steps',
  'SKL-12': 'Skill routing guidance',
  'SKL-13': 'Skill negative scope',
  'SKL-14': 'Skill examples and evaluations',
  'TOL-01': 'Tool inventory',
  'TOL-02': 'Tool descriptions',
  'TOL-03': 'Tool authentication',
  'TOL-04': 'Tool connections',
  'TOL-05': 'Duplicate tool operations',
  'TOL-06': 'Agent authentication for user tools',
};

export { RULE_DISPLAY_LABELS };

/** Returns a maker-facing check name without exposing its internal rule id. */
export function ruleDisplayLabel(ruleId: string, family: string): string {
  return RULE_DISPLAY_LABELS[ruleId] ?? `${family} check`;
}
