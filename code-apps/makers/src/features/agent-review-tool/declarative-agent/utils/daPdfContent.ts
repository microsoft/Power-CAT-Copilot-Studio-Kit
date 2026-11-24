import type { CsPdfLayout } from '../../utils/csPdfLayout';
import { reviewPdfText } from '../../utils/reviewPdfContent';
import { findingToView } from '../../agents-experience/components/viewMappers';
import { REFERENCES } from '../../agents-experience/contracts/references';
import type { DAReviewShellModel, DATabId } from '../adapters/daReviewShellModel';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import {
  CRITERION_LEARN_DOCS, HEALTH_CHECK_LEARN_DOCS, ISSUE_LEARN_URLS,
  PACKAGE_GUIDANCE_DOCS, SCHEMA_LEARN_DOCS, type LearnDocLink,
} from '../contracts/learnDocs';
import { guidancePageOf, issueGuidanceLink, type GuidanceIssue } from './guidanceLinks';

export interface DAPdfFinding {
  label: string;
  tab: DATabId;
  category: string;
  issue: GuidanceIssue;
  title?: string;
  recordedId?: string;
  impact?: string;
  disposition?: string;
  steps?: Array<{ order: number; action: string }>;
}

export const DA_PDF_SEVERITY = {
  High: { color: '#a4262c', rank: 0 },
  Medium: { color: '#875600', rank: 1 },
  Low: { color: '#17436b', rank: 2 },
} as const;

const KNOWN_DOCS = [
  ...Object.values(PACKAGE_GUIDANCE_DOCS), ...Object.values(SCHEMA_LEARN_DOCS),
  ...Object.values(CRITERION_LEARN_DOCS).flat(), ...Object.values(HEALTH_CHECK_LEARN_DOCS).flat(),
  ...Object.values(ISSUE_LEARN_URLS),
];

/** Decode and redact saved M365 values with the shared report text helper. */
export function daPdfText(value: string | number | null | undefined): string {
  return reviewPdfText(value);
}

/** Render a saved M365 field with measured wrapping, entity decoding, and redaction. */
export function daPdfField(
  layout: CsPdfLayout, label: string, value: string | number | null | undefined,
  options?: Parameters<CsPdfLayout['field']>[2],
): void {
  layout.field(label, daPdfText(value), options);
}

/** Number distinct recorded issues without merging repeated rule identifiers. */
export function buildDAPdfFindings(review: DAReviewRecord, model: DAReviewShellModel): DAPdfFinding[] {
  const findings: Omit<DAPdfFinding, 'label'>[] = model.sections.flatMap(section =>
    (section.result?.issues ?? []).map(issue => ({
      tab: section.tab, category: section.criterionName, issue,
    })));
  for (const skill of review.customSkillReviews ?? []) {
    for (const saved of skill.findings) {
      const view = findingToView(saved);
      findings.push({
        tab: 'customSkills', category: skill.skillName, title: view.title,
        recordedId: saved.id, impact: view.why, steps: view.fixSteps,
        disposition: view.dispositionLabel,
        issue: {
          severity: view.sev === 'error' ? 'High' : view.sev === 'warning' ? 'Medium' : 'Low',
          description: view.fact, recommendation: view.fix, ruleId: saved.ruleId,
          method: view.provenance === 'unknown' ? undefined
            : view.provenance === 'ai-generated' ? 'semantic' : 'deterministic',
          sourceFile: saved.resourcePath, evidence: saved.evidence,
        },
      });
    }
  }
  return findings.map((finding, index) => ({
    ...finding, label: `F-${String(index + 1).padStart(2, '0')}`,
  }));
}

function curatedGuidance(issue: GuidanceIssue): LearnDocLink | undefined {
  const link = issueGuidanceLink(issue);
  if (!link) return undefined;
  return KNOWN_DOCS.find(doc => doc.url === link.url)
    ?? KNOWN_DOCS.find(doc => guidancePageOf(doc.url) === guidancePageOf(link.url));
}

/** Keep each issue's evidence, source, and saved action together in the Standard finding blocks. */
export function renderDAPdfFindings(layout: CsPdfLayout, findings: readonly DAPdfFinding[]): void {
  if (!findings.length) {
    layout.paragraph('No issue was recorded in this section. Check assessment notes and limits before drawing a complete conclusion.');
  }
  for (const finding of findings) {
    const identity = `${finding.label} - ${daPdfText(finding.title ?? finding.category)}`;
    const { issue } = finding;
    layout.setContinuationContext(identity);
    layout.findingHeading(identity);
    daPdfField(layout, 'Severity', issue.severity, {
      style: 'bold', color: DA_PDF_SEVERITY[issue.severity].color,
    });
    daPdfField(layout, 'Category', finding.category);
    if (finding.recordedId) daPdfField(layout, 'Recorded finding ID', finding.recordedId);
    daPdfField(layout, 'Rule', issue.ruleId);
    daPdfField(layout, 'Method', issue.method);
    if (finding.disposition) daPdfField(layout, 'Product disposition', finding.disposition);
    daPdfField(layout, 'Finding', issue.description);
    daPdfField(layout, 'Source file', issue.sourceFile);
    daPdfField(layout, 'JSON path', issue.jsonPath);
    daPdfField(layout, 'Recorded evidence', issue.evidence);
    if (finding.impact) daPdfField(layout, 'Why it matters', finding.impact);
    layout.callout('Maker action', daPdfText(issue.recommendation));
    finding.steps?.forEach(step => daPdfField(layout, `Recorded step ${step.order}`, step.action));
    const link = curatedGuidance(issue);
    if (link) layout.paragraph(daPdfText(link.label), {
      url: link.url, color: '#17436b', fontSize: 8.5,
    });
    else if (issue.guidanceUrl) daPdfField(layout, 'Recorded guidance', issue.guidanceUrl);
    layout.divider();
  }
  layout.setContinuationContext();
}

/** Link only registry-owned guidance, never arbitrary addresses embedded in saved evidence. */
export function renderDAPdfReferences(
  layout: CsPdfLayout, review: DAReviewRecord, model: DAReviewShellModel,
  findings: readonly DAPdfFinding[],
): void {
  const docs = findings.flatMap(finding => {
    const link = curatedGuidance(finding.issue);
    return link ? [link] : [];
  });
  for (const section of model.sections) {
    for (const check of [...(section.result?.passingChecks ?? []), ...(section.result?.assessmentNotes ?? [])]) {
      const doc = check.learnUrl
        ? KNOWN_DOCS.find(candidate => guidancePageOf(candidate.url) === guidancePageOf(check.learnUrl ?? ''))
        : undefined;
      if (doc) docs.push(doc);
    }
  }
  const skillReferences = [
    ...(review.customSkillReviews?.flatMap(skill => skill.findings.flatMap(finding => finding.referenceIds)) ?? []),
    ...(model.customSkills?.grouped.orchestration.flatMap(pattern => pattern.references.map(reference => reference.id)) ?? []),
  ];
  for (const [id, reference] of Object.entries(REFERENCES)) {
    if (skillReferences.includes(id)) docs.push({ label: reference.title, url: reference.url });
  }
  layout.heading('Official references', 1);
  layout.paragraph('Saved authoring guidance from the verified reference lists.', { fontSize: 8.5 });
  const seen = new Set<string>();
  for (const doc of docs) {
    const page = guidancePageOf(doc.url);
    if (seen.has(page)) continue;
    seen.add(page);
    layout.block([{
      value: `${daPdfText(doc.label)}\n${doc.url}`,
      options: { style: 'bold', color: '#17436b', url: doc.url, fontSize: 7, gap: 0.5 },
    }]);
  }
  if (!seen.size) layout.paragraph('No curated reference was recorded for this saved review.');
}
