import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { SkillResourceEvaluation } from '../contracts/SkillEvaluation';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { buildPersistedSkillView, buildReviewViewModel } from '../components/viewModel';
import { buildSkillFileExplorerModel } from '../components/skills/skillFileExplorerModel';
import {
  buildCopilotSkillExportRows,
  buildSkillExportRowsFromPayload,
  generateCopilotReviewExcel,
} from '../utils/copilotReviewExport';
import { bundle, copilotPayloadWithDeepSecretEvidence, textResource } from './skillTestFixtures';

const paths = ['references/cheatsheet.md', 'assets/sample.csv', 'scripts/charts.py'];

function reviewInput(statuses: SkillResourceEvaluation['status'][] = ['failed', 'failed', 'failed']) {
  const input = copilotPayloadWithDeepSecretEvidence();
  const review = input.payload.skillBundleReviews![0];
  const source = review.deepEvaluation!.resources[0];
  input.bundles = [bundle({
    skillMarkdown: 'When needed, read references/cheatsheet.md and run scripts/charts.py.',
    resources: paths.map(path => textResource(path, 'Example content.', {
      analysisStatus: 'completed',
    })),
  })];
  review.status = 'partial';
  review.deterministicFindings = [];
  review.standardEvaluation!.findings = [];
  review.standardEvaluation!.unreviewedResources = [];
  review.deepEvaluation = {
    status: 'partial',
    synthesisLevel: 'partial',
    resources: statuses.map((status, index) => ({
      ...source,
      resourcePath: paths[index],
      status,
      riskLevel: 'none',
      readiness: status === 'complete' ? 'ready' : 'unknown',
      analyzedChunks: status === 'complete' || status === 'partial' ? 1 : 0,
      totalChunks: status === 'partial' ? 2 : 1,
      observedBehaviors: [],
      dependencies: [],
      externalEndpoints: [],
      capabilities: [],
      runtimeAssumptions: [],
      findings: [],
      purposeAlignment: { matches: true, rationale: 'Example.' },
      referenceIds: [],
    })),
    findings: [],
    crossFileChains: [],
    operationalAssumptions: [],
    summary: 'The supporting-file assessment is incomplete.',
    referenceIds: [],
  };
  return input;
}

function legacyReview() {
  const persisted = buildPersistedCopilotReview(reviewInput());
  const review = persisted.payload.skillBundleReviews[0];
  review.manifest = review.manifest.map(resource => ({
    ...resource, analysisStatus: 'completed',
  }));
  review.coverage = {
    ...review.coverage,
    resourcesReviewed: 3,
    resourcesFailed: 0,
    chunksTotal: 0,
  };
  for (const score of [review.scores.safety, review.scores.readiness]) {
    score.value = 100;
    score.status = 'complete';
    score.coveragePercent = 100;
  }
  return persisted;
}

describe('Actual supporting-file assessment coverage', () => {
  it('does not count decoded files as successfully deep-reviewed', () => {
    const input = reviewInput();
    const before = JSON.stringify(input);
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.manifest.map(resource => resource.analysisStatus)).toEqual([
      'failed', 'failed', 'failed',
    ]);
    expect(review.coverage).toMatchObject({
      resourcesTotal: 3,
      resourcesReviewed: 0,
      resourcesFailed: 3,
      chunksTotal: 3,
      chunksReviewed: 0,
    });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('does not assign a perfect readiness or safety score to zero successful assessments', () => {
    const review = buildPersistedCopilotReview(reviewInput()).payload.skillBundleReviews[0];

    expect(review.scores.readiness).toMatchObject({
      value: null, status: 'unavailable', coveragePercent: 0,
    });
    expect(review.scores.safety).toMatchObject({
      value: null, status: 'unavailable', coveragePercent: 0,
    });
    expect(review.status).toBe('partial');
  });

  it('retains a real blocking safety finding when resource scores are unavailable', () => {
    const input = reviewInput();
    const finding = copilotPayloadWithDeepSecretEvidence().payload.skillBundleReviews![0].deterministicFindings[0];
    input.payload.skillBundleReviews![0].deterministicFindings = [
      { ...finding, severity: 'critical', safetyDisposition: 'blocking' },
    ];
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.scores.safety.value).toBeNull();
    expect(review.scores.safetyGate).toBe('error');
    expect(review.findings.some(finding => finding.severity === 'critical')).toBe(true);
  });

  it('counts complete, partial and failed resources separately using real chunk totals', () => {
    const review = buildPersistedCopilotReview(
      reviewInput(['complete', 'partial', 'failed']),
    ).payload.skillBundleReviews[0];

    expect(review.coverage).toMatchObject({
      resourcesReviewed: 1,
      resourcesPartial: 1,
      resourcesFailed: 1,
      chunksTotal: 4,
      chunksReviewed: 2,
    });
    expect(review.scores.readiness.status).toBe('partial');
    expect(review.scores.readiness.coveragePercent).toBe(33);
    expect(review.scores.safety.coveragePercent).toBe(33);
  });

  it('does not label a partial file assessment as risk-free', () => {
    const input = reviewInput(['complete', 'partial', 'failed']);
    input.payload.skillBundleReviews![0].deepEvaluation!.resources[1].readiness = 'ready';
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.manifest[1].analysisStatus).toBe('partial');
    expect(review.manifest[1].riskLevel).toBeUndefined();
    expect(review.manifest[1].readiness).toBe('unknown');
  });

  it('does not call a missing required deep assessment complete', () => {
    const input = reviewInput();
    input.payload.skillBundleReviews![0].deepEvaluation!.resources = [];
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.manifest.every(resource => resource.analysisStatus !== 'completed')).toBe(true);
    expect(review.coverage.resourcesReviewed).toBe(0);
    expect(review.scores.readiness.value).toBeNull();
  });

  it('keeps a complete successful resource assessment complete', () => {
    const input = reviewInput(['complete', 'complete', 'complete']);
    const runtime = input.payload.skillBundleReviews![0];
    runtime.status = 'complete';
    runtime.deepEvaluation!.status = 'complete';
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.coverage.resourcesReviewed).toBe(3);
    expect(review.coverage.chunksTotal).toBe(3);
    expect(review.scores.readiness).toMatchObject({
      value: 100, status: 'complete', coveragePercent: 100,
    });
  });

  it('uses actual per-file results when the standard backend supplies them', () => {
    const input = reviewInput();
    const runtime = input.payload.skillBundleReviews![0];
    runtime.mode = 'standard';
    input.mode = 'standard';
    runtime.standardEvaluation!.resources = runtime.deepEvaluation!.resources;
    runtime.deepEvaluation = undefined;
    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.coverage.resourcesFailed).toBe(3);
    expect(review.coverage.resourcesReviewed).toBe(0);
    expect(review.scores.readiness.value).toBeNull();
  });
});

describe('Historical supporting-file results', () => {
  it('exports failed resource checks from runtime evidence, not decoded-file labels', () => {
    const input = reviewInput();
    const before = JSON.stringify(input);
    const rows = buildCopilotSkillExportRows(input);

    expect(rows.map(row => row.reviewCoverage)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(rows.every(row => row.riskLevel === undefined)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('uses actual failed resource results in saved-review exports without changing the record', () => {
    const persisted = legacyReview();
    const before = JSON.stringify(persisted.payload);
    const rows = buildSkillExportRowsFromPayload(persisted.payload);

    expect(rows.map(row => row.reviewCoverage)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(JSON.stringify(persisted.payload)).toBe(before);
  });

  it('does not call an incomplete deep review full coverage in the export summary', async () => {
    const persisted = legacyReview();
    const before = JSON.stringify(persisted.payload);
    const view = buildReviewViewModel(persisted.payload, 'Example reviewer', 1000);
    const blob = await generateCopilotReviewExcel(view, persisted.payload);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const summary = workbook.getWorksheet('Summary')!;
    const values = summary.getColumn(1).values;
    const coverageRow = values.indexOf('Analysis coverage');

    expect(summary.getCell(coverageRow, 2).value).toBe('Limited - supporting-file assessment incomplete');
    expect(JSON.stringify(persisted.payload)).toBe(before);
  });

  it('does not present a failed file check as proven risk-free in the file explorer', () => {
    const review = legacyReview().payload.skillBundleReviews[0];
    const files = buildSkillFileExplorerModel(buildPersistedSkillView(review));
    const supportingFiles = files.entries.filter(file => !file.isSkillDefinition);

    expect(supportingFiles).toHaveLength(3);
    expect(supportingFiles.every(file => file.riskLevel === undefined)).toBe(true);
  });

  it('does not display contradicted Complete labels or readiness 100 on a saved skill', () => {
    const persisted = legacyReview();
    const review = persisted.payload.skillBundleReviews[0];
    const before = JSON.stringify(review);
    const view = buildPersistedSkillView(review);

    expect(view.resourceRows?.map(resource => resource.reviewCoverage)).toEqual([
      'Failed', 'Failed', 'Failed',
    ]);
    expect(view.resourceManifest?.every(resource => resource.analysisStatus === 'failed')).toBe(true);
    expect(view.scores?.readiness).toMatchObject({
      value: null, status: 'unavailable', coveragePercent: 0,
    });
    expect(JSON.stringify(review)).toBe(before);
  });

  it('uses the same truthful mapping in the main Copilot review view', () => {
    const persisted = legacyReview();
    const review = persisted.payload.skillBundleReviews[0];
    persisted.payload.model.skills = [{
      name: review.skillName,
      schemaname: review.skillSchemaName,
      markdown: '# Skill',
      body: 'Example.',
      componentId: review.skillComponentId,
      componentIdUnique: review.skillComponentUniqueId,
      source: 'zip-bundle',
      resourceCount: 3,
    }];
    const before = JSON.stringify(persisted.payload);
    const view = buildReviewViewModel(persisted.payload, 'Example reviewer', 1000);

    expect(view.skills[0].resourceRows?.map(resource => resource.reviewCoverage)).toEqual([
      'Failed', 'Failed', 'Failed',
    ]);
    expect(view.skills[0].scores?.readiness.value).toBeNull();
    expect(JSON.stringify(persisted.payload)).toBe(before);
  });
});
