import type { CreditsVM } from './model-assessment';

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Sum of the rounded parts, so the total shown always adds up from the breakdown
 * shown beside it. Amounts too small to round above zero keep their true sum.
 */
export function creditsTotal(credits: CreditsVM): number {
  const shown = cents(credits.conversation) + cents(credits.evaluators);
  return shown > 0 ? shown : credits.conversation + credits.evaluators;
}

/** Combined credits of several test cases; partial when any of them is. */
export function sumCredits(items: Iterable<CreditsVM>): CreditsVM | undefined {
  let total: CreditsVM | undefined;
  for (const item of items) {
    total = {
      conversation: (total?.conversation ?? 0) + item.conversation,
      evaluators: (total?.evaluators ?? 0) + item.evaluators,
      ...(total?.partial || item.partial ? { partial: true } : {}),
    };
  }
  return total;
}

/** Two decimals; tiny non-zero amounts read as "<0.01" rather than "0.00". */
export function formatCredits(value: number): string {
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** e.g. "Est. 1.40 Copilot Credits" (with "partial" when Copilot Studio could not total every conversation). */
export function creditsLabel(credits: CreditsVM): string {
  return `Est. ${formatCredits(creditsTotal(credits))} Copilot Credits${credits.partial ? ' (partial)' : ''}`;
}

/** e.g. "0.16 to answer · 1.24 to score". */
export function creditsBreakdown(credits: CreditsVM): string {
  return `${formatCredits(credits.conversation)} to answer · ${formatCredits(credits.evaluators)} to score`;
}

export const CREDITS_NOT_REPORTED = 'Copilot Credits not reported';
