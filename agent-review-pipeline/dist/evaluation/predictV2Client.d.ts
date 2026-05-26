/**
 * PredictV2 Client — calls AI Builder custom prompts via Dataverse unbound action.
 *
 * Uses the same SPN OAuth token already acquired for artifact download.
 */
/** Stage B response: list of patterns with pass/fail status */
export interface PatternEvaluation {
    Patterns: Array<{
        PatternName: string;
        Status: boolean;
        Category?: string;
        Severity?: string;
        Recommendation?: string;
        /** Affected topics — AI returns as {item: string}[], local patterns as string[] */
        Topics?: Array<{
            item: string;
        }> | string[];
    }>;
    PatternCompliancePercentage?: number;
}
/** Stage C response: instruction compliance issues */
export interface InstructionEvaluation {
    compliancePercentage: number;
    issues: Array<{
        id: string;
        title: string;
        severity: string;
        description: string;
    }>;
}
/**
 * Invoke Stage B: Pattern Evaluation
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - OAuth Bearer token
 * @param botComponentsJson - Stage A output stringified (topicComponents)
 */
export declare function invokeStageB(dataverseHost: string, accessToken: string, botComponentsJson: string): Promise<PatternEvaluation>;
/**
 * Invoke Stage C: Instruction Compliance
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - OAuth Bearer token
 * @param agentInstructions - Raw agent instructions text
 */
export declare function invokeStageC(dataverseHost: string, accessToken: string, agentInstructions: string): Promise<InstructionEvaluation>;
