import { describe, expect, it, vi } from 'vitest';
import {
  DA_WORKFLOW_CONTRACT_VERSION,
  buildDAWorkflowRequest,
  verifyDAWorkflowResponse,
} from '../services/DAWorkflowContractService';
import type { DAManifest } from '../contracts/DAManifest';
import type { DAPackageEvidence } from '../contracts/DAPackageReview';
import {
  evaluateDAWithWorkflow,
  evaluateDAWorkflowRequest,
  projectDAWorkflowEvaluation,
} from '../services/DAWorkflowEvaluationService';

const manifest: DAManifest = {
  appId: 'app-1',
  appVersion: '1.0.0',
  manifestVersion: '1.17',
  shortName: 'Agent',
  fullName: 'Agent',
  shortDescription: 'short',
  fullDescription: 'full',
  developerName: 'Contoso',
  accentColor: '#000000',
  iconBase64: null,
  pluginFiles: {},
  schemaVersion: 'v1.8',
  daId: 'da-1',
  name: 'Agent',
  description: 'desc',
  instructions: 'Answer with a concise table.',
  capabilities: [],
  actions: [],
  conversationStarters: [],
};

const packageEvidence: DAPackageEvidence = {
  rootManifestPath: 'manifest.json',
  declarativeAgentPath: 'declarativeAgent.json',
  documents: [],
  references: [],
  records: [{
    evidenceId: 'declarativeAgent.json#$.instructions',
    kind: 'json-value',
    sourceFile: 'declarativeAgent.json',
    jsonPath: '$.instructions',
    content: 'Answer with a concise table.',
    status: 'available',
  }],
};

describe('DA workflow contract', () => {
  it('builds a versioned request with only applicable rules and referenced evidence', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });

    expect(request.contractVersion).toBe(DA_WORKFLOW_CONTRACT_VERSION);
    expect(request.correlationId).toBe('correlation-1');
    expect(request.agent).toEqual({ id: 'da-1', name: 'Agent', version: 'v1.8' });
    expect(request.rules.some((rule) => rule.criterion === 'actions')).toBe(false);
    expect(request.evidence).toEqual(packageEvidence.records);
    expect(JSON.stringify(request)).not.toContain('rawZip');
  });

  it('accepts an outcome only when its exact excerpt occurs in allowed evidence', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });
    const rule = request.rules.find((candidate) => candidate.criterion === 'instructions');
    expect(rule).toBeDefined();

    const verified = verifyDAWorkflowResponse(request, {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      state: 'completed',
      outcomes: [{
        ruleId: rule!.ruleId,
        status: 'Pass',
        evidence: [{
          evidenceId: 'declarativeAgent.json#$.instructions',
          exactExcerpt: 'concise table',
        }],
        explanation: 'The requested output format is explicit.',
        recommendation: '',
      }],
    });

    expect(verified.outcomes).toHaveLength(1);
    expect(verified.rejected).toHaveLength(0);
  });

  it('rejects unknown evidence and fabricated excerpts', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });
    const rule = request.rules.find((candidate) => candidate.criterion === 'instructions');
    expect(rule).toBeDefined();

    const verified = verifyDAWorkflowResponse(request, {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      state: 'completed',
      outcomes: [{
        ruleId: rule!.ruleId,
        status: 'Fail',
        evidence: [
          { evidenceId: 'unknown', exactExcerpt: 'fabricated' },
          {
            evidenceId: 'declarativeAgent.json#$.instructions',
            exactExcerpt: 'not present',
          },
        ],
        explanation: 'Unsupported claim.',
        recommendation: 'Add detail.',
      }],
    });

    expect(verified.outcomes).toHaveLength(0);
    expect(verified.rejected).toEqual([
      expect.objectContaining({ ruleId: rule!.ruleId }),
    ]);
  });

  it('rejects every outcome when a workflow returns a requested rule more than once', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });
    const rule = request.rules.find((candidate) => candidate.criterion === 'instructions')!;
    const outcome = {
      ruleId: rule.ruleId,
      status: 'Pass' as const,
      evidence: [{
        evidenceId: 'declarativeAgent.json#$.instructions',
        exactExcerpt: 'concise table',
      }],
      explanation: 'The requested output format is explicit.',
      recommendation: '',
    };

    const verified = verifyDAWorkflowResponse(request, {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      state: 'completed',
      outcomes: [outcome, outcome],
    });

    expect(verified.outcomes).toHaveLength(0);
    expect(verified.rejected).toHaveLength(2);
    expect(verified.rejected.every(({ reason }) => reason.includes('more than once'))).toBe(true);
  });

  it('rejects a malformed outcome instead of failing response verification', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });
    const rule = request.rules.find((candidate) => candidate.criterion === 'instructions')!;
    const response = {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      state: 'completed',
      outcomes: [{
        ruleId: rule.ruleId,
        status: 'Pass',
        explanation: 'Synthetic outcome.',
        recommendation: '',
        evidence: null,
      }],
    } as unknown as Parameters<typeof verifyDAWorkflowResponse>[1];

    const verified = verifyDAWorkflowResponse(request, response);

    expect(verified.outcomes).toHaveLength(0);
    expect(verified.rejected).toContainEqual(expect.objectContaining({
      ruleId: rule.ruleId,
      reason: expect.stringMatching(/evidence array/i),
    }));
  });

  it('rejects a response with the wrong correlation id', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });

    expect(() => verifyDAWorkflowResponse(request, {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'other-correlation',
      state: 'completed',
      outcomes: [],
    })).toThrow(/correlation/i);
  });

  it('uses an injected workflow transport and records response provenance', async () => {
    const result = await evaluateDAWithWorkflow(
      manifest,
      packageEvidence,
      async (request) => ({
        jobId: 'job-1',
        response: {
          contractVersion: request.contractVersion,
          correlationId: request.correlationId,
          state: 'completed',
          outcomes: [],
        },
      }),
      'correlation-1',
    );

    expect(result.evaluation.instructionsCriterion.status).toBe('Not assessed');
    expect(result.provenance).toMatchObject({
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      jobId: 'job-1',
      rejectedOutcomeCount: 0,
    });
  });

  it('counts job-row rejections with response-verification rejections', async () => {
    const result = await evaluateDAWithWorkflow(
      manifest,
      packageEvidence,
      async (request) => ({
        jobId: 'job-1',
        rejected: [{
          ruleId: 'semantic.instructions.quality',
          reason: 'The durable job returned no row.',
        }],
        response: {
          contractVersion: request.contractVersion,
          correlationId: request.correlationId,
          state: 'completed',
          outcomes: [{
            ruleId: 'unknown-rule',
            status: 'Pass',
            evidence: [],
            explanation: 'Synthetic unknown rule.',
            recommendation: '',
          }],
        },
      }),
      'correlation-1',
    );

    expect(result.provenance.rejectedOutcomeCount).toBe(2);
    expect(result.evaluation.instructionsCriterion.status).toBe('Not assessed');
  });

  it('resumes from the exact prepared request without generating a new correlation ID', async () => {
    const preparedRequest = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'prepared-correlation',
    });
    const transport = vi.fn(async (submitted: typeof preparedRequest) => ({
      response: {
        contractVersion: submitted.contractVersion,
        correlationId: submitted.correlationId,
        state: 'completed' as const,
        outcomes: [],
      },
    }));

    const result = await evaluateDAWorkflowRequest(
      manifest,
      preparedRequest,
      transport,
    );

    expect(transport).toHaveBeenCalledWith(preparedRequest);
    expect(result.provenance.correlationId).toBe('prepared-correlation');
  });

  it('projects verified evidence and assigns applicability in the Code App', () => {
    const request = buildDAWorkflowRequest(manifest, packageEvidence, {
      correlationId: 'correlation-1',
    });
    const instructionsRule = request.rules.find(
      (candidate) => candidate.criterion === 'instructions',
    )!;
    const verified = verifyDAWorkflowResponse(request, {
      contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      state: 'completed',
      outcomes: [{
        ruleId: instructionsRule.ruleId,
        status: 'Warning',
        evidence: [{
          evidenceId: 'declarativeAgent.json#$.instructions',
          exactExcerpt: 'concise table',
        }],
        explanation: 'The output format is present but the task scope is broad.',
        recommendation: 'State the allowed tasks.',
      }],
    });

    const evaluation = projectDAWorkflowEvaluation(manifest, request, verified);

    expect(evaluation.instructionsCriterion).toMatchObject({
      status: 'Warning',
      issues: [{
        method: 'semantic',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.instructions',
        evidence: 'concise table',
      }],
    });
    expect(evaluation.actionsCriterion.status).toBe('N/A');
    expect(evaluation.conversationStartersCriterion.status).toBe('N/A');
    expect(evaluation.capabilitiesCriterion.status).toBe('N/A');
  });
});
