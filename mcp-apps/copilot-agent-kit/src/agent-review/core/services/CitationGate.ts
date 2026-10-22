/**
 * Citation gate (spec 013 §2). AI output is advisory: any finding or skill-eval
 * citation that references a URL/id not in the curated registry is dropped.
 */
import type { GroundedFinding } from '../contracts/Findings.js';
import type { SkillBundleEvaluation } from '../contracts/SkillEvaluation.js';
import { REFERENCES } from '../contracts/references.js';

const ALLOWED_IDS = new Set(Object.keys(REFERENCES));
const ALLOWED_URLS = new Set(Object.values(REFERENCES).map(r => normalizeUrl(r.url)));

function normalizeUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}

/** Keep only findings whose referenceId is in the registry. */
export function gateFindings(findings: GroundedFinding[]): GroundedFinding[] {
  return findings.filter(f => ALLOWED_IDS.has(f.referenceId));
}

/**
 * Filter a skill evaluation: drop safety findings and cross-skill conflicts whose
 * cited reference is off-list, drop off-list top-level citations. Returns null when
 * the evaluation retains no valid citation at all (fully unmoored output).
 */
export function gateSkillEval(e: SkillBundleEvaluation): SkillBundleEvaluation | null {
  const citations = (e.citations ?? []).filter(c =>
    (c.id && ALLOWED_IDS.has(c.id)) || (c.url && ALLOWED_URLS.has(normalizeUrl(c.url))));
  const safetyFindings = (e.safety?.findings ?? []).filter(f => !f.reference || ALLOWED_IDS.has(f.reference));
  const resources = (e.resources ?? []).map(r => ({
    ...r, findings: (r.findings ?? []).filter(f => !f.reference || ALLOWED_IDS.has(f.reference)),
  }));

  if (citations.length === 0 && (e.citations?.length ?? 0) > 0) return null;

  return {
    ...e,
    citations,
    safety: { ...e.safety, findings: safetyFindings, flagged: safetyFindings.length > 0 ? e.safety.flagged : false },
    resources,
  };
}
