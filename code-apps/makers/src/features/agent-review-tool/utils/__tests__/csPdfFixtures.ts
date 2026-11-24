import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { InstructionEvaluation, Pattern, PatternEvaluation } from '../../contracts/StageOutputs';

export const EXPORTED_ON = new Date('2026-09-08T12:00:00Z');

export const REPORT_PATTERNS: Pattern[] = [
  {
    PatternId: 'input-descriptions',
    PatternName: 'Missing Input Variable Description',
    Status: false,
    AssessmentStatus: 'fail',
    Severity: 'High',
    Description: 'Two input settings need descriptions.',
    Recommendation: 'Describe each input and its expected meaning.',
    EvidenceKind: 'configuration-fact',
    Topics: [
      {
        item: 'Topic Alpha', variable: 'requestId', current: '',
        suggested: 'The identifier supplied with the request.',
        componentId: 'component-alpha', setting: 'inputs.requestId.description',
        evidence: {
          source: 'configuration', status: 'verified',
          setting: 'inputs.requestId.description', quote: '',
          reason: 'The setting is present and empty.',
        },
        remediation: {
          findingTitle: 'Request identifier purpose is missing',
          whyItMatters: 'The maker cannot confirm what value should be supplied.',
          makerAction: 'Describe the identifier and its expected format.',
          suggestedText: 'Unique request identifier supplied by the calling topic.',
          acceptanceCheck: 'A maker can select the correct value without opening the topic.',
        },
      },
      {
        item: 'Topic Alpha', variable: 'locale', current: 'Region value',
        suggested: 'The language and region selected for this request.',
        componentId: 'component-alpha', setting: 'inputs.locale.description',
        evidence: {
          source: 'configuration', status: 'verified', quote: 'Region value',
        },
      },
    ],
  },
  {
    PatternId: 'routing-description', PatternName: 'Missing Model Description',
    Status: true, AssessmentStatus: 'pass', Topics: [],
    Recommendation: 'Maintain a focused routing description.',
  },
  {
    PatternId: 'model-name', PatternName: 'Missing Model Name', Status: false,
    AssessmentStatus: 'not-applicable', Topics: [],
    AssessmentReason: 'This event topic is not selected by the model.',
    Recommendation: 'No model-selection action applies.',
  },
  {
    PatternId: 'overlap', PatternName: 'Overlapping Topic Descriptions', Status: false,
    AssessmentStatus: 'not-assessed', Topics: [],
    AssessmentReason: 'Routing metadata was unavailable in the reviewed snapshot.',
    Recommendation: 'Review routing metadata before evaluating overlap.',
  },
];

export const REPORT_INSTRUCTIONS: InstructionEvaluation = {
  compliancePercentage: 98,
  policyVersion: 'standard-review-2',
  summary: 'There are 99 failures in this original untrusted narrative.',
  issues: [
    {
      id: 'scope-definition-1', criteriaId: 'scope-definition',
      title: 'Scope boundaries need clarification', description: 'The permitted request scope is incomplete.',
      recommendation: 'Describe the supported request scope.',
      severity: 'High', assessmentStatus: 'fail', coverage: 'incomplete',
      uncoveredSituation: 'Requests outside the supported service.',
      evidence: { source: 'instructions', status: 'verified', quote: 'Handle service requests.' },
      remediation: {
        findingTitle: 'Supported request scope is not explicit',
        whyItMatters: 'The agent can accept unsupported requests without a clear boundary.',
        makerAction: 'State the requests that the agent supports and refuses.',
        suggestedText: 'Help with workshop search and registration only. Decline unrelated requests.',
        acceptanceCheck: 'An unrelated request receives a clear boundary response.',
      },
    },
    {
      id: 'privacy-and-sensitive-data-1', criteriaId: 'privacy-and-sensitive-data',
      title: 'Privacy coverage requires confirmation', description: 'The available quote was not verified.',
      recommendation: 'Inspect the reviewed privacy instruction.',
      severity: 'High', assessmentStatus: 'not-assessed',
      assessmentReason: 'The quoted instruction did not match the reviewed input.',
      evidence: { source: 'ai-response', status: 'unverified', quote: 'An unmatched quote.' },
    },
  ],
  criterionAssessments: COMPLIANCE_CRITERIA.map(criterion => ({
    criteriaId: criterion.id,
    status: criterion.id === 'scope-definition' ? 'fail'
      : criterion.id === 'privacy-and-sensitive-data' ? 'not-assessed'
        : criterion.id === 'tool-routing-hints' ? 'not-applicable' : 'pass',
  })),
};

/** Make a wholly synthetic saved review with intentionally stale persisted counts. */
export function createReportReview(overrides: Partial<ReviewResult> = {}): ReviewResult {
  const patterns: PatternEvaluation = {
    Patterns: REPORT_PATTERNS, policyVersion: 'standard-review-2',
    PatternCompliancePercentage: 99,
    Summary: 'There are 99 failures in this original untrusted narrative.',
    assessmentNotes: ['The reviewed snapshot did not include all routing metadata.'],
  };
  return {
    botId: 'synthetic-agent', componentIdUnique: 'synthetic-version',
    botName: 'Synthetic Service Agent', reviewId: 'synthetic-review',
    overallScore: 54, patternScore: 24, instructionScore: 61,
    overallScoreApplicable: true, patternScoreApplicable: true, instructionScoreApplicable: true,
    assessmentPolicyVersion: 'standard-review-2', scoreState: 'measured',
    highSeverityCount: 79, mediumSeverityCount: 78, lowSeverityCount: 77, totalIssueCount: 234,
    reviewedOn: new Date('2026-09-01T10:00:00Z'), durationMs: 1200, status: 'completed',
    agentVersion: '2026-08-31T09:00:00Z', sourceEnvironment: 'zip', reviewKind: 'standard',
    stageAOutput: JSON.stringify({
      source: 'zip',
      policyVersion: 'standard-review-2',
      topicCount: 36,
      toolCount: 2,
      connectedAgentCount: 7,
      knowledgeCount: 0,
    }),
    stageBOutput: JSON.stringify(patterns), stageCOutput: JSON.stringify(REPORT_INSTRUCTIONS),
    workflowProvenance: {
      jobId: 'synthetic-job',
      correlationId: 'synthetic-correlation',
      reviewPolicyVersion: 'standard-review-2',
      retrievedAt: '2026-09-12T05:36:51.000Z',
      rejectedCandidateCount: 2,
      units: [{
        componentIndex: 9500,
        unitId: 'standard-configuration-quality',
        status: 'succeeded',
        findingCount: 1,
        notAssessedCount: 0,
      }],
    },
    ...overrides,
  };
}

/** Read text from this exporter's uncompressed, base-font page streams for layout regressions. */
export function pdfPageText(contents: string): string[] {
  return [...contents.matchAll(/\nstream\n([\s\S]*?)\nendstream/g)].map(stream =>
    [...stream[1].matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g)]
      .map(match => match[1].replace(/\\([\\()])/g, '$1')).join(' ').replace(/\s+/g, ' '))
    .filter(page => page.length > 0);
}
