import type { BotComponent } from '../contracts/BotComponent.js';
import type {
  RetrievalIssue,
  SkillBundle,
  SkillBundleResource,
} from '../contracts/SkillBundle.js';
import {
  prepareDeterministicReview,
} from '../services/CopilotReviewService.js';
import {
  buildReviewCorpus,
} from '../services/jobs/reviewCorpusBuilder.js';
import {
  computeDeterministicFindingsByBundle,
} from '../services/SkillBundleReviewService.js';
import {
  assembleSkillBundle,
} from '../services/skill/bundleAssembler.js';
import {
  sanitizeModelForPersistence,
} from '../services/skill/persistedSkillReview.js';
import {
  normalizeResource,
} from '../services/skill/resourceNormalizer.js';
import { redactSecrets } from '../services/skill/resourceScanners.js';
import { normalizeStandardIdentity, ReviewSourceError } from '../contracts/StandardReview.js';
import { standardTopicInputJson } from '../services/standardTopicEvaluation.js';
import {
  isStandardTopicComponent, type StandardTopicCorpusComponent,
} from '../contracts/ReviewJob.js';
import { collectConfiguredCapabilities } from '../services/jobs/reviewCorpusBuilder.js';
import { estimateTokens, STANDARD_TOKEN_CEILING } from '../services/skill/tokenBudget.js';
import type {
  FinalizationBundleSnapshot,
  FinalizationSnapshot,
  PrepareReviewInput,
  PreparedReview,
  ReviewSourceSnapshot,
} from './contracts.js';
import type { PrepareReviewPorts } from './ports.js';
import { parseFinalizationSnapshot } from './finalizationSnapshot.js';

const CORE_VERSION = '0.1.0-modern-review.0' as const;
const SOURCE_REVISION = '4fd618cd' as const;

function sameIdentifier(left: string, right: string): boolean {
  return left.replace(/[{}]/g, '').toLowerCase()
    === right.replace(/[{}]/g, '').toLowerCase();
}

function parentComponent(
  input: PrepareReviewInput,
  skill: ReturnType<typeof prepareDeterministicReview>['model']['skills'][number],
): BotComponent {
  const data = JSON.stringify({ content: skill.markdown });
  return {
    botcomponentid: skill.componentId,
    botid: input.botId,
    componenttype: '9',
    content: data,
    data,
    name: skill.name,
    componentidunique: skill.componentIdUnique,
    schemaname: skill.schemaname,
  };
}

function stripResourceContent(
  resource: SkillBundleResource,
): Omit<SkillBundleResource, 'textContent' | 'chunks'> {
  const {
    textContent: _textContent,
    chunks: _chunks,
    ...metadata
  } = resource;
  return metadata;
}

function redactSnapshotStrings<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(redactSnapshotStrings) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        redactSnapshotStrings(child),
      ]),
    ) as T;
  }
  return value;
}

async function assembleBundles(
  input: PrepareReviewInput,
  source: ReviewSourceSnapshot,
  ports: PrepareReviewPorts,
  model: ReturnType<typeof prepareDeterministicReview>['model'],
): Promise<SkillBundle[]> {
  const bundles: SkillBundle[] = [];
  const zipSkills = model.skills.filter(
    (skill) => skill.source === 'zip-bundle',
  );

  for (const skill of model.skills) {
    if (!skill.componentId) continue;
    let resources = source.resources.filter(({ row }) =>
      sameIdentifier(row.parentbotcomponentid, skill.componentId)
      || sameIdentifier(row.parentbotcomponentid, skill.componentIdUnique),
    );
    if (
      resources.length === 0
      && skill.source === 'zip-bundle'
      && zipSkills.length === 1
    ) {
      resources = [...source.resources];
    }

    const normalized: SkillBundleResource[] = [];
    const issues: RetrievalIssue[] = [];
    for (const resource of resources) {
      try {
        normalized.push(await normalizeResource(
          resource.row,
          resource.bytes,
          ports.hash,
        ));
      } catch (error) {
        issues.push({
          code: 'resource-normalization-failed',
          message: `Could not read "${resource.row.name}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          resourcePath: resource.row.name,
          severity: 'error',
        });
      }
    }

    const assembled = await assembleSkillBundle(
      parentComponent(input, skill),
      normalized,
      {
        agentInstructions: model.agentSettings.instructions,
        siblingDescriptions: model.skills
          .filter((sibling) => sibling.schemaname !== skill.schemaname)
          .map((sibling) => ({
            name: sibling.frontmatterName ?? sibling.name,
            description: sibling.frontmatterDescription,
          })),
      },
      ports.hash,
    );
    assembled.retrievalIssues.push(...issues);
    bundles.push(assembled);
  }
  return bundles;
}

export async function prepareReview(
  input: PrepareReviewInput,
  source: ReviewSourceSnapshot,
  ports: PrepareReviewPorts,
): Promise<PreparedReview> {
  const deterministic = prepareDeterministicReview(
    source.configuration,
    source.components,
  );
  if (deterministic.model.harness === 'standard') {
    const invalid = deterministic.model.unknownKinds[0];
    if (invalid) {
      throw new ReviewSourceError(invalid.errorCode ?? 'UNSUPPORTED_COMPONENT',
        `Cannot review "${invalid.schemaname}": ${invalid.warning}`);
    }
    const identities = new Set<string>();
    const componentIds = new Set<string>();
    for (const component of [...(deterministic.model.topics ?? []), ...deterministic.model.skills]) {
      const identity = normalizeStandardIdentity(component.componentIdUnique ?? '');
      const id = normalizeStandardIdentity(component.componentId ?? '');
      if (!identity || !id || identities.has(identity) || componentIds.has(id)) {
        throw new ReviewSourceError('INVALID_SOURCE', `Standard component "${component.name}" has an invalid or duplicated identity.`);
      }
      identities.add(identity);
      componentIds.add(id);
    }
    if (!(deterministic.model.topics?.length || deterministic.model.skills.length)) {
      throw new ReviewSourceError('UNSUPPORTED_COMPONENT', 'The Standard agent has no supported reviewable components.');
    }
  }
  const bundles = await assembleBundles(
    input,
    source,
    ports,
    deterministic.model,
  );
  const findingsByBundle = computeDeterministicFindingsByBundle(bundles);
  const correlationId = ports.ids.randomUUID();
  const generatedOn = ports.clock.now().toISOString();
  const corpus = buildReviewCorpus(
    bundles,
    findingsByBundle,
    deterministic.model,
    {
      correlationId,
      botId: input.botId,
      botName: input.botName,
      sourceEnvironment: input.sourceEnvironmentName,
      generatedOn,
    },
  );
  const skillComponents = corpus.components.filter(component => !isStandardTopicComponent(component));
  const safeModel = sanitizeModelForPersistence(deterministic.model);
  const model = safeModel.harness === 'standard' ? redactSnapshotStrings(safeModel) : safeModel;
  const topics: StandardTopicCorpusComponent[] = [];
  const configuredCapabilities = collectConfiguredCapabilities(model);
  for (const topic of model.topics ?? []) {
    const componentIndex = corpus.components.length + topics.length;
    const component: StandardTopicCorpusComponent = {
      ...topic,
      evaluationType: 'StandardTopic', contractVersion: 1,
      componentIndex,
      inputHash: await ports.hash.sha256(new TextEncoder().encode(standardTopicInputJson(
        topic, componentIndex, model.agentSettings.instructions, configuredCapabilities,
      ))),
      agent_instructions: model.agentSettings.instructions,
      configuredCapabilities,
    };
    if (estimateTokens(component) > STANDARD_TOKEN_CEILING) {
      throw new ReviewSourceError('SOURCE_TOO_LARGE',
        `Standard component "${topic.name}" exceeds the evaluator input budget. No topic content was removed.`);
    }
    topics.push(component);
  }
  corpus.components.push(...topics);
  corpus.review.componentCount = corpus.components.length;
  if (corpus.components.length > 1000) {
    throw new ReviewSourceError('SOURCE_TOO_LARGE', 'The review exceeds the 1,000-component result-index range (0 through 999).');
  }

  const bundleSnapshots: FinalizationBundleSnapshot[] = bundles.map(
    (bundle, index) => ({
      bundle: {
        ...bundle,
        resources: bundle.resources.map(stripResourceContent),
      },
      resourceStats: bundle.resources.map((resource) => ({
        resourceId: resource.id,
        textLength: resource.textContent?.length ?? 0,
        chunkCount: resource.chunks.length,
        isEmpty:
          resource.textContent !== undefined
          && resource.textContent.trim().length === 0,
      })),
      corpusComponent: skillComponents[index],
      deterministicFindings:
        findingsByBundle.get(bundle.skillSchemaName) ?? [],
    }),
  );

  const finalizationSnapshot = redactSnapshotStrings<FinalizationSnapshot>({
    version: 1,
    coreVersion: CORE_VERSION,
    sourceRevision: SOURCE_REVISION,
    startedAt: input.startedAt,
    identity: {
      botId: input.botId,
      botName: input.botName,
      componentIdUnique: input.componentIdUnique,
      sourceEnvironmentId: input.sourceEnvironmentId,
      sourceEnvironmentName: input.sourceEnvironmentName,
    },
    model,
    deterministic: {
      findings: deterministic.findings,
      ruleResults: deterministic.deterministicResults,
      coverage: deterministic.coverage.rows.map((row) => ({
        name: row.name,
        kind: row.kind,
        cases: row.cases,
      })),
      coverageBasis: deterministic.coverage.basis,
      coverageSets: deterministic.coverage.sets,
    },
    bundles: bundleSnapshots,
    ...(topics.length ? {
      topics: topics.map(topic => ({
        componentIndex: topic.componentIndex,
        componentIdUnique: topic.componentIdUnique,
        inputHash: topic.inputHash,
      })),
    } : {}),
  });
  if (topics.length && JSON.stringify(finalizationSnapshot.model).length > 900_000) {
    throw new ReviewSourceError('SOURCE_TOO_LARGE',
      'The complete Standard model exceeds the saved-review budget. No reviewed source was removed.');
  }
  if (topics.length) {
    try {
      parseFinalizationSnapshot(finalizationSnapshot);
    } catch (error) {
      const failure = new ReviewSourceError('INVALID_SOURCE',
        'The complete Standard source cannot be retained safely in its finalization snapshot.');
      failure.cause = error;
      throw failure;
    }
  }

  return {
    correlationId,
    componentCount: corpus.components.length,
    corpus: {
      ...corpus,
      finalizationSnapshot,
    },
  };
}

export async function prepareAgentMap(
  input: PrepareReviewInput, source: ReviewSourceSnapshot, ports: PrepareReviewPorts,
) {
  const deterministic = prepareDeterministicReview(source.configuration, source.components);
  const bundles = await assembleBundles(input, source, ports, deterministic.model);
  const corpus = buildReviewCorpus(
    bundles, computeDeterministicFindingsByBundle(bundles), deterministic.model,
    {
      correlationId: ports.ids.randomUUID(), botId: input.botId, botName: input.botName,
      sourceEnvironment: input.sourceEnvironmentName, generatedOn: ports.clock.now().toISOString(),
    },
  );
  return { model: sanitizeModelForPersistence(deterministic.model), corpusComponents: corpus.components };
}
