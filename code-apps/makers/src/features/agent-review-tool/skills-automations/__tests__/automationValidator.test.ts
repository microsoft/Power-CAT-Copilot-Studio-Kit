/**
 * Scout automation validation tests.
 *
 * Public Scout contracts and unattended-execution behavior are covered here.
 * Unpublished schedule assumptions must not produce findings.
 */
import { describe, expect, it } from 'vitest';
import { evaluateAutomation } from '../services/automationValidator';
import { artifact, automationArtifact, file, hasRule, validAutomation } from './fixtures';

describe('evaluateAutomation', () => {
  it('passes a well-formed automation', () => {
    const findings = evaluateAutomation(automationArtifact(validAutomation()));
    expect(findings.filter((f) => f.severity === 'critical' || f.severity === 'high')).toHaveLength(0);
  });

  it('does not invent an installer-contract finding when no automation object is found', () => {
    expect(hasRule(evaluateAutomation(artifact([file('automation.json', '[1,2,3]')])), 'INST-JSON')).toBe(false);
  });

  it('flags a missing name', () => {
    const findings = evaluateAutomation(automationArtifact(validAutomation({ name: '' })));
    expect(hasRule(findings, 'AUTO-SCHEMA')).toBe(true);
  });

  it('flags an automation with no steps', () => {
    const findings = evaluateAutomation(automationArtifact(validAutomation({ steps: [] })));
    expect(hasRule(findings, 'AUTO-STEPS')).toBe(true);
  });

  it('does not require an unpublished automation description field', () => {
    const noDescription = validAutomation();
    delete noDescription.description;
    expect(hasRule(evaluateAutomation(automationArtifact(noDescription)), 'AUTO-DESC')).toBe(false);
  });

  it.each([
    ['AUTO-INTERVAL', { kind: 'interval', intervalMinutes: 50 }],
    ['AUTO-MONTHLY', { kind: 'monthly', day: 31, months: [2] }],
    ['AUTO-CRON', { kind: 'cron', expression: '0 99 * * *' }],
    ['AUTO-CRON', { kind: 'cron', expression: '0 9 30 2 *' }],
  ])('does not emit unsupported schedule rule %s', (ruleId, schedule) => {
    const findings = evaluateAutomation(automationArtifact(validAutomation({ schedule })));
    expect(hasRule(findings, ruleId)).toBe(false);
  });

  it('does not reject a schedule kind that Scout has not published as a closed contract', () => {
    const findings = evaluateAutomation(
      automationArtifact(validAutomation({ schedule: { kind: 'future-scout-schedule' } })),
    );
    expect(hasRule(findings, 'AUTO-SCHEMA')).toBe(false);
  });

  it('flags a prompt that asks an unattended run to consult a human', () => {
    // An unattended automation cannot stop to ask. A prompt that waits for an
    // answer stalls or improvises, and neither is what the author intended.
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [{ label: 'Confirm', prompt: 'Ask the user which repository to use before continuing.' }],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-UNATTENDED')).toBe(true);
  });

  it('flags a destructive action in a scheduled prompt', () => {
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [{ label: 'Clean up', prompt: 'Delete every branch that has not been updated in 30 days.' }],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-DESTRUCTIVE')).toBe(true);
  });

  it('does not flag a prompt that forbids asking, which is the safeguard not the defect', () => {
    // Reported from a real upload. "…and never ask me a clarifying question,
    // since this run is unattended" is the author doing exactly the right thing.
    // Matching the bare phrase turned that safeguard into a high-severity
    // finding, which teaches the reader to distrust every finding.
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [
            {
              label: 'Keep the real asks and decide how to chase',
              prompt: 'Rank by what the wait costs, and never ask me a clarifying question, since this run is unattended.',
            },
          ],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-UNATTENDED')).toBe(false);
  });

  it.each([
    'Do not ask the user which repository to use.',
    "Don't ask the user to choose.",
    'Decide on your own rather than ask the user.',
    'There is no need to ask the user before continuing.',
  ])('does not flag a negated question: %s', (prompt) => {
    expect(
      hasRule(evaluateAutomation(automationArtifact(validAutomation({ steps: [{ label: 'Step', prompt }] }))), 'AUTO-UNATTENDED'),
    ).toBe(false);
  });

  it('still flags a real question that follows a negated one in the same prompt', () => {
    // One negated phrase must not buy silence for the rest of the prompt.
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [
            {
              label: 'Triage',
              prompt: 'Never ask the user about formatting. If the sender is unknown, ask the user whether to reply.',
            },
          ],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-UNATTENDED')).toBe(true);
  });

  it('still flags a question where a nearby "not" qualifies something else', () => {
    // The window is deliberately tight: "not" here describes the answer, not
    // the asking, so the finding must survive.
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [{ label: 'Check', prompt: 'If the answer is not clear, ask the user to confirm.' }],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-UNATTENDED')).toBe(true);
  });

  it('does not flag a destructive verb that the prompt forbids', () => {
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [{ label: 'Triage', prompt: 'Mark the thread as read, and never delete anything.' }],
        }),
      ),
    );
    expect(hasRule(findings, 'AUTO-DESTRUCTIVE')).toBe(false);
  });

  it('quotes enough of the prompt for the reader to judge the finding', () => {
    // A bare matched phrase cannot be checked, because the words that change its
    // meaning are exactly the ones left out.
    const findings = evaluateAutomation(
      automationArtifact(
        validAutomation({
          steps: [{ label: 'Check', prompt: 'When the request is ambiguous, ask the user which option they meant.' }],
        }),
      ),
    );
    const finding = findings.find((f) => f.ruleId === 'AUTO-UNATTENDED');
    expect(finding?.evidence).toContain('When the request is ambiguous');
    expect(finding?.evidence).toContain('which option they meant');
  });

  it('does not leak regex state between two automations in one run', () => {
    // The question and destructive patterns are global, so a shared lastIndex
    // would make the second automation of a batch score differently to the first.
    const withQuestion = validAutomation({
      steps: [{ label: 'Check', prompt: 'Ask the user which repository to use before continuing.' }],
    });
    const first = evaluateAutomation(automationArtifact(withQuestion));
    const second = evaluateAutomation(automationArtifact(withQuestion));
    expect(hasRule(first, 'AUTO-UNATTENDED')).toBe(true);
    expect(hasRule(second, 'AUTO-UNATTENDED')).toBe(true);
  });
});
