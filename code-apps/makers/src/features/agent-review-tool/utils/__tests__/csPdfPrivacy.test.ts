import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCsPdfReport } from '../csPdfUtils';
import { buildCsReportModel } from '../csReportModel';
import { downloadPdf } from '../exportUtils';
import { createReportReview, EXPORTED_ON, REPORT_INSTRUCTIONS, REPORT_PATTERNS } from './csPdfFixtures';

const TOKENS = [
  'Avery Example', 'OrchidExampleServices', 'portal.example.invalid', 'reviewer@example.invalid',
  'ACCOUNT_EXAMPLE_917', 'AGENT_PACKAGE_EXAMPLE.zip', 'secret-agent.yaml', 'SYNTHETIC_COMPONENT_EXAMPLE',
];
const SENSITIVE_TEXT = TOKENS.join(' | ');
const STALE_NARRATIVE = `Original narrative: 999 failures. ${SENSITIVE_TEXT}`;

function privacyReview() {
  return createReportReview({
    botName: SENSITIVE_TEXT, botId: SENSITIVE_TEXT, componentIdUnique: SENSITIVE_TEXT,
    reviewId: SENSITIVE_TEXT, reviewedBy: SENSITIVE_TEXT, sourceEnvironment: SENSITIVE_TEXT,
    agentVersion: 'C:\\synthetic\\secret-agent.yaml',
    patternSummary: STALE_NARRATIVE, complianceSummary: STALE_NARRATIVE,
    agentInstructions: SENSITIVE_TEXT, errorMessage: SENSITIVE_TEXT,
    stageAOutput: JSON.stringify({
      source: 'zip', policyVersion: SENSITIVE_TEXT, agentInstructions: SENSITIVE_TEXT,
      parsingErrors: [SENSITIVE_TEXT],
    }),
    stageBOutput: JSON.stringify({
      policyVersion: SENSITIVE_TEXT, Summary: STALE_NARRATIVE, assessmentNotes: [SENSITIVE_TEXT],
      Patterns: [{
        ...REPORT_PATTERNS[0], PatternId: SENSITIVE_TEXT, PatternName: SENSITIVE_TEXT,
        Description: SENSITIVE_TEXT, PatternDescription: SENSITIVE_TEXT,
        Recommendation: SENSITIVE_TEXT, AssessmentReason: SENSITIVE_TEXT,
        Topics: [{
          item: SENSITIVE_TEXT, variable: SENSITIVE_TEXT, current: SENSITIVE_TEXT,
          suggested: SENSITIVE_TEXT, setting: SENSITIVE_TEXT, componentId: SENSITIVE_TEXT,
          evidence: { source: 'configuration', status: 'verified', quote: SENSITIVE_TEXT, reason: SENSITIVE_TEXT },
        }],
      }],
    }),
    stageCOutput: JSON.stringify({
      ...REPORT_INSTRUCTIONS, policyVersion: SENSITIVE_TEXT, summary: STALE_NARRATIVE,
      assessmentReason: SENSITIVE_TEXT,
      criterionAssessments: REPORT_INSTRUCTIONS.criterionAssessments?.map(item => ({ ...item, reason: SENSITIVE_TEXT })),
      issues: [{
        ...REPORT_INSTRUCTIONS.issues[0], id: `scope-definition-${SENSITIVE_TEXT}`,
        title: SENSITIVE_TEXT, description: SENSITIVE_TEXT, recommendation: SENSITIVE_TEXT,
        assessmentReason: SENSITIVE_TEXT, uncoveredSituation: SENSITIVE_TEXT,
        evidence: { source: 'instructions', status: 'verified', quote: SENSITIVE_TEXT, reason: SENSITIVE_TEXT },
      }],
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('public-safe PDF free-text redaction', () => {
  it('omits identifiers repeated in titles, recommendations, summaries and metadata without dropping findings', () => {
    const review = privacyReview();
    const before = JSON.stringify(review);
    const full = buildCsReportModel(review, { exportedOn: EXPORTED_ON });
    const publicSafe = buildCsReportModel(review, { exportedOn: EXPORTED_ON, redactSensitiveValues: true });
    const output = JSON.stringify(publicSafe);
    for (const token of TOKENS) {
      expect(JSON.stringify(full).includes(token), `full report retains ${token}`).toBe(true);
      expect(output.includes(token), `public report omits ${token}`).toBe(false);
    }
    expect(publicSafe.counts).toEqual(full.counts);
    expect(publicSafe.scores).toEqual(full.scores);
    expect(publicSafe.patterns).toHaveLength(full.patterns.length);
    expect(publicSafe.instructionIssues).toHaveLength(full.instructionIssues.length);
    expect(output).toContain('Omitted for public-safe export');
    expect(output).not.toContain('999 failures');
    expect(JSON.stringify(review)).toBe(before);
  });

  it('omits repeated sensitive text from real PDF bytes and document metadata', async () => {
    const blob = await generateCsPdfReport(privacyReview(), { exportedOn: EXPORTED_ON, redactSensitiveValues: true });
    const output = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    for (const token of TOKENS) expect(output.includes(token), token).toBe(false);
    expect(output.includes('999 failures')).toBe(false);
    expect(output.includes('Omitted for public-safe export')).toBe(true);
    expect(output).toContain('/Title (Copilot Studio Agent Review)');
    const metadata = [...output.matchAll(/\/(?:Title|Subject|Author|Creator) \(([^)]*)\)/g)];
    expect(metadata).toHaveLength(4);
    expect(metadata.every(entry => !TOKENS.some(token => entry[1].includes(token)))).toBe(true);
  });

  it('keeps historical narrative counts out of the full PDF without changing the saved narrative', async () => {
    const review = privacyReview();
    const before = JSON.stringify(review);
    const blob = await generateCsPdfReport(review, { exportedOn: EXPORTED_ON });
    const output = Buffer.from(await blob.arrayBuffer()).toString('latin1');
    expect(output.includes('999 failures')).toBe(false);
    expect(output.includes('Failed check categories: 1')).toBe(true);
    expect(output.includes('Instruction issues counted: 1')).toBe(true);
    expect(JSON.stringify(review)).toBe(before);
  });

  it('uses the existing generic public-safe download prefix rather than anything inside the report', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EXPORTED_ON);
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-public-report');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = await generateCsPdfReport(privacyReview(), { exportedOn: EXPORTED_ON, redactSensitiveValues: true });
    downloadPdf(blob, 'Public_Agent_Review');
    expect(anchor.download).toBe('Public_Agent_Review_review_2026-09-08.pdf');
    for (const token of TOKENS) expect(anchor.download.includes(token)).toBe(false);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:synthetic-public-report');
  });
});
