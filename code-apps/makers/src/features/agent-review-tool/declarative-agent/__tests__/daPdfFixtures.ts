import type { CriterionResult, DAEvaluationResult } from '../contracts/DAEvaluationResult';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { ManifestHealthCheck } from '../contracts/ManifestHealthCheck';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';

/** Build a synthetic criterion without inferring a passed check from its status. */
export function pdfCriterion(status: CriterionResult['status'] = 'Pass'): CriterionResult {
  return {
    status,
    issues: [],
    passingChecks: status === 'Pass' ? [{ description: 'Synthetic recorded passing check.' }] : [],
  };
}

/** Build a synthetic quality assessment with two excluded criteria. */
export function pdfEvaluation(): DAEvaluationResult {
  return {
    instructionsCriterion: {
      status: 'Warning',
      issues: [{
        severity: 'Medium',
        description: 'The supported request scope is not explicit.',
        recommendation: 'State the requests that the agent supports and refuses.',
        ruleId: 'semantic.instructions.quality',
        method: 'semantic',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.instructions',
        evidence: 'Help with workshop requests.',
        guidanceUrl: PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url,
      }],
      passingChecks: [],
    },
    knowledgeCriterion: pdfCriterion(),
    capabilitiesCriterion: pdfCriterion(),
    actionsCriterion: {
      ...pdfCriterion('N/A'),
      assessmentNotes: [{
        status: 'N/A',
        description: 'No action is declared in this saved assessment.',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.actions',
        evidence: '[]',
      }],
    },
    conversationStartersCriterion: pdfCriterion('N/A'),
    gracefulErrorHandlingCriterion: pdfCriterion(),
    summary: 'Synthetic saved quality summary.',
  };
}

/** Build a wholly synthetic M365 saved review for actual PDF regression tests. */
export function createDAPdfReview(overrides: Partial<DAReviewRecord> = {}): DAReviewRecord {
  return {
    componentIdUnique: 'synthetic-da-agent',
    agentName: 'Synthetic Workshop Agent',
    agentVersion: '1.0.0',
    publisherName: 'Synthetic publisher',
    sourceType: 'zip',
    overallScore: 17,
    reviewedOn: new Date('2026-09-01T10:00:00Z'),
    iconBase64: null,
    evaluation: pdfEvaluation(),
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
        recommendation: 'Set the required version to v1.8.',
        guidanceUrl: PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url,
      }],
    },
    workflowProvenance: {
      contractVersion: '1.0',
      correlationId: 'synthetic-correlation',
      jobId: 'synthetic-job',
      completedAt: '2026-09-01T10:00:00.000Z',
      rejectedOutcomeCount: 2,
    },
    ...overrides,
  };
}

/** Build legacy health data with a long saved message that must not be truncated. */
export function createDAPdfLegacyHealth(): ManifestHealthCheck {
  const passing = { pass: true, message: 'Synthetic legacy check passed.' };
  return {
    schemaVersion: 'v1.8',
    nameLength: { value: 10, limit: 100, pass: true },
    descriptionLength: { value: 100, limit: 1000, pass: true },
    instructionsPresent: { value: 1, limit: 1, pass: true },
    conversationStartersCount: { value: 4, max: 12, pass: true },
    actionsCount: { value: 0, max: 10, pass: true },
    colorIconPresent: true,
    daFileResolved: true,
    nameConsistency: {
      pass: false,
      message: 'Synthetic legacy name check detail. '.repeat(12) + 'LEGACY_MESSAGE_END',
    },
    noPromptInjection: passing,
    noUrlsOrEmojis: passing,
    isConsequentialFlags: passing,
    httpsOnActionUrls: passing,
    mcpStaticDiscovery: passing,
  };
}
