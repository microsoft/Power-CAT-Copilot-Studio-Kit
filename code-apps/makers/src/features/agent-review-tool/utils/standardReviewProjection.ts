import type { ReviewResult } from '../contracts/ReviewResult';
import type { PillarBreakdown } from '../agents-experience/services/scoring';
import type { InstructionEvaluation, LocalStageAOutput, PatternEvaluation } from '../contracts/StageOutputs';
import { getInstructionAssessments, getPatternAssessment, isAssessmentStatus } from './reviewAssessment';

export const STANDARD_REVIEW_LIMITS =
  'Static authoring checks of the saved configuration and instructions, not measured runtime outcomes or production approval. '
  + 'The score is not a conversation success rate. This review does not assess answer accuracy, response time, '
  + 'access-control effectiveness, or production readiness.';

export interface SavedStandardScores {
  pattern: number | null;
  instruction: number | null;
  overall: number | null;
  legacy: boolean;
  notes: string[];
  /**
   * The per-pillar breakdown the composite scorer recorded.
   *
   * Empty on every review saved before the standard harness moved onto the shared scorer. Read
   * that emptiness as "scored the old way", never as "no pillar applied".
   */
  pillars: PillarBreakdown[];
  /** 'partial' when part of the composite rests on evidence that could not be fully read. */
  status: 'complete' | 'partial' | null;
}

export interface SavedStandardReviewProjection {
  stageAOutput: LocalStageAOutput | null;
  patternEvaluation: PatternEvaluation | null;
  instructionEvaluation: InstructionEvaluation | null;
  isZipSource: boolean;
  scores: SavedStandardScores;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseStage(raw: string | undefined): JsonObject | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function validOptionalArray(record: JsonObject, key: string, validItem: (item: unknown) => boolean): boolean {
  return record[key] === undefined || (Array.isArray(record[key]) && record[key].every(validItem));
}

function optionalStrings(record: JsonObject, keys: string[]): boolean {
  return keys.every(key => record[key] === undefined || typeof record[key] === 'string');
}

function optionalBooleans(record: JsonObject, keys: string[]): boolean {
  return keys.every(key => record[key] === undefined || typeof record[key] === 'boolean');
}

function validEvidence(value: unknown): boolean {
  return value === undefined || (isObject(value)
    && typeof value.source === 'string' && ['configuration', 'instructions', 'ai-response'].includes(value.source)
    && typeof value.status === 'string' && ['verified', 'unverified', 'unavailable'].includes(value.status)
    && optionalStrings(value, ['quote', 'reason', 'setting']));
}

function isPattern(value: unknown): boolean {
  return isObject(value) && typeof value.PatternName === 'string'
    && optionalStrings(value, ['PatternId', 'Description', 'PatternDescription', 'Recommendation', 'AssessmentReason', 'EvidenceKind'])
    && validOptionalArray(value, 'Topics', item => isObject(item) && typeof item.item === 'string'
      && optionalStrings(item, ['componentId', 'schemaName', 'variable', 'setting', 'current', 'suggested', 'assessmentReason'])
      && (item.assessmentStatus === undefined || isAssessmentStatus(item.assessmentStatus)) && validEvidence(item.evidence))
    && validOptionalArray(value, 'AffectedTopics', item => typeof item === 'string');
}

function isPatternEvaluation(value: JsonObject | null): value is JsonObject & PatternEvaluation {
  return !!value && Array.isArray(value.Patterns) && value.Patterns.every(isPattern);
}

function isInstructionEvaluation(value: JsonObject | null): value is JsonObject & InstructionEvaluation {
  return !!value && Array.isArray(value.issues)
    && optionalStrings(value, ['summary', 'assessmentReason', 'policyVersion'])
    && optionalBooleans(value, ['scoreAvailable'])
    && value.issues.every(issue => isObject(issue) && typeof issue.id === 'string'
      && optionalStrings(issue, ['criteriaId', 'title', 'description', 'recommendation', 'guidelineReference', 'assessmentReason', 'uncoveredSituation', 'coverage'])
      && (issue.assessmentStatus === undefined || issue.assessmentStatus === 'fail' || issue.assessmentStatus === 'not-assessed')
      && (issue.coverage === undefined || issue.coverage === 'missing' || issue.coverage === 'incomplete' || issue.coverage === 'unclear')
      && validEvidence(issue.evidence))
    && validOptionalArray(value, 'criterionAssessments', item =>
      isObject(item) && typeof item.criteriaId === 'string' && isAssessmentStatus(item.status) && optionalStrings(item, ['reason']))
    && (value.assessmentStatus === undefined || isAssessmentStatus(value.assessmentStatus));
}

function isStageA(value: JsonObject | null): value is JsonObject & LocalStageAOutput {
  if (!value || !['topics', 'tools', 'botName', 'topicComponents', 'connectedAgents', 'entities', 'configurationComponents', 'unknownComponents']
    .some(key => value[key] !== undefined)) return false;
  const nameArrays = ['topics', 'tools', 'knowledgeSources', 'parsingErrors'];
  const resourceArrays = ['toolDetails', 'knowledgeDetails', 'childAgents', 'connectedAgents', 'entities', 'configurationComponents', 'unknownComponents', 'testCaseDetails'];
  return optionalStrings(value, ['botId', 'botName', 'agentDescription', 'agentInstructions', 'policyVersion'])
    && optionalBooleans(value, ['configurationAvailable'])
    && ['toolCount', 'topicCount', 'knowledgeCount', 'testCaseCount'].every(key =>
      value[key] === undefined || (typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] >= 0))
    && nameArrays.every(key => validOptionalArray(value, key, item => typeof item === 'string'))
    && resourceArrays.every(key => validOptionalArray(value, key, item =>
      isObject(item) && typeof item.name === 'string'
      && optionalStrings(item, ['componentId', 'schemaName', 'kind', 'description', 'targetSchemaName', 'targetId', 'parentComponentId',
        'reason', 'displayName', 'input', 'url', 'toolType', 'sourceType', 'source'])))
    && (value.agentSettings === undefined || (isObject(value.agentSettings)
      && optionalStrings(value.agentSettings, ['language', 'authenticationMode'])
      && optionalBooleans(value.agentSettings, ['useModelKnowledge', 'isSemanticSearchEnabled', 'optInUseLatestModels'])))
    && validOptionalArray(value, 'topicComponents', item =>
      isObject(item) && typeof item.TopicName === 'string'
      && optionalStrings(item, ['TopicId', 'SchemaName', 'TriggerKind', 'ModelName', 'ModelDescription'])
      && ['RoutingApplicability', 'NamingApplicability'].every(key => item[key] === undefined
        || (isObject(item[key]) && typeof item[key].status === 'string' && typeof item[key].reason === 'string'))
      && ['InputVariables', 'OutputVariables'].every(key =>
        validOptionalArray(item, key, variable => isObject(variable) && typeof variable.VariableName === 'string'
          && optionalStrings(variable, ['VariableDescription']))));
}

function metadataAvailability(root: unknown, stage: JsonObject | null, kind: 'pattern' | 'instruction'): boolean | undefined {
  if (root !== undefined) return root === true;
  if (stage?.scoreAvailable !== undefined) return stage.scoreAvailable === true;
  if (kind === 'pattern' && Array.isArray(stage?.Patterns)) {
    const patterns = stage.Patterns.filter(isObject);
    if (stage.policyVersion || patterns.some(pattern => pattern.AssessmentStatus !== undefined)) {
      return patterns.some(pattern => ['pass', 'fail'].includes(getPatternAssessment(pattern)));
    }
  }
  if (kind === 'instruction' && stage) {
    if (stage.assessmentStatus === 'not-assessed' || stage.assessmentStatus === 'not-applicable') return false;
    if (stage.policyVersion || stage.criterionAssessments !== undefined) {
      return isInstructionEvaluation(stage)
        && getInstructionAssessments(stage).some(assessment => assessment.status === 'pass' || assessment.status === 'fail');
    }
  }
  return undefined;
}

function savedScore(value: unknown, available: boolean | undefined, label: string, notes: string[]): number | null {
  if (available === false) {
    notes.push(`${label} score: Not assessed. Excluded or unavailable assessments do not contribute a score.`);
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    notes.push(`The saved ${label.toLowerCase()} score is unavailable. No replacement score has been calculated.`);
    return null;
  }
  return value;
}

/**
 * Keep only breakdown rows that carry a whole pillar.
 *
 * The breakdown crosses a persistence boundary, so a partially written or
 * older-shaped row reaches here as plain JSON. Dropping such a row is safer
 * than showing it: an explainer built from half a row states a weight the
 * score never used.
 *
 * `complete` is the one field this reconstructs rather than requires. It was
 * added to the breakdown after rows were already being persisted, so demanding
 * it would discard every older row and silently drop the explainer back to the
 * superseded two-pillar wording — the exact defect this projection exists to
 * prevent. It records whether a pillar's rules all ran and is read by no
 * arithmetic, so assuming they did is a safe reconstruction of a missing field,
 * not a claim about the score.
 */
function validPillars(value: unknown): PillarBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry =>
    isObject(entry)
    && typeof entry.pillar === 'string'
    && typeof entry.weight === 'number' && Number.isFinite(entry.weight)
    && typeof entry.applicable === 'boolean'
    && (entry.score === null || (typeof entry.score === 'number' && Number.isFinite(entry.score)))
      ? [{
        pillar: entry.pillar as PillarBreakdown['pillar'],
        weight: entry.weight,
        applicable: entry.applicable,
        score: entry.score as number | null,
        complete: typeof entry.complete === 'boolean' ? entry.complete : true,
      }]
      : []);
}

function unavailableStageReason(source: string | undefined, parsed: JsonObject | null): string {  if (!source?.trim()) return 'is unavailable: the saved stage is missing.';
  if (!parsed) return 'is unavailable: the saved stage could not be read as a JSON object.';
  return 'is partial and unavailable for complete display: saved fields or rows are incomplete or malformed.';
}

/** Read a saved standard review without evaluating it again or loading live source data. */
export function projectSavedStandardReview(review: ReviewResult): SavedStandardReviewProjection {
  const rawA = parseStage(review.stageAOutput);
  const rawB = parseStage(review.stageBOutput);
  const rawC = parseStage(review.stageCOutput);
  const stageAOutput = isStageA(rawA) ? rawA : null;
  const patternEvaluation = isPatternEvaluation(rawB) ? rawB : null;
  const instructionEvaluation = isInstructionEvaluation(rawC) ? rawC : null;
  const notes: string[] = [];
  if (!stageAOutput) notes.push(`Source snapshot data ${unavailableStageReason(review.stageAOutput, rawA)}`);
  if (!patternEvaluation) notes.push(`Pattern assessment data ${unavailableStageReason(review.stageBOutput, rawB)}`);
  if (!instructionEvaluation) notes.push(`Instruction assessment data ${unavailableStageReason(review.stageCOutput, rawC)}`);
  if (stageAOutput?.parsingErrors?.length) notes.push('Some source configuration could not be read. Inspect the affected checks and source details.');
  if (stageAOutput?.configurationAvailable === false) notes.push('Source configuration was unavailable. Empty resource lists do not confirm that components are absent.');
  if (patternEvaluation?.Patterns.some(pattern => getPatternAssessment(pattern) === 'not-assessed')) {
    notes.push('Some pattern checks were not assessed. Open their details for the saved reason.');
  }
  if (instructionEvaluation && getInstructionAssessments(instructionEvaluation).some(assessment => assessment.status === 'not-assessed')) {
    notes.push('Some instruction criteria were not assessed. Open their details for the saved reason.');
  }
  if (instructionEvaluation?.issues.length === 0 && instructionEvaluation.policyVersion === undefined
    && instructionEvaluation.criterionAssessments === undefined && instructionEvaluation.assessmentStatus === undefined) {
    notes.push('Legacy instruction compatibility: no per-criterion outcomes were recorded. An empty issue list follows the saved format and is not a new coverage assessment.');
  }
  if (Array.isArray(patternEvaluation?.assessmentNotes)) {
    notes.push(...patternEvaluation.assessmentNotes.filter((note): note is string => typeof note === 'string' && note.length > 0));
  }
  const legacy = ![review.assessmentPolicyVersion, rawA?.policyVersion, rawB?.policyVersion, rawC?.policyVersion]
    .some(version => typeof version === 'string' && version.trim().length > 0);
  if (legacy) notes.push('Historical assessment: scores are shown as saved. No policy version was recorded and this review has not been regraded.');

  const patternAvailable = metadataAvailability(review.patternScoreApplicable, rawB, 'pattern');
  const instructionAvailable = metadataAvailability(review.instructionScoreApplicable, rawC, 'instruction');
  const overallAvailable = review.overallScoreApplicable !== undefined
    ? review.overallScoreApplicable === true
    : patternAvailable === false && instructionAvailable === false ? false : undefined;
  const scores: SavedStandardScores = {
    pattern: savedScore(review.patternScore, patternAvailable, 'Pattern', notes),
    instruction: savedScore(review.instructionScore, instructionAvailable, 'Instruction', notes),
    overall: savedScore(review.overallScore, overallAvailable, 'Overall', notes),
    legacy,
    notes: [...new Set(notes)],
    pillars: validPillars(review.scorePillars),
    status: review.scoreStatus === 'complete' || review.scoreStatus === 'partial' ? review.scoreStatus : null,
  };
  return {
    stageAOutput, patternEvaluation, instructionEvaluation, scores,
    isZipSource: review.sourceEnvironment === 'zip' || (!review.sourceEnvironment && stageAOutput?.source === 'zip'),
  };
}

/** Return saved scores with availability metadata; never substitute AI percentages or regrade history. */
export function getSavedStandardScores(review: ReviewResult): SavedStandardScores {
  return projectSavedStandardReview(review).scores;
}
