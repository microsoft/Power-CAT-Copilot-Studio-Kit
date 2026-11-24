/**
 * manifestHealthToIssues.ts
 *
 * Converts a ManifestHealthCheck result into a CriterionResult-compatible shape
 * so the Manifest Health tab renders with the same Option A row pattern as AI criteria.
 *
 * Only failed / warned checks are included — passing checks are omitted.
 */

import type { ManifestHealthCheck } from '../contracts/ManifestHealthCheck';
import type { CriterionResult, EvaluationIssue, IssueSeverity, PassingCheck } from '../contracts/DAEvaluationResult';
import { HEALTH_CHECK_LEARN_DOCS } from '../contracts/learnDocs';

interface ManifestIssue extends EvaluationIssue {
  /** Learn doc URL for this specific check */
  learnUrl?: string;
  learnLabel?: string;
}

function getLearnDoc(key: string): { url: string; label: string } | undefined {
  const docs = HEALTH_CHECK_LEARN_DOCS[key];
  return docs?.[0] ? { url: docs[0].url, label: docs[0].label } : undefined;
}

function addIssue(
  issues: ManifestIssue[],
  key: string,
  severity: IssueSeverity,
  description: string,
  recommendation: string,
) {
  const doc = getLearnDoc(key);
  issues.push({
    severity,
    description,
    recommendation,
    learnUrl: doc?.url,
    learnLabel: doc?.label,
  });
}

/**
 * Converts a ManifestHealthCheck into a CriterionResult for rendering.
 * Failed Must-Fix checks → High severity. Other failures → Medium. Warnings → Low.
 */
export function manifestHealthToCriterionResult(health: ManifestHealthCheck): CriterionResult & { issues: ManifestIssue[] } {
  const issues: ManifestIssue[] = [];

  // ── Schema & Content checks ──

  if (health.versionSupported && !health.versionSupported.pass) {
    addIssue(issues, 'versionSupported', 'High',
      health.versionSupported.message,
      'Set the required declarative-agent version property to v1.8, or v1.9 for a package with custom skills.',
    );
  }

  if (!health.instructionsPresent.pass) {
    addIssue(issues, 'instructionsPresent', 'High',
      'Instructions field is empty',
      'Add instructions to your declarative agent. Without them, all AI evaluation criteria will fail and the agent will not function as intended.',
    );
  }

  if (!health.nameLength.pass) {
    addIssue(issues, 'nameLength', 'Medium',
      `Name exceeds 100 character limit (${health.nameLength.value} / 100)`,
      'Shorten the declarative-agent name to 100 characters or fewer.',
    );
  }

  if (!health.descriptionLength.pass) {
    addIssue(issues, 'descriptionLength', 'Medium',
      `Description exceeds 1000 character limit (${health.descriptionLength.value} / 1000)`,
      'Shorten the short description to 1000 characters or fewer.',
    );
  }

  if (health.instructionsLength && !health.instructionsLength.pass) {
    addIssue(issues, 'instructionsLength', 'High',
      `Instructions exceed 8000 character limit (${health.instructionsLength.value} / 8000)`,
      'Shorten the instructions to 8000 characters or fewer.',
    );
  }

  if (!health.conversationStartersCount.pass) {
    const val = health.conversationStartersCount.value;
    const max = health.conversationStartersCount.max;
    addIssue(
      issues,
      'conversationStartersCount',
      'High',
      `${val} conversation starters — maximum is ${max}`,
      `Remove ${val - max} conversation starter${val - max !== 1 ? 's' : ''}.`,
    );
  }

  if (!health.actionsCount.pass) {
    addIssue(issues, 'actionsCount', 'Medium',
      `Actions count exceeds schema limit (${health.actionsCount.value} / ${health.actionsCount.max} max)`,
      'Remove actions until the count is 10 or fewer. This is a hard schema limit.',
    );
  }

  if (!health.colorIconPresent) {
    addIssue(issues, 'colorIconPresent', 'Low',
      'color.png icon is missing from the app package',
      'Add a color.png icon (192×192px recommended) to the ZIP package. A fallback icon will be used until then.',
    );
  }

  // ── Store Validation Must Fix checks ──

  if (!health.noPromptInjection.pass) {
    addIssue(issues, 'noPromptInjection', 'High',
      `Prompt injection phrases detected: ${health.noPromptInjection.message}`,
      "Remove instructional phrases such as 'ignore', 'delete', 'reset', 'new instructions', 'Answer in Bold', or 'Do not print anything' from instructions and conversation starters.",
    );
  }

  if (!health.noUrlsOrEmojis.pass && !health.noUrlsOrEmojis.message.includes('N/A')) {
    addIssue(issues, 'noUrlsOrEmojis', 'Low',
      `URLs or emojis detected: ${health.noUrlsOrEmojis.message}`,
      'Remove all URLs, emojis, and hidden characters (hexadecimal, binary, unconventional symbols) from instructions and conversation starters. Note: this is only required if publishing to the M365 App Store.',
    );
  }

  if (!health.isConsequentialFlags.pass && !health.isConsequentialFlags.message.includes('N/A')) {
    addIssue(issues, 'isConsequentialFlags', 'High',
      `isConsequential flag missing or incorrect: ${health.isConsequentialFlags.message}`,
      'Set isConsequential to true for all POST, PUT, PATCH, and DELETE plugin operations. This requires explicit user permission before execution.',
    );
  }

  if (!health.httpsOnActionUrls.pass && !health.httpsOnActionUrls.message.includes('N/A')) {
    addIssue(issues, 'httpsOnActionUrls', 'High',
      `Non-HTTPS URLs found in plugin files: ${health.httpsOnActionUrls.message}`,
      'Replace all HTTP URLs with HTTPS. All API calls must use HTTPS with TLS 1.2 or higher and must not redirect.',
    );
  }

  // Derive status from issue severity (deterministic — no numeric score needed)
  const highCount = issues.filter((i) => i.severity === 'High').length;
  const medCount = issues.filter((i) => i.severity === 'Medium').length;
  const status: CriterionResult['status'] =
    highCount > 0 ? 'Fail' : medCount > 0 ? 'Warning' : 'Pass';

  // Derive passing checks from checks that actually passed
  const passingChecks: PassingCheck[] = [];
  if (health.instructionsPresent.pass) passingChecks.push({ description: 'Instructions field is present and non-empty' });
  if (health.instructionsLength?.pass) passingChecks.push({ description: `Instructions length is within the 8000-character limit (${health.instructionsLength.value} chars)` });
  if (health.nameLength.pass) passingChecks.push({ description: `Agent name length is within the 100-character limit (${health.nameLength.value} chars)` });
  if (health.descriptionLength.pass) passingChecks.push({ description: `Description length is within the 1000-character limit (${health.descriptionLength.value} chars)` });
  if (health.conversationStartersCount.pass && health.conversationStartersCount.value > 0) passingChecks.push({ description: `Conversation starters count (${health.conversationStartersCount.value}) is within the maximum of ${health.conversationStartersCount.max}` });
  if (health.actionsCount.pass && health.actionsCount.value > 0) passingChecks.push({ description: `Actions count (${health.actionsCount.value}) is within the maximum limit of ${health.actionsCount.max}` });
  if (health.colorIconPresent) passingChecks.push({ description: 'color.png icon is present in the app package' });
  if (health.noPromptInjection.pass) passingChecks.push({ description: 'No prompt injection phrases detected in instructions or conversation starters' });
  if (health.noUrlsOrEmojis.pass) passingChecks.push({ description: 'No URLs, emojis, or hidden characters found in instructions or conversation starters' });
  if (health.isConsequentialFlags.pass) passingChecks.push({ description: 'isConsequential flags are correctly set on all plugin operations' });
  if (health.httpsOnActionUrls.pass) passingChecks.push({ description: 'All plugin API URLs use HTTPS' });

  return { status, issues, passingChecks };
}
