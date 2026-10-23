import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel.js';
import type { GroundedFinding, FindingSeverity } from '../../contracts/Findings.js';
import type { ReferenceId } from '../../contracts/references.js';

export interface Rule {
  id: string; family: string; severity: FindingSeverity; referenceId: ReferenceId;
  /**
   * `record` marks a rule that reports configuration rather than judging it.
   *
   * These rules state a fact -- the model in use, the tool inventory, the
   * harness -- and their own `fix` text says "No action required". They can
   * never fail, so counting them in "checks passed" put a ceiling on that
   * ratio that no agent could reach, and left a maker hunting for problems
   * among rules that were never looking for one.
   *
   * Defaults to a real check when omitted.
   */
  kind?: 'check' | 'record';
  check(model: AgentsExperienceModel): GroundedFinding | GroundedFinding[] | null;
}

/** Whitespace-normalized, lowercased display name for token matching. */
export function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
