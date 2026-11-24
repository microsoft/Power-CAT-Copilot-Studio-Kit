/**
 * Shared, pure mappers that turn live findings into the view-model finding shape.
 * Extracted so both {@link ./viewModel} and {@link ./skillsGroupedModel} can reuse
 * them without a circular import.
 */
import type { GroundedFinding, GroundedSkillFinding } from '../contracts/Findings';
import { getSafetyDispositionLabel } from '../contracts/Findings';
import { REFERENCES } from '../contracts/references';
import { dimensionForRuleId } from '../services/skill/skillRuleRegistry';
import { prettyModelSeries } from '../services/modelDisplay';
import { getCopilotFindingGuidance, type CopilotGuidanceContext } from '../services/copilotContextualGuidance';
import { readInstructionFindingNarrative } from '../services/copilotAiNarrative';
import { redactSecrets } from '../services/skill/resourceScanners';
import type { FindingProvenance, FindingView, Severity } from './viewTypes';

/** Collapse the finding severity scale into the three view severities. */
export function toViewSeverity(
  severity: GroundedFinding['severity'] | GroundedSkillFinding['severity'],
): Severity {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'info';
  return severity;
}

/** Type guard: whether a finding is a GroundedSkillFinding (has referenceIds). */
export function isSkillFinding(
  f: GroundedFinding | GroundedSkillFinding,
): f is GroundedSkillFinding {
  return 'referenceIds' in f && Array.isArray((f as GroundedSkillFinding).referenceIds);
}

/**
 * Formats the series token inside a `Model: <series>` finding title (e.g.
 * `Model: Sonnet46` -> `Model: Sonnet 4.6`). Idempotent, so already-formatted
 * or non-model titles pass through unchanged. Applied at the view layer so
 * reviews persisted before the rule fix still render the friendly label.
 */
function prettifyModelTitle(family: string, title: string): string {
  if (!family.toLowerCase().includes('model')) return title;
  const m = /^(Model:\s*)(\S+)$/.exec(title);
  return m ? `${m[1]}${prettyModelSeries(m[2])}` : title;
}

function resolveFindingProvenance(
  finding: GroundedFinding | GroundedSkillFinding,
): FindingProvenance {
  if (finding.ai === true) return 'ai-generated';
  if (finding.ai === false) return 'deterministic';
  return 'unknown';
}

/** Map a live finding into the presentational FindingView, resolving references + dimension. */
export function findingToView(
  f: GroundedFinding | GroundedSkillFinding,
  context?: CopilotGuidanceContext,
  containingSkillId?: string,
): FindingView {
  const primaryRef = REFERENCES[f.referenceId];
  const provenance = resolveFindingProvenance(f);

  // Collect all reference IDs: skill findings have referenceIds array; plain findings use referenceId only.
  const allRefIds: string[] = isSkillFinding(f)
    ? (f.referenceIds?.length ? f.referenceIds : (f.referenceId ? [f.referenceId] : []))
    : (f.referenceId ? [f.referenceId] : []);

  const references = allRefIds
    .filter((id): id is keyof typeof REFERENCES => id in REFERENCES)
    .map(id => {
      const ref = REFERENCES[id as keyof typeof REFERENCES];
      return { id: id as string, title: ref.title, url: ref.url, source: ref.source };
    });

  const dimension = (isSkillFinding(f) && f.dimension) ? f.dimension : dimensionForRuleId(f.id);
  const narrative = readInstructionFindingNarrative(f).narrative;
  const remediation = getCopilotFindingGuidance(f, context, containingSkillId);

  return {
    id: f.id,
    sev: f.safetyDisposition === 'advisory' ? 'warning' : toViewSeverity(f.severity),
    family: f.family,
    provenance,
    ai: provenance === 'ai-generated',
    title: narrative ? remediation?.findingTitle ?? f.title : prettifyModelTitle(f.family, f.title),
    sub: (narrative?.fact === undefined ? f.fact : redactSecrets(narrative.fact)).split('\n')[0] ?? '',
    fact: f.fact,
    why: narrative ? remediation?.whyItMatters ?? f.why : f.why,
    fix: narrative ? remediation?.makerAction ?? f.fix : f.fix,
    displayFact: narrative?.fact === undefined ? undefined : redactSecrets(narrative.fact),
    remediation,
    dimension,
    refTitle: primaryRef?.title ?? f.referenceId,
    refUrl: (primaryRef?.url ?? '').replace(/^https?:\/\//, ''),
    source: primaryRef?.source ?? 'Microsoft Learn',
    // `skipAiEvaluation` no longer suppresses the AI stage — the gate was
    // removed. The flag is retained on the finding as a severity signal, so it
    // must not claim an isolation behaviour that no longer happens.
    how: provenance === 'ai-generated'
      ? 'AI-generated'
      : provenance === 'deterministic'
        ? 'Automated check'
        : 'Source unavailable',
    safetyDisposition: f.safetyDisposition,
    platformOverlap: f.platformOverlap,
    dispositionLabel: f.safetyDisposition
      ? getSafetyDispositionLabel(f.safetyDisposition, f.platformOverlap)
      : undefined,
    skipAiEvaluation: f.skipAiEvaluation,
    componentIdUnique: f.componentIdUnique,
    resourcePath: isSkillFinding(f) ? f.resourcePath : undefined,
    fixSteps: isSkillFinding(f) ? (f.fixSteps ?? []) : [],
    references,
  };
}
