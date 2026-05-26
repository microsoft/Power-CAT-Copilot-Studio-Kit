/**
 * Evaluation Orchestrator — runs Stage B + C via PredictV2, then scores.
 *
 * Called by the GitHub Action after Stage A completes.
 * Reuses the same SPN OAuth token acquired for artifact download.
 */
import { invokeStageB, invokeStageC } from './predictV2Client.js';
import { calculateScores } from './scoreCalculator.js';
/**
 * Run the full evaluation pipeline (Stage B + C + scoring).
 *
 * @param dataverseHost - Dataverse host (e.g., org.crm.dynamics.com)
 * @param accessToken - SPN OAuth Bearer token
 * @param stageAOutput - Stage A output from local parsing
 * @param threshold - Quality gate threshold (default: 60)
 */
export async function runEvaluation(dataverseHost, accessToken, stageAOutput, threshold) {
    const errors = [];
    let stageBResult;
    let stageCResult;
    // Prepare Stage B payload (topicComponents filtered to those with content)
    const topicComponents = stageAOutput.topicComponents ?? [];
    const stageBPayload = JSON.stringify({
        Components: {
            Topics: topicComponents.filter((t) => t.ModelName?.trim() || t.ModelDescription?.trim()),
        },
    });
    // Run Stage B: Pattern Evaluation
    try {
        console.log('[Stage B] Invoking PredictV2...');
        stageBResult = await invokeStageB(dataverseHost, accessToken, stageBPayload);
        // Filter out patterns not applicable for pipeline ZIP reviews (same as Code App)
        if (stageBResult.Patterns) {
            stageBResult.Patterns = stageBResult.Patterns.filter((p) => p.PatternName !== 'Missing Trigger Phrases' && p.PatternName !== 'Inadequate Test Cases');
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Stage B] Failed: ${msg}`);
        errors.push(`Stage B failed: ${msg}`);
    }
    // Merge local patterns (Stage A deterministic checks) into Stage B results
    if (stageAOutput.localPatterns?.length) {
        const localAsPatterns = stageAOutput.localPatterns.map((lp) => ({
            PatternName: lp.patternName,
            Status: lp.status,
            Category: lp.category,
            Severity: lp.severity,
            Recommendation: lp.recommendation,
            Topics: lp.topics?.length ? lp.topics.map((t) => ({ item: t })) : undefined,
        }));
        if (!stageBResult) {
            stageBResult = { Patterns: localAsPatterns };
        }
        else {
            stageBResult.Patterns = [...(stageBResult.Patterns ?? []), ...localAsPatterns];
        }
    }
    if (stageBResult?.Patterns) {
        const passing = stageBResult.Patterns.filter((p) => p.Status === true).length;
        console.log(`[Stage B] Total patterns (AI + local): ${passing}/${stageBResult.Patterns.length} passing`);
    }
    // Run Stage C: Instruction Compliance
    if (stageAOutput.agentInstructions?.trim()) {
        try {
            console.log('[Stage C] Invoking PredictV2...');
            stageCResult = await invokeStageC(dataverseHost, accessToken, stageAOutput.agentInstructions);
            console.log(`[Stage C] Complete: ${stageCResult.issues?.length ?? 0} issues found`);
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[Stage C] Failed: ${msg}`);
            errors.push(`Stage C failed: ${msg}`);
        }
    }
    else {
        console.log('[Stage C] Skipped — no agent instructions found');
        errors.push('Stage C skipped: no agent instructions in solution');
    }
    // Calculate scores
    const scores = calculateScores(stageBResult, stageCResult, threshold);
    console.log(`[Scoring] Pattern: ${scores.patternScore}%, Instruction: ${scores.instructionScore}%, Overall: ${scores.overallScore}% (threshold: ${scores.threshold}%) → ${scores.passed ? 'PASSED' : 'FAILED'}`);
    return {
        stageA: stageAOutput,
        stageB: stageBResult,
        stageC: stageCResult,
        scores,
        errors,
    };
}
