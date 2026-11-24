/**
 * Scout automation validator (spec 018, group E).
 *
 * Validates the documented automation fields and checks prompt behavior that
 * conflicts with unattended execution. Schedule kinds and their semantics are
 * not treated as a closed contract because Scout does not publish one.
 */
import type { ArtifactFinding, UploadedArtifact } from '../contracts/ArtifactReview';
import { buildFinding } from './findingFactory';
import { firstUnnegatedMatch, quoteWithContext } from './proseMatching';
import { extensionOf, filesWhere, stripRoot } from './artifactUtils';

/** Metadata JSON that is not an automation definition. */
const METADATA_JSON = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'manifest.json']);

/** Phrasing that asks a human for an answer mid-run. */
const QUESTION_RE =
  /\b(?:ask|prompt|confirm\s+with|check\s+with|wait\s+for)\s+(?:the\s+)?(?:user|me|them|someone|a\s+human)\b|\bif\s+(?:you'?re|you\s+are)\s+unsure,?\s+ask\b|\brequest\s+(?:user\s+)?(?:input|confirmation|approval)\b/gi;

/** Irreversible actions that need an explicit scope in an unattended run. */
const DESTRUCTIVE_RE =
  /\b(?:delete|remove|purge|erase|drop|archive\s+all|send\s+(?:an?\s+)?(?:email|message)|reply\s+to|post\s+to|overwrite|truncate|revoke|cancel)\b/gi;

/** Words that bound a destructive action to something specific. */
const SCOPE_RE =
  /\b(?:only|at\s+most|no\s+more\s+than|up\s+to|exactly|limit(?:ed)?\s+to|matching|whose|where|in\s+the\s+["'\w-]+\s+folder|from\s+the\s+["'\w-]+\s+list)\b/i;

interface ValidationIssue {
  ruleId: string;
  evidence: string;
  instanceKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the definition's shape against the import contract. */
function validateDefinition(definition: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [{ ruleId: 'AUTO-SCHEMA', evidence: 'The automation file does not contain a JSON object.' }];
  }

  const name = definition.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    issues.push({ ruleId: 'AUTO-SCHEMA', evidence: 'The required "name" field is missing or empty.', instanceKey: 'name' });
  }

  const steps = definition.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    issues.push({ ruleId: 'AUTO-STEPS', evidence: 'The automation declares no steps, so every scheduled run does nothing.' });
  } else {
    steps.forEach((step, index) => {
      if (!isRecord(step)) {
        issues.push({
          ruleId: 'AUTO-SCHEMA',
          evidence: `Step ${index + 1} is not an object.`,
          instanceKey: `step-${index}`,
        });
        return;
      }
      if (typeof step.label !== 'string' || step.label.trim().length === 0) {
        issues.push({
          ruleId: 'AUTO-SCHEMA',
          evidence: `Step ${index + 1} has no "label".`,
          instanceKey: `step-${index}-label`,
        });
      }
      if (typeof step.prompt !== 'string' || step.prompt.trim().length === 0) {
        issues.push({
          ruleId: 'AUTO-SCHEMA',
          evidence: `Step ${index + 1} has no "prompt".`,
          instanceKey: `step-${index}-prompt`,
        });
      }
    });
  }

  issues.push(...validateScheduleShape(definition.schedule));
  return issues;
}

/** Validate only the schedule shape that Scout documents publicly. */
function validateScheduleShape(schedule: unknown): ValidationIssue[] {
  if (schedule === undefined) return [];

  if (!isRecord(schedule)) {
    return [{ ruleId: 'AUTO-SCHEMA', evidence: 'The "schedule" field is not an object.', instanceKey: 'schedule' }];
  }

  return [];
}

/** Behavioural rules that apply to the prompts inside each step. */
function evaluateStepBehaviour(definition: unknown, path: string): ArtifactFinding[] {
  if (!isRecord(definition) || !Array.isArray(definition.steps)) return [];
  const findings: ArtifactFinding[] = [];

  definition.steps.forEach((step, index) => {
    if (!isRecord(step) || typeof step.prompt !== 'string') return;
    const prompt = step.prompt;
    const label = typeof step.label === 'string' ? step.label : `Step ${index + 1}`;

    const question = firstUnnegatedMatch(prompt, QUESTION_RE);
    if (question) {
      findings.push(
        buildFinding({
          ruleId: 'AUTO-UNATTENDED',
          resourcePath: path,
          evidence: `"${label}" asks for a human answer: "${quoteWithContext(prompt, question)}". An unattended automation cannot stop to ask.`,
          instanceKey: `unattended-${index}`,
        }),
      );
    }

    const destructive = firstUnnegatedMatch(prompt, DESTRUCTIVE_RE);
    if (destructive && !SCOPE_RE.test(prompt)) {
      findings.push(
        buildFinding({
          ruleId: 'AUTO-DESTRUCTIVE',
          resourcePath: path,
          evidence: `"${label}" performs "${destructive[0]}" without stating what it may affect or an upper bound.`,
          instanceKey: `destructive-${index}`,
        }),
      );
    }
  });

  return findings;
}

/** Validate a standalone Scout automation definition. */
export function evaluateAutomation(artifact: UploadedArtifact): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];

  const jsonFiles = filesWhere(artifact, (relative) => {
    if (extensionOf(relative) !== 'json') return false;
    const base = relative.split('/').pop()?.toLowerCase() ?? '';
    return !METADATA_JSON.has(base);
  });

  const candidates = jsonFiles.filter((f) => {
    if (!f.text) return false;
    try {
      const parsed: unknown = JSON.parse(f.text);
      return isRecord(parsed) && (Array.isArray(parsed.steps) || 'schedule' in parsed);
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) {
    return findings;
  }

  for (const file of candidates) {
    const path = stripRoot(file.path, artifact.rootFolderName);
    let definition: unknown;
    try {
      definition = JSON.parse(file.text as string);
    } catch (error) {
      findings.push(
        buildFinding({
          ruleId: 'AUTO-SCHEMA',
          resourcePath: path,
          evidence: `"${path}" is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}.`,
          instanceKey: path,
        }),
      );
      continue;
    }

    for (const issue of validateDefinition(definition)) {
      findings.push(
        buildFinding({
          ruleId: issue.ruleId,
          resourcePath: path,
          evidence: issue.evidence,
          instanceKey: `${path}:${issue.instanceKey ?? issue.ruleId}`,
        }),
      );
    }

    findings.push(...evaluateStepBehaviour(definition, path));
  }

  return findings;
}
