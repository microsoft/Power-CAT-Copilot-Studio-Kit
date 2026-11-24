/**
 * Shared harness helpers for the Agent Review Tool (GitHub issue 947).
 *
 * A review starts only for the standard harness or the Microsoft Copilot harness.
 * For an unsupported harness, the caller shows UNSUPPORTED_HARNESS_MESSAGE, and no checks run.
 */
import type { AgentHarnessKind, ReviewGridRow, ReviewKind } from '../contracts/ReviewResult';

export interface HarnessReviewStartHandlers {
  standard: () => void;
  copilot: () => void;
  unsupported: () => void;
}

/** Calls the one handler for the harness. No harness means the standard harness. */
export function startReviewForHarness(
  harness: AgentHarnessKind | undefined,
  handlers: HarnessReviewStartHandlers,
): void {
  if (harness === 'unsupported') {
    handlers.unsupported();
    return;
  }
  if (harness === 'copilot') {
    handlers.copilot();
    return;
  }
  handlers.standard();
}

/**
 * Gives the harness of the saved review that a grid row shows. The saved review comes first,
 * so an old review still opens when the agent now has an unsupported harness.
 */
export function resolveSavedReviewHarness(
  row: Pick<ReviewGridRow, 'harness' | 'reviewHarness'> | undefined,
  botHarness: AgentHarnessKind | undefined,
): ReviewKind {
  if (row?.reviewHarness) return row.reviewHarness;
  return botHarness === 'copilot' || row?.harness === 'copilot' ? 'copilot' : 'standard';
}

/** The harness label in the agent list. */
export function agentHarnessLabel(harness: AgentHarnessKind | undefined): string {
  if (harness === 'copilot') return 'Microsoft Copilot';
  if (harness === 'unsupported') return 'Unsupported harness';
  return 'Standard';
}

/** The agent name in the ZIP agent selector. An unsupported harness adds the harness label. */
export function agentSelectorLabel(name: string, harness: AgentHarnessKind | undefined): string {
  return harness === 'unsupported' ? `${name} (${agentHarnessLabel(harness)})` : name;
}
