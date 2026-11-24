import { describe, expect, it } from 'vitest';
import { parseArc2NodeOutput, parseBareArc2Result } from '../services/jobs/aiWorkflowNodeOutput';
import { mapReviewJobItems } from '../services/jobs/reviewJobMapping';
import { toStandardEvaluation } from '../services/ai-providers/WorkflowReviewAiProviderCore';
import { ReviewJobItemStatus } from '../contracts/ReviewJob';

const file = {
  resourcePath: 'references/id-policy.md',
  status: 'complete',
  riskLevel: 'none',
  readiness: 'ready',
  purposeAlignment: { matches: false, rationale: 'This file contradicts the declared steps.' },
  observedBehaviors: [{ kind: 'policy-statement', evidence: 'Only a physical photo ID is accepted.' }],
  dependencies: [{ name: 'policy-library', kind: 'document', evidence: 'policy-library' }],
  externalEndpoints: [{ value: 'https://example.test/policy', evidence: 'https://example.test/policy' }],
  capabilities: [],
  runtimeAssumptions: [],
};

const bare = (resources: unknown) => ({
  skillName: 'id-check',
  exceptions: [],
  notAssessed: [],
  dimensions: [],
  resources,
});

const envelope = (resources: unknown) => ({
  contract: 'arc2-node-output-v4',
  schemaVersion: 4,
  node: 'copilot-skill',
  result: bare(resources),
});

describe.each([
  { name: 'bare', parse: (resources: unknown) => parseBareArc2Result(bare(resources), 'copilot-skill') },
  { name: 'enveloped', parse: (resources: unknown) => parseArc2NodeOutput(envelope(resources)) },
])('$name workflow resource parsing', ({ parse }) => {
  it('carries valid file analysis without changing its purpose verdict', () => {
    const parsed = parse([file]);
    expect(parsed?.result.resources).toEqual([file]);
    expect(parsed?.status).toBe('complete');
  });

  it.each([{}, 'not a list', false])('does not read malformed resources %j as a clean analysis', (resources) => {
    const parsed = parse(resources);
    expect(parsed?.result.resources).toBeUndefined();
    expect(parsed?.status).toBe('partial');
  });

  it.each([
    null,
    { ...file, resourcePath: 7 },
    { ...file, resourcePath: ' ' },
    { ...file, status: 'finished' },
    { ...file, status: undefined },
    { ...file, purposeAlignment: { matches: 'false', rationale: 'Unknown.' } },
    { ...file, dependencies: [{ name: 7, kind: 'package' }] },
    { ...file, externalEndpoints: 'https://example.test' },
    { ...file, observedBehaviors: [{ kind: 'policy', evidence: {} }] },
    { ...file, findings: 'nothing found' },
  ])('drops a bad resource row without losing valid rows: %j', (bad) => {
    const parsed = parse([file, bad]);
    expect(parsed?.result.resources).toEqual([file]);
    expect(parsed?.status).toBe('partial');
  });

  it('keeps an absent or empty resource list unassessed rather than fabricating a file result', () => {
    expect(parse(undefined)?.result.resources).toBeUndefined();
    expect(parse([])?.result.resources).toBeUndefined();
    expect(parse(undefined)?.status).toBe('complete');
    expect(parse([])?.status).toBe('complete');
  });
});

describe('workflow file analysis through the component and evaluation adapters', () => {
  it.each([bare, envelope])('preserves alignment, dependencies and endpoints', (makeResult) => {
    const [component] = mapReviewJobItems([{
      cat_agentreviewjobitemid: 'test-item',
      cat_componentindex: 0,
      cat_skillname: 'id-check',
      cat_itemstatus: ReviewJobItemStatus.Succeeded,
      cat_resultjson: JSON.stringify(makeResult([file])),
    }]);
    expect(component.resources).toEqual([file]);
    const evaluation = toStandardEvaluation(component);
    expect(evaluation.resources).toHaveLength(1);
    expect(evaluation.resources?.[0]).toMatchObject({
      purposeAlignment: file.purposeAlignment,
      dependencies: file.dependencies,
      externalEndpoints: file.externalEndpoints,
      observedBehaviors: file.observedBehaviors,
    });
  });

  it('does not invent an aligned verdict when alignment was not returned', () => {
    const evaluation = toStandardEvaluation({
      skillName: 'id-check', dimensions: [], findings: [], summary: '',
      resources: [{ resourcePath: file.resourcePath, status: 'complete' }],
    });
    expect(evaluation.resources?.[0].purposeAlignment.matches).toBe(false);
    expect(evaluation.resources?.[0].purposeAlignment.rationale).toBe('');
  });

  it('also drops malformed legacy resource rows at the evaluation boundary', () => {
    const evaluation = toStandardEvaluation({
      skillName: 'id-check', dimensions: [], findings: [], summary: '',
      resources: [{ resourcePath: file.resourcePath, status: 'not a verdict' }],
    });
    expect(evaluation.resources).toBeUndefined();
    expect(evaluation.status).toBe('partial');
  });
});
