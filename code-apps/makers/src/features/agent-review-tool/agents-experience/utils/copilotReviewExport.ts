/**
 * Microsoft Copilot harness review export utilities (Task 12).
 *
 * Projects persisted metadata, findings, scores, and resource rows into
 * export-safe formats for PDF and Excel. Never includes raw textContent,
 * source bytes, prompt payloads, hashes identified as secrets, or signed/SAS URLs.
 * Evidence is redacted again at export time as a defence-in-depth measure.
 */
import ExcelJS from 'exceljs';
import { reviewBrandArgb } from '../components/copilotStudioReviewTheme';
import type { CopilotReviewPersistenceInput } from '../services/skill/persistedSkillReview';
import type { PersistedCopilotReviewPayload } from '../../contracts/ReviewResult';
import { redactSecrets } from '../services/skill/resourceScanners';
import {
  getResourceReviewAssessment,
  reconcilePersistedResourceReview,
} from '../services/skill/resourceReviewCoverage';
import {
  getSafetyDispositionLabel,
  type CopilotContextualGuidance,
  type GroundedSkillFinding,
  type SkillSafetyDisposition,
} from '../contracts/Findings';
import type { ReviewViewModel } from '../components/viewTypes';
import type { CoverageState, EvidenceState } from '../contracts/TranscriptEvidence';
import { buildReviewSkillGradeExportRows as buildSkillGradeExportRows } from '../../utils/reviewPdfContent';
import type { CostEfficiencyReview } from '../contracts/CostEfficiency';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { renderCopilotPdfReport } from './copilotPdfReport';
import { crossSkillOrchestrationLabel, instructionCoverageExportLabel, scoreBasisLabel } from './copilotReviewExportLabels';
import { copilotGuidanceSourceLabel, getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { readInstructionFindingNarrative } from '../services/copilotAiNarrative';

export { instructionCoverageExportLabel, scoreBasisLabel } from './copilotReviewExportLabels';
export { buildReviewSkillGradeExportRows as buildSkillGradeExportRows } from '../../utils/reviewPdfContent';

// ---------------------------------------------------------------------------
// Export row contracts
// ---------------------------------------------------------------------------

/**
 * One configured capability and whether transcripts recorded it running.
 *
 * Carries no conversation content (spec 019 FR-10) and no credit figure
 * (FR-7) — transcripts hold neither a token nor a meter field.
 */
export interface ObservedEvidenceExportRow {
  capabilityClass: string;
  name: string;
  sourceType: string;
  status: string;
  invocations: number | string;
}

/** Export wording for each coverage state, kept in one place for both writers. */
const EXPORT_STATUS: Record<CoverageState, string> = {
  observed: 'Observed',
  'not-observed': 'Not observed',
  'not-attributable': 'Not attributable',
};

/**
 * Note printed under every observed-use table.
 *
 * States all three terms, because omitting "not attributable" would leave a
 * reader to guess that it is a softer synonym for "not observed" — the exact
 * confusion that made a fleet of searched uploaded files look removable.
 */
export const OBSERVED_USE_EXPORT_NOTE =
  '"Not observed" means the capability was never invoked in this window. It does not mean '
  + 'the capability is unused. "Not attributable" means the transcript records this class of '
  + 'search under a group name rather than by individual name, so use can be confirmed neither '
  + 'way — these are not a provisioning gap. Transcripts contain no credit or token data, so no '
  + 'per-agent cost is shown.';

/**
 * Projects observed evidence into export rows.
 *
 * Returns an empty array unless evidence was actually read. A state with no
 * signal deliberately exports nothing rather than a table of zeros, which
 * would read as a finding when nothing was measured.
 */
export function buildEvidenceExportRows(
  evidence: EvidenceState | undefined,
): ObservedEvidenceExportRow[] {
  if (!evidence || evidence.status !== 'ready') return [];

  return evidence.coverage.flatMap((coverage) =>
    coverage.items.map((item) => ({
      capabilityClass: coverage.kind === 'knowledge' ? 'Knowledge source' : 'Skill',
      name: item.name,
      sourceType: item.sourceType ?? '',
      status: EXPORT_STATUS[item.state],
      // A not-attributable item has no meaningful count: the transcript never
      // names it, so "0" would read as a measured zero rather than as silence.
      invocations: item.state === 'not-attributable' ? 'n/a' : item.invocations,
    })),
  );
}

/**
 * Describes the window the evidence came from, so a reader can judge the
 * sample rather than treat "not observed" as proof of disuse.
 */
export function buildEvidenceWindowRows(
  evidence: EvidenceState | undefined,
): Array<[string, string]> {
  if (!evidence) return [['Observed capability use', 'Not read']];

  switch (evidence.status) {
    case 'loading':
      return [['Observed capability use', 'Still reading transcripts']];
    case 'no-access':
      return [['Observed capability use', 'Transcripts unavailable']];
    case 'no-transcripts':
      return [
        ['Observed capability use', 'No conversation activity in the window'],
        ['Observation window (days)', String(evidence.window.days)],
      ];
    case 'no-signal':
      return [
        ['Observed capability use', 'No capability use recorded in the window'],
        ['Observation window (days)', String(evidence.window.days)],
        ['Conversations read', String(evidence.window.conversations)],
      ];
    case 'ready':
      return [
        ['Observed capability use', 'Read from this agent\u2019s transcripts'],
        ['Observation window (days)', String(evidence.window.days)],
        ['Observation window start', evidence.window.startIso],
        ['Observation window end', evidence.window.endIso],
        ['Conversations read', String(evidence.window.conversations)],
        ['Window complete', evidence.window.truncated ? 'No - stopped at page limit' : 'Yes'],
        ['Blocked conversations excluded', String(evidence.blockedConversations)],
      ];
  }
}

export interface CopilotSkillExportRow {
  skillName: string;
  skillSchemaName: string;
  resourcePath: string;
  kind: string;
  language?: string;
  sizeBytes: number;
  analysisStatus: string;
  riskLevel?: string;
  readiness?: string;
  findingCount: number;
  reviewCoverage: string;
  referencedBy: string[];
}

export interface CopilotFindingExportRow {
  skillName: string;
  findingId: string;
  ruleId: string;
  severity: string;
  family: string;
  title: string;
  fact: string;
  displayFact?: string;
  why: string;
  fix: string;
  resourcePath?: string;
  primaryReferenceId: string;
  safetyDisposition?: SkillSafetyDisposition;
  dispositionLabel?: string;
  guidanceSource?: string;
  guidanceComponentId?: string;
  makerAction?: string;
  example?: string;
  draftChange?: string;
  acceptanceCheck?: string;
}

/** Per-skill grade export row (Task 5) — never a synthetic 0% for an unavailable/blocked/failed skill. */
export interface CopilotSkillGradeExportRow {
  skillName: string;
  grade: string;
  evaluationState: string;
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

const GUIDANCE_EXPORT_COLUMNS = [
  { header: 'Guidance source', key: 'guidanceSource', width: 48 },
  { header: 'Guidance component ID', key: 'guidanceComponentId', width: 38 },
  { header: 'Recommended action', key: 'makerAction', width: 50 },
  { header: 'Example for this agent', key: 'example', width: 60 },
  { header: 'Draft change (Not applied)', key: 'draftChange', width: 80 },
  { header: 'How to verify', key: 'acceptanceCheck', width: 60 },
];

function guidanceExportFields(
  guidance: CopilotContextualGuidance | undefined, impact: string, action: string,
) {
  return {
    guidanceSource: guidance ? copilotGuidanceSourceLabel(guidance.source) : undefined,
    guidanceComponentId: guidance?.componentIdUnique,
    makerAction: guidance?.makerAction !== action ? guidance?.makerAction : undefined,
    example: guidance?.whyItMatters !== impact ? guidance?.whyItMatters : undefined,
    draftChange: guidance?.suggestedText === '' ? '(empty)' : guidance?.suggestedText,
    acceptanceCheck: guidance?.acceptanceCheck,
  };
}

/**
 * Build exportable resource rows from a raw persistence input.
 * Projects resource metadata and finding counts only — never includes
 * textContent, sha256, raw chunks, retrieval issues, prompt payloads,
 * or SAS/signed URLs.
 *
 * @param input - Runtime persistence input (bundles carry raw resources).
 * @returns Sanitized resource rows safe for export.
 */
export function buildCopilotSkillExportRows(
  input: CopilotReviewPersistenceInput,
): CopilotSkillExportRow[] {
  const rows: CopilotSkillExportRow[] = [];

  for (const bundle of input.bundles) {
    const review = (input.payload.skillBundleReviews ?? []).find(
      r => r.skillSchemaName === bundle.skillSchemaName,
    );

    // Collect all findings across evaluation phases for per-resource counting.
    const allFindings = [
      ...(review?.deterministicFindings ?? []),
      ...(review?.standardEvaluation?.findings ?? []),
      ...(review?.deepEvaluation?.resources.flatMap(resource => resource.findings) ?? []),
    ];

    for (const resource of bundle.resources) {
      const findingCount = allFindings.filter(
        f => f.resourcePath === resource.normalizedPath,
      ).length;

      const assessment = getResourceReviewAssessment(
        { ...resource, path: resource.normalizedPath },
        review?.mode ?? input.mode,
        review?.standardEvaluation,
        review?.deepEvaluation,
      );

      const reviewCoverage =
        assessment.analysisStatus === 'completed' ? 'Complete' :
        assessment.analysisStatus === 'partial' ? 'Partial' :
        assessment.analysisStatus === 'oversized' ? 'Oversized' :
        assessment.analysisStatus === 'failed' ? 'Failed' :
        assessment.analysisStatus === 'skipped' ? 'Skipped' :
        assessment.analysisStatus === 'cancelled' ? 'Cancelled' : 'Not reviewed';

      rows.push({
        skillName: bundle.skillName,
        skillSchemaName: bundle.skillSchemaName,
        resourcePath: resource.normalizedPath,
        kind: resource.kind,
        language: resource.language,
        sizeBytes: resource.sizeBytes,
        analysisStatus: assessment.analysisStatus,
        riskLevel: assessment.riskLevel,
        readiness: assessment.readiness,
        findingCount,
        reviewCoverage,
        referencedBy: resource.referencedBy,
        // Explicitly excluded: textContent, sha256, chunks, issues
      });
    }
  }

  return rows;
}

/**
 * Build exportable resource rows from a persisted payload (view mode / after run).
 * Uses the sanitized manifest — no textContent possible.
 */
export function buildSkillExportRowsFromPayload(
  payload: PersistedCopilotReviewPayload,
): CopilotSkillExportRow[] {
  const rows: CopilotSkillExportRow[] = [];
  for (const savedReview of payload.skillBundleReviews) {
    const review = reconcilePersistedResourceReview(savedReview);
    for (const entry of review.manifest) {
      const findingCount = review.findings.filter(f => f.resourcePath === entry.path).length;
      const reviewCoverage =
        entry.analysisStatus === 'completed' ? 'Complete' :
        entry.analysisStatus === 'partial' ? 'Partial' :
        entry.analysisStatus === 'oversized' ? 'Oversized' :
        entry.analysisStatus === 'failed' ? 'Failed' :
        entry.analysisStatus === 'skipped' ? 'Skipped' :
        entry.analysisStatus === 'cancelled' ? 'Cancelled' : 'Not reviewed';
      rows.push({
        skillName: review.skillName,
        skillSchemaName: review.skillSchemaName,
        resourcePath: entry.path,
        kind: entry.kind,
        language: entry.language,
        sizeBytes: entry.sizeBytes,
        analysisStatus: entry.analysisStatus,
        riskLevel: entry.riskLevel,
        readiness: entry.readiness,
        findingCount,
        reviewCoverage,
        referencedBy: entry.referencedBy,
      });
    }
  }
  return rows;
}

/**
 * Build exportable finding rows from a persisted payload.
 *
 * Uses `payload.findings` as the authoritative source — exactly what the page
 * renders. Per-bundle `skillBundleReviews[].findings` is used only to resolve
 * skill attribution (skillName). Evidence is redacted at export time for all
 * three narrative fields: fact, why, and fix.
 *
 * Deduplicates by finding id to guard against findings that appear in both the
 * top-level array and a bundle projection.
 */
export function buildFindingExportRows(
  payload: PersistedCopilotReviewPayload,
): CopilotFindingExportRow[] {
  // A legacy rule id can occur in several skills; do not guess its target.
  const findingSkillMap = new Map<string, Set<string>>();
  for (const review of payload.skillBundleReviews) {
    for (const f of review.findings) {
      const names = findingSkillMap.get(f.id) ?? new Set<string>();
      names.add(review.skillName);
      findingSkillMap.set(f.id, names);
    }
  }

  // payload.findings is the authoritative set matching what the page renders.
  const rows: CopilotFindingExportRow[] = [];
  const seenIds = new Set<string>();
  for (const finding of payload.findings) {
    if (seenIds.has(finding.id)) continue;
    seenIds.add(finding.id);
    const isSkill = 'ruleId' in finding;
    const sf = isSkill ? (finding as GroundedSkillFinding) : undefined;
    const guidance = getCopilotFindingGuidance(finding, payload);
    const narrative = readInstructionFindingNarrative(finding).narrative;
    const impact = narrative ? guidance?.whyItMatters ?? finding.why : finding.why;
    const action = narrative ? guidance?.makerAction ?? finding.fix : finding.fix;
    const target = guidance?.componentIdUnique ?? finding.componentIdUnique;
    const skills = target ? payload.model.skills.filter(skill =>
      skill.componentIdUnique?.toLowerCase() === target.toLowerCase()) : [];
    const legacyNames = findingSkillMap.get(finding.id);
    const skillName = skills.length === 1 ? skills[0].frontmatterName || skills[0].name
      : !target && legacyNames?.size === 1 ? [...legacyNames][0] : '—';
    rows.push({
      skillName,
      findingId: finding.id,
      ruleId: sf?.ruleId ?? finding.id,
      severity: finding.severity,
      family: finding.family,
      title: narrative ? guidance?.findingTitle ?? finding.title : finding.title,
      fact: redactSecrets(finding.fact),
      displayFact: narrative?.fact === undefined ? undefined : redactSecrets(narrative.fact),
      why: redactSecrets(impact),
      fix: redactSecrets(action),
      resourcePath: sf?.resourcePath,
      primaryReferenceId: finding.referenceId,
      safetyDisposition: finding.safetyDisposition,
      dispositionLabel: finding.safetyDisposition
        ? getSafetyDispositionLabel(finding.safetyDisposition, finding.platformOverlap)
        : undefined,
      ...guidanceExportFields(guidance, impact, action),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Excel workbook builder
// ---------------------------------------------------------------------------

const HEADER_ARGB = reviewBrandArgb;
const WHITE_ARGB = 'FFFFFFFF';

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: WHITE_ARGB } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_ARGB } };
  row.alignment = { vertical: 'middle' };
  row.height = 18;
}

/**
 * Generate an Excel workbook with Summary, Findings, and Resources sheets.
 *
 * @param vm - View model (for summary metadata).
 * @param payload - Persisted payload (for findings and resource manifest).
 * @returns Excel workbook as Blob.
 */
export async function generateCopilotReviewExcel(
  vm: ReviewViewModel,
  payload: PersistedCopilotReviewPayload,
  evidence?: EvidenceState,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Copilot Studio Kit';
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  styleHeader(summary.getRow(1));
  const s = vm.summary;
  const incompleteResourceReview = payload.skillBundleReviews.some(review => {
    const { coverage } = reconcilePersistedResourceReview(review);
    return coverage.resourcesReviewed < coverage.resourcesTotal;
  });
  const analysisCoverage = incompleteResourceReview
    ? 'Limited - supporting-file assessment incomplete'
    : payload.skillReviewMode === 'standard' ? 'Limited - per-resource analysis unavailable' : 'Full';
  [
    ['Agent', s.agentName], ['Score basis', scoreBasisLabel({ basisVersion: s.scoreBasisVersion, status: s.scoreStatus })],
    ['Score', s.score ?? 'N/A'], ['Passed', s.passed],
    ['Warnings', s.warnings], ['Errors', s.errors], ['Rules evaluated', s.rulesEvaluated],
    ['Instruction AI coverage', instructionCoverageExportLabel(s.instructionCoverageStatus)],
    ...(s.crossSkillOrchestrationStatus?.state === 'not-applicable'
      ? [] : [['Cross-skill assessment', crossSkillOrchestrationLabel(s.crossSkillOrchestrationStatus)]]),
    ['Web search', s.webSearchEnabled === undefined ? 'Not captured' : s.webSearchEnabled ? 'Enabled' : 'Disabled'],
    ['Duration', s.duration], ['Reviewed by', s.reviewedBy],
    ['Analysis coverage', analysisCoverage],
    ['Skills', vm.skills.length], ['Findings', vm.findings.length],
  ].forEach(([f, v]) => summary.addRow({ field: f, value: v }));
  for (const [field, value] of buildEvidenceWindowRows(evidence)) {
    summary.addRow({ field, value });
  }
  summary.views = [{ state: 'frozen', ySplit: 1 }];

  // Observed use sheet - configured capabilities versus what transcripts recorded.
  // Written only when evidence was read, so an empty window never exports a
  // table of zeros that would read as a finding.
  const evidenceRows = buildEvidenceExportRows(evidence);
  if (evidenceRows.length > 0) {
    const observedSheet = wb.addWorksheet('Observed use');
    observedSheet.columns = [
      { header: 'Capability class', key: 'capabilityClass', width: 20 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Type', key: 'sourceType', width: 18 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Calls', key: 'invocations', width: 10 },
    ];
    styleHeader(observedSheet.getRow(1));
    for (const row of evidenceRows) {
      observedSheet.addRow(row);
    }
    observedSheet.addRow({});
    observedSheet.addRow({
      capabilityClass: 'Note',
      name: OBSERVED_USE_EXPORT_NOTE,
    });
    observedSheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Skills sheet — truthful grade per skill (never a synthetic 0% for unavailable/blocked skills)
  const skillsSheet = wb.addWorksheet('Skills');
  skillsSheet.columns = [
    { header: 'Skill', key: 'skillName', width: 30 },
    { header: 'Grade', key: 'grade', width: 24 },
    { header: 'Evaluation state', key: 'evaluationState', width: 18 },
    { header: 'Quality', key: 'quality', width: 12 },
    { header: 'Integrity', key: 'integrity', width: 12 },
    { header: 'Safety', key: 'safety', width: 12 },
    { header: 'Readiness', key: 'readiness', width: 12 },
    { header: 'Safety gate', key: 'safetyGate', width: 14 },
  ];
  styleHeader(skillsSheet.getRow(1));
  for (const row of buildSkillGradeExportRows(vm)) {
    const skill = vm.skills.find(sk => sk.name === row.skillName);
    const scores = skill?.scores;
    const fmtScore = (q: typeof scores extends undefined ? never : NonNullable<typeof scores>['quality'] | undefined) =>
      q && q.value !== null ? `${q.value}` : '—';
    skillsSheet.addRow({
      ...row,
      quality: scores ? fmtScore(scores.quality) : '—',
      integrity: scores ? fmtScore(scores.integrity) : '—',
      safety: scores ? fmtScore(scores.safety) : '—',
      readiness: scores ? fmtScore(scores.readiness) : '—',
      safetyGate: scores?.safetyGate ?? '—',
    });
  }
  skillsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Findings sheet
  const findingsSheet = wb.addWorksheet('Findings');
  findingsSheet.columns = [
    { header: 'Skill', key: 'skillName', width: 22 },
    { header: 'Rule ID', key: 'ruleId', width: 14 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Family', key: 'family', width: 14 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Fact', key: 'fact', width: 50 },
    { header: 'Finding context (AI)', key: 'displayFact', width: 60 },
    { header: 'Impact', key: 'why', width: 50 },
    { header: 'How to fix', key: 'fix', width: 50 },
    { header: 'Resource', key: 'resourcePath', width: 30 },
    { header: 'Reference', key: 'primaryReferenceId', width: 24 },
    { header: 'Disposition', key: 'dispositionLabel', width: 48 },
    ...GUIDANCE_EXPORT_COLUMNS,
  ];
  styleHeader(findingsSheet.getRow(1));
  for (const row of buildFindingExportRows(payload)) {
    findingsSheet.addRow(row);
  }
  findingsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Resources sheet
  const resourcesSheet = wb.addWorksheet('Resources');
  resourcesSheet.columns = [
    { header: 'Skill', key: 'skillName', width: 22 },
    { header: 'Path', key: 'resourcePath', width: 36 },
    { header: 'Kind', key: 'kind', width: 12 },
    { header: 'Language', key: 'language', width: 12 },
    { header: 'Size (bytes)', key: 'sizeBytes', width: 14 },
    { header: 'Analysis status', key: 'analysisStatus', width: 18 },
    { header: 'Risk', key: 'riskLevel', width: 12 },
    { header: 'Readiness', key: 'readiness', width: 20 },
    { header: 'Findings', key: 'findingCount', width: 10 },
    { header: 'Coverage', key: 'reviewCoverage', width: 14 },
  ];
  styleHeader(resourcesSheet.getRow(1));
  for (const row of buildSkillExportRowsFromPayload(payload)) {
    resourcesSheet.addRow(row);
  }
  resourcesSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Checks sheet — per-rule outcomes including passes
  const checksSheet = wb.addWorksheet('Checks');
  checksSheet.columns = [
    { header: 'Rule ID', key: 'ruleId', width: 16 },
    { header: 'Family', key: 'family', width: 18 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Title', key: 'title', width: 50 },
  ];
  styleHeader(checksSheet.getRow(1));
  if (!vm.checks.recorded) {
    checksSheet.addRow({ ruleId: '—', family: '—', status: '—', title: 'Rule outcomes were not recorded for this review.' });
  } else {
    for (const group of vm.checks.groups) {
      for (const row of group.rows) {
        const subjectSuffix = row.subject ? ` — ${row.subject}` : '';
        const recordMark = row.record ? ' [record]' : '';
        const title = row.findings.length > 0
          ? row.findings.map(f => redactSecrets(f.title)).join('; ')
          : `${row.ruleId}${subjectSuffix}${recordMark}`;
        checksSheet.addRow({ ruleId: row.ruleId, family: row.family, status: row.status, title });
      }
    }
  }
  checksSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Evaluation Coverage sheet
  if (vm.coverage.length > 0 || vm.coverageSets.length > 0) {
    const coverageSheet = wb.addWorksheet('Evaluation Coverage');
    coverageSheet.columns = [
      { header: 'Capability', key: 'capability', width: 36 },
      { header: 'Kind', key: 'kind', width: 16 },
      { header: 'Covered', key: 'covered', width: 10 },
      { header: 'Test cases', key: 'cases', width: 12 },
      { header: 'Evaluation set', key: 'evaluationSet', width: 28 },
    ];
    styleHeader(coverageSheet.getRow(1));
    // Per-capability rows
    for (const row of vm.coverage) {
      coverageSheet.addRow({
        capability: row.name,
        kind: row.kind,
        covered: row.cases > 0 ? 'Yes' : 'No',
        cases: row.cases,
        evaluationSet: '',
      });
    }
    // Evaluation set summary rows
    if (vm.coverageSets.length > 0) {
      coverageSheet.addRow({});
      for (const set of vm.coverageSets) {
        coverageSheet.addRow({
          capability: `[Set] ${set.name}`,
          kind: '',
          covered: `${set.covered}/${set.total}`,
          cases: set.caseCount,
          evaluationSet: set.name,
        });
      }
    }
    coverageSheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Orchestration sheet — set-level cross-skill patterns
  if (vm.skillsGrouped.orchestration.length > 0) {
    const orchSheet = wb.addWorksheet('Orchestration');
    orchSheet.columns = [
      { header: 'Rule ID', key: 'ruleId', width: 14 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Skills', key: 'skills', width: 30 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Finding context (AI)', key: 'fact', width: 60 },
      { header: 'Evidence', key: 'evidence', width: 50 },
      { header: 'Why it matters', key: 'why', width: 50 },
      { header: 'Recommendation', key: 'recommendation', width: 50 },
      ...GUIDANCE_EXPORT_COLUMNS,
    ];
    styleHeader(orchSheet.getRow(1));
    for (const pattern of vm.skillsGrouped.orchestration) {
      orchSheet.addRow({
        ruleId: pattern.ruleId,
        severity: pattern.sev,
        type: pattern.type,
        skills: pattern.skills.join(', '),
        title: pattern.title,
        fact: pattern.fact === undefined ? undefined : redactSecrets(pattern.fact),
        evidence: redactSecrets(pattern.evidence ?? ''),
        why: redactSecrets(pattern.meaning),
        recommendation: redactSecrets(pattern.fix),
        ...guidanceExportFields(pattern.remediation, pattern.meaning, pattern.fix),
      });
    }
    orchSheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Instruction Coverage sheet — five canonical elements
  {
    const INSTRUCTION_ELEMENT_KEYS = ['role', 'tone', 'boundaries', 'ambiguity', 'escalation'] as const;
    const INSTRUCTION_ELEMENT_LABELS: Record<string, string> = {
      role: 'Role & purpose', tone: 'Tone & style', boundaries: 'Decline/redirect boundaries',
      ambiguity: 'Ambiguous-input handling', escalation: 'Escalation triggers',
    };
    const instructionFindings = vm.findings.filter(f => f.family === 'Instructions');
    const missingElements = new Set<string>();
    for (const f of instructionFindings) {
      for (const key of INSTRUCTION_ELEMENT_KEYS) {
        if (f.fact.includes(`"${key}"`)) missingElements.add(key);
      }
    }

    const instrSheet = wb.addWorksheet('Instruction Coverage');
    instrSheet.columns = [
      { header: 'Element', key: 'element', width: 32 },
      { header: 'Present', key: 'present', width: 10 },
      { header: 'Evidence', key: 'evidence', width: 60 },
    ];
    styleHeader(instrSheet.getRow(1));
    for (const key of INSTRUCTION_ELEMENT_KEYS) {
      const present = !missingElements.has(key);
      const relatedFindings = instructionFindings.filter(f => f.fact.includes(`"${key}"`));
      const evidence = relatedFindings.length > 0
        ? relatedFindings.map(f => redactSecrets(f.title)).join('; ')
        : '';
      instrSheet.addRow({
        element: INSTRUCTION_ELEMENT_LABELS[key] ?? key,
        present: present ? 'Yes' : 'No',
        evidence,
      });
    }
    instrSheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

/**
 * Generate a local PDF with the Standard actionable-report layout and saved Copilot data.
 * Contains metadata, score summary, instruction coverage, evaluation coverage,
 * all checks, findings, orchestration patterns, skill scores with dimension
 * rationales, resource tables with per-resource findings, and optional cost
 * and efficiency data. Never includes raw textContent, source bytes, or
 * SAS URLs.
 *
 * @param vm - View model (metadata + findings).
 * @param payload - Persisted payload (for resource manifest).
 * @param evidence - Observed capability use evidence (optional).
 * @param costReview - Cost & efficiency review data (optional).
 * @returns PDF as Blob.
 */
export function generateCopilotReviewPdf(
  vm: ReviewViewModel,
  payload: PersistedCopilotReviewPayload,
  evidence?: EvidenceState,
  costReview?: CostEfficiencyReview,
): Blob {
  return renderCopilotPdfReport({
    vm,
    reviewMode: payload.skillReviewMode,
    scoreBasis: scoreBasisLabel({
      basisVersion: vm.summary.scoreBasisVersion,
      status: vm.summary.scoreStatus,
    }),
    instructionCoverage: instructionCoverageExportLabel(vm.summary.instructionCoverageStatus),
    crossSkillOrchestration: vm.summary.crossSkillOrchestrationStatus?.state === 'not-applicable'
      ? undefined : crossSkillOrchestrationLabel(vm.summary.crossSkillOrchestrationStatus),
    completion: getCopilotReviewCompletion(payload),
    resources: buildSkillExportRowsFromPayload(payload),
    skillGrades: buildSkillGradeExportRows(vm),
    evidenceRows: buildEvidenceExportRows(evidence),
    evidenceWindow: buildEvidenceWindowRows(evidence),
    evidenceNote: OBSERVED_USE_EXPORT_NOTE,
    persistenceLimits: payload.persistenceIssues.map(issue => issue.message),
    costReview,
  });
}
