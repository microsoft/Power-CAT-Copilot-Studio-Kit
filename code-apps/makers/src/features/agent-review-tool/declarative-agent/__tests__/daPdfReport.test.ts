import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundle, textResource } from '../../agents-experience/__tests__/skillTestFixtures';
import type { GroundedSkillFinding } from '../../agents-experience/contracts/Findings';
import { buildPersistedSkillBundleReview } from '../../agents-experience/services/skill/persistedSkillReview';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { generateDAPdfReport } from '../utils/daPdfUtils';
import { createDAPdfLegacyHealth, createDAPdfReview } from './daPdfFixtures';

async function exportReview(review: DAReviewRecord, sample?: string) {
  const blob = await generateDAPdfReport(review);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const raw = bytes.toString('latin1');
  const pages = pdfPageText(raw);
  if (sample && process.env.CS_PDF_SAMPLE_DIR) {
    const directory = process.env.CS_PDF_SAMPLE_DIR;
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${sample}.pdf`);
    await writeFile(path, bytes);
    await writeFile(join(directory, `${sample}.fixture.json`), JSON.stringify(review, null, 2));
    expect(await readFile(path)).toEqual(bytes);
  }
  return { blob, raw, pages, text: pages.join(' ') };
}

function reviewWithSkills(): DAReviewRecord {
  const finding: GroundedSkillFinding = {
    id: 'SKL-SYNTHETIC',
    ruleId: 'SKL-SYNTHETIC',
    family: 'Skills',
    severity: 'medium',
    title: 'Synthetic skill scope is unclear',
    fact: 'The saved skill does not define its request scope.',
    evidence: 'Recorded synthetic skill evidence.',
    why: 'The maker cannot confirm when the skill applies.',
    fix: 'Define the skill request scope.',
    recommendation: 'Define the skill request scope.',
    ai: false,
    confidence: 'high',
    referenceId: 'ms-skills-overview',
    referenceIds: ['ms-skills-overview'],
    fixSteps: [{ order: 1, action: 'Clarify the allowed requests.' }],
    resourcePath: 'references/workshop-scope.md',
  };
  const skillBundle = bundle({
    skillName: 'Synthetic workshop skill',
    resources: [textResource('references/workshop-scope.md', 'Synthetic scope.', {
      analysisStatus: 'failed',
    })],
  });
  const skill = buildPersistedSkillBundleReview(skillBundle, {
    status: 'unavailable',
    mode: 'standard',
    skillName: skillBundle.skillName,
    skillSchemaName: skillBundle.skillSchemaName,
    deterministicFindings: [finding],
    blocked: false,
  }, '2026-09-01T10:00:00Z', '2026-09-01T10:01:00Z');
  skill.skillDefinitionSource = 'RAW_SKILL_SOURCE_SENTINEL';
  return createDAPdfReview({
    customSkillReviews: [skill],
    customSkillIssues: [{
      code: 'skill-review-unavailable',
      message: 'Synthetic skill evaluator was unavailable.',
      resourcePath: 'skills/workshop/SKILL.md',
      severity: 'warning',
    }],
  });
}

describe('M365 Declarative Agent PDF in the Standard report format', () => {
  it('uses the agent-specific Standard cover and actionable report sequence', async () => {
    const { blob, pages, text } = await exportReview(createDAPdfReview(), 'm365-mixed');
    expect(blob.type).toBe('application/pdf');
    expect(pages[0]).toContain('Synthetic Workshop Agent Review');
    expect(pages[0]).toContain('saved M365 Declarative Agent review');
    expect(pages[0]).not.toContain('Executive summary');
    expect(pages[1]).toContain('Contents');
    for (const heading of [
      'Executive summary', 'Review scope', 'Quality review', 'Package validity',
      'Custom skills and resources', 'Recommended implementation order',
      'Tests to run after changes', 'All recorded checks',
      'Validation record and limits', 'Official references',
    ]) expect(text).toContain(heading);
    expect(text).toContain('Page 2 of');
    expect(text).not.toContain('saved Standard review');
  });

  it('explains the M365 criterion weights without applying Standard weights', async () => {
    const { text } = await exportReview(createDAPdfReview());
    expect(text).toContain('84 / 100');
    expect(text).not.toContain('17 / 100');
    expect(text).toContain('Quality score calculation');
    expect(text).toContain('Configured weight');
    expect(text).toContain('Effective weight');
    expect(text).toContain('Contribution');
    for (const value of ['30%', '20%', '15%', '10%', '40%', '26.67%', '13.33%']) {
      expect(text).toContain(value);
    }
    expect(text).toContain('Pass = 100; Warning = 60; Fail = 0.');
    expect(text).toContain('Package validity, N/A, and Not assessed results do not affect the quality score.');
    expect(text).toContain('Custom-skill quality is separate from the M365 quality score.');
    expect(text).not.toContain('Pattern score:');
  });

  it('keeps saved-score fallback without inventing a criterion breakdown', async () => {
    const { text } = await exportReview(createDAPdfReview({
      evaluation: undefined, packageValidation: undefined, overallScore: 61,
    }), 'm365-legacy-score');
    expect(text).toContain('61 / 100');
    expect(text).toContain('No criterion breakdown was saved.');
    expect(text).toContain('Not assessed');
    expect(text).not.toContain('Pass = 100');
    expect(text).not.toContain('100 / 100');
  });

  it('keeps a missing quality score unassessed', async () => {
    const { text } = await exportReview(createDAPdfReview({
      evaluation: undefined, overallScore: null,
    }), 'm365-unassessed');
    expect(text).toContain('Quality score: Not assessed');
    expect(text).not.toContain('0 / 100');
    expect(text).not.toContain('100 / 100');
  });

  it('keeps finding identity, evidence, source location, maker action, and provenance', async () => {
    const { text, raw } = await exportReview(createDAPdfReview());
    for (const value of [
      'F-01', 'F-02', 'semantic.instructions.quality', 'DA-VERSION-REQUIRED',
      'semantic', 'deterministic', 'declarativeAgent.json', '$.instructions', '$.version',
      'Help with workshop requests.', '(missing)', 'Maker action:',
      'State the requests that the agent supports and refuses.',
      'Set the required version to v1.8.', 'Workflow provenance',
      'synthetic-correlation', 'synthetic-job', '2026-09-01T10:00:00.000Z',
      'Rejected outcomes: 2',
    ]) expect(text).toContain(value);
    expect(raw).toContain('/Subtype /Link');
    expect(raw).toContain(PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url);
  });

  it('retains assessment notes even when the criterion has no issues', async () => {
    const { text } = await exportReview(createDAPdfReview());
    expect(text).toContain('No action is declared in this saved assessment.');
    expect(text).toContain('Assessment note: N/A');
    expect(text).toContain('$.actions');
    expect(text).toContain('Synthetic recorded passing check.');
  });

  it('retains all package check outcomes without counting exclusions as failures', async () => {
    const review = createDAPdfReview();
    review.packageValidation?.findings.push(...(['Pass', 'Warning', 'N/A', 'Not assessed'] as const)
      .map(status => ({
        ruleId: `synthetic-package-${status}`,
        status,
        method: 'deterministic' as const,
        explanation: `Synthetic package outcome ${status}.`,
        recommendation: '',
      })));
    const { text } = await exportReview(review);
    for (const status of ['Pass', 'Warning', 'N/A', 'Not assessed']) {
      expect(text).toContain(`Synthetic package outcome ${status}.`);
    }
    expect(text).toContain('All recorded checks');
  });

  it('keeps custom-skill findings and pipeline limits without inventing grades or fixes', async () => {
    const { text } = await exportReview(reviewWithSkills(), 'm365-custom-skills');
    for (const value of [
      'Synthetic workshop skill', 'Not evaluated', 'failed', 'SKL-SYNTHETIC',
      'Recorded synthetic skill evidence.', 'references/workshop-scope.md',
      'Define the skill request scope.', 'Clarify the allowed requests.',
      'Synthetic skill evaluator was unavailable.',
      'No maker action was recorded for this execution issue.',
    ]) expect(text).toContain(value);
    expect(text).not.toContain('RAW_SKILL_SOURCE_SENTINEL');
    expect(text).not.toContain('0% (');
  });

  it('preserves full legacy health messages without treating missing checks as passed', async () => {
    const { text } = await exportReview(createDAPdfReview({
      evaluation: undefined,
      packageValidation: undefined,
      manifestHealth: createDAPdfLegacyHealth(),
    }), 'm365-legacy-health');
    expect(text).toContain('Legacy manifest health checks');
    expect(text).toContain('LEGACY_MESSAGE_END');
    expect(text.match(/Synthetic legacy name check detail\./g)).toHaveLength(12);
    expect(text).toContain('Instructions length: Not assessed');
  });

  it('redacts report fields and evidence without changing the saved data', async () => {
    const secret = 'api_key="synthetic-not-a-real-key"';
    const signed = 'https://example.invalid/resource?sig=synthetic-signature';
    const encoded = 'api_key&amp;amp;#x3D;&amp;amp;quot;synthetic-encoded-key&amp;amp;quot;';
    const review = createDAPdfReview({ agentName: secret, publisherName: signed });
    if (!review.evaluation) throw new Error('The synthetic evaluation is missing.');
    review.evaluation.instructionsCriterion.issues[0].evidence = `${secret} ${signed} ${encoded}`;
    review.evaluation.instructionsCriterion.issues[0].guidanceUrl = signed;
    review.evidence = [{
      evidenceId: 'synthetic-evidence', kind: 'document',
      sourceFile: 'instructions.md', jsonPath: '$',
      content: 'RAW_SOURCE_SENTINEL', status: 'available',
    }];
    const before = JSON.stringify(review);
    const { raw, text } = await exportReview(review);
    expect(raw).not.toContain('synthetic-not-a-real-key');
    expect(raw).not.toContain('synthetic-signature');
    expect(raw).not.toContain('synthetic-encoded-key');
    expect(raw).not.toContain('RAW_SOURCE_SENTINEL');
    expect(text).toContain('[REDACTED]');
    expect(text).toContain('[URL-REDACTED]');
    expect(JSON.stringify(review)).toBe(before);
  });

  it('preserves supplementary numeric entities and leaves invalid code points visible', async () => {
    const review = createDAPdfReview();
    if (!review.evaluation) throw new Error('The synthetic evaluation is missing.');
    review.evaluation.instructionsCriterion.issues[0].evidence =
      'Saved icons: &#x1F600; / &#128512;. Invalid entity: &#99999999;';
    const { text } = await exportReview(review, 'm365-text-encoding');
    expect(text).toContain('Saved icons: [U+1F600] / [U+1F600].');
    expect(text).toContain('Invalid entity: &#99999999;');
  });

  it('retains long evidence, recommendations, and unbroken locations over measured page breaks', async () => {
    const review = createDAPdfReview();
    if (!review.evaluation) throw new Error('The synthetic evaluation is missing.');
    const finding = review.evaluation.instructionsCriterion.issues[0];
    finding.evidence = 'Synthetic evidence detail. '.repeat(110) + 'EVIDENCE_END';
    finding.recommendation = 'Synthetic maker action. '.repeat(70) + 'ACTION_END';
    finding.sourceFile = `references/${'W'.repeat(800)}.md`;
    const { text } = await exportReview(review, 'm365-long');
    expect(text.match(/Synthetic evidence detail\./g)).toHaveLength(110);
    expect(text.match(/Synthetic maker action\./g)).toHaveLength(70);
    expect(text).toContain('EVIDENCE_END');
    expect(text).toContain('ACTION_END');
    expect(text.replace(/\s/g, '')).toContain(finding.sourceFile);
    expect(text).toContain('(continued)');
    expect(text).not.toContain('[excerpt');
  });
});
