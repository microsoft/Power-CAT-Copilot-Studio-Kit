import { describe, expect, it } from 'vitest';
import type { DAManifest } from '../contracts/DAManifest';
import type { DAEvidenceRecord, DAPackageEvidence } from '../contracts/DAPackageReview';
import { buildDAWorkflowRequest, verifyDAWorkflowResponse } from '../services/DAWorkflowContractService';

const manifest: DAManifest = {
  appId: 'chart-app',
  appVersion: '1.0.0',
  manifestVersion: '1.28',
  shortName: 'Chart Desk',
  fullName: 'Chart Desk',
  shortDescription: 'Create charts.',
  fullDescription: 'Create charts from supplied data.',
  developerName: 'Contoso',
  accentColor: '#000000',
  iconBase64: null,
  pluginFiles: {},
  schemaVersion: 'v1.9',
  daId: 'chart-agent',
  name: 'Chart Desk',
  description: 'Create charts from supplied data.',
  instructions: 'Use the chart skill to create charts from supplied data.',
  capabilities: [{ name: 'CodeInterpreter' }],
  actions: [],
  conversationStarters: [],
};

function record(jsonPath: string, content: string): DAEvidenceRecord {
  return {
    evidenceId: `agent.json#${jsonPath}`,
    kind: 'json-value',
    sourceFile: 'agent.json',
    jsonPath,
    content,
    status: 'available',
  };
}

function evidence(records: DAEvidenceRecord[]): DAPackageEvidence {
  return {
    rootManifestPath: 'manifest.json',
    declarativeAgentPath: 'agent.json',
    documents: [],
    references: [],
    records,
  };
}

describe('DA workflow fit context', () => {
  it.each(['knowledge', 'capabilities'] as const)(
    'gives the %s fit rule its capability evidence and available purpose context',
    criterion => {
      const request = buildDAWorkflowRequest(manifest, evidence([
        record('$.instructions', manifest.instructions),
        record('$.description', manifest.description),
        record('$.capabilities', '[{"name":"CodeInterpreter"}]'),
      ]), { correlationId: 'fit-review' });
      const rule = request.rules.find(candidate => candidate.criterion === criterion);

      expect(rule?.evidenceIds).toEqual(expect.arrayContaining([
        'agent.json#$.instructions',
        'agent.json#$.description',
        'agent.json#$.capabilities',
      ]));
      expect(new Set(rule?.evidenceIds).size).toBe(rule?.evidenceIds.length);
    },
  );

  it('does not make a fit criterion applicable merely because instructions exist', () => {
    const request = buildDAWorkflowRequest(
      { ...manifest, capabilities: [] },
      evidence([record('$.instructions', manifest.instructions)]),
      { correlationId: 'instructions-only' },
    );

    expect(request.rules.map(rule => rule.criterion)).toEqual([
      'instructions', 'gracefulErrorHandling',
    ]);
  });

  it('redacts purpose context before transport and still verifies exact excerpts', () => {
    const request = buildDAWorkflowRequest(manifest, evidence([
      record('$.instructions', 'Create charts. api_key = "private-example-key"'),
      record('$.capabilities', '[{"name":"CodeInterpreter"}]'),
    ]), { correlationId: 'safe-fit' });
    const rule = request.rules.find(candidate => candidate.criterion === 'capabilities')!;

    expect(JSON.stringify(request)).not.toContain('private-example-key');
    const result = verifyDAWorkflowResponse(request, {
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      state: 'completed',
      outcomes: [{
        ruleId: rule.ruleId,
        status: 'Pass',
        explanation: 'The instructions require chart creation.',
        recommendation: '',
        evidence: [{
          evidenceId: 'agent.json#$.instructions',
          exactExcerpt: 'Create charts.',
        }],
      }],
    });

    expect(result.rejected).toEqual([]);
    expect(result.outcomes).toHaveLength(1);
  });
});
