import type { CsPdfLayout } from '../../utils/csPdfLayout';
import type { FindingView, ReviewViewModel } from '../components/viewTypes';
import { REFERENCES } from '../contracts/references';
import { reviewPdfField, reviewPdfText } from '../../utils/reviewPdfContent';
import { copilotGuidanceSourceLabel } from '../services/copilotContextualGuidance';
import type { CopilotContextualGuidance } from '../contracts/Findings';

export { reviewPdfField as copilotPdfField, reviewPdfText as copilotPdfText } from '../../utils/reviewPdfContent';

export interface CopilotPdfFinding {
  label: string;
  finding: FindingView;
}

export const COPILOT_PDF_SEVERITY = {
  error: { label: 'Error', color: '#a4262c', rank: 0 },
  warning: { label: 'Warning', color: '#875600', rank: 1 },
  info: { label: 'Information', color: '#17436b', rank: 2 },
} as const;

const copilotPdfText = reviewPdfText;
const copilotPdfField = reviewPdfField;

/** Give every displayed finding a report identity without collapsing repeated rule IDs. */
export function numberedCopilotFindings(vm: ReviewViewModel): CopilotPdfFinding[] {
  return vm.findings.map((finding, index) => ({
    label: `F-${String(index + 1).padStart(2, '0')}`,
    finding,
  }));
}

/** Use the same recorded advice fields for ordinary and set-level Copilot findings. */
export function renderCopilotActionGuidance(
  layout: CsPdfLayout,
  guidance: CopilotContextualGuidance | undefined,
  currentAction: string,
  currentImpact: string,
): void {
  if (!guidance) return;
  copilotPdfField(layout, 'Guidance source', copilotGuidanceSourceLabel(guidance.source));
  if (guidance.componentIdUnique !== undefined) copilotPdfField(layout, 'Guidance component ID', guidance.componentIdUnique);
  if (guidance.makerAction !== currentAction) copilotPdfField(layout, 'Recommended action', guidance.makerAction);
  if (guidance.whyItMatters !== currentImpact) copilotPdfField(layout, 'Example for this agent', guidance.whyItMatters);
  if (guidance.suggestedText !== undefined) {
    copilotPdfField(layout, 'Draft change (Not applied)', guidance.suggestedText === '' ? '(empty)' : guidance.suggestedText);
  }
  if (guidance.acceptanceCheck.trim()) copilotPdfField(layout, 'How to verify', guidance.acceptanceCheck);
}

/** Render saved findings using the Standard report's actionable finding and callout blocks. */
export function renderCopilotFindings(
  layout: CsPdfLayout,
  findings: CopilotPdfFinding[],
  vm: ReviewViewModel,
): void {
  if (!findings.length) {
    layout.paragraph(
      'No finding was recorded in this section. This does not establish complete assessment coverage.',
    );
    return;
  }
  for (const { label, finding } of findings) {
    const title = `${label} - ${copilotPdfText(finding.title)}`;
    layout.setContinuationContext(title);
    layout.findingHeading(title);
    const severity = COPILOT_PDF_SEVERITY[finding.sev];
    copilotPdfField(layout, 'Severity', severity.label, {
      style: 'bold',
      color: severity.color,
    });
    copilotPdfField(layout, 'Recorded finding ID', finding.id);
    copilotPdfField(layout, 'Family', finding.family);
    copilotPdfField(layout, 'Detection', finding.how);
    if (finding.dispositionLabel) {
      copilotPdfField(layout, 'Product disposition', finding.dispositionLabel);
    }
    const component = vm.skills.find(skill => skill.id === finding.componentIdUnique);
    if (component || finding.componentIdUnique) {
      copilotPdfField(layout, 'Recorded component', component?.name ?? finding.componentIdUnique);
    }
    copilotPdfField(layout, 'Where to change', finding.resourcePath);
    if (finding.displayFact !== undefined) {
      copilotPdfField(layout, 'Finding context (AI)', finding.displayFact);
      copilotPdfField(layout, 'Recorded evidence', finding.fact);
    } else {
      copilotPdfField(layout, 'Finding', finding.fact);
      if (finding.sub && finding.sub !== finding.fact) copilotPdfField(layout, 'Recorded evidence', finding.sub);
    }
    copilotPdfField(layout, 'Why it matters', finding.why);
    layout.callout('Maker action', copilotPdfText(finding.fix));
    renderCopilotActionGuidance(layout, finding.remediation, finding.fix, finding.why);
    for (const step of finding.fixSteps) {
      copilotPdfField(layout, `Recorded step ${step.order}`, step.action);
    }
    if (finding.references.length) {
      copilotPdfField(layout, 'Recorded guidance',
        finding.references.map(reference => reference.title).join(' | '));
    }
    layout.divider();
  }
  layout.setContinuationContext();
}

/** Render one saved outcome without presenting a failed execution as an agent defect. */
export function renderCopilotChecks(layout: CsPdfLayout, vm: ReviewViewModel): void {
  layout.heading('All recorded checks', 1);
  if (!vm.checks.recorded) {
    layout.paragraph('Rule outcomes were not recorded for this review. No pass/fail checklist is inferred.');
    return;
  }
  const statusLabels = {
    passed: 'Passed',
    info: 'Information',
    warning: 'Warning',
    error: 'Error',
    'not-applicable': 'Not applicable',
    failed: 'Not assessed (execution failed)',
  } as const;
  for (const group of vm.checks.groups) {
    layout.heading(copilotPdfText(group.family), 2);
    for (const row of group.rows) {
      layout.setContinuationContext(`Check ${copilotPdfText(row.ruleId)}`);
      layout.heading(copilotPdfText(row.ruleId), 3);
      copilotPdfField(layout, 'Status', statusLabels[row.status]);
      if (row.record) layout.paragraph('Configuration record; not a scored pass/fail check.');
      if (row.subject) copilotPdfField(layout, 'Recorded subject', row.subject);
      row.findings.forEach(finding => {
        copilotPdfField(layout, 'Recorded finding', finding.title);
      });
    }
  }
  layout.setContinuationContext();
}

/** Render only curated reference URLs, with the Standard report's linked reference treatment. */
export function renderCopilotReferences(layout: CsPdfLayout, vm: ReviewViewModel): void {
  const identifiers = new Set([
    ...vm.findings.flatMap(finding => finding.references.map(reference => reference.id)),
    ...vm.skillsGrouped.orchestration.flatMap(pattern => pattern.references.map(reference => reference.id)),
  ]);
  const references = Object.entries(REFERENCES).filter(([id]) => identifiers.has(id));
  layout.heading('Official references', 1);
  layout.paragraph('Saved authoring guidance; references are not proof of measured runtime outcomes.', {
    fontSize: 7,
    gap: 0.5,
  });
  if (!references.length) layout.paragraph('No curated reference was recorded for these findings.');
  for (const [, reference] of references) {
    layout.block([{
      value: `${reference.title}\n${reference.url}`,
      options: { style: 'bold', color: '#17436b', url: reference.url, fontSize: 7, gap: 0.5 },
    }]);
  }
}
