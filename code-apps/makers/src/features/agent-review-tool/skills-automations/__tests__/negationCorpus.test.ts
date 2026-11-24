/**
 * Negation corpus: a behavioural net over every deterministic prose rule.
 *
 * Why this file exists
 * --------------------
 * A real upload was reported as defective for the words "…and never ask me a
 * clarifying question, since this run is unattended" — the author's own
 * safeguard. The rule matched "ask me" and never read the word in front of it.
 *
 * Fixing that one rule is not enough, because the same mistake is available to
 * every future rule that reads prose. This file is the net. It drives the whole
 * deterministic pipeline — packaging, shape, runtime and automation —
 * over artifacts written entirely in safeguard language, and asserts that a
 * well-written author is never blamed for the thing they prevented.
 *
 * Each case carries a positive control: the same sentence without its negation
 * must still be reported. Without that, this file could pass because the rules
 * stopped working, which is the failure it is meant to catch.
 */
import { describe, expect, it } from 'vitest';
import { evaluateAutomation } from '../services/automationValidator';
import { detectArtifactKind } from '../services/artifactDetector';
import { evaluatePackaging } from '../services/packagingRules';
import { evaluateShape } from '../services/shapeRules';
import { scanForSecrets } from '../services/secretScanner';
import type { ArtifactFinding, TargetRuntime, UploadedArtifact } from '../contracts/ArtifactReview';
import { artifact, automationArtifact, file, goodSkillMarkdown, validAutomation } from './fixtures';

const ALL_RUNTIMES: TargetRuntime[] = ['cowork', 'scout', 'copilot-studio'];

/**
 * Every deterministic rule, branching on kind exactly as `reviewArtifact` does.
 *
 * Mirrors `artifactReviewService.ts` rather than running all evaluators over
 * every artifact, so a pass here means the real pipeline passes. Running the
 * automation rules over a skill, for example, would judge the wrong contract.
 */
function evaluateEverything(input: UploadedArtifact): ArtifactFinding[] {
  const detection = detectArtifactKind(input);
  const findings: ArtifactFinding[] = [...scanForSecrets(input).findings];

  if (detection.kind === 'skill') {
    findings.push(...evaluatePackaging({ artifact: input, runtimes: ALL_RUNTIMES }));
    findings.push(...evaluateShape(input));
  } else if (detection.kind === 'automation') {
    findings.push(...evaluateAutomation(input));
  }

  return findings;
}

/** Only the findings that would alarm a reader. Info and low are advisory. */
function alarming(findings: ArtifactFinding[]): ArtifactFinding[] {
  return findings.filter((f) => f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium');
}

function automationWithPrompt(prompt: string): UploadedArtifact {
  return automationArtifact(validAutomation({ steps: [{ label: 'Act', prompt }] }));
}

describe('negation corpus — automation prompts', () => {
  /** Each pair is [safeguard wording, the same claim without its negation]. */
  const pairs: Array<[string, string]> = [
    [
      'Rank by what the wait costs, and never ask me a clarifying question, since this run is unattended.',
      'Rank by what the wait costs, and ask me a clarifying question when it is unclear.',
    ],
    ['Decide on your own. Do not ask the user which repository to use.', 'Ask the user which repository to use.'],
    ["Choose the newest branch. Don't ask the user to pick.", 'Ask the user to pick a branch.'],
    [
      'Apply the rule below rather than ask the user for a decision.',
      'Stop and ask the user for a decision on each item.',
    ],
    [
      'The rule is fixed, so there is no need to ask the user before continuing.',
      'Confirm with the user before continuing.',
    ],
    [
      'Mark the thread as read, and never delete anything.',
      'Delete anything that has been read.',
    ],
    [
      'Move stale items to the archive instead of delete them permanently.',
      'Delete stale items permanently.',
    ],
  ];

  it.each(pairs)('does not report the safeguard wording: %s', (safeguard) => {
    expect(alarming(evaluateEverything(automationWithPrompt(safeguard)))).toEqual([]);
  });

  it.each(pairs)('positive control — still reports the same claim unnegated (for: %s)', (_safeguard, unnegated) => {
    // Guards against this whole file passing because the rules stopped firing.
    expect(alarming(evaluateEverything(automationWithPrompt(unnegated))).length).toBeGreaterThan(0);
  });
});

describe('negation corpus — the exact wording from the reported upload', () => {
  // Reproduced verbatim from awaiting-reply.json, the file that produced the
  // false positive. This case must never regress.
  const REPORTED =
    'Keep only threads where I expected an answer: a direct question, a request for a document, a ' +
    'decision, an approval or a date, or a deadline that has passed. Drop informational messages, ' +
    'FYIs, thank-yous, and confirmations of something already agreed. Mark a thread uncertain rather ' +
    'than guessing, and never ask me a clarifying question, since this run is unattended. Keep at ' +
    'most 8 and say how many were left out.';

  it('reports nothing alarming', () => {
    expect(alarming(evaluateEverything(automationWithPrompt(REPORTED)))).toEqual([]);
  });
});

describe('negation corpus — structural rules are unaffected', () => {
  // Rules that read structure rather than prose must not be softened by this
  // work. A negation in the text cannot make a real packaging defect go away.
  it('still reports a bundled dependency directory, whatever the prose says', () => {
    const findings = evaluateEverything(
      artifact([
        file('SKILL.md', goodSkillMarkdown({ body: '## Steps\n\n1. Never install node_modules.' })),
        file('node_modules/left-pad/index.js', 'module.exports = () => {};'),
      ]),
    );
    expect(findings.some((f) => f.ruleId === 'PKG-NOISE')).toBe(true);
  });
});
