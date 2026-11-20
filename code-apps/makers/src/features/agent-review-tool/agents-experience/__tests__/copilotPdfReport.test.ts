import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SkillView } from '../components/viewTypes';
import { buildReviewViewModel } from '../components/viewModel';
import type { GroundedFinding } from '../contracts/Findings';
import type { CostEfficiencyReview } from '../contracts/CostEfficiency';
import type { EvidenceState } from '../contracts/TranscriptEvidence';
import { generateCopilotReviewPdf } from '../utils/copilotReviewExport';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';
import { buildPersistedPayloadForFindingExport } from './skillTestFixtures';

const FINDING: GroundedFinding = {
  id: 'INS-02',
  family: 'Instructions',
  severity: 'warning',
  title: 'Supported request scope is missing',
  fact: 'The recorded instructions do not define the supported request scope.',
  why: 'The agent can accept a request outside the supported service.',
  fix: 'State the supported requests and the response to unsupported requests.',
  referenceId: 'ms-authoring-instructions',
  ai: false,
};

function fixture(findings: GroundedFinding[] = [FINDING]) {
  const payload = buildPersistedPayloadForFindingExport({ topLevelFindings: findings });
  payload.score = {
    grounded: 70,
    passed: 1,
    warnings: 1,
    errors: 0,
    evaluated: 2,
    basisVersion: 2,
    status: 'complete',
  };
  payload.ruleResults = [
    { key: 'INS-02', ruleId: 'INS-02', family: 'Instructions', status: 'warning' },
    { key: 'AGT-01', ruleId: 'AGT-01', family: 'Agent', status: 'passed' },
  ];
  const vm = buildReviewViewModel(payload, 'Synthetic reviewer', 1200, 'Synthetic Workshop Agent');
  return { payload, vm };
}

async function pages(blob: Blob, sample?: string): Promise<string[]> {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const result = pdfPageText(bytes.toString('latin1'));
  if (sample && process.env.CS_PDF_SAMPLE_DIR) {
    const directory = process.env.CS_PDF_SAMPLE_DIR;
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${sample}.pdf`);
    await writeFile(path, bytes);
    expect(await readFile(path)).toEqual(bytes);
  }
  return result;
}

function skill(overrides: Partial<SkillView> = {}): SkillView {
  return {
    id: 'synthetic-skill-id',
    schemaName: 'synthetic.skill',
    name: 'Synthetic workshop skill',
    description: 'Synthetic skill description',
    source: 'Bundled files',
    safetyFlagged: false,
    sizeLabel: '1 KB',
    dimensions: [],
    evaluationState: 'unavailable',
    markdown: 'RAW_SOURCE_SENTINEL',
    ...overrides,
  };
}

describe('Microsoft Copilot PDF in the Standard report format', () => {
  it('uses the agent-specific cover followed by contents and the actionable report sequence', async () => {
    const { vm, payload } = fixture();
    const result = await pages(generateCopilotReviewPdf(vm, payload), 'copilot-mixed');
    const text = result.join(' ');
    expect(result[0]).toContain('Synthetic Workshop Agent Review');
    expect(result[0]).toContain('saved Microsoft Copilot');
    expect(result[0]).not.toContain('Executive summary');
    expect(result[1]).toContain('Contents');
    for (const heading of [
      'Executive summary',
      'Review scope',
      'Configuration review',
      'Instruction review',
      'Skills and resources',
      'Recommended implementation order',
      'Tests to run after changes',
      'All recorded checks',
      'Validation record and limits',
      'Official references',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('Page 2 of');
    expect(text).not.toContain('saved Standard review');
  });

  it('keeps recorded findings with evidence, impact, maker action, and official guidance', async () => {
    const { vm, payload } = fixture();
    const text = (await pages(generateCopilotReviewPdf(vm, payload), 'copilot-findings')).join(' ');
    for (const value of [FINDING.title, FINDING.fact, FINDING.why, FINDING.fix]) {
      expect(text).toContain(value);
    }
    expect(text).toContain('Maker action:');
    expect(text).toContain('Recorded finding ID:');
    expect(text).toContain('F-01');
    expect(text).toContain('https://learn.microsoft.com/');
    expect(text).toContain('70 / 100');
    expect(text).not.toContain('Pattern score:');
  });

  it('retains passed checks and distinguishes an execution failure from an agent finding', async () => {
    const { payload } = fixture();
    payload.ruleResults?.push({
      key: 'INS-03',
      ruleId: 'INS-03',
      family: 'Instructions',
      status: 'failed',
    });
    payload.score.status = 'partial';
    const vm = buildReviewViewModel(payload, 'Synthetic reviewer', 1200, 'Synthetic Workshop Agent');
    const text = (await pages(generateCopilotReviewPdf(vm, payload), 'copilot-incomplete')).join(' ');
    expect(text).toContain('AGT-01');
    expect(text).toContain('Passed');
    expect(text).toContain('INS-03');
    expect(text).toContain('Not assessed (execution failed)');
    expect(text).toContain('Review incomplete');
    expect(text).toContain('70 / 100');
  });

  it('does not claim instruction coverage or a clean review when AI coverage is unavailable', async () => {
    const { payload } = fixture([]);
    payload.analysisStatus = { instructionCoverage: { state: 'unavailable', reason: 'unprovisioned' } };
    const vm = buildReviewViewModel(payload, 'Synthetic reviewer', 1200, 'Synthetic Workshop Agent');
    const text = (await pages(generateCopilotReviewPdf(vm, payload), 'copilot-unavailable')).join(' ');
    expect(text).toContain('Not evaluated (classifier unavailable)');
    expect(text).toContain('Not assessed');
    expect(text).toContain('Review incomplete');
    expect(text).not.toContain('All instruction elements are covered');
  });

  it('keeps unassessed skill resources without inventing a zero grade', async () => {
    const { vm, payload } = fixture();
    vm.skills = [skill({
      resourceRows: [{
        path: 'references/workshop-scope.md',
        kind: 'markdown',
        sizeBytes: 300,
        analysisStatus: 'failed',
        findingCount: 0,
        reviewCoverage: 'Failed',
      }],
    })];
    const text = (await pages(generateCopilotReviewPdf(vm, payload))).join(' ');
    expect(text).toContain('Synthetic workshop skill');
    expect(text).toContain('Not evaluated');
    expect(text).toContain('references/workshop-scope.md');
    expect(text).toContain('Failed');
    expect(text).not.toContain('0%');
    expect(text).not.toContain('RAW_SOURCE_SENTINEL');
  });

  it('does not display an unavailable dimension placeholder as a measured zero', async () => {
    const { vm, payload } = fixture();
    vm.skills = [skill({
      evaluationMessage: 'The synthetic evaluator was unavailable.',
      scores: {
        quality: { value: 0, status: 'unavailable', coveragePercent: 0 },
        integrity: { value: 0, status: 'complete', coveragePercent: 100 },
        safety: { value: 75, status: 'partial', coveragePercent: 50 },
        readiness: { value: null, status: 'unavailable', coveragePercent: 0 },
        safetyGate: 'none',
      },
    })];
    const text = (await pages(generateCopilotReviewPdf(vm, payload))).join(' ');
    expect(text).toContain('Not evaluated');
    expect(text).toContain('The synthetic evaluator was unavailable.');
    expect(text).toContain('Instruction quality: Not assessed | unavailable');
    expect(text).toContain('Bundle integrity: 0 | complete');
    expect(text).toContain('Resource safety: 75 | partial');
    expect(text).not.toContain('Instruction quality: 0 | unavailable');
  });

  it('retains optional observed-use evidence and planning estimates as separate, qualified sections', async () => {
    const { vm, payload } = fixture();
    const evidence: EvidenceState = {
      status: 'ready',
      window: {
        startIso: '2026-09-01T00:00:00Z', endIso: '2026-09-08T00:00:00Z',
        days: 7, conversations: 8, truncated: true,
      },
      coverage: [{
        kind: 'knowledge', configured: 1, observed: 0, notAttributable: 1,
        aggregateObservations: [{ name: 'Uploaded Files', invocations: 3 }],
        items: [{
          name: 'Synthetic workshop handbook', sourceType: 'Uploaded file',
          state: 'not-attributable', invocations: 0,
        }],
      }],
      observedTools: [], blockedConversations: 2,
    };
    const cost: CostEfficiencyReview = {
      facts: {
        modelSeries: 'Synthetic model', connectorTools: 1, mcpTools: 0, skills: 0,
        knowledgeSources: 1, connectedAgents: 0, triggers: 0, webSearchEnabled: false,
        evaluationSets: 1, testCases: 2, toolAssertionCases: 1,
      },
      estimate: {
        scenario: 'heavy', monthlyTasks: 100,
        creditsPerTask: { lowerBound: 20, lowerBoundInclusive: false },
        monthlyCredits: { lowerBound: 2000, lowerBoundInclusive: false },
        publicPaygCostCents: { lowerBound: 2000, lowerBoundInclusive: false },
        publicPricePerCreditUsd: 0.01, priceBasis: 'public-payg-list-price',
        sourceLabel: 'Microsoft Learn — Billing overview',
      },
      opportunities: [{
        id: 'synthetic-opportunity', title: 'Synthetic cost opportunity',
        potentialImpact: 'low', confidence: 'low', evidenceLabel: 'configured',
        evidence: ['Synthetic configuration fact.'],
        recommendation: 'Validate the configured path before making a change.',
        qualityRisk: 'Retain the required knowledge.',
        validationPlan: 'Repeat the controlled scenario.',
      }],
    };
    const text = (await pages(generateCopilotReviewPdf(vm, payload, evidence, cost),
      'copilot-observed-cost')).join(' ');
    for (const value of [
      'Cost and efficiency', 'not measured agent consumption',
      'Synthetic workshop handbook', 'Not attributable',
      'Window complete: No - stopped at page limit', 'Blocked conversations excluded: 2',
      'Credits per task: >20+', 'Monthly credits: >2000+',
      'Synthetic cost opportunity', 'Retain the required knowledge.',
      'Repeat the controlled scenario.',
    ]) expect(text).toContain(value);
    expect(text).not.toContain('unused capability');
    expect(text).not.toContain('measured credit consumption');
  });

  it('keeps distinct findings that share a rule identifier', async () => {
    const { vm, payload } = fixture([
      { ...FINDING, fact: 'First synthetic scope finding.' },
      { ...FINDING, fact: 'Second synthetic scope finding.' },
    ]);
    vm.summary.countsAreChecks = true;
    vm.summary.warnings = 1;
    const text = (await pages(generateCopilotReviewPdf(vm, payload))).join(' ');
    expect(text).toContain('F-01');
    expect(text).toContain('F-02');
    expect(text).toContain('First synthetic scope finding.');
    expect(text).toContain('Second synthetic scope finding.');
    expect(text).toContain('Finding summary Severity Included findings Error 0 Warning 2 Information 0 Total 2');
  });

  it('retains long evidence, actions, and source locations without excerpts or lost characters', async () => {
    const { vm, payload } = fixture();
    const finding = vm.findings[0];
    finding.fact = 'Synthetic Copilot evidence detail. '.repeat(110) + 'COPILOT_EVIDENCE_END';
    finding.sub = 'Synthetic first-line evidence.';
    finding.fix = 'Synthetic Copilot maker action. '.repeat(70) + 'COPILOT_ACTION_END';
    finding.resourcePath = `references/${'W'.repeat(800)}.md`;
    const text = (await pages(generateCopilotReviewPdf(vm, payload), 'copilot-long')).join(' ');
    expect(text.match(/Synthetic Copilot evidence detail\./g)).toHaveLength(110);
    expect(text.match(/Synthetic Copilot maker action\./g)).toHaveLength(70);
    expect(text).toContain('COPILOT_EVIDENCE_END');
    expect(text).toContain('COPILOT_ACTION_END');
    expect(text.replace(/\s/g, '')).toContain(finding.resourcePath);
    expect(text).toContain('(continued)');
    expect(text).not.toContain('[excerpt');
  });

  it('redacts exported metadata and evidence without changing the saved review', async () => {
    const secret = 'api_key="synthetic-not-a-real-key"';
    const signed = 'https://example.invalid/resource?sig=synthetic-signature';
    const encoded = 'api_key&amp;amp;#x3D;&amp;amp;quot;synthetic-encoded-key&amp;amp;quot;';
    const { vm, payload } = fixture([{ ...FINDING, title: secret, fact: `${secret} ${signed} ${encoded}` }]);
    vm.summary.agentName = secret;
    vm.summary.reviewedBy = signed;
    payload.model.agentSettings.instructions = 'INSTRUCTION_SOURCE_SENTINEL';
    const before = JSON.stringify({ vm, payload });
    const text = (await pages(generateCopilotReviewPdf(vm, payload))).join(' ');
    expect(text).not.toContain('synthetic-not-a-real-key');
    expect(text).not.toContain('synthetic-signature');
    expect(text).not.toContain('synthetic-encoded-key');
    expect(text).not.toContain('INSTRUCTION_SOURCE_SENTINEL');
    expect(text).toContain('[REDACTED]');
    expect(text).toContain('[URL-REDACTED]');
    expect(JSON.stringify({ vm, payload })).toBe(before);
  });
});
