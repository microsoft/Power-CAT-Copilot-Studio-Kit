import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import type { ReviewResult } from '../contracts/ReviewResult';
import type { ComplianceIssue, InstructionEvaluation } from '../contracts/StageOutputs';
import {
  getAssessedInstructionIssues, getInstructionAssessments, getIssueCriterionId,
  isAssessmentStatus, STANDARD_REVIEW_POLICY_VERSION,
} from './reviewAssessment';
import { getSavedStandardScores, projectSavedStandardReview, STANDARD_REVIEW_LIMITS } from './standardReviewProjection';
import {
  displayed, enumText, evidenceFields, NOT_RECORDED, object, OMITTED, remediationFields, reportField, SEVERITIES, text, unavailableRow,
  type CsReportField, type CsReportRow, type SavedObject, type Severity,
} from './csReportFields';
import { patternRows } from './csReportPatterns';

export type { CsReportField, CsReportRow } from './csReportFields';

export interface CsPdfReportOptions {
  redactSensitiveValues?: boolean;
  exportedOn?: Date;
}

type Availability = 'available' | 'partial' | 'unavailable';

export interface CsReportModel {
  agentName: string;
  publicSafe: boolean;
  exportedOn: Date;
  metadata: CsReportField[];
  scores: Omit<ReturnType<typeof getSavedStandardScores>, 'notes'>;
  availability: { patterns: Availability; instructions: Availability };
  patterns: CsReportRow[];
  instructionIssues: CsReportRow[];
  instructionCriteria: CsReportRow[];
  counts: {
    failedCheckCategories: number;
    instructionIssues: number;
    total: number;
    severity: Record<Severity, number>;
  };
  scopeSummary: string;
  limits: string[];
}

export const CS_REPORT_REFERENCES = [
  {
    title: 'Microsoft Learn: Generative orchestration and topic descriptions',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-generative-actions',
  },
  {
    title: 'Microsoft Learn: Writing instructions for generative orchestration',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance',
  },
] as const;

function dateLabel(value: unknown): string {
  let date = value instanceof Date ? value : undefined;
  if (typeof value === 'string') {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
    if (!parts) return 'Unavailable';
    const [year, month, day] = parts.slice(1, 4).map(Number);
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
      || calendar.getUTCDate() !== day) return 'Unavailable';
    if (parts[4] === undefined) return `${value} (time not recorded)`;
    if (Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return 'Unavailable';
    date = new Date(value);
  }
  return date && Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 0 && date.getUTCFullYear() <= 9999
    ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'Unavailable';
}

function readStage(raw: string | undefined, label: string, limits: string[]): SavedObject | undefined {
  if (raw === undefined || raw === '') {
    limits.push(`${label} data unavailable: no saved stage output was provided.`);
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (object(parsed)) return parsed;
  } catch {
    limits.push(`${label} data unavailable: the saved JSON is malformed.`);
    return undefined;
  }
  limits.push(`${label} data unavailable: the saved output is not an object.`);
  return undefined;
}

function instructionEvaluation(stage: SavedObject, limits: string[]): InstructionEvaluation {
  const rawIssues = stage.issues as unknown[];
  const issues: ComplianceIssue[] = rawIssues.map((value, index) => {
    if (!object(value) || !text(value.id)?.trim()) return {
      id: `unavailable-issue-${index + 1}`, title: `Instruction issue ${index + 1} (unavailable)`,
      severity: 'Medium', description: '', recommendation: '', assessmentStatus: 'not-assessed',
      assessmentReason: 'This saved issue is malformed; its assessment is unavailable.',
    };
    const validStatus = value.assessmentStatus === undefined
      || value.assessmentStatus === 'fail' || value.assessmentStatus === 'not-assessed';
    return {
      ...value, id: value.id as string, title: text(value.title) ?? value.id as string,
      description: text(value.description) ?? NOT_RECORDED,
      recommendation: text(value.recommendation) ?? NOT_RECORDED,
      severity: SEVERITIES.includes(value.severity as ComplianceIssue['severity'])
        ? value.severity as ComplianceIssue['severity'] : 'Medium',
      assessmentStatus: validStatus ? value.assessmentStatus as ComplianceIssue['assessmentStatus'] : 'not-assessed',
    } as ComplianceIssue;
  });
  const evaluation: InstructionEvaluation = { ...stage, compliancePercentage: Number.NaN, issues };
  if (stage.criterionAssessments !== undefined) {
    const entries = stage.criterionAssessments;
    if (!Array.isArray(entries)) {
      limits.push('Instruction criteria unavailable: the saved criterion list is malformed.');
      evaluation.assessmentStatus = 'not-assessed';
    }
    evaluation.criterionAssessments = Array.isArray(entries) ? entries.filter(object).map(entry => ({
      criteriaId: text(entry.criteriaId) ?? '',
      status: isAssessmentStatus(entry.status) ? entry.status : 'not-assessed',
      reason: text(entry.reason),
    })) : [];
  }
  if (stage.assessmentStatus !== undefined && !isAssessmentStatus(stage.assessmentStatus)) {
    evaluation.assessmentStatus = 'not-assessed';
    limits.push('Instruction assessment status is malformed; coverage is unavailable.');
  }
  if (evaluation.criterionAssessments === undefined && text(stage.policyVersion)?.trim()) {
    evaluation.criterionAssessments = [];
    limits.push('Instruction criterion outcomes were not saved for this policy-versioned stage; coverage is not assessed.');
  } else if (evaluation.criterionAssessments === undefined
    && rawIssues.some(value => !object(value) || !text(value.id)?.trim())) {
    evaluation.criterionAssessments = getInstructionAssessments(evaluation).map(assessment =>
      assessment.status === 'pass' ? {
        ...assessment, status: 'not-assessed',
        reason: 'A malformed saved issue list cannot establish that this criterion passed.',
      } : assessment);
    limits.push('The saved instruction issue list is incomplete. Readable failures remain; other criteria are not assessed.');
  }
  return evaluation;
}

function instructionRows(evaluation: InstructionEvaluation, raw: unknown[], redact: boolean): CsReportRow[] {
  const assessments = getInstructionAssessments(evaluation);
  const countedIssues = new Set(getAssessedInstructionIssues(evaluation));
  return evaluation.issues.map((issue, index) => {
    const id = `instruction-${index + 1}`;
    const saved = raw[index];
    if (!object(saved) || !text(saved.id)?.trim()) {
      return unavailableRow(id, `Instruction issue ${index + 1} (unavailable)`);
    }
    const criterionId = getIssueCriterionId(issue);
    const criterion = COMPLIANCE_CRITERIA.find(item => item.id === criterionId);
    const assessment = assessments.find(item => item.criteriaId === criterionId);
    const failed = countedIssues.has(issue);
    const status = failed ? 'fail' : evaluation.assessmentStatus === 'not-applicable'
      || assessment?.status === 'not-applicable' ? 'not-applicable' : 'not-assessed';
    return {
      id, title: redact ? `${criterion?.name ?? 'Instruction'} - issue ${index + 1}` : issue.title,
      status, severity: enumText(saved.severity, SEVERITIES, 'Unspecified') as Severity, items: [],
      fields: [
        reportField('Saved issue ID', issue.id, redact),
        reportField('Criterion', criterion?.name, false),
        reportField('Finding', saved.description, redact),
        reportField('Recommendation', saved.recommendation, redact),
        reportField('Coverage', issue.coverage === undefined ? undefined
          : enumText(issue.coverage, ['missing', 'incomplete', 'unclear']), false),
        reportField('Uncovered situation', issue.uncoveredSituation, redact),
        reportField('Assessment reason', issue.assessmentReason ?? assessment?.reason, redact),
        ...evidenceFields(issue.evidence, redact),
        ...remediationFields(saved.remediation, redact),
      ],
    };
  });
}

function countRows(patterns: CsReportRow[], issues: CsReportRow[]): CsReportModel['counts'] {
  const failed = [...patterns, ...issues].filter(row => row.status === 'fail');
  const severity: Record<Severity, number> = { High: 0, Medium: 0, Low: 0, Unspecified: 0 };
  for (const row of failed) severity[row.severity]++;
  return {
    failedCheckCategories: patterns.filter(row => row.status === 'fail').length,
    instructionIssues: issues.filter(row => row.status === 'fail').length,
    total: failed.length, severity,
  };
}

/** Project one saved review for PDF display without regrading it or mutating detector output. */
export function buildCsReportModel(review: ReviewResult, options: CsPdfReportOptions = {}): CsReportModel {
  const exportedOn = new Date((options.exportedOn ?? new Date()).getTime());
  if (!Number.isFinite(exportedOn.getTime())) throw new Error('Invalid export date');
  const publicSafe = options.redactSensitiveValues === true;
  const { notes, ...scores } = getSavedStandardScores(review);
  const projection = projectSavedStandardReview(review);
  const { isZipSource } = projection;
  const limits = [STANDARD_REVIEW_LIMITS,
    ...notes.map(note => publicSafe ? `Additional saved assessment context: ${OMITTED}` : note),
    'Saved review scores are authoritative. This export does not regrade the historical assessment.',
    'Totals count failed check categories and assessed instruction issues, not affected topics or variables. N/A and Not assessed rows are excluded.',
    'Counts describe included detail rows only. Unavailable data does not mean zero underlying failures.',
    'Inherent severity describes rule importance or potential authoring risk, not a measured runtime failure.',
    'Pattern severity is inherent to the check. Instruction issue severity is retained as saved and can differ from criterion inherent severity; criteria are not counted again as issues.',
    'Evidence validation is shown as saved, not independently verified by this export. Missing validation metadata is labelled Not recorded.',
    'The factual summary uses structured rows, not free-text AI summary counts.',
  ];
  const source = readStage(review.stageAOutput, 'Source metadata', limits);
  const patternStage = readStage(review.stageBOutput, 'Pattern assessment', limits);
  const instructionStage = readStage(review.stageCOutput, 'Instruction assessment', limits);
  const patternValues = patternStage?.Patterns;
  const issueValues = instructionStage?.issues;
  if (patternStage && !Array.isArray(patternValues)) limits.push('Pattern assessment is partial: the saved check list is missing or malformed. No complete conclusion can be drawn.');
  if (instructionStage && !Array.isArray(issueValues)) limits.push('Instruction assessment is partial: the saved issue list is missing or malformed. No complete conclusion can be drawn.');
  const patterns = patternRows(Array.isArray(patternValues) ? patternValues : [], publicSafe, isZipSource);
  const incompleteReferences = patterns.some(row => row.items.some(item => item.status === 'not-assessed'))
    || (Array.isArray(patternValues) && patternValues.some(value => object(value) && !Array.isArray(value.Topics)));
  if (incompleteReferences) {
    limits.push('Some recorded setting references were not assessed or their list is unavailable. Retained unassessed references are not counted as settings marked Fail.');
  }
  const evaluation = instructionStage && Array.isArray(issueValues)
    ? instructionEvaluation(instructionStage, limits) : undefined;
  const instructionIssues = evaluation && Array.isArray(issueValues)
    ? instructionRows(evaluation, issueValues, publicSafe) : [];
  const instructionCriteria = getInstructionAssessments(evaluation).map(assessment => {
    const criterion = COMPLIANCE_CRITERIA.find(item => item.id === assessment.criteriaId)!;
    return {
      id: criterion.id, title: criterion.name, status: assessment.status, severity: criterion.inherentSeverity,
      fields: [reportField('Assessment reason', instructionStage && !evaluation
        ? 'Saved instruction rows are incomplete or malformed; this criterion was not assessed.'
        : assessment.reason, publicSafe)], items: [],
    };
  });
  if (Array.isArray(patternValues) && patterns.length === 0) {
    limits.push('No pattern check rows were saved. This is not evidence that every check passed.');
  }
  if (evaluation && evaluation.criterionAssessments === undefined) {
    limits.push('Legacy instruction criterion statuses use the saved issue list and historical compatibility rules, not a new coverage assessment.');
  }
  if ([...patterns, ...instructionIssues].some(row => row.fields.some(field => /malformed|unavailable/i.test(field.value)))) {
    limits.push('Some saved detail rows are malformed or incomplete; unavailable values and outcomes are labelled in the detail sections.');
  }
  for (const [label, values] of [
    ['Saved extraction limit', source?.parsingErrors], ['Saved pattern assessment limit', patternStage?.assessmentNotes],
  ] as const) {
    if (Array.isArray(values)) values.forEach(value => limits.push(`${label}: ${displayed(value, publicSafe)}`));
    else if (values !== undefined) limits.push(`${label}: unavailable (malformed saved notes).`);
  }
  if (instructionStage?.assessmentReason !== undefined) limits.push(`Saved instruction assessment limit: ${displayed(instructionStage.assessmentReason, publicSafe)}`);
  if (review.status !== 'completed') limits.push('The selected review is not marked completed; its available saved data is shown without asserting completeness.');
  if (publicSafe) limits.push('Public-safe export: source identifiers, evidence values, suggestions and free-text explanations are omitted. Finding rows, statuses and saved scores are retained.');
  const counts = countRows(patterns, instructionIssues);
  if (counts.total !== review.totalIssueCount || counts.severity.High !== review.highSeverityCount
    || counts.severity.Medium !== review.mediumSeverityCount || counts.severity.Low !== review.lowSeverityCount) {
    limits.push('Saved summary counters differ from the included detail rows. Report totals use those rows; saved scores are unchanged.');
  }
  const sourceType = isZipSource ? 'ZIP snapshot'
    : source?.source === 'live' || review.sourceEnvironment !== undefined ? 'Live environment snapshot' : NOT_RECORDED;
  const metadata: CsReportField[] = [
    { label: 'Review date', value: dateLabel(review.reviewedOn) },
    { label: 'Export date', value: dateLabel(exportedOn) },
    { label: 'Source', value: sourceType },
    reportField('Agent version (saved)', review.agentVersion, publicSafe),
    reportField('Review ID', review.reviewId, publicSafe),
    reportField('Reviewed by', review.reviewedBy, publicSafe),
    reportField('Source environment', review.sourceEnvironment, publicSafe),
  ];
  if (review.workflowProvenance) {
    metadata.push(
      reportField('Workflow job ID', review.workflowProvenance.jobId, publicSafe),
      reportField('Workflow correlation ID', review.workflowProvenance.correlationId, publicSafe),
      reportField('Workflow result retrieval', review.workflowProvenance.retrievedAt, publicSafe),
      {
        label: 'Rejected workflow candidates',
        value: String(review.workflowProvenance.rejectedCandidateCount),
      },
      {
        label: 'Workflow units',
        value: review.workflowProvenance.units.map((unit) =>
          `${unit.componentIndex} ${unit.unitId}: ` + (unit.status === 'missing'
            ? 'no workflow result'
            : `${unit.findingCount} findings, ${unit.notAssessedCount} not assessed`)).join('; '),
      },
    );
  }
  for (const [label, value] of [
    ['Review policy', review.assessmentPolicyVersion], ['Extraction policy', source?.policyVersion],
    ['Pattern policy', patternStage?.policyVersion], ['Instruction policy', instructionStage?.policyVersion],
  ]) metadata.push(reportField(String(label), value, publicSafe && value !== STANDARD_REVIEW_POLICY_VERSION));
  const topicCount = typeof source?.topicCount === 'number' ? source.topicCount : undefined;
  const toolCount = typeof source?.toolCount === 'number' ? source.toolCount : undefined;
  const connectedAgentCount = typeof source?.connectedAgentCount === 'number'
    ? source.connectedAgentCount
    : Array.isArray(source?.connectedAgents)
      ? source.connectedAgents.length
      : 0;
  const knowledgeCount = typeof source?.knowledgeCount === 'number'
    ? source.knowledgeCount
    : undefined;
  const scopeSummary = topicCount === undefined
    || toolCount === undefined
    || knowledgeCount === undefined
    ? 'Review scope counts were not recorded in this saved review.'
    : `${topicCount} topics · ${toolCount + connectedAgentCount} tools and agents · `
      + `${knowledgeCount} knowledge sources`;
  return {
    agentName: displayed(review.botName, publicSafe), publicSafe, exportedOn, metadata, scores,
    availability: {
      patterns: !patternStage ? 'unavailable'
        : !projection.patternEvaluation || patterns.length === 0 || incompleteReferences
          || patterns.some(row => row.status === 'not-assessed') ? 'partial' : 'available',
      instructions: !instructionStage ? 'unavailable'
        : !projection.instructionEvaluation || !evaluation
          || [...instructionCriteria, ...instructionIssues].some(row => row.status === 'not-assessed') ? 'partial' : 'available',
    },
    patterns, instructionIssues, instructionCriteria, counts, scopeSummary,
    limits: [...new Set(limits)],
  };
}
