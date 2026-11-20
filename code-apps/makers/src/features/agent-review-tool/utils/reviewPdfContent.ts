import type { ReviewViewModel, SkillView, SkillsGroupedView } from '../agents-experience/components/viewTypes';
import {
  evaluationStateLabel, normalizedDimensionScore, scoreBand, skillScorePercent,
} from '../agents-experience/components/skillHelpers';
import { redactSecrets } from '../agents-experience/services/skill/resourceScanners';
import type {
  CopilotSkillExportRow,
  CopilotSkillGradeExportRow,
} from '../agents-experience/utils/copilotReviewExport';
import type { CsPdfLayout } from './csPdfLayout';
import { decodePdfTextEntities } from './csPdfText';

export interface ReviewPdfSkillsData {
  skills: readonly SkillView[];
  skillGrades: readonly CopilotSkillGradeExportRow[];
  resources?: readonly CopilotSkillExportRow[];
  reviewMode?: 'standard' | 'deep';
}

/** Project real skill grades for both report types without a synthetic zero for an unavailable grade. */
export function buildReviewSkillGradeExportRows(vm: Pick<ReviewViewModel, 'skills'>): CopilotSkillGradeExportRow[] {
  return vm.skills.map(skill => {
    const pct = skillScorePercent(skill);
    if (pct === null) {
      return { skillName: skill.name, grade: evaluationStateLabel(skill).label, evaluationState: skill.evaluationState };
    }
    const band = scoreBand(pct);
    const grade = skill.evaluationState === 'partial' ? `${pct}% (Partial)` : `${pct}% (${band.label})`;
    return { skillName: skill.name, grade, evaluationState: skill.evaluationState };
  });
}

/** Decode displayed values before redaction without changing or shortening the saved source. */
export function reviewPdfText(value: string | number | null | undefined): string {
  let text = value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
  let decoded = decodePdfTextEntities(text);
  while (decoded !== text) {
    text = decoded;
    decoded = decodePdfTextEntities(text);
  }
  return redactSecrets(text);
}

/** Write a saved field with the Standard report's measured wrapping and label treatment. */
export function reviewPdfField(
  layout: CsPdfLayout,
  label: string,
  value: string | number | null | undefined,
  options?: Parameters<CsPdfLayout['field']>[2],
): void {
  layout.field(label, reviewPdfText(value), options);
}

/** Preserve saved skill grades and resource assessments with the shared report layout. */
export function renderReviewPdfSkills(
  layout: CsPdfLayout,
  data: ReviewPdfSkillsData,
  title = 'Skills and resources',
): void {
  const savedResources = data.resources ?? [];
  layout.heading(title, 1);
  if (!data.skills.length && !savedResources.length) {
    layout.paragraph('No skill or supporting-file rows were included in this saved review.');
  }
  for (const [index, skill] of data.skills.entries()) {
    const context = `Skill ${index + 1} - ${reviewPdfText(skill.name)}`;
    layout.setContinuationContext(context);
    layout.heading(reviewPdfText(skill.name), 2);
    reviewPdfField(layout, 'Review mode', skill.mode ?? data.reviewMode);
    reviewPdfField(layout, 'Assessment status',
      skill.evaluationState === 'unavailable' ? 'Not evaluated' : skill.evaluationState);
    reviewPdfField(layout, 'Evaluation', data.skillGrades[index]?.grade);
    if (skill.scores) {
      layout.heading('Dimension scores', 3);
      for (const [label, score] of [
        ['Instruction quality', skill.scores.quality],
        ['Bundle integrity', skill.scores.integrity],
        ['Resource safety', skill.scores.safety],
        ['Operational readiness', skill.scores.readiness],
      ] as const) {
        reviewPdfField(layout, label,
          `${score.status === 'unavailable' || score.value === null ? 'Not assessed' : score.value} | ${score.status} | ${score.coveragePercent}% coverage`);
        if (score.note) reviewPdfField(layout, 'Saved score note', score.note);
      }
      reviewPdfField(layout, 'Safety gate', skill.scores.safetyGate);
    }
    for (const dimension of skill.dimensions) {
      layout.heading(reviewPdfText(dimension.key), 3);
      reviewPdfField(layout, 'Saved dimension score', `${normalizedDimensionScore(dimension.score)} / 10`);
      reviewPdfField(layout, 'Saved rationale', dimension.rationale);
    }
    const resources = skill.resourceRows
      ?? savedResources.filter(row => row.skillSchemaName === skill.schemaName)
        .map(row => ({ ...row, path: row.resourcePath }));
    if (resources.length) layout.heading('Supporting files', 3);
    for (const resource of resources) {
      layout.setContinuationContext(`${context} | ${reviewPdfText(resource.path)}`, true);
      layout.heading(reviewPdfText(resource.path), 3);
      reviewPdfField(layout, 'Resource kind', resource.kind);
      if (resource.language) reviewPdfField(layout, 'Language', resource.language);
      reviewPdfField(layout, 'Size in bytes', resource.sizeBytes);
      reviewPdfField(layout, 'Analysis status', resource.analysisStatus);
      reviewPdfField(layout, 'Review coverage', resource.reviewCoverage);
      reviewPdfField(layout, 'Recorded risk', resource.riskLevel);
      reviewPdfField(layout, 'Recorded readiness', resource.readiness);
      reviewPdfField(layout, 'Recorded findings', resource.findingCount);
      const analysis = skill.resourceAnalyses?.find(item => item.path === resource.path);
      for (const finding of analysis?.findings ?? []) {
        reviewPdfField(layout, 'Resource finding', `${finding.severity}: ${finding.title}`);
        reviewPdfField(layout, 'Recorded resource evidence', finding.evidence);
        reviewPdfField(layout, 'Resource impact', finding.why);
        reviewPdfField(layout, 'Resource action', finding.fix);
      }
    }
  }
  const orphaned = savedResources.filter(resource =>
    !data.skills.some(skill => skill.schemaName === resource.skillSchemaName));
  if (orphaned.length) {
    layout.heading('Additional saved resource rows', 2);
    for (const resource of orphaned) {
      reviewPdfField(layout, 'Skill', resource.skillName);
      reviewPdfField(layout, 'Resource', resource.resourcePath);
      reviewPdfField(layout, 'Analysis status', resource.analysisStatus);
      reviewPdfField(layout, 'Review coverage', resource.reviewCoverage);
    }
  }
  layout.setContinuationContext();
}

/** Retain cross-skill patterns without generating new conclusions or remediation. */
export function renderReviewPdfOrchestration(layout: CsPdfLayout, grouped: SkillsGroupedView): void {
  if (!grouped.orchestration.length) return;
  layout.heading('Cross-skill orchestration', 2);
  for (const pattern of grouped.orchestration) {
    layout.setContinuationContext(reviewPdfText(pattern.ruleId));
    layout.findingHeading(`${reviewPdfText(pattern.ruleId)} - ${reviewPdfText(pattern.title)}`);
    reviewPdfField(layout, 'Severity', pattern.sev);
    reviewPdfField(layout, 'Recorded pattern type', pattern.type);
    reviewPdfField(layout, 'Affected skills', pattern.skills.join(', '));
    reviewPdfField(layout, 'Why it matters', pattern.meaning);
    layout.callout('Maker action', reviewPdfText(pattern.fix));
    pattern.fixSteps.forEach(step => reviewPdfField(layout, `Recorded step ${step.order}`, step.action));
    for (const pair of pattern.pairs) {
      reviewPdfField(layout, 'Affected pair', `${pair.a} / ${pair.b}`);
      reviewPdfField(layout, 'Recorded pair evidence', pair.evidence);
    }
  }
  layout.setContinuationContext();
}
