import { describe, expect, it } from 'vitest';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import {
  copilotPayloadWithRawResourceContent,
  copilotPayloadWithRepeatedInfoEvidence,
  copilotPayloadWithDeepSecretEvidence,
  copilotPayloadWithUnsanitizedIntegrityFindings,
  copilotPayloadWithLegacySkillEvaluations,
  copilotPayloadWithSasRetrievalIssues,
  copilotPayloadWithSecretsInModel,
  modelWithSecretsEverywhere,
  MODEL_SECRET_MARKER,
} from './skillTestFixtures';
import type { CopilotReviewPersistenceInput } from '../services/skill/persistedSkillReview';

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — sanitization', () => {
  it('serializes copilot payload without raw resource content', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.json).not.toContain('textContent');
    expect(persisted.json).not.toContain('SasUrl');
    expect(persisted.json).toContain('skillBundleReviews');
    expect(persisted.json.length).toBeLessThanOrEqual(900_000);
  });

  it('strips SAS URLs from evidence text', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.json).not.toContain('sig=secret123');
    expect(persisted.json).not.toContain('blob.core.windows.net');
    expect(persisted.json).toContain('URL-REDACTED');
  });

  it('truncates evidence longer than 160 characters', () => {
    const input = copilotPayloadWithRawResourceContent();
    // Inject a long evidence finding
    const longEvidence = 'A'.repeat(200);
    const review = input.payload.skillBundleReviews![0];
    review.deterministicFindings[0] = {
      ...review.deterministicFindings[0],
      evidence: longEvidence,
      fact: longEvidence,
    };

    const persisted = buildPersistedCopilotReview(input);
    // Check no finding evidence exceeds 160 chars in the persisted reviews
    for (const r of persisted.payload.skillBundleReviews) {
      for (const f of r.findings) {
        expect(f.evidence.length).toBeLessThanOrEqual(160);
        expect(f.fact.length).toBeLessThanOrEqual(160);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — projection', () => {
  it('produces PersistedSkillBundleReview with schemaVersion 1', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.skillBundleReviews).toHaveLength(1);
    expect(persisted.payload.skillBundleReviews[0].schemaVersion).toBe(1);
  });

  it('includes manifest, scores, coverage, and citations', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    const review = persisted.payload.skillBundleReviews[0];

    expect(review.manifest).toBeDefined();
    expect(review.scores).toBeDefined();
    expect(review.scores.quality).toBeDefined();
    expect(review.scores.integrity).toBeDefined();
    expect(review.scores.safety).toBeDefined();
    expect(review.scores.readiness).toBeDefined();
    expect(review.coverage).toBeDefined();
    expect(review.coverage.resourcesTotal).toBeGreaterThanOrEqual(0);
    expect(review.citations).toBeDefined();
  });

  it('carries deterministic findings and integrity result', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    const review = persisted.payload.skillBundleReviews[0];

    expect(review.deterministic).toBeDefined();
    expect(review.deterministic.findings.length).toBeGreaterThan(0);
    expect(review.deterministic.integrity).toBeDefined();
    expect(typeof review.deterministic.integrity.progressiveDisclosureOk).toBe('boolean');
  });

  it('preserves mode and status from execution result', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    const review = persisted.payload.skillBundleReviews[0];
    expect(review.mode).toBe('standard');
    expect(['complete', 'partial', 'failed', 'cancelled']).toContain(review.status);
  });

  it('includes prompt versions from Constants', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    const review = persisted.payload.skillBundleReviews[0];
    expect(review.promptVersions.standard).toBeDefined();
    expect(typeof review.promptVersions.standard).toBe('string');
  });

  it('populates skillReviewMode in persisted payload', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.skillReviewMode).toBe('standard');
  });

  it('retains a redacted, bounded bundled SKILL.md definition', () => {
    const input = copilotPayloadWithRawResourceContent();
    input.bundles[0].skillMarkdown = '# Skill\napi_key = "skill-source-secret"';

    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.skillDefinitionSource).toContain('# Skill');
    expect(review.skillDefinitionSource).toContain('[REDACTED]');
    expect(review.skillDefinitionSource).not.toContain('skill-source-secret');
    expect(review.skillDefinitionSourceOmission).toBeUndefined();
  });

  it('omits an oversized bundled SKILL.md instead of storing a partial definition', () => {
    const input = copilotPayloadWithRawResourceContent();
    input.bundles[0].skillMarkdown = 'x'.repeat(64_001);

    const review = buildPersistedCopilotReview(input).payload.skillBundleReviews[0];

    expect(review.skillDefinitionSource).toBeUndefined();
    expect(review.skillDefinitionSourceOmission).toBe('too-large');
  });
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — compaction', () => {
  it('compacts repeated low-priority evidence before the memo limit', () => {
    const persisted = buildPersistedCopilotReview(
      copilotPayloadWithRepeatedInfoEvidence(950_000),
      900_000,
    );
    expect(persisted.json.length).toBeLessThanOrEqual(900_000);
    expect(persisted.payload.skillBundleReviews[0].findings).not.toHaveLength(0);
    expect(persisted.payload.persistenceIssues).toContainEqual(
      expect.objectContaining({ code: 'persisted-payload-compacted' }),
    );
  });

  it('preserves high/critical findings during compaction', () => {
    const persisted = buildPersistedCopilotReview(
      copilotPayloadWithRepeatedInfoEvidence(950_000),
      900_000,
    );
    const review = persisted.payload.skillBundleReviews[0];
    const highFindings = review.findings.filter(f => f.severity === 'high' || f.severity === 'critical');
    expect(highFindings.length).toBeGreaterThan(0);
  });

  it('does not compact when within budget', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.persistenceIssues).toHaveLength(0);
    expect(persisted.json.length).toBeLessThanOrEqual(900_000);
  });

  it('throws when protected fields exceed the limit', () => {
    // Create input where ALL findings are high severity (cannot be trimmed)
    const input = copilotPayloadWithRawResourceContent();
    const review = input.payload.skillBundleReviews![0];
    const massiveFindings = [];
    for (let i = 0; i < 5000; i++) {
      massiveFindings.push({
        ...review.deterministicFindings[0],
        id: `HIGH-${i}`,
        ruleId: `HIGH-${i}`,
        severity: 'critical' as const,
        evidence: 'x'.repeat(150) + `-${i}`,
        fact: 'x'.repeat(150) + `-${i}`,
      });
    }
    review.deterministicFindings = massiveFindings;

    expect(() => buildPersistedCopilotReview(input, 1000)).toThrow(
      'Review result exceeds the Dataverse persistence limit',
    );
  });

  it('respects maxChars even when persistenceIssues push payload over the boundary', () => {
    // Create a payload that requires compaction. Compact at 900K so
    // persistenceIssues are populated. Verify the final JSON (including
    // persistenceIssues) stays within the limit.
    const compactedResult = buildPersistedCopilotReview(
      copilotPayloadWithRepeatedInfoEvidence(950_000),
      900_000,
    );
    // The persistenceIssues were assigned. Verify the final JSON length is within budget.
    expect(compactedResult.json.length).toBeLessThanOrEqual(900_000);
    expect(compactedResult.payload.persistenceIssues.length).toBeGreaterThan(0);
    // Double-check: re-serialize the payload to confirm it matches the stored json length.
    const reserialized = JSON.stringify(compactedResult.payload);
    expect(reserialized.length).toBeLessThanOrEqual(900_000);
    expect(reserialized.length).toBe(compactedResult.json.length);
  });

  it('records when payload compaction removes a bundled skill definition', () => {
    const input = copilotPayloadWithRepeatedInfoEvidence(950_000);
    input.bundles[0].skillMarkdown = '# Retained before compaction';

    const review = buildPersistedCopilotReview(input, 900_000)
      .payload.skillBundleReviews[0];

    expect(review.skillDefinitionSource).toBeUndefined();
    expect(review.skillDefinitionSourceOmission).toBe('payload-budget');
  });

  it('compacts standard resource observations with the same bounds as deep resources', () => {
    const input = copilotPayloadWithDeepSecretEvidence();
    const review = input.payload.skillBundleReviews![0];
    const resource = review.deepEvaluation!.resources[0];
    const repeat = <T extends { evidence: string }>(value: T): T[] =>
      Array.from({ length: 300 }, (_, index) => ({ ...value, evidence: `evidence-${index}` }));

    review.deepEvaluation = undefined;
    review.standardEvaluation!.resources = [{
      ...resource,
      findings: [],
      observedBehaviors: repeat(resource.observedBehaviors[0]),
      dependencies: repeat(resource.dependencies[0]),
      externalEndpoints: repeat(resource.externalEndpoints[0]),
      capabilities: repeat(resource.capabilities[0]),
      runtimeAssumptions: repeat(resource.runtimeAssumptions[0]),
    }];

    const persisted = buildPersistedCopilotReview(input, 40_000);
    const compacted = persisted.payload.skillBundleReviews[0].standard!.resources![0];

    expect(compacted.observedBehaviors).toHaveLength(5);
    expect(compacted.dependencies).toHaveLength(5);
    expect(compacted.externalEndpoints).toHaveLength(5);
    expect(compacted.capabilities).toHaveLength(5);
    expect(compacted.runtimeAssumptions).toHaveLength(5);
    expect(persisted.json.length).toBeLessThanOrEqual(40_000);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — edge cases', () => {
  it('handles empty bundles gracefully', () => {
    const input: CopilotReviewPersistenceInput = {
      payload: {
        model: {
          agentSettings: { instructions: '', raw: {} },
          tools: [], skills: [], connectedAgents: [], knowledge: [],
          evaluationSets: [], testCases: [], multiTurnCases: [],
          triggers: [], unknownKinds: [],
        },
        findings: [],
        skillEvaluations: [],
        skillBundleReviews: [],
        bundleRetrievalIssues: [],
        coverage: [],
        score: { grounded: 0, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
      },
      bundles: [],
      mode: 'standard',
      startedAt: '2026-07-14T00:00:00Z',
      completedAt: '2026-07-14T00:01:00Z',
    };

    const persisted = buildPersistedCopilotReview(input);
    expect(persisted.payload.skillBundleReviews).toHaveLength(0);
    expect(persisted.json.length).toBeLessThanOrEqual(900_000);
  });

  it('skips review results with no matching bundle', () => {
    const input: CopilotReviewPersistenceInput = {
      payload: {
        model: {
          agentSettings: { instructions: '', raw: {} },
          tools: [], skills: [], connectedAgents: [], knowledge: [],
          evaluationSets: [], testCases: [], multiTurnCases: [],
          triggers: [], unknownKinds: [],
        },
        findings: [],
        skillEvaluations: [],
        skillBundleReviews: [{
          status: 'complete',
          mode: 'standard',
          skillName: 'orphan',
          skillSchemaName: 'no.matching.bundle',
          deterministicFindings: [],
          blocked: false,
        }],
        bundleRetrievalIssues: [],
        coverage: [],
        score: { grounded: 0, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
      },
      bundles: [],
      mode: 'standard',
      startedAt: '2026-07-14T00:00:00Z',
      completedAt: '2026-07-14T00:01:00Z',
    };

    const persisted = buildPersistedCopilotReview(input);
    expect(persisted.payload.skillBundleReviews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Persisted payload completeness
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — persisted payload completeness', () => {
  it('persists model, skillEvaluations, and bundleRetrievalIssues', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.model).toBeDefined();
    expect(persisted.payload.model.agentSettings).toBeDefined();
    expect(persisted.payload.skillEvaluations).toBeDefined();
    expect(Array.isArray(persisted.payload.skillEvaluations)).toBe(true);
    expect(persisted.payload.bundleRetrievalIssues).toBeDefined();
  });

  it('persists skillReviewMode as required', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.skillReviewMode).toBe('standard');
  });

  it('persists coverage and score', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithRawResourceContent());
    expect(persisted.payload.coverage).toBeDefined();
    expect(persisted.payload.score).toBeDefined();
    expect(persisted.payload.score.grounded).toBeGreaterThanOrEqual(0);
  });

  it('persists ruleResults, without which "All checks" can never populate', () => {
    // Measured on a real saved review: `score` said "13 of 25 passed" while the
    // All checks tab said the per-check list was not recorded and asked the user
    // to re-run -- which never helped, because the next save dropped it again.
    const input = copilotPayloadWithRawResourceContent();
    input.payload.ruleResults = [
      { key: 'TOL-01:tool-a', ruleId: 'TOL-01', family: 'Tools', status: 'passed' },
      { key: 'INS-08:agent', ruleId: 'INS-08', family: 'Instructions', status: 'warning' },
    ];

    const persisted = buildPersistedCopilotReview(input);

    expect(persisted.payload.ruleResults).toHaveLength(2);
    expect(persisted.payload.ruleResults?.map(r => r.ruleId)).toEqual(['TOL-01', 'INS-08']);
    // It must survive serialization too -- the memo column is what the UI reads.
    expect(JSON.parse(persisted.json).ruleResults).toHaveLength(2);
  });

  it('leaves ruleResults undefined when the review never recorded any', () => {
    // Legacy reviews genuinely have none. That must stay distinguishable from
    // "nothing passed", which is why the panel keeps its explanatory state.
    const input = copilotPayloadWithRawResourceContent();
    input.payload.ruleResults = undefined;
    expect(buildPersistedCopilotReview(input).payload.ruleResults).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Deep sanitization
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — deep sanitization', () => {
  it('redacts secrets from nested Standard findings and evidence', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    const review = persisted.payload.skillBundleReviews[0];

    // Standard findings must be sanitized
    if (review.standard) {
      for (const f of review.standard.findings) {
        expect(f.evidence.length).toBeLessThanOrEqual(160);
        expect(f.fact.length).toBeLessThanOrEqual(160);
      }
      // Standard operationalAssumptions evidence
      for (const a of review.standard.operationalAssumptions) {
        expect(a.evidence).not.toContain('sk-supersecret');
        expect(a.evidence.length).toBeLessThanOrEqual(160);
      }
      // Standard resourcePurposeAlignment rationale
      for (const r of review.standard.resourcePurposeAlignment) {
        expect(r.rationale).not.toContain('hunter2');
      }
    }
  });

  it('redacts secrets and truncates Deep resource evidence at every nesting level', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    const review = persisted.payload.skillBundleReviews[0];

    if (review.deep) {
      for (const res of review.deep.resources) {
        // Findings
        for (const f of res.findings) {
          expect(f.evidence.length).toBeLessThanOrEqual(160);
          expect(f.fact.length).toBeLessThanOrEqual(160);
          expect(f.evidence).not.toContain('sk-supersecret');
        }
        // observedBehaviors
        for (const o of res.observedBehaviors) {
          expect(o.evidence).not.toContain('blob.core.windows.net');
          expect(o.evidence.length).toBeLessThanOrEqual(160);
        }
        // dependencies
        for (const d of res.dependencies) {
          if (d.evidence) {
            expect(d.evidence.length).toBeLessThanOrEqual(160);
          }
        }
        // externalEndpoints
        for (const e of res.externalEndpoints) {
          expect(e.evidence).not.toContain('sk-supersecret');
          expect(e.evidence.length).toBeLessThanOrEqual(160);
        }
        // capabilities
        for (const c of res.capabilities) {
          expect(c.evidence).not.toContain('sk-supersecret');
          expect(c.evidence.length).toBeLessThanOrEqual(160);
        }
        // runtimeAssumptions
        for (const r of res.runtimeAssumptions) {
          expect(r.evidence).not.toContain('blob.core.windows.net');
          expect(r.evidence.length).toBeLessThanOrEqual(160);
        }
        // purposeAlignment
        expect(res.purposeAlignment.rationale).not.toContain('hunter2');
      }
    }
  });

  it('redacts secrets from Deep operationalAssumptions', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    const review = persisted.payload.skillBundleReviews[0];

    if (review.deep) {
      for (const a of review.deep.operationalAssumptions) {
        expect(a.statement).not.toContain('secret-tok-999');
      }
    }
  });

  it('redacts secrets from top-level findings in the persisted payload', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    for (const f of persisted.payload.findings) {
      expect(f.fact).not.toContain('blob.core.windows.net');
      expect(f.fact.length).toBeLessThanOrEqual(160);
    }
  });

  it('redacts SAS URLs from Deep bundle findings why field', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    const review = persisted.payload.skillBundleReviews[0];
    for (const f of review.findings) {
      expect(f.why).not.toContain('blob.core.windows.net');
    }
  });

  it('uses the same exhaustive sanitizer for standard and deep resources', () => {
    const input = copilotPayloadWithDeepSecretEvidence();
    const review = input.payload.skillBundleReviews![0];
    const deepResource = review.deepEvaluation!.resources[0];
    const marker = 'resource-field-secret';

    deepResource.observedBehaviors[0].kind = `password = "${marker}"`;
    deepResource.dependencies[0].name = `password = "${marker}"`;
    deepResource.dependencies[0].kind = `password = "${marker}"`;
    deepResource.externalEndpoints[0].value =
      `https://storage.blob.core.windows.net/file?sig=${marker}`;
    deepResource.runtimeAssumptions[0].statement = `password = "${marker}"`;
    deepResource.findings[0].title = `password = "${marker}"`;
    deepResource.parseError = `password = "${marker}"`;
    review.standardEvaluation!.resources = [{
      ...deepResource,
      observedBehaviors: deepResource.observedBehaviors.map(item => ({ ...item })),
      dependencies: deepResource.dependencies.map(item => ({ ...item })),
      externalEndpoints: deepResource.externalEndpoints.map(item => ({ ...item })),
      capabilities: deepResource.capabilities.map(item => ({ ...item })),
      runtimeAssumptions: deepResource.runtimeAssumptions.map(item => ({ ...item })),
      findings: deepResource.findings.map(item => ({ ...item })),
      purposeAlignment: { ...deepResource.purposeAlignment },
    }];

    const persistedReview = buildPersistedCopilotReview(input)
      .payload.skillBundleReviews[0];
    const serializedResources = JSON.stringify({
      standard: persistedReview.standard?.resources,
      deep: persistedReview.deep?.resources,
    });

    expect(serializedResources).not.toContain(marker);
    expect(serializedResources).not.toContain('blob.core.windows.net');
    expect(persistedReview.standard?.resources?.[0].parseError).toContain('[REDACTED]');
    expect(persistedReview.deep?.resources[0].parseError).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Gap-fix: Integrity findings sanitization (Gap 1)
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — integrity findings sanitization', () => {
  it('produces at least one integrity finding from the duplicate-path bundle', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithUnsanitizedIntegrityFindings());
    const findings = persisted.payload.skillBundleReviews[0].deterministic.integrity.findings;
    expect(findings.length).toBeGreaterThan(0);
  });

  it('truncates deterministic.integrity.findings evidence to ≤160 chars', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithUnsanitizedIntegrityFindings());
    const findings = persisted.payload.skillBundleReviews[0].deterministic.integrity.findings;
    for (const f of findings) {
      expect(f.evidence.length).toBeLessThanOrEqual(160);
      expect(f.fact.length).toBeLessThanOrEqual(160);
    }
  });

  it('integrity finding evidence ends with ellipsis after truncation', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithUnsanitizedIntegrityFindings());
    const findings = persisted.payload.skillBundleReviews[0].deterministic.integrity.findings;
    // At least one finding must have been truncated (evidence was > 160 chars before sanitization)
    const truncated = findings.filter(f => f.evidence.endsWith('...'));
    expect(truncated.length).toBeGreaterThan(0);
  });

  it('redacts SAS URLs from integrity finding evidence if present', () => {
    // Use the existing deep-secret fixture which has SAS content in deterministic findings
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    const findings = persisted.payload.skillBundleReviews[0].deterministic.integrity.findings;
    for (const f of findings) {
      expect(f.evidence).not.toContain('blob.core.windows.net');
      expect(f.fact).not.toContain('blob.core.windows.net');
    }
  });
});

// ---------------------------------------------------------------------------
// Gap-fix: Legacy skillEvaluations sanitization (Gap 2)
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — legacy skillEvaluations sanitization', () => {
  it('sanitizes safety finding evidence to ≤160 chars with secrets redacted', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithLegacySkillEvaluations());
    for (const ev of persisted.payload.skillEvaluations) {
      for (const f of ev.safety.findings) {
        expect(f.evidence.length).toBeLessThanOrEqual(160);
        expect(f.evidence).not.toContain('sk-supersecret');
      }
    }
  });

  it('sanitizes resource finding evidence to ≤160 chars with secrets redacted', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithLegacySkillEvaluations());
    for (const ev of persisted.payload.skillEvaluations) {
      for (const r of ev.resources) {
        for (const f of r.findings) {
          expect(f.evidence.length).toBeLessThanOrEqual(160);
          expect(f.evidence).not.toContain('sk-supersecret');
        }
      }
    }
  });

  it('sanitizes crossSkillConflict evidence to ≤160 chars with SAS URLs redacted', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithLegacySkillEvaluations());
    for (const ev of persisted.payload.skillEvaluations) {
      for (const c of ev.crossSkillConflicts) {
        expect(c.evidence.length).toBeLessThanOrEqual(160);
        expect(c.evidence).not.toContain('blob.core.windows.net');
        expect(c.evidence).not.toContain('sig=secret123');
      }
    }
  });

  it('redacts secrets from skillEvaluation summary, rationale, and rationale fields', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithLegacySkillEvaluations());
    const json = persisted.json;
    expect(json).not.toContain('sk-supersecret-longvalue');
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('sig=secret123');
    expect(json).not.toContain('blob.core.windows.net');
  });

  it('does not alter scores, name, band, or identity fields', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithLegacySkillEvaluations());
    const ev = persisted.payload.skillEvaluations[0];
    expect(ev.name).toBe('test-skill');
    expect(ev.overallScorePercent).toBe(75);
    expect(ev.band).toBe('Good');
    expect(ev.safety.flagged).toBe(true);
    expect(ev.safety.severity).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Gap-fix: RetrievalIssue message sanitization (Gap 3)
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — retrieval issue message sanitization', () => {
  it('redacts SAS URLs from bundleRetrievalIssues messages', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSasRetrievalIssues());
    for (const issue of persisted.payload.bundleRetrievalIssues ?? []) {
      expect(issue.message).not.toContain('sig=secret123');
      expect(issue.message).not.toContain('blob.core.windows.net');
      expect(issue.message).toContain('[URL-REDACTED]');
    }
  });

  it('redacts SAS URLs from per-bundle retrievalIssues messages', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSasRetrievalIssues());
    for (const review of persisted.payload.skillBundleReviews) {
      for (const issue of review.retrievalIssues) {
        expect(issue.message).not.toContain('sig=secret123');
        expect(issue.message).not.toContain('blob.core.windows.net');
      }
    }
  });

  it('preserves issue code and severity while redacting message', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSasRetrievalIssues());
    const bundleIssue = persisted.payload.bundleRetrievalIssues?.[0];
    expect(bundleIssue?.code).toBe('bundle-retrieval-failed');
    expect(bundleIssue?.severity).toBe('error');
    expect(bundleIssue?.message).toContain('[URL-REDACTED]');
  });

  it('does not contain any SAS URL in the serialized JSON', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSasRetrievalIssues());
    expect(persisted.json).not.toContain('sig=secret123');
    expect(persisted.json).not.toContain('blob.core.windows.net');
  });
});

// ---------------------------------------------------------------------------
// Model sanitization before persistence (Task 1: spec 013 remediation)
// ---------------------------------------------------------------------------

describe('buildPersistedCopilotReview — model sanitization (Task 1)', () => {
  it('redacts secrets/SAS URLs from every persisted model text surface and clears raw', () => {
    const input = copilotPayloadWithSecretsInModel();
    const original = structuredClone(input.payload.model);

    const persisted = buildPersistedCopilotReview(input);

    expect(persisted.payload.model.agentSettings.raw).toEqual({});
    expect(persisted.json).not.toContain(MODEL_SECRET_MARKER);
    expect(persisted.json).not.toContain('sig=model-secret');
    expect(persisted.json).toContain('[REDACTED]');

    // The runtime payload passed in must be untouched (no mutation).
    expect(input.payload.model).toEqual(original);
  });

  it('redacts agentSettings.instructions while preserving ordinary prose and URLs', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const instructions = persisted.payload.model.agentSettings.instructions;

    expect(instructions).not.toContain(MODEL_SECRET_MARKER);
    expect(instructions).toContain('[REDACTED]');
    // Multiple secret assignments in the same field must all be redacted.
    expect(instructions.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
    // Ordinary prose/URLs are left untouched.
    expect(instructions).toContain('Visit https://example.com/docs for reference.');
  });

  it('redacts tool displayName and description, preserving empty strings and undefined optionals', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [toolWithSecret, toolWithoutOptionalFields] = persisted.payload.model.tools;

    expect(toolWithSecret.displayName).not.toContain(MODEL_SECRET_MARKER);
    expect(toolWithSecret.displayName).toContain('[REDACTED]');
    expect(toolWithSecret.description).not.toContain(MODEL_SECRET_MARKER);

    // Optional fields that were never provided must stay undefined, not ''.
    expect(toolWithoutOptionalFields.displayName).toBeUndefined();
    // A field explicitly set to '' must remain '' (not turned into undefined).
    expect(toolWithoutOptionalFields.description).toBe('');
  });

  it('redacts connectedAgent description including mixed-case secret keys', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [agentWithSecret, agentWithoutOptionalFields] = persisted.payload.model.connectedAgents;

    expect(agentWithSecret.description).not.toContain(`${MODEL_SECRET_MARKER}-mixed-case`);
    expect(agentWithSecret.description).toContain('[REDACTED]');
    // Normal prose without a secret marker is untouched.
    expect(agentWithSecret.displayName).toBe('Connected Agent');

    expect(agentWithoutOptionalFields.displayName).toBeUndefined();
    expect(agentWithoutOptionalFields.description).toBeUndefined();
  });

  it('redacts skill markdown, body, frontmatterDescription, and frontmatterName; strips both SAS URL patterns', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [skillWithSecret, skillWithoutOptionalFields] = persisted.payload.model.skills;

    expect(skillWithSecret.markdown).not.toContain(MODEL_SECRET_MARKER);
    expect(skillWithSecret.markdown).not.toContain('blob.core.windows.net');
    expect(skillWithSecret.markdown).toContain('[URL-REDACTED]');
    expect(skillWithSecret.body).not.toContain(MODEL_SECRET_MARKER);
    expect(skillWithSecret.body).toContain('ordinary text https://example.com/help.');
    expect(skillWithSecret.frontmatterDescription).not.toContain(MODEL_SECRET_MARKER);
    // frontmatterName (maker-authored skill title, spec 013 §3): secret redacted,
    // ordinary prefix preserved.
    expect(skillWithSecret.frontmatterName).not.toContain(MODEL_SECRET_MARKER);
    expect(skillWithSecret.frontmatterName).toContain('[REDACTED]');
    expect(skillWithSecret.frontmatterName).toContain('Skill Title secret=');

    // Empty strings must remain empty strings, not undefined or truncated.
    expect(skillWithoutOptionalFields.markdown).toBe('');
    expect(skillWithoutOptionalFields.body).toBe('');
    expect(skillWithoutOptionalFields.frontmatterDescription).toBeUndefined();
    // frontmatterName was never provided: must stay undefined, not ''.
    expect(skillWithoutOptionalFields.frontmatterName).toBeUndefined();
  });

  it('redacts grader name and instructions, and label description/outcome, while keeping label name as an identifier', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [setWithGrader, setWithoutGraderDetails] = persisted.payload.model.evaluationSets;
    const [promptGrader, toolCallGrader, containsAnyGrader] = setWithGrader.graderDetails ?? [];

    expect(setWithGrader.displayName).not.toContain(MODEL_SECRET_MARKER);
    expect(promptGrader?.instructions).not.toContain(MODEL_SECRET_MARKER);
    // grader.name (spec 013 §3 AeGrader): maker-supplied on PromptGrader, so it
    // must be redacted like any other free-text field; ordinary prefix survives.
    expect(promptGrader?.name).not.toContain(MODEL_SECRET_MARKER);
    expect(promptGrader?.name).toContain('[REDACTED]');
    expect(promptGrader?.name).toContain('Correctness Judge secret=');
    expect(promptGrader?.labels?.[0].description).not.toContain(MODEL_SECRET_MARKER);
    expect(promptGrader?.labels?.[0].outcome).not.toContain(MODEL_SECRET_MARKER);
    // The second label never had description/outcome — must remain undefined.
    expect(promptGrader?.labels?.[1].description).toBeUndefined();
    expect(promptGrader?.labels?.[1].outcome).toBeUndefined();
    // label.name is the outcome bucket's identifier (e.g. "Pass"/"Fail"), not
    // maker prose — it must pass through unchanged. See report for rationale.
    expect(promptGrader?.labels?.[0].name).toBe('Pass');
    expect(promptGrader?.labels?.[1].name).toBe('Fail');

    // An ordinary (non-secret) grader.name must be preserved verbatim.
    expect(toolCallGrader?.name).toBe('target_tool_schema_name');
    // A grader with no `name` at all must stay undefined, not become ''.
    expect(containsAnyGrader?.name).toBeUndefined();

    expect(setWithoutGraderDetails.graderDetails).toBeUndefined();
  });

  it('redacts test-case input, expected, and expectedKeywords', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [caseWithSecret, caseWithoutOptionalFields] = persisted.payload.model.testCases;

    expect(caseWithSecret.input).not.toContain(MODEL_SECRET_MARKER);
    expect(caseWithSecret.expected).not.toContain(MODEL_SECRET_MARKER);
    expect(caseWithSecret.expectedKeywords?.[1]).not.toContain(MODEL_SECRET_MARKER);
    expect(caseWithSecret.expectedKeywords?.[0]).toBe('keyword-one');

    expect(caseWithoutOptionalFields.input).toBeUndefined();
    expect(caseWithoutOptionalFields.expected).toBeUndefined();
    expect(caseWithoutOptionalFields.expectedKeywords).toBeUndefined();
  });

  it('redacts unknown-kind warning text', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const [unknownKind] = persisted.payload.model.unknownKinds;
    expect(unknownKind.warning).not.toContain(MODEL_SECRET_MARKER);
    expect(unknownKind.warning).toContain('[REDACTED]');
  });

  it('redacts workflow tool text and keeps IQ capabilities and hooks', () => {
    const input = copilotPayloadWithSecretsInModel();
    input.payload.model.workflowTools = [{
      name: 'Look up order', schemaname: 'agent.tool.LookUpOrder', componentIdUnique: 'workflow-tool-1',
      displayName: `Look up order password="${MODEL_SECRET_MARKER}"`,
      description: `Calls a flow with secret="${MODEL_SECRET_MARKER}" inside.`,
      workflowId: '00000000-0000-0000-0000-000000000001', connectionMode: 'Invoker',
    }];
    input.payload.model.iqCapabilities = [{
      name: 'agent.iqCapability.mail_a1B', schemaname: 'agent.iqCapability.mail_a1B',
      componentIdUnique: 'iq-1', capability: 'mail', access: 'Write',
    }];
    input.payload.model.hooks = [{
      name: 'agent.tool.Onsessionstart', schemaname: 'agent.tool.Onsessionstart', componentIdUnique: 'hook-1',
      event: 'SessionStartHookEvent', action: 'WorkflowHookAction',
      workflowId: '00000000-0000-0000-0000-000000000002',
    }];

    const persisted = buildPersistedCopilotReview(input);
    const [workflowTool] = persisted.payload.model.workflowTools ?? [];

    expect(persisted.json).not.toContain(MODEL_SECRET_MARKER);
    expect(workflowTool.displayName).toContain('[REDACTED]');
    expect(workflowTool.description).toContain('[REDACTED]');
    expect(workflowTool.connectionMode).toBe('Invoker');
    expect(persisted.payload.model.iqCapabilities).toEqual(input.payload.model.iqCapabilities);
    expect(persisted.payload.model.hooks).toEqual(input.payload.model.hooks);
  });

  it('does not add the new component arrays to a model that has none', () => {
    const model = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel()).payload.model;

    expect('workflowTools' in model).toBe(false);
    expect('iqCapabilities' in model).toBe(false);
    expect('hooks' in model).toBe(false);
  });

  it('always clears raw to {} even when it contains deeply nested unknown values', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    expect(persisted.payload.model.agentSettings.raw).toEqual({});
    expect(Object.keys(persisted.payload.model.agentSettings.raw)).toHaveLength(0);
  });

  it('never mutates the runtime payload.model passed into buildPersistedCopilotReview', () => {
    const input = copilotPayloadWithSecretsInModel();
    const original = structuredClone(input.payload.model);

    buildPersistedCopilotReview(input);

    expect(input.payload.model).toEqual(original);
    // Sanity: confirm the original really still carries the raw secret so
    // this assertion isn't vacuously true.
    expect(input.payload.model.agentSettings.raw).not.toEqual({});
    expect(input.payload.model.agentSettings.instructions).toContain(MODEL_SECRET_MARKER);
  });

  it('produces an unrecoverable-secret export: re-serializing the persisted model alone omits the secret', () => {
    const persisted = buildPersistedCopilotReview(copilotPayloadWithSecretsInModel());
    const exportedModelJson = JSON.stringify(persisted.payload.model);
    expect(exportedModelJson).not.toContain(MODEL_SECRET_MARKER);
    expect(exportedModelJson).not.toContain('sig=model-secret');
  });

  it('sanitizes the model before the 900,000-character compaction pass runs', () => {
    // Reuse the existing compaction fixture (guarantees a real trim occurs)
    // but swap in the secret-laden model to prove sanitization isn't
    // incidentally skipped or undone while compaction mutates findings.
    const input = copilotPayloadWithRepeatedInfoEvidence(950_000);
    input.payload.model = modelWithSecretsEverywhere();

    const persisted = buildPersistedCopilotReview(input, 900_000);

    expect(persisted.json.length).toBeLessThanOrEqual(900_000);
    expect(persisted.json).not.toContain(MODEL_SECRET_MARKER);
    expect(persisted.payload.model.agentSettings.raw).toEqual({});
  });

  it('leaves the existing top-level finding and bundle sanitization behavior unchanged', () => {
    // Regression guard: model sanitization must not interfere with the
    // pre-existing finding/evidence/SAS sanitization paths.
    const persisted = buildPersistedCopilotReview(copilotPayloadWithDeepSecretEvidence());
    for (const f of persisted.payload.findings) {
      expect(f.fact).not.toContain('blob.core.windows.net');
      expect(f.fact.length).toBeLessThanOrEqual(160);
    }
    expect(persisted.payload.model).toBeDefined();
    expect(persisted.payload.model.agentSettings.raw).toEqual({});
  });
});
