/**
 * Evaluation Orchestrator — runs Stage B + C via PredictV2, then scores.
 *
 * Called by the GitHub Action after Stage A completes.
 * Reuses the same SPN OAuth token acquired for artifact download.
 */
import type { PatternEvaluation, InstructionEvaluation } from './predictV2Client.js';
import type { ScoreResult } from './scoreCalculator.js';
import type { LocalStageAOutput } from '../models/types.js';
/** Full evaluation result posted back to Power Automate */
export interface EvaluationResult {
    stageA: LocalStageAOutput;
    stageB?: PatternEvaluation;
    stageC?: InstructionEvaluation;
    scores: ScoreResult;
    errors: string[];
}
/** Multi-bot evaluation result */
export interface MultiEvaluationResult {
    agents: EvaluationResult[];
    overall: {
        passed: boolean;
        lowestScore: number;
        threshold: number;
        agentCount: number;
    };
}
/**
 * Run the full evaluation pipeline (Stage B + C + scoring).
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - SPN OAuth Bearer token
 * @param stageAOutput - Stage A output from local parsing
 * @param threshold - Quality gate threshold (default: 60)
 */
export declare function runEvaluation(dataverseHost: string, accessToken: string, stageAOutput: LocalStageAOutput, threshold?: number): Promise<EvaluationResult>;
