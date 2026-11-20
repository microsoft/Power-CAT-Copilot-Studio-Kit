import { describe, expect, it } from 'vitest';
import { presentAnalysis } from '../analysis-presentation';

const caseId = 'f685648e-fe87-4661-b4c4-523432848e90';

describe('presentAnalysis', () => {
  it('formats the older four-sentence summary without losing findings', () => {
    const text = 'The assessment shows a transition from GPT5Auto to GPT5Reasoning with a regression status labeled as Critical. '
      + 'The test set with the most failures is MODELCHECK Contoso Employee Onboarding Agent, which had 2 failures. '
      + `There is one regressed case, identified as ${caseId}, which passed on the previous model but failed on the current one. `
      + 'A recommended next action is to investigate the failures before proceeding.';
    const result = presentAnalysis(text, [{
      id: 'r1', testCaseId: caseId, question: 'How can I request project-site access?', status: 'Fail',
    }]);
    expect(result.summary).toContain('GPT-5 Auto to GPT-5 Reasoning');
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toContain('2 failures');
    expect(result.findings[1]).toContain('“How can I request project-site access?”');
    expect(result.findings[1]).not.toContain(caseId);
    expect(result.nextStep).toBe('A recommended next action is to investigate the failures before proceeding.');
  });

  it('groups the new three-sentence prompt response', () => {
    expect(presentAnalysis(
      'One result regressed. Project-site access now fails. Review the project-site run details.',
      [],
    )).toEqual({
      summary: 'One result regressed.',
      findings: ['Project-site access now fails.'],
      nextStep: 'Review the project-site run details.',
    });
  });

  it('does not invent an action or drop an unfamiliar final sentence', () => {
    expect(presentAnalysis('No comparable baseline is available. Coverage is incomplete.', [])).toEqual({
      summary: 'No comparable baseline is available.',
      findings: ['Coverage is incomplete.'],
      nextStep: undefined,
    });
  });

  it('preserves unknown identifiers and handles empty and single-sentence text', () => {
    expect(presentAnalysis(`Case ${caseId} failed.`, []).summary).toContain(caseId);
    expect(presentAnalysis('Only one sentence', []).summary).toBe('Only one sentence');
    expect(presentAnalysis('  ', [])).toEqual({ summary: '', findings: [], nextStep: undefined });
  });

  it('handles decimal model versions, aliases and the new latest-chat model', () => {
    const result = presentAnalysis(
      'GPT-5.3 Chat changed to GPT56Chat. sonnet4-5 was also assessed. Next step: review its results.',
      [],
    );
    expect(result.summary).toBe('GPT-5.3 Chat changed to GPT Chat Latest.');
    expect(result.findings).toEqual(['Claude Sonnet 4.5 was also assessed.']);
    expect(result.nextStep).toBe('Next step: review its results.');
  });

  it('keeps the Sol, Luna and Terra aliases distinct in analysis text', () => {
    const result = presentAnalysis(
      'GPT56Reasoning changed to GPT56ReasoningTerra. GPT56ReasoningLuna and gpt-6-astra were also assessed. '
      + 'Review Fable5 and claude-fable-5-1 results.',
      [],
    );
    expect(result.summary).toBe('GPT 5.6 Sol changed to GPT 5.6 Terra.');
    expect(result.findings).toEqual(['GPT 5.6 Luna and GPT-6 Astra were also assessed.']);
    expect(result.nextStep).toBe('Review Claude Fable 5 and Claude Fable 5.1 results.');
  });

  it('groups headed prompt lines into sections, skipping blank lines and Markdown markers', () => {
    const text = '🧭 **Overall:** GPT41 passed 9 of 55 checks.\n\n'
      + '⚠️ **Needs attention:** The **VPN** request failed.  \n'
      + '⚠️ **Needs attention:** One GeneralQuality check errored.\n'
      + '🔄 What changed: Compared with Opus47, case ' + caseId + ' regressed.\n'
      + '🔎 **Evidence limits**: Rerun the assessment.';
    const result = presentAnalysis(text, [{ id: 'r1', testCaseId: caseId, question: 'Reset my password', status: 'Fail' }]);
    expect(result.sections).toEqual([
      { icon: '🧭', heading: 'Overall', items: ['GPT-4.1 passed 9 of 55 checks.'] },
      { icon: '⚠️', heading: 'Needs attention', items: ['The VPN request failed.', 'One Response Quality check errored.'] },
      { icon: '🔄', heading: 'What changed', items: ['Compared with Claude Opus 4.7, case “Reset my password” regressed.'] },
      { icon: '🔎', heading: 'Evidence limits', items: ['Rerun the assessment.'] },
    ]);
    expect(result.summary).toBe('GPT-4.1 passed 9 of 55 checks.');
    expect(result.findings).toHaveLength(4);
  });

  it('keeps plain sentences with a label and colon in sentence mode', () => {
    expect(presentAnalysis('Status: one regressed.\nNext step: review it.', []).sections).toBeUndefined();
  });

  it('drops Markdown list dashes and keeps bulleted labels as points', () => {
    const text = '✅ **Works well**\n'
      + '- **GeneralQuality:** Responses are safe.\n'
      + '- **Compare Meaning:** Covers expected information.\n'
      + '⚠️ **Needs attention**\n'
      + '* **Keyword Match:** Misses required keywords.\n'
      + '1. Answers are wordy.';
    expect(presentAnalysis(text, []).sections).toEqual([
      { icon: '✅', heading: 'Works well', items: ['Response Quality: Responses are safe.', 'Compare Meaning: Covers expected information.'] },
      { icon: '⚠️', heading: 'Needs attention', items: ['Keyword Match: Misses required keywords.', 'Answers are wordy.'] },
    ]);
  });

  it('treats a bare icon line as a heading only when points follow it', () => {
    const text = '🧭 **Overall:** 9 of 55 checks passed.\n\n'
      + '- ✅ Works well\n\n'
      + '- Baseline quality is stable.\n\n'
      + '⚠️ Needs attention\n\n'
      + '- Unnecessary refusals.\n'
      + '- Responses are overly long.\n'
      + '✅ All checks ran\n'
      + '🔄 **What changed:** Nothing.';
    expect(presentAnalysis(text, []).sections).toEqual([
      { icon: '🧭', heading: 'Overall', items: ['9 of 55 checks passed.'] },
      { icon: '✅', heading: 'Works well', items: ['Baseline quality is stable.'] },
      { icon: '⚠️', heading: 'Needs attention', items: ['Unnecessary refusals.', 'Responses are overly long.', '✅ All checks ran'] },
      { icon: '🔄', heading: 'What changed', items: ['Nothing.'] },
    ]);
  });

  it('drops list dashes in sentence mode', () => {
    expect(presentAnalysis('- One result regressed.\n- Coverage is incomplete.', [])).toMatchObject({
      summary: 'One result regressed.',
      findings: ['Coverage is incomplete.'],
    });
  });
});
