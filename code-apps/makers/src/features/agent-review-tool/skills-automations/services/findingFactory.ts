/**
 * Finding factory for uploaded-artifact rules (spec 018).
 *
 * Wraps `createRegisteredFinding` so every finding this feature produces still
 * gets its title, explanation, fix steps and citations from the shared rule
 * registry, and adds only the upload-specific fields on top.
 *
 * Rules must not build findings by hand. The registry is what stops rule text
 * being written twice and drifting, and what guarantees every finding carries a
 * citation the citation gate will accept.
 */
import { createRegisteredFinding } from '../../agents-experience/services/skill/skillRuleRegistry';
import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';
import type { ArtifactFinding, FindingSource, TargetRuntime } from '../contracts/ArtifactReview';
import { truncateEvidence } from './artifactUtils';

export interface BuildFindingOptions {
  ruleId: string;
  /** What was observed. Shown verbatim in the monospace evidence block. */
  evidence: string;
  /** Root-relative path of the file the finding is about. */
  resourcePath?: string;
  line?: number;
  severity?: SkillFindingSeverity;
  /** Runtimes this applies to. Empty or omitted means all selected runtimes. */
  runtimes?: TargetRuntime[];
  source?: FindingSource;
  /**
   * Disambiguates two findings from the same rule and file.
   *
   * Without it, five unreferenced files all produce `PKG-ORPHAN:<path>` and the
   * list collapses to one row, hiding four real problems.
   */
  instanceKey?: string;
}

/** Build a fully grounded finding for an uploaded artifact. */
export function buildFinding(options: BuildFindingOptions): ArtifactFinding {
  const evidence = truncateEvidence(options.evidence);
  const base = createRegisteredFinding(options.ruleId, {
    resourcePath: options.resourcePath,
    evidence,
    fact: evidence,
    severity: options.severity,
  });

  const suffix = options.instanceKey ? `:${options.instanceKey}` : '';
  return {
    ...base,
    id: `${base.id}${suffix}`,
    runtimes: options.runtimes ?? [],
    source: options.source ?? 'deterministic',
    line: options.line,
  };
}
