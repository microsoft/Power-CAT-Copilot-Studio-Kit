import { load } from 'js-yaml';
import type { BotComponent } from '../../../contracts/ServiceContracts';
import { classifyComponent } from '../../../utils/componentClassification';
import { recordValue } from '../../../utils/topicApplicability';
import type { EvaluationCaseAssertion, NormalizedEvaluationEvidence } from '../../contracts/EvaluationEvidence';
import type { UnifiedAvailability } from '../../contracts/UnifiedReview';
import { parseEvaluationCase, parseEvaluationSet, parseMultiTurnEvaluationCase } from '../AgentsExperienceParser';

export interface EvaluationCaptureOptions {
  source: 'live' | 'zip';
  availability?: UnifiedAvailability;
  expectedComponentCount?: number;
}

/** Normalize only evaluation evidence, sharing existing mappings without coercing either agent model. */
export function parseNormalizedEvaluationEvidence(
  components: readonly BotComponent[], options: EvaluationCaptureOptions,
): NormalizedEvaluationEvidence {
  const caseAssertions: EvaluationCaseAssertion[] = [];
  const result: NormalizedEvaluationEvidence = {
    evaluationSets: [], testCases: [], multiTurnCases: [],
    availability: options.availability ?? (options.source === 'zip' ? 'partial' : 'complete'),
    source: options.source, capturedComponentCount: components.length, evaluationComponentCount: 0,
    expectedComponentCount: options.expectedComponentCount, diagnostics: [], unlinkedCaseIds: [], caseAssertions,
  };
  const diagnostics: string[] = [];
  const incomplete = (reason: string) => {
    diagnostics.push(reason);
    if (result.availability !== 'unavailable') result.availability = 'partial';
  };
  if (options.availability === 'unavailable') {
    return { ...result, diagnostics: ['Evaluation evidence was unavailable at capture.'] };
  }
  if (options.expectedComponentCount !== undefined && options.expectedComponentCount !== components.length) {
    incomplete(`Expected ${options.expectedComponentCount} components but captured ${components.length}; completeness is not established.`);
  }
  const seen = new Set<string>();
  for (const component of components) {
    const raw = component.data?.trim() ? component.data : component.content;
    let doc: Record<string, unknown> | undefined;
    try { doc = recordValue(raw?.trim() ? load(raw) : undefined); }
    catch { /* Classification below distinguishes unresolved components from known non-evaluation metadata. */ }
    const kind = typeof doc?.kind === 'string' ? doc.kind : undefined;
    const category = classifyComponent(component, doc).category;
    const candidate = category === 'test' || kind === 'TestSetDefinition' || String(component.componenttype) === '19';
    if (!candidate) {
      if (!doc && category === 'unknown') incomplete(`Unreadable component ${component.botcomponentid || component.schemaname} could not be classified.`);
      continue;
    }
    result.evaluationComponentCount++;
    const id = component.botcomponentid || component.componentidunique || component.schemaname;
    if (!id || seen.has(id)) {
      incomplete(`Evaluation component identity is ${id ? `duplicated: ${id}` : 'missing'}.`);
      continue;
    }
    seen.add(id);
    if (!doc) {
      incomplete(`Evaluation component ${id} is unreadable.`);
      continue;
    }
    const rawParent = recordValue(component)?._parentbotcomponentid_value;
    const typedParent = component.parentbotcomponentid?.trim();
    const odataParent = typeof rawParent === 'string' ? rawParent.trim() : undefined;
    const conflictingParent = !!typedParent && !!odataParent && typedParent !== odataParent;
    const unreadableParent = rawParent !== undefined && rawParent !== null && typeof rawParent !== 'string';
    if (conflictingParent || unreadableParent) incomplete(`Evaluation component ${id} has conflicting or unreadable parent-set evidence.`);
    const linkedComponent = {
      ...component, parentbotcomponentid: conflictingParent || unreadableParent ? undefined : typedParent || odataParent,
    };
    if (kind === 'EvaluationSet' || kind === 'TestSetDefinition') {
      if (doc.graders !== undefined && (!Array.isArray(doc.graders)
        || doc.graders.some(g => typeof g === 'string' ? !g.trim() : typeof recordValue(g)?.kind !== 'string'))) {
        incomplete(`Evaluation set ${id} has unreadable grader configuration.`);
        continue;
      }
      result.evaluationSets.push(parseEvaluationSet(component, doc));
    } else if (kind === 'EvaluationData') {
      if (doc.rows !== undefined && !Array.isArray(doc.rows)) {
        incomplete(`Evaluation component ${id} has an unreadable rows collection.`);
        continue;
      }
      if (Array.isArray(doc.rows)) {
        doc.rows.forEach((rawRow, index) => {
          const row = recordValue(rawRow);
          if (!row || ['input', 'expectedOutput', 'expected'].some(field =>
            row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string')) {
            incomplete(`Evaluation row ${id}:${index} contains unreadable input/expected-response metadata.`);
            return;
          }
          // EvaluationData rows have no required row ID. Component + source-row offset is stable within this capture.
          const rowId = `${id}:row:${index}`;
          const mapped = parseEvaluationCase({
            ...linkedComponent, componentidunique: rowId,
            schemaname: `${component.schemaname || id}#row:${index}`,
            name: `${component.name} / row ${index + 1}`,
          }, { ...doc, rows: [row] });
          result.testCases.push(mapped);
        });
      } else if (recordValue(doc.source)) {
        const legacySource = recordValue(doc.source)!;
        if (['input', 'expected'].some(field => legacySource[field] !== undefined
          && legacySource[field] !== null && typeof legacySource[field] !== 'string')) {
          incomplete(`Legacy evaluation source ${id} has unreadable input/expected-response metadata.`);
        } else result.testCases.push(parseEvaluationCase(linkedComponent, doc));
      } else {
        incomplete(`EvaluationData ${id} has neither readable rows nor a supported legacy source.`);
      }
    } else if (kind === 'TestCaseDefinition') {
      const legacy = parseLegacyTranscript(linkedComponent, doc);
      if (!legacy) {
        incomplete(`Legacy transcript ${id} is not a supported single SendUserActivity with readable assertion metadata.`);
        continue;
      }
      result.testCases.push(legacy.testCase);
      caseAssertions.push(...legacy.assertions);
    } else if (kind === 'MultiTurnEvaluationCase') {
      if (!Array.isArray(doc.activities) || doc.activities.some(a => {
        const activity = recordValue(recordValue(a)?.activity);
        const text = activity?.text;
        return !activity || (text !== undefined && text !== null && typeof text !== 'string'
          && (!Array.isArray(text) || text.some(segment => typeof segment !== 'string')));
      })) {
        incomplete(`Conversation case ${id} has unreadable activities.`);
        continue;
      }
      const mapped = parseMultiTurnEvaluationCase(linkedComponent, doc);
      if (!mapped.input?.trim()) {
        incomplete(`Conversation case ${id} contains no readable user-turn input.`);
        continue;
      }
      result.testCases.push(mapped);
      result.multiTurnCases.push({ name: mapped.name, schemaname: mapped.schemaname });
    } else {
      incomplete(`Evaluation kind ${kind ?? '(absent)'} on ${id} is not supported by the shared evaluation mapping.`);
    }
  }
  const sets = new Set(result.evaluationSets.map(s => s.id).filter(Boolean));
  result.unlinkedCaseIds = result.testCases.filter(c => !c.setId || !sets.has(c.setId))
    .map(c => c.componentIdUnique || c.componentId || c.schemaname);
  if (result.unlinkedCaseIds.length) diagnostics.push('Some cases do not link to a uniquely captured evaluation set; set-specific checks will expose that limitation.');
  if (options.source === 'zip' && !result.evaluationComponentCount) {
    result.availability = 'unavailable';
    diagnostics.push('A ZIP without evaluation components cannot establish that the live agent has no evaluations.');
  }
  result.diagnostics = diagnostics;
  return result;
}

const legacyAssertionKinds = new Set([
  'CosineEmbeddingSimilarityAssertion', 'ContainsAllAssertion', 'ContainsAnyAssertion',
  'IntentMatchAssertion', 'AbstentionAssertion', 'RelevanceAssertion',
  'CompletenessAssertion', 'GroundednessAssertion',
]);

/** Adapt the observed legacy transcript shape, then delegate case construction to the existing mapper. */
function parseLegacyTranscript(component: BotComponent, doc: Record<string, unknown>) {
  const activities = recordValue(doc.transcriptDefinition)?.testActivities;
  if (!Array.isArray(activities) || activities.length !== 1) return undefined;
  const activity = recordValue(activities[0]);
  if (activity?.kind !== 'SendUserActivity' || typeof activity.activity !== 'string' || !activity.activity.trim()) return undefined;
  const rawAssertions = activity.activityAssertions ?? [];
  if (!Array.isArray(rawAssertions)) return undefined;
  const assertions: EvaluationCaseAssertion[] = [];
  for (const [index, rawAssertion] of rawAssertions.entries()) {
    const assertion = recordValue(rawAssertion);
    if (!assertion || typeof assertion.kind !== 'string' || !legacyAssertionKinds.has(assertion.kind)
      || (assertion.expectedResponse !== undefined && typeof assertion.expectedResponse !== 'string')
      || (assertion.expectedResponses !== undefined && (!Array.isArray(assertion.expectedResponses)
        || assertion.expectedResponses.some(value => typeof value !== 'string')))
      || (assertion.scoreThreshold !== undefined && (typeof assertion.scoreThreshold !== 'number' || !Number.isFinite(assertion.scoreThreshold)))) {
      return undefined;
    }
    assertions.push({
      componentId: component.botcomponentid || component.componentidunique || component.schemaname,
      fieldPath: `transcriptDefinition.testActivities[0].activityAssertions[${index}]`,
      kind: assertion.kind,
      expectedResponse: typeof assertion.expectedResponse === 'string' ? assertion.expectedResponse : undefined,
      expectedResponses: Array.isArray(assertion.expectedResponses) ? assertion.expectedResponses.filter((value): value is string => typeof value === 'string') : undefined,
      scoreThreshold: typeof assertion.scoreThreshold === 'number' ? assertion.scoreThreshold : undefined,
    });
  }
  // Intent targets and ContainsAny/All fragments are not full response references.
  const expected = assertions.filter(a => a.kind === 'CosineEmbeddingSimilarityAssertion')
    .map(a => a.expectedResponse).filter((value): value is string => value !== undefined).join('\n');
  return {
    testCase: parseEvaluationCase(component, {
      source: 'legacy-transcript', rows: [{ input: activity.activity, expectedOutput: expected || undefined }],
    }),
    assertions,
  };
}
