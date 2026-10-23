/**
 * Citation gate (spec 013 §2). AI output is advisory: any finding whose reference
 * id is not in the curated registry is dropped.
 */
import type { GroundedFinding } from '../contracts/Findings.js';
import { REFERENCES } from '../contracts/references.js';

const ALLOWED_IDS = new Set(Object.keys(REFERENCES));

/** Keep only findings whose referenceId is in the registry. */
export function gateFindings(findings: GroundedFinding[]): GroundedFinding[] {
  return findings.filter(f => ALLOWED_IDS.has(f.referenceId));
}
