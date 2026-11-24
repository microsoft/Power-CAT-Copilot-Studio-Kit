import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type {
  CriterionResult,
  DAEvaluationResult,
} from '../contracts/DAEvaluationResult';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { buildDAExcelWorkbook } from '../utils/daExportUtils';
import { generateDAPdfReport, packageValidityCardColor } from '../utils/daPdfUtils';

function criterion(status: CriterionResult['status'] = 'Pass'): CriterionResult {
  return {
    status,
    issues: [],
    passingChecks: status === 'Pass' ? [{ description: 'Synthetic check passed.' }] : [],
    assessmentNotes: status === 'N/A'
      ? [{ status: 'N/A', description: 'No action is declared.' }]
      : undefined,
  };
}

function evaluation(): DAEvaluationResult {
  return {
    instructionsCriterion: {
      status: 'Warning',
      issues: [{
        severity: 'Medium',
        description: 'The instruction scope is broad.',
        recommendation: 'State the allowed tasks.',
        ruleId: 'semantic.instructions.quality',
        method: 'semantic',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.instructions',
        evidence: 'Help with Contoso.',
      }],
      passingChecks: [],
    },
    knowledgeCriterion: criterion(),
    capabilitiesCriterion: criterion(),
    actionsCriterion: criterion('N/A'),
    conversationStartersCriterion: criterion('N/A'),
    gracefulErrorHandlingCriterion: criterion(),
    summary: 'Synthetic review summary.',
  };
}

function review(): DAReviewRecord {
  return {
    componentIdUnique: 'agent-1',
    agentName: 'Synthetic agent',
    agentVersion: '1.0.0',
    publisherName: 'Contoso',
    sourceType: 'zip',
    overallScore: 84,
    iconBase64: null,
    evaluation: evaluation(),
    packageValidation: {
      status: 'invalid',
      schemaVersion: 'v1.8',
      findings: [{
        ruleId: 'DA-VERSION-REQUIRED',
        status: 'Fail',
        severity: 'High',
        method: 'deterministic',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.version',
        evidence: '(missing)',
        explanation: 'The required version is missing.',
        recommendation: 'Set version to v1.8.',
      }],
    },
    workflowProvenance: {
      contractVersion: '1.0',
      correlationId: 'correlation-1',
      jobId: 'job-1',
      completedAt: '2026-03-10T12:00:00.000Z',
      rejectedOutcomeCount: 1,
    },
  };
}

describe('declarative-agent report traceability', () => {
  it('exports package findings, assessment notes, evidence, and workflow provenance to Excel', async () => {
    const blob = await buildDAExcelWorkbook([review()]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());

    expect(workbook.getWorksheet('Summary')?.getCell('E2').value).toBe('invalid');
    expect(workbook.getWorksheet('Issues Detail')?.getColumn('J').values)
      .toContain('declarativeAgent.json');
    expect(workbook.getWorksheet('Issues Detail')?.getColumn('F').values)
      .toContain('Assessment note');
    expect(workbook.getWorksheet('Package Findings')?.getColumn('I').values)
      .toContain('(missing)');
    expect(workbook.getWorksheet('Workflow Provenance')?.getCell('C2').value)
      .toBe('correlation-1');
  });

  it('generates a PDF with nullable scoring and package traceability data', async () => {
    const blob = await generateDAPdfReport(review());

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('keeps the score note in the PDF without the removed package-scope sentence', async () => {
    const pdfText = await (await generateDAPdfReport(review())).text();

    expect(pdfText).toContain('Package validity, N/A, and Not assessed results do not affect the quality score.');
    expect(pdfText).not.toContain('checks the uploaded package');
    expect(pdfText).not.toContain('runtime behavior');
  });

  it('colors the PDF package card from package validity, not from legacy health checks', () => {
    expect(packageValidityCardColor('valid', 2)).toBe('#107c10');
    expect(packageValidityCardColor('valid-with-warnings', 2)).toBe('#b7580a');
    expect(packageValidityCardColor('invalid', 0)).toBe('#c50f1f');
    expect(packageValidityCardColor(undefined, 1)).toBe('#c50f1f');
    expect(packageValidityCardColor(undefined, 0)).toBe('#107c10');
  });
});
