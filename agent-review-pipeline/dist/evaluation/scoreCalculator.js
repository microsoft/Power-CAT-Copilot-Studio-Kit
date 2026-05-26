/**
 * Score Calculator — deterministic scoring logic for agent reviews.
 *
 * Ported from CopilotStudioKit/src/features/agent-review-tool/utils/scoreCalculator.ts
 */
import { COMPLIANCE_CRITERIA, SEVERITY_POINTS, MAX_INSTRUCTION_POINTS, DEFAULT_THRESHOLD, } from './constants.js';
/**
 * Calculate pattern score from Stage B output.
 * Formula: (passing / total) × 100
 */
export function calculatePatternScore(evaluation) {
    if (!evaluation?.Patterns?.length)
        return 0;
    const total = evaluation.Patterns.length;
    const passing = evaluation.Patterns.filter((p) => p.Status === true).length;
    return Math.round((passing / total) * 100);
}
/**
 * Calculate instruction compliance score from Stage C output.
 * Uses severity-weighted scoring (High=3, Medium=2, Low=1).
 * A criterion passes if no issue ID starts with its prefix.
 */
export function calculateInstructionScore(evaluation) {
    if (!evaluation?.issues)
        return 0;
    // Missing instructions = all criteria fail = 0%
    if (evaluation.issues.some((i) => i.id === 'missing-instruction-input'))
        return 0;
    const issueIds = evaluation.issues.map((i) => i.id);
    const earnedPoints = COMPLIANCE_CRITERIA.reduce((sum, criterion) => {
        const failed = issueIds.some((id) => id.startsWith(criterion.id));
        return failed ? sum : sum + SEVERITY_POINTS[criterion.inherentSeverity];
    }, 0);
    return Math.round((earnedPoints / MAX_INSTRUCTION_POINTS) * 100);
}
/**
 * Calculate overall score and determine pass/fail.
 *
 * Formula: (patternScore × 0.5) + (instructionScore × 0.5)
 * If only one stage available, use that score alone.
 */
export function calculateScores(stageBResult, stageCResult, threshold = DEFAULT_THRESHOLD) {
    const patternScore = calculatePatternScore(stageBResult);
    const instructionScore = calculateInstructionScore(stageCResult);
    let overallScore;
    if (stageBResult && stageCResult) {
        overallScore = Math.round(patternScore * 0.5 + instructionScore * 0.5);
    }
    else if (stageBResult) {
        overallScore = patternScore;
    }
    else if (stageCResult) {
        overallScore = instructionScore;
    }
    else {
        overallScore = 0;
    }
    return {
        patternScore,
        instructionScore,
        overallScore,
        passed: overallScore >= threshold,
        threshold,
        stageBPatternCount: stageBResult?.Patterns?.length ?? 0,
        stageBPassingCount: stageBResult?.Patterns?.filter((p) => p.Status === true).length ?? 0,
        stageCIssueCount: stageCResult?.issues?.length ?? 0,
    };
}
