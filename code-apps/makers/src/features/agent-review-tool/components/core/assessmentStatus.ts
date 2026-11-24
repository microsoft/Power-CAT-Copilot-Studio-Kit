const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'N/A': 'Not applicable. No eligible item exists for this rule. This result does not affect the score.',
  'Not assessed': 'The rule may apply, but the available information was not sufficient for a reliable Pass or Fail result. This result does not affect the score.',
};

/** Return the generic explanation for a non-scored assessment status. */
export function getAssessmentStatusDescription(statusLabel: string): string | undefined {
  return STATUS_DESCRIPTIONS[statusLabel];
}
