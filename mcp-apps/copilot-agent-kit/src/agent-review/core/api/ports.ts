import type {
  InstructionCoverageResult,
} from '../contracts/AiCoverage.js';
import type {
  OrchestrationPromptPayload,
} from '../services/skill/SkillPromptPayloadBuilder.js';
import type {
  OrchestrationValidationResult,
} from '../services/skill/SkillEvaluationValidator.js';
import type { Guid } from './contracts.js';

export interface ReviewClock {
  now(): Date;
}

export interface ReviewIdPort {
  randomUUID(): Guid;
}

export interface ReviewHashPort {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface ReviewFallbackAiPort {
  invokeCrossSkillOrchestrator(
    payload: OrchestrationPromptPayload,
    knownSkills: string[],
    sourceCorpus: string,
  ): Promise<OrchestrationValidationResult>;
  invokeInstructionCoverage(
    instructions: string,
    capabilityNamesJson: string,
  ): Promise<InstructionCoverageResult>;
}

export interface PrepareReviewPorts {
  clock: ReviewClock;
  ids: ReviewIdPort;
  hash: ReviewHashPort;
}

export interface ReadWorkflowResultsPorts {
  fallbackAi?: ReviewFallbackAiPort;
  hash?: ReviewHashPort;
}
