import type { CsPdfLayout } from '../../utils/csPdfLayout';
import type { DACriterionSection, DAReviewShellModel } from '../adapters/daReviewShellModel';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { ManifestHealthCheck } from '../contracts/ManifestHealthCheck';
import { daPdfField, daPdfText, type DAPdfFinding } from './daPdfContent';

const HEALTH_CHECKS: ReadonlyArray<{ field: keyof ManifestHealthCheck; label: string }> = [
  { field: 'versionSupported', label: 'Declarative-agent version' },
  { field: 'nameLength', label: 'Agent name length' },
  { field: 'descriptionLength', label: 'Description length' },
  { field: 'instructionsPresent', label: 'Instructions present' },
  { field: 'instructionsLength', label: 'Instructions length' },
  { field: 'conversationStartersCount', label: 'Conversation starters count' },
  { field: 'actionsCount', label: 'Actions count' },
  { field: 'nameConsistency', label: 'Name consistency across files' },
  { field: 'noPromptInjection', label: 'No prompt injection phrases' },
  { field: 'noUrlsOrEmojis', label: 'No URLs or emojis in fields' },
  { field: 'isConsequentialFlags', label: 'isConsequential flags correct' },
  { field: 'httpsOnActionUrls', label: 'HTTPS on all action URLs' },
  { field: 'mcpStaticDiscovery', label: 'MCP static discovery flags' },
  { field: 'colorIconPresent', label: 'Color icon present' },
  { field: 'daFileResolved', label: 'Declarative agent file resolved' },
];

/** Retain passing checks and all non-scored notes, even when no issue was recorded. */
export function renderDACriterionEvidence(layout: CsPdfLayout, section: DACriterionSection): void {
  for (const check of section.result?.passingChecks ?? []) {
    daPdfField(layout, 'Recorded passing check', check.description);
  }
  for (const note of section.result?.assessmentNotes ?? []) {
    daPdfField(layout, 'Assessment note', note.status);
    daPdfField(layout, 'Recorded reason', note.description);
    if (note.sourceFile) daPdfField(layout, 'Source file', note.sourceFile);
    if (note.jsonPath) daPdfField(layout, 'JSON path', note.jsonPath);
    if (note.evidence) daPdfField(layout, 'Recorded evidence', note.evidence);
  }
  if (!section.result) layout.paragraph('No assessment was saved for this criterion.');
}

function renderLegacyHealth(layout: CsPdfLayout, health: ManifestHealthCheck): void {
  layout.heading('Legacy manifest health checks', 2);
  daPdfField(layout, 'Schema version', health.schemaVersion);
  for (const { field, label } of HEALTH_CHECKS) {
    const check = health[field];
    layout.setContinuationContext(`Legacy check - ${label}`);
    if (check === undefined || typeof check === 'string') {
      daPdfField(layout, label, 'Not assessed');
      continue;
    }
    const passed = typeof check === 'boolean' ? check : check.pass;
    daPdfField(layout, label, passed ? 'Pass' : 'Fail');
    if (typeof check === 'boolean') daPdfField(layout, 'Recorded detail', check ? 'Present' : 'Not found');
    else {
      if (check.message) daPdfField(layout, 'Recorded detail', check.message);
      if ('value' in check && 'limit' in check) {
        daPdfField(layout, 'Recorded length', `${check.value} / ${check.limit} characters`);
      } else if ('value' in check && 'max' in check) {
        daPdfField(layout, 'Recorded count', `${check.value} / ${check.max} maximum`);
        if (check.min !== undefined) daPdfField(layout, 'Recorded minimum', check.min);
      }
    }
  }
  layout.setContinuationContext();
}

/** Retain every saved outcome while referring to finding details instead of repeating long evidence. */
export function renderDARecordedChecks(
  layout: CsPdfLayout, review: DAReviewRecord, model: DAReviewShellModel,
  findings: readonly DAPdfFinding[],
): void {
  layout.heading('All recorded checks', 1);
  for (const section of model.sections.filter(item => item.tab !== 'package')) {
    layout.heading(section.criterionName, 3);
    daPdfField(layout, 'Status', section.result?.status ?? 'Not assessed');
    const related = findings.filter(finding => finding.tab === section.tab);
    if (related.length) daPdfField(layout, 'Related findings', related.map(finding => finding.label).join(', '));
    if (section.result) daPdfField(layout, 'Recorded passing checks', section.result.passingChecks?.length ?? 0);
  }
  if (review.packageValidation) {
    layout.heading('Recorded package checks', 2);
    for (const finding of review.packageValidation.findings) {
      layout.setContinuationContext(`Package check - ${daPdfText(finding.ruleId)}`);
      layout.heading(daPdfText(finding.ruleId), 3);
      daPdfField(layout, 'Status', finding.status);
      daPdfField(layout, 'Method', finding.method);
      daPdfField(layout, 'Recorded outcome', finding.explanation);
      if (finding.status !== 'Fail' && finding.status !== 'Warning') {
        daPdfField(layout, 'Source file', finding.sourceFile);
        daPdfField(layout, 'JSON path', finding.jsonPath);
        daPdfField(layout, 'Recorded evidence', finding.evidence);
        if (finding.recommendation) daPdfField(layout, 'Recorded recommendation', finding.recommendation);
      }
    }
  } else if (review.manifestHealth) {
    renderLegacyHealth(layout, review.manifestHealth);
  } else {
    layout.paragraph('No package-validation or legacy manifest-health checks were saved.');
  }
  layout.setContinuationContext();
}
