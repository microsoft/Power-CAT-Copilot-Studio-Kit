import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ConnectionReference {
  id: string;
  dataSources: string[];
  workflowDetails?: {
    workflowEntityId: string;
    workflowDisplayName: string;
    workflowName: string;
  };
}

const config: { connectionReferences: Record<string, ConnectionReference> } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../../power.config.json', import.meta.url)),
    'utf8',
  ),
);
const flowReferences = Object.entries(config.connectionReferences).filter(
  ([, reference]) => reference.id.endsWith('/shared_logicflows'),
);

describe('Makers flow connection bindings', () => {
  it.each(flowReferences)('retains workflow identifiers for %s', (_id, reference) => {
    expect(reference.workflowDetails).toEqual(expect.objectContaining({
      workflowEntityId: expect.stringMatching(/\S/),
      workflowName: expect.stringMatching(/\S/),
    }));
  });

  it('binds feature telemetry to the existing LogFeatureTelemetry flow', () => {
    expect(config.connectionReferences['96077a26-18b3-4d7a-bee8-57b6baa54db5']).toMatchObject({
      id: '/providers/Microsoft.PowerApps/apis/shared_logicflows',
      dataSources: ['logfeaturetelemetry'],
      workflowDetails: {
        workflowEntityId: 'fc955cf5-0c8a-f111-ab0f-70a8a5afad9f',
        workflowDisplayName: 'LogFeatureTelemetry',
        workflowName: '00000000-0000-0000-0000-000000000000',
      },
    });
  });
});
