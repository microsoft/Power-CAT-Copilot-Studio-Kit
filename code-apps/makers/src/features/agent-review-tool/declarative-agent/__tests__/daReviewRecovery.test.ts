import { describe, expect, it } from 'vitest';
import type { DAPreparedReviewInput } from '../hooks/useDAReviewMutation';
import {
  clearDAReviewRecovery,
  createDAReviewRecovery,
  readDAReviewRecovery,
  writeDAReviewRecovery,
  type DAReviewRecoveryStorage,
} from '../services/daReviewRecovery';

function memoryStorage(): DAReviewRecoveryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const prepared: DAPreparedReviewInput = {
  componentIdUnique: 'component-1',
  sourceType: 'zip',
  manifest: {
    appId: 'app-1',
    appVersion: '1.0.0',
    manifestVersion: '1.19',
    shortName: 'Synthetic agent',
    fullName: 'Synthetic agent',
    shortDescription: 'Synthetic',
    fullDescription: 'Synthetic',
    developerName: 'Contoso',
    accentColor: '#000000',
    iconBase64: 'large-image',
    pluginFiles: {
      'plugin.json': {
        token: 'must-not-enter-browser-storage',
      },
    },
    schemaVersion: 'v1.8',
    daId: 'agent-1',
    name: 'Synthetic agent',
    description: 'Synthetic',
    instructions: 'Use concise answers.',
    capabilities: [{
      name: 'SyntheticCapability',
      apiKey: 'must-also-be-redacted',
    }],
    actions: [],
    conversationStarters: [],
  },
  manifestHealth: {
    score: 100,
    checks: [],
  },
  packageValidation: {
    status: 'valid',
    schemaVersion: 'v1.8',
    findings: [],
  },
  retainedEvidence: [{
    evidenceId: 'agent.json#$.instructions',
    kind: 'json-value',
    sourceFile: 'agent.json',
    jsonPath: '$.instructions',
    content: 'Use concise answers.',
    status: 'available',
  }],
  workflowRequest: {
    contractVersion: '1.0',
    correlationId: 'correlation-1',
    agent: {
      id: 'agent-1',
      name: 'Synthetic agent',
      version: 'v1.8',
    },
    rules: [{
      ruleId: 'semantic.instructions.quality',
      criterion: 'instructions',
      evidenceIds: ['agent.json#$.instructions'],
    }],
    evidence: [{
      evidenceId: 'agent.json#$.instructions',
      kind: 'json-value',
      sourceFile: 'agent.json',
      jsonPath: '$.instructions',
      content: 'Use concise answers.',
      status: 'available',
    }],
  },
};

describe('Declarative review restart recovery', () => {
  it('stores only the prepared review snapshot and removes raw plugin data', () => {
    const recovery = createDAReviewRecovery(prepared, 1_000);

    expect(recovery.input.manifest.pluginFiles).toEqual({});
    expect(recovery.input.manifest.iconBase64).toBeNull();
    expect(JSON.stringify(recovery)).not.toContain('must-not-enter-browser-storage');
    expect(JSON.stringify(recovery)).not.toContain('must-also-be-redacted');
    expect(JSON.stringify(recovery)).toContain('[REDACTED]');
    expect(recovery.input.workflowRequest).toEqual(prepared.workflowRequest);
  });

  it('redacts free-text secrets throughout the restart snapshot', () => {
    const bearer = 'synthetic-bearer-token-12345';
    const apiKey = 'synthetic-unquoted-secret';
    const sasUrl = 'https://contoso.blob.core.windows.net/private/file.txt?sv=1&sig=synthetic-signature';
    const evidence = [{
      ...prepared.workflowRequest.evidence[0],
      content: `Authorization: Bearer ${bearer}\napi_key=${apiKey}\n${sasUrl}`,
    }];
    const recovery = createDAReviewRecovery({
      ...prepared,
      manifest: {
        ...prepared.manifest,
        instructions: `Authorization: Bearer ${bearer}`,
      },
      workflowRequest: {
        ...prepared.workflowRequest,
        evidence,
      },
      retainedEvidence: evidence,
      customSkillIssues: [{
        code: 'synthetic',
        message: `api_key=${apiKey}`,
        severity: 'warning',
      }],
    }, 1_000);

    const serialized = JSON.stringify(recovery);
    expect(serialized).not.toContain(bearer);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain(sasUrl);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[URL-REDACTED]');
  });

  it('round-trips a recent job and preserves the immutable correlation ID', () => {
    const storage = memoryStorage();
    const recovery = {
      ...createDAReviewRecovery(prepared, 1_000),
      jobId: 'job-1',
    };

    expect(writeDAReviewRecovery(recovery, storage)).toBe(true);
    expect(readDAReviewRecovery(storage, 2_000)).toMatchObject({
      jobId: 'job-1',
      input: {
        componentIdUnique: 'component-1',
        workflowRequest: {
          correlationId: 'correlation-1',
        },
      },
    });

    clearDAReviewRecovery(storage);
    expect(readDAReviewRecovery(storage, 2_000)).toBeNull();
  });

  it('deletes expired or malformed recovery records', () => {
    const storage = memoryStorage();
    writeDAReviewRecovery(createDAReviewRecovery(prepared, 1_000), storage);

    expect(
      readDAReviewRecovery(storage, 8 * 24 * 60 * 60 * 1000),
    ).toBeNull();

    storage.setItem('copilot-studio-kit:active-da-review:v1', '{"version":1}');
    expect(readDAReviewRecovery(storage, 2_000)).toBeNull();
  });
});
