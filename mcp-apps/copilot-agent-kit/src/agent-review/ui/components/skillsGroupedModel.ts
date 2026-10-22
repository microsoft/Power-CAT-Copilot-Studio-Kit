/**
 * Builds the grouped-by-rubric-dimension view of the skill evaluation, plus the
 * set-level cross-skill orchestration section. Pure and synchronous.
 *
 * Per-skill findings (from each persisted skill bundle review) are grouped by the
 * four fixed rubric dimensions. Every dimension is always present — a passing one
 * with no findings renders as an "all clear" state driven by its score. Set-level
 * orchestration findings are surfaced separately since no single skill owns them.
 */
import type {
  CopilotReviewDisplayPayload,
  CrossSkillOrchestrationFinding,
  PersistedSkillBundleReview,
} from '../../core/index.js';
import { REFERENCES, dimensionForRuleId } from '../../core/index.js';
import { findingToView, toViewSeverity } from './viewMappers.js';
import type {
  AggregateFindingProvenance,
  DimensionGroupView,
  FindingProvenance,
  OrchestrationPairView,
  OrchestrationPatternView,
  SkillPatternView,
  SkillRubricDimension,
  SkillsGroupedView,
  SkillView,
} from './viewTypes.js';

/** Canonical dimension order (matches the score strip and locked layout). */
const DIMENSION_ORDER: SkillRubricDimension[] = ['quality', 'integrity', 'safety', 'readiness'];

const DIMENSION_LABELS: Record<SkillRubricDimension, string> = {
  quality: 'Instruction quality',
  integrity: 'Bundle integrity',
  safety: 'Resource safety',
  readiness: 'Operational readiness',
};

const SEV_RANK = { error: 0, warning: 1, info: 2 } as const;

/** Pairwise orchestration types compare two skills; others describe the whole set. */
const PAIRWISE_TYPES = new Set<string>(['overlap', 'redundancy', 'contradiction', 'coupling']);

/** Type guard: whether a bundle review is the persisted form (has scores + manifest). */
function isPersistedBundleReview(r: unknown): r is PersistedSkillBundleReview {
  return typeof r === 'object' && r !== null && 'scores' in r && 'manifest' in r;
}

function firstLine(s: string): string {
  return (s.split('\n')[0] ?? '').trim();
}

/** Strip a leading "[Skill name] " prefix some per-skill titles carry, for a rule-level title. */
function ruleTitle(title: string): string {
  return title.replace(/^\[[^\]]+\]\s*/, '').trim() || title;
}

function aggregateProvenance(
  provenances: readonly FindingProvenance[],
): AggregateFindingProvenance {
  if (provenances.length === 0 || provenances.every(source => source === 'unknown')) {
    return 'unknown';
  }
  if (provenances.some(source => source === 'unknown')) {
    return 'unknown';
  }
  return new Set(provenances).size > 1 ? 'mixed' : provenances[0];
}

/** Group every per-skill finding by its rule id into a pattern with per-skill instances. */
function buildPatterns(reviews: PersistedSkillBundleReview[]): Map<string, SkillPatternView> {
  const map = new Map<string, SkillPatternView>();
  for (const r of reviews) {
    for (const f of r.findings) {
      const sev = toViewSeverity(f.severity);
      const finding = findingToView(f);
      let pattern = map.get(f.id);
      if (!pattern) {
        pattern = {
          ruleId: f.id,
          title: ruleTitle(f.title),
          sev,
          provenance: finding.provenance,
          dimension: f.dimension ?? dimensionForRuleId(f.id),
          meaning: f.why,
          fix: f.fix,
          instances: [],
        };
        map.set(f.id, pattern);
      } else if (SEV_RANK[sev] < SEV_RANK[pattern.sev]) {
        pattern.sev = sev;
      }
      pattern.instances.push({
        skillId: r.skillComponentUniqueId,
        skillName: r.skillName,
        evidence: firstLine(f.fact),
        finding,
      });
      pattern.provenance = aggregateProvenance(
        pattern.instances.map(instance => instance.finding.provenance),
      );
    }
  }
  return map;
}

/** Worst (lowest) non-null dimension score across all skills; null when never scored. */
function aggregateScore(reviews: PersistedSkillBundleReview[], dim: SkillRubricDimension): number | null {
  let worst: number | null = null;
  for (const r of reviews) {
    const s = r.scores[dim];
    if (s && typeof s.value === 'number') {
      worst = worst === null ? s.value : Math.min(worst, s.value);
    }
  }
  return worst;
}

/** Worst-first inside a group: by severity, then by breadth (skills affected), then id. */
function sortPatterns(patterns: SkillPatternView[]): SkillPatternView[] {
  return [...patterns].sort(
    (a, b) =>
      SEV_RANK[a.sev] - SEV_RANK[b.sev] ||
      b.instances.length - a.instances.length ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

/** Rank a group by its worst finding severity (all-clear groups sink to the bottom). */
function groupWorstRank(group: DimensionGroupView): number {
  return group.patterns.reduce((min, p) => Math.min(min, SEV_RANK[p.sev]), 3);
}

function orchestrationToView(
  f: CrossSkillOrchestrationFinding,
  skillIdsByName: Map<string, string[]>,
): OrchestrationPatternView {
  const references = (f.referenceIds ?? [])
    .filter((id): id is keyof typeof REFERENCES => id in REFERENCES)
    .map(id => {
      const ref = REFERENCES[id as keyof typeof REFERENCES];
      return { id: id as string, title: ref.title, url: ref.url, source: ref.source };
    });

  const pairs: OrchestrationPairView[] = [];
  if (PAIRWISE_TYPES.has(f.type) && f.skills.length >= 2) {
    for (let i = 0; i < f.skills.length; i++) {
      for (let j = i + 1; j < f.skills.length; j++) {
        const a = f.skills[i];
        const b = f.skills[j];
        const aMatches = skillIdsByName.get(a) ?? [];
        const bMatches = skillIdsByName.get(b) ?? [];
        pairs.push({
          id: `${f.id}:${i}:${j}`,
          a,
          b,
          aSkillId: aMatches.length === 1 ? aMatches[0] : undefined,
          bSkillId: bMatches.length === 1 ? bMatches[0] : undefined,
          evidence: f.evidence,
        });
      }
    }
  }

  return {
    ruleId: f.ruleId,
    title: f.title,
    sev: toViewSeverity(f.severity),
    type: f.type,
    meaning: f.rationale,
    fix: f.recommendation,
    fixSteps: f.fixSteps ?? [],
    skills: f.skills,
    pairs,
    references,
  };
}

/**
 * Build the grouped Skills view from the review payload and the already-mapped skills.
 *
 * @param payload - The display payload (carries skillBundleReviews + crossSkillOrchestration).
 * @param skills - The mapped SkillView list, used for in-pane drill-down lookups.
 */
export function buildSkillsGroupedView(
  payload: CopilotReviewDisplayPayload,
  skills: SkillView[],
): SkillsGroupedView {
  const reviews = (payload.skillBundleReviews ?? []).filter(isPersistedBundleReview);
  const patterns = buildPatterns(reviews);

  const groups: DimensionGroupView[] = DIMENSION_ORDER.map(dim => ({
    dimension: dim,
    label: DIMENSION_LABELS[dim],
    score: aggregateScore(reviews, dim),
    patterns: sortPatterns([...patterns.values()].filter(p => p.dimension === dim)),
  }));

  // Worst first: dimensions with the most severe findings float up; all-clear ones sink.
  groups.sort(
    (a, b) => groupWorstRank(a) - groupWorstRank(b) || (a.score ?? 101) - (b.score ?? 101),
  );

  const skillsById: Record<string, SkillView> = {};
  const skillIdsByName = new Map<string, string[]>();
  for (const skill of skills) {
    skillsById[skill.id] = skill;
    skillIdsByName.set(skill.name, [...(skillIdsByName.get(skill.name) ?? []), skill.id]);
  }

  const orchestration = payload.crossSkillOrchestration
    ? payload.crossSkillOrchestration.findings.map(f =>
        orchestrationToView(f, skillIdsByName)
      )
    : [];

  return { groups, orchestration, skillsById };
}
