import type { FinalizationSnapshot } from './contracts.js';
import { JSON_SCHEMA, load } from 'js-yaml';
import { normalizeStandardIdentity } from '../contracts/StandardReview.js';
import { parseStandardTopic } from '../services/standardTopicParser.js';
import { standardTopicInputJson } from '../services/standardTopicEvaluation.js';

export function parseFinalizationSnapshot(
  value: unknown,
): FinalizationSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Finalization snapshot must be an object.');
  }

  const candidate = value as Partial<FinalizationSnapshot>;
  if (candidate.version !== 1) {
    throw new Error(`Unsupported finalization snapshot version: ${String(candidate.version)}.`);
  }
  if (candidate.coreVersion !== '0.1.0-modern-review.0') {
    throw new Error('Unsupported finalization snapshot coreVersion.');
  }
  if (candidate.sourceRevision !== '4fd618cd') {
    throw new Error('Unsupported finalization snapshot sourceRevision.');
  }
  if (!Array.isArray(candidate.bundles)) {
    throw new Error('Finalization snapshot bundles must be an array.');
  }
  const topics = candidate.model?.topics;
  if (topics !== undefined && !Array.isArray(topics)) {
    throw new Error('Finalization snapshot model topics must be an array.');
  }
  if (topics?.length && !Array.isArray(candidate.topics)) {
    throw new Error('Finalization snapshot is missing the Standard topic index.');
  }
  if (candidate.topics !== undefined) {
    if (!Array.isArray(candidate.topics) || !Array.isArray(topics)
        || candidate.topics.length !== topics.length
        || typeof candidate.model?.agentSettings?.instructions !== 'string') {
      throw new Error('Finalization snapshot Standard topics are inconsistent.');
    }
    const indices = new Set<number>(candidate.bundles.map(({ corpusComponent }, index) => corpusComponent.componentIndex ?? index));
    const identities = new Set<string>();
    for (const entry of candidate.topics) {
      const identity = entry && typeof entry.componentIdUnique === 'string'
        ? normalizeStandardIdentity(entry.componentIdUnique) : undefined;
      if (!entry || !Number.isInteger(entry.componentIndex) || entry.componentIndex < 0 || entry.componentIndex >= 1000
          || indices.has(entry.componentIndex) || !identity || identities.has(identity)
          || typeof entry.inputHash !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.inputHash)) {
        throw new Error('Finalization snapshot has an invalid Standard topic index, identity, or input hash.');
      }
      const matches = topics.filter(topic => topic && typeof topic.componentIdUnique === 'string'
        && normalizeStandardIdentity(topic.componentIdUnique) === identity);
      if (matches.length !== 1) {
        throw new Error('Finalization snapshot must retain exactly one original Standard component for each index.');
      }
      const topic = matches[0];
      if (typeof topic.name !== 'string' || typeof topic.componentId !== 'string'
          || typeof topic.schemaname !== 'string' || typeof topic.sourceText !== 'string'
          || (topic.sourceField !== 'data' && topic.sourceField !== 'content')) {
        throw new Error('Finalization snapshot has a malformed original Standard component.');
      }
      let reparsed;
      try {
        reparsed = parseStandardTopic({
          botcomponentid: topic.componentId, componentidunique: topic.componentIdUnique,
          botid: candidate.identity?.botId ?? '', componenttype: '9',
          name: topic.name, schemaname: topic.schemaname, description: topic.description,
          data: topic.sourceField === 'data' ? topic.sourceText : '',
          content: topic.sourceField === 'content' ? topic.sourceText : topic.componentContent ?? '',
        }, load(topic.sourceText, { schema: JSON_SCHEMA }));
      } catch (error) {
        throw new Error('Finalization snapshot has an invalid Standard source document.', { cause: error });
      }
      if (standardTopicInputJson(topic, entry.componentIndex, '', [])
          !== standardTopicInputJson(reparsed, entry.componentIndex, '', [])) {
        throw new Error('Finalization snapshot Standard source, document, and action inventory do not match.');
      }
      indices.add(entry.componentIndex);
      identities.add(identity);
    }
  }

  return candidate as FinalizationSnapshot;
}
