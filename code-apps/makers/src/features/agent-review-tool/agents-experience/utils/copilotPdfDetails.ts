import type { CsPdfLayout } from '../../utils/csPdfLayout';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';
import type { ReviewViewModel } from '../components/viewTypes';
import type { CostEfficiencyReview } from '../contracts/CostEfficiency';
import type { CopilotPdfReportData } from './copilotPdfReport';
import { copilotPdfField, copilotPdfText, renderCopilotActionGuidance } from './copilotPdfContent';
import { renderReviewPdfSkills } from '../../utils/reviewPdfContent';
import { crossSkillOrchestrationLabel } from './copilotReviewExportLabels';

const ELEMENT_LABELS = {
  role: 'Role and purpose',
  tone: 'Tone and style',
  boundaries: 'Decline and redirect boundaries',
  ambiguity: 'Ambiguous-input handling',
  escalation: 'Escalation triggers',
} as const;

/** Keep instruction stage availability separate from recorded coverage gaps. */
export function renderCopilotInstructionCoverage(layout: CsPdfLayout, vm: ReviewViewModel): void {
  const status = vm.summary.instructionCoverageStatus;
  layout.heading('Instruction coverage', 2);
  for (const key of INSTRUCTION_COVERAGE_KEYS) {
    const hasGap = vm.findings.some(finding =>
      finding.family === 'Instructions' && finding.fact.includes(`"${key}"`));
    const outcome = hasGap ? 'Recorded coverage gap'
      : status?.state === 'complete' ? 'Covered by the recorded assessment'
        : status?.state === 'not-applicable' ? 'Not applicable'
          : 'Not assessed';
    copilotPdfField(layout, ELEMENT_LABELS[key], outcome);
  }
  layout.paragraph('An absent finding does not establish coverage when the classifier was unavailable or incomplete.', {
    fontSize: 8.5,
    style: 'italic',
  });
}

/** Preserve every saved skill grade, dimension rationale, and supporting-file assessment. */
export function renderCopilotSkills(layout: CsPdfLayout, data: CopilotPdfReportData): void {
  renderReviewPdfSkills(layout, { ...data, skills: data.vm.skills });
}

/** Retain saved cross-skill patterns without generating new conclusions or remediation. */
export function renderCopilotOrchestration(layout: CsPdfLayout, vm: ReviewViewModel): void {
  if (vm.summary.crossSkillOrchestrationStatus?.state !== 'not-applicable') {
    copilotPdfField(layout, 'Cross-skill assessment', crossSkillOrchestrationLabel(vm.summary.crossSkillOrchestrationStatus));
  }
  if (!vm.skillsGrouped.orchestration.length) return;
  layout.heading('Cross-skill orchestration', 2);
  for (const pattern of vm.skillsGrouped.orchestration) {
    layout.setContinuationContext(copilotPdfText(pattern.ruleId));
    layout.findingHeading(`${copilotPdfText(pattern.ruleId)} - ${copilotPdfText(pattern.title)}`);
    copilotPdfField(layout, 'Severity', pattern.sev);
    copilotPdfField(layout, 'Recorded pattern type', pattern.type);
    copilotPdfField(layout, 'Affected skills', pattern.skills.join(', '));
    if (pattern.fact !== undefined) copilotPdfField(layout, 'Finding context (AI)', pattern.fact);
    copilotPdfField(layout, 'Why it matters', pattern.meaning);
    layout.callout('Maker action', copilotPdfText(pattern.fix));
    renderCopilotActionGuidance(layout, pattern.remediation, pattern.fix, pattern.meaning);
    pattern.fixSteps.forEach(step => copilotPdfField(layout, `Recorded step ${step.order}`, step.action));
    for (const pair of pattern.pairs) {
      copilotPdfField(layout, 'Affected pair', `${pair.a} / ${pair.b}`);
      copilotPdfField(layout, 'Recorded pair evidence', pair.evidence);
    }
    if (!pattern.pairs.length) copilotPdfField(layout, 'Recorded evidence', pattern.evidence);
  }
  layout.setContinuationContext();
}

/** Retain declared evaluation coverage and observed-use windows without implying runtime success or cost. */
export function renderCopilotEvidence(layout: CsPdfLayout, data: CopilotPdfReportData): void {
  const { vm } = data;
  layout.heading('Evaluation coverage', 1);
  copilotPdfField(layout, 'Coverage basis', vm.coverageBasis);
  copilotPdfField(layout, 'Capabilities covered', `${vm.summary.capabilitiesCovered} / ${vm.summary.capabilitiesTotal}`);
  copilotPdfField(layout, 'Test cases', `${vm.summary.testCases} (${vm.summary.multiTurnCases} multi-turn)`);
  copilotPdfField(layout, 'Graders', vm.summary.graders);
  for (const set of vm.coverageSets) {
    layout.heading(copilotPdfText(set.name), 3);
    copilotPdfField(layout, 'Set coverage', `${set.covered} / ${set.total}`);
    copilotPdfField(layout, 'Set test cases', `${set.caseCount} (${set.declaringCases} declaring)`);
  }
  for (const row of vm.coverage) {
    copilotPdfField(layout, 'Recorded capability', `${row.name} | ${row.kind} | ${row.cases} test cases`);
  }
  layout.paragraph('Configured test coverage is not a record that these tests passed.');
  layout.heading('Observed capability use', 1);
  data.evidenceWindow.forEach(([label, value]) => copilotPdfField(layout, label, value));
  for (const row of data.evidenceRows) {
    layout.heading(copilotPdfText(row.name), 3);
    copilotPdfField(layout, 'Capability class', row.capabilityClass);
    copilotPdfField(layout, 'Source type', row.sourceType);
    copilotPdfField(layout, 'Observation', row.status);
    copilotPdfField(layout, 'Recorded invocations', row.invocations);
  }
  if (data.evidenceRows.length) layout.paragraph(data.evidenceNote, { fontSize: 8.5 });
}

function range(value: CostEfficiencyReview['estimate']['creditsPerTask']): string {
  const lower = `${value.lowerBoundInclusive ? '' : '>'}${value.lowerBound}`;
  return value.upperBound === undefined ? `${lower}+` : `${lower}-${value.upperBound}`;
}

/** Preserve optional planning estimates and their quality checks as assumptions, not measured cost. */
export function renderCopilotCost(layout: CsPdfLayout, review?: CostEfficiencyReview): void {
  if (!review) return;
  layout.heading('Cost and efficiency', 1);
  layout.paragraph('Planning estimate using the selected scenario and task volume; not measured agent consumption.');
  const facts = review.facts;
  for (const [label, value] of [
    ['Model series', facts.modelSeries],
    ['Connector tools', facts.connectorTools],
    ['MCP tools', facts.mcpTools],
    ['Skills', facts.skills],
    ['Knowledge sources', facts.knowledgeSources],
    ['Connected agents', facts.connectedAgents],
    ['Triggers', facts.triggers],
    ['Web search', facts.webSearchEnabled === undefined ? 'Not captured' : facts.webSearchEnabled ? 'Enabled' : 'Disabled'],
    ['Evaluation sets', facts.evaluationSets],
    ['Test cases', `${facts.testCases} (${facts.toolAssertionCases} with tool assertions)`],
    ['Scenario', review.estimate.scenario],
    ['Monthly tasks', review.estimate.monthlyTasks],
    ['Credits per task', range(review.estimate.creditsPerTask)],
    ['Monthly credits', range(review.estimate.monthlyCredits)],
    ['Price basis', review.estimate.sourceLabel],
  ] as const) copilotPdfField(layout, label, value);
  for (const opportunity of review.opportunities) {
    layout.findingHeading(copilotPdfText(opportunity.title));
    copilotPdfField(layout, 'Potential impact', opportunity.potentialImpact);
    copilotPdfField(layout, 'Confidence', opportunity.confidence);
    copilotPdfField(layout, 'Evidence source', opportunity.evidenceLabel);
    opportunity.evidence.forEach(value => copilotPdfField(layout, 'Recorded evidence', value));
    layout.callout('Recommendation', copilotPdfText(opportunity.recommendation));
    copilotPdfField(layout, 'Quality risk', opportunity.qualityRisk);
    copilotPdfField(layout, 'Validation plan', opportunity.validationPlan);
  }
}
