import type { InstructionCoverageResult } from '../contracts/AiCoverage.js';
import type {
  CrossSkillOrchestrationEvaluation,
} from '../contracts/SkillEvaluation.js';
import {
  ReviewJobError,
} from '../contracts/ReviewJob.js';
import { collectConfiguredCapabilities } from '../services/jobs/reviewCorpusBuilder.js';
import {
  AGENT_LEVEL_INDEX,
  reduceWorkflowResultRows,
  toStandardEvaluation,
} from '../services/jobs/workflowResultRows.js';
import { classifyFailure } from '../services/jobs/reviewJobPolling.js';
import {
  validateInstructionCoverage,
} from '../services/skill/InstructionCoverageValidator.js';
import {
  buildOrchestrationPromptInput,
} from '../services/skill/SkillPromptPayloadBuilder.js';
import {
  validateOrchestrationEvaluation,
  validateStandardEvaluation,
  type OrchestrationValidationResult,
  type StandardValidationResult,
} from '../services/skill/SkillEvaluationValidator.js';
import type {
  FinalizationSnapshot,
  NormalizedWorkflowResults,
  ReadWorkflowResultsInput,
  WorkflowStageResult,
} from './contracts.js';
import type { ReadWorkflowResultsPorts } from './ports.js';
import { standardTopicInputJson, validateStandardTopicResult } from '../services/standardTopicEvaluation.js';
import { normalizeStandardIdentity } from '../contracts/StandardReview.js';
import type { AeStandardTopic } from '../contracts/AgentsExperienceModel.js';
import { parseFinalizationSnapshot } from './finalizationSnapshot.js';

const skillResultIdentity = Symbol('skillResultIdentity');

type IdentifiedStandardValidationResult = StandardValidationResult & {
  [skillResultIdentity]?: string;
};

export function getWorkflowSkillResultIdentity(
  result: StandardValidationResult,
): string | undefined {
  return (result as IdentifiedStandardValidationResult)[skillResultIdentity];
}

function sourceCorpusForBundle(
  snapshot: FinalizationSnapshot,
  bundleIndex: number,
): string {
  const component = snapshot.bundles[bundleIndex]?.corpusComponent;
  if (!component) return '';
  return [
    component.skill_markdown,
    ...component.resource_excerpts.map((excerpt) => excerpt.content),
  ].join('\n\n');
}

function orchestrationContext(snapshot: FinalizationSnapshot): {
  knownSkills: string[];
  sourceCorpus: string;
} {
  return {
    knownSkills: snapshot.bundles.map(
      ({ bundle }) => bundle.skillName,
    ),
    sourceCorpus: snapshot.bundles
      .map(({ corpusComponent }) => corpusComponent.skill_markdown)
      .join('\n\n'),
  };
}

function missingReason(
  input: ReadWorkflowResultsInput,
  index: number,
): 'missing-row' | 'malformed-row' {
  return input.rows.some(
    (row) => row.cat_componentindex === index,
  ) ? 'malformed-row' : 'missing-row';
}

async function normalizeOrchestration(
  input: ReadWorkflowResultsInput,
  ports: ReadWorkflowResultsPorts | undefined,
  raw: unknown | undefined,
): Promise<WorkflowStageResult<OrchestrationValidationResult>> {
  const { knownSkills, sourceCorpus } = orchestrationContext(input.snapshot);
  if (raw !== undefined) {
    try {
      return {
        state: 'complete',
        value: validateOrchestrationEvaluation(
          raw as CrossSkillOrchestrationEvaluation,
          knownSkills,
          sourceCorpus,
        ),
      };
    } catch {
      // Explicit fallback policy below decides whether malformed data may retry.
    }
  }

  if (
    input.missingAiStagePolicy === 'fallback'
    && ports?.fallbackAi
  ) {
    try {
      const fallback = await ports.fallbackAi.invokeCrossSkillOrchestrator(
        buildOrchestrationPromptInput(
          input.snapshot.bundles.map(
            ({ bundle }) => bundle,
          ) as unknown as import('../contracts/SkillBundle.js').SkillBundle[],
          input.snapshot.model.agentSettings.instructions,
        ),
        knownSkills,
        sourceCorpus,
      );
      return {
        state: 'complete',
        value: validateOrchestrationEvaluation(
          fallback.evaluation,
          knownSkills,
          sourceCorpus,
        ),
      };
    } catch {
      return { state: 'failed', reason: 'fallback-failed' };
    }
  }

  return {
    state: 'unavailable',
    reason: missingReason(input, AGENT_LEVEL_INDEX.ORCHESTRATION),
  };
}

async function normalizeInstructionCoverage(
  input: ReadWorkflowResultsInput,
  ports: ReadWorkflowResultsPorts | undefined,
  raw: unknown | undefined,
): Promise<WorkflowStageResult<InstructionCoverageResult>> {
  const instructions = input.snapshot.model.agentSettings.instructions;
  if (raw !== undefined) {
    try {
      return {
        state: 'complete',
        value: validateInstructionCoverage(
          raw as InstructionCoverageResult,
          instructions,
        ),
      };
    } catch {
      // Explicit fallback policy below decides whether malformed data may retry.
    }
  }

  if (
    input.missingAiStagePolicy === 'fallback'
    && ports?.fallbackAi
  ) {
    try {
      const fallback = await ports.fallbackAi.invokeInstructionCoverage(
        instructions,
        JSON.stringify(collectConfiguredCapabilities(input.snapshot.model)),
      );
      return {
        state: 'complete',
        value: validateInstructionCoverage(fallback, instructions),
      };
    } catch {
      return { state: 'failed', reason: 'fallback-failed' };
    }
  }

  return {
    state: 'unavailable',
    reason: missingReason(
      input,
      AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE,
    ),
  };
}

export async function readWorkflowResults(
  input: ReadWorkflowResultsInput,
  ports?: ReadWorkflowResultsPorts,
): Promise<NormalizedWorkflowResults> {
  if (
    input.missingAiStagePolicy === 'fallback'
    && !ports?.fallbackAi
  ) {
    throw new Error(
      'missingAiStagePolicy "fallback" requires a fallbackAi port.',
    );
  }

  parseFinalizationSnapshot(input.snapshot);
  const expectedTopics = new Map<number, { topic: AeStandardTopic; inputHash: string }>();
  for (const expected of input.snapshot.topics ?? []) {
    const topic = input.snapshot.model.topics?.find(topic =>
      normalizeStandardIdentity(topic.componentIdUnique) === normalizeStandardIdentity(expected.componentIdUnique));
    if (!topic || !ports?.hash) {
      throw new ReviewJobError('malformed-output', 'The Standard finalization snapshot requires its original component and a hash port.');
    }
    const hash = await ports.hash.sha256(new TextEncoder().encode(standardTopicInputJson(
      topic, expected.componentIndex, input.snapshot.model.agentSettings.instructions,
      collectConfiguredCapabilities(input.snapshot.model),
    )));
    if (hash.toLowerCase() !== expected.inputHash.toLowerCase()) {
      throw new ReviewJobError('malformed-output', 'The Standard finalization snapshot input hash does not match its retained evaluator context.');
    }
    expectedTopics.set(expected.componentIndex, { topic, inputHash: expected.inputHash });
  }
  const reduced = reduceWorkflowResultRows(input.rows, {
    correlationId: input.job.correlationId, topics: expectedTopics,
  });
  const skillResults: StandardValidationResult[] = [];
  const orderedComponents = [...reduced.components].sort((left, right) => {
    const leftIndex = left.row.cat_componentindex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.row.cat_componentindex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

  for (const component of orderedComponents) {
    const index = component.row.cat_componentindex;
    const bundleIndex = index === undefined || index === null
      ? input.snapshot.bundles.findIndex(
          ({ bundle }) => bundle.skillName === component.result.skillName,
        )
      : input.snapshot.bundles.findIndex(({ corpusComponent }, bundleIndex) =>
          (corpusComponent.componentIndex ?? bundleIndex) === index);
    const bundle = input.snapshot.bundles[bundleIndex];
    if (!bundle) continue;
    const validated = validateStandardEvaluation(
      toStandardEvaluation(
        component.result,
        sourceCorpusForBundle(input.snapshot, bundleIndex),
      ),
      sourceCorpusForBundle(input.snapshot, bundleIndex),
      bundle.deterministicFindings,
    ) as IdentifiedStandardValidationResult;
    Object.defineProperty(validated, skillResultIdentity, {
      value: bundle.bundle.skillSchemaName,
      enumerable: false,
    });
    skillResults.push(validated);
  }

  const topicResults = [...expectedTopics.entries()].map(([index, expected]) => {
    const selected = reduced.topics.find(component => component.row.cat_componentindex === index);
    const rejected = reduced.rejectedRows.find(row => row.componentIndex === index);
    return validateStandardTopicResult(expected.topic, expected.inputHash, selected?.result ?? null,
      rejected?.reason ?? 'The Standard evaluator result is missing or malformed.');
  });

  if (input.job.status === 'failed' && skillResults.length === 0
      && !topicResults.some(result => result.status !== 'unavailable')) {
    throw new ReviewJobError(
      classifyFailure(input.job.errorMessage ?? undefined),
      input.job.errorMessage
        ?? 'The review workflow reported a failure.',
    );
  }

  const orchestrationRaw = reduced.stages.get(
    AGENT_LEVEL_INDEX.ORCHESTRATION,
  )?.value;
  const instructionRaw = reduced.stages.get(
    AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE,
  )?.value;

  return {
    jobId: input.job.jobId,
    correlationId: input.job.correlationId,
    completedAt: input.job.completedAt,
    disposition: input.job.status === 'failed' || topicResults.some(result => result.status !== 'complete')
      ? 'salvaged-partial'
      : 'complete',
    skillResults,
    ...(topicResults.length ? { topicResults } : {}),
    orchestration: await normalizeOrchestration(
      input,
      ports,
      orchestrationRaw,
    ),
    instructionCoverage: await normalizeInstructionCoverage(
      input,
      ports,
      instructionRaw,
    ),
    discardedDuplicateItemIds:
      reduced.discardedDuplicateItemIds as unknown as NormalizedWorkflowResults[
        'discardedDuplicateItemIds'
      ],
    rejectedRows: reduced.rejectedRows as unknown as NormalizedWorkflowResults[
      'rejectedRows'
    ],
  };
}
