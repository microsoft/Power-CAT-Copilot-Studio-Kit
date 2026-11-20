import type { ReviewResult } from '../contracts/ReviewResult';
import {
  countReviewFindings, getAssessedInstructionIssues, getIssueCriterionId,
  getPatternAssessment, getPatternTopicAssessment, isFailedPattern,
  summarizePatternAssessments, summarizeInstructionAssessments,
} from './reviewAssessment';
import { getPatternSeverity } from './patternUtils';
import { projectSavedStandardReview } from './standardReviewProjection';

interface SarifLocation {
  physicalLocation: { artifactLocation: { uri: string } };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations?: SarifLocation[];
  properties?: Record<string, unknown>;
}

export interface SarifLog {
  version: '2.1.0';
  $schema: string;
  runs: Array<{
    tool: { driver: { name: string; version: string; informationUri: string } };
    results: SarifResult[];
    properties: Record<string, unknown>;
    invocations: Array<{
      executionSuccessful: boolean;
      toolExecutionNotifications: Array<{ level: 'warning'; message: { text: string } }>;
    }>;
  }>;
}

function severityLevel(severity?: 'High' | 'Medium' | 'Low'): 'error' | 'warning' | 'note' {
  return severity === 'High' ? 'error' : severity === 'Medium' ? 'warning' : 'note';
}

/** Export saved outcomes and item evidence without regrading history or implying complete coverage. */
export function generateSARIF(review: ReviewResult): SarifLog {
  const projection = projectSavedStandardReview(review);
  const patterns = projection.patternEvaluation;
  const instructions = projection.instructionEvaluation;
  if (review.stageBOutput && (!patterns || !Array.isArray(patterns.Patterns))) {
    throw new Error('Stored pattern assessment data is unreadable.');
  }
  if (review.stageCOutput && (!instructions || !Array.isArray(instructions.issues))) {
    throw new Error('Stored instruction assessment data is unreadable.');
  }
  const patternRows = patterns?.Patterns ?? [];
  for (const pattern of patternRows) {
    if (!pattern || typeof pattern.PatternName !== 'string' || typeof pattern.PatternId !== 'string'
      || !Array.isArray(pattern.Topics) || pattern.Topics.some(t => !t || typeof t.item !== 'string')) {
      throw new Error('Stored pattern or component details are unreadable.');
    }
  }
  const patternSummary = summarizePatternAssessments(patternRows);
  const instructionSummary = summarizeInstructionAssessments(instructions ?? undefined);
  const completed = patternSummary.completed + instructionSummary.completed;
  const incomplete = !patterns || !instructions || patternSummary.notAssessed > 0
    || instructionSummary.notAssessed > 0 || patternRows.length === 0
    || patternRows.some(pattern => pattern.Topics.some(topic =>
      getPatternTopicAssessment(getPatternAssessment(pattern), topic) === 'not-assessed'));
  const notes: string[] = [];
  if (!patterns) notes.push('Pattern assessment data is unavailable.');
  if (!instructions) notes.push('Instruction assessment data is unavailable.');
  if (incomplete) notes.push('Some checks or referenced settings were not assessed. An empty findings list does not establish a passing review.');
  if (!completed) notes.push('No applicable checks were completed.');

  const results: SarifResult[] = patternRows.filter(isFailedPattern).map(pattern => {
    const affected = pattern.Topics.filter(topic => getPatternTopicAssessment('fail', topic) === 'fail');
    return {
      ruleId: pattern.PatternId,
      level: severityLevel(getPatternSeverity(pattern.PatternName)),
      message: { text: `${pattern.PatternName}: ${pattern.Description ?? pattern.PatternDescription ?? ''}` },
      locations: affected.map(topic => ({
        physicalLocation: {
          artifactLocation: { uri: `copilot://topics/${encodeURIComponent(topic.componentId ?? topic.schemaName ?? topic.item)}` },
        },
      })),
      properties: {
        category: pattern.Category ?? 'Pattern',
        assessmentStatus: 'fail', evidenceKind: pattern.EvidenceKind,
        recommendation: pattern.Recommendation,
        affectedTopics: affected.map(topic => topic.item),
        affectedSettings: affected, recordedReferences: pattern.Topics,
      },
    };
  });
  for (const issue of getAssessedInstructionIssues(instructions ?? undefined)) {
    if (typeof issue.id !== 'string' || typeof issue.title !== 'string' || typeof issue.description !== 'string') {
      throw new Error('Stored instruction finding details are unreadable.');
    }
    results.push({
      ruleId: getIssueCriterionId(issue) ?? issue.id,
      level: severityLevel(issue.severity),
      message: { text: `${issue.title}: ${issue.description}` },
      properties: {
        category: 'Compliance', assessmentStatus: 'fail',
        recommendation: issue.recommendation, criteriaId: getIssueCriterionId(issue),
        evidence: issue.evidence, coverage: issue.coverage, uncoveredSituation: issue.uncoveredSituation,
      },
    });
  }
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: {
        name: 'Copilot Studio Agent Review Tool', version: '1.0.0',
        informationUri: 'https://learn.microsoft.com/copilot-studio',
      } },
      results,
      properties: {
        assessmentStatus: !completed ? 'not-assessed' : incomplete ? 'partial' : 'complete',
        patternAssessment: patternSummary, instructionAssessment: instructionSummary,
        savedScores: projection.scores,
        assessmentPolicyVersion: review.assessmentPolicyVersion ?? 'legacy-unknown',
        findingCounts: countReviewFindings(patternRows, instructions ?? undefined),
        countUnit: 'Failed pattern categories plus assessed instruction issues, not criterion rows or affected settings.',
        executionScope: 'Configuration and instruction review only. Agent conversations and dependencies were not executed.',
      },
      invocations: [{
        executionSuccessful: completed > 0 && !incomplete,
        toolExecutionNotifications: notes.map(text => ({ level: 'warning', message: { text } })),
      }],
    }],
  };
}
