import { describe, expect, it } from 'vitest';
import { buildComparisonPdf, pdfText, questionsCell } from '../comparison-export';
import type { EvaluationRunVM } from '../../contracts/model-assessment';

const run = (id: string, ai?: string): EvaluationRunVM => ({
  id, name: id, status: 'Completed', analysisStatus: 'Completed', regression: 'Healthy',
  pass: 1, fail: 0, error: 0, excluded: 0, completedOn: '2026-09-11T12:00:00Z', ai,
});

describe('comparison export', () => {
  it('stacks multi-turn questions one per line', () => {
    expect(questionsCell(['Only'])).toBe('Only');
    expect(questionsCell(['First', 'Second'])).toBe('First\nSecond');
  });

  it('keeps PDF text within the built-in font character set', () => {
    expect(pdfText('\u201CQuoted\u201D \u2014 it\u2019s done\u2026')).toBe('"Quoted" - it\'s done...');
    expect(pdfText('Caf\u00E9 \u4F60')).toBe('Caf\u00E9 ?');
  });

  it('writes the AI summary and grouped results with friendly metric names', () => {
    const doc = buildComparisonPdf({
      agentName: 'Helpdesk',
      runs: [
        { run: run('current', 'One question regressed. The ticket answer missed a detail. Review the ticket guidance.'), model: 'GPT-5 Auto' },
        { run: run('previous'), model: 'GPT-4.1' },
      ],
      rows: [{
        testSet: 'MODELCHECK (Conversation)',
        caseKey: 'case-1',
        questions: ['Add a ticket.', 'Environment: HelpDesk.'],
        metric: 'GeneralQuality',
        cells: [{ status: 'Fail', finding: 'Missed detail' }, { status: 'Pass' }],
      }],
    });
    const pdf = doc.output();
    expect(pdf.startsWith('%PDF')).toBe(true);
    for (const text of [
      'Model Assessment Report', 'AI Summary', 'One question regressed.', 'Key findings',
      'Recommended next step', 'Review the ticket guidance.', 'Analysis completed.',
      'MODELCHECK \\(Conversation\\)', 'Add a ticket.', 'Environment: HelpDesk.',
      'Response Quality', 'Missed detail', 'Page 1 of',
    ]) {
      expect(pdf).toContain(`(${text}`);
    }
    expect(pdf).not.toContain('(1. Add a ticket.');
    expect(pdf).not.toContain('(2. Environment: HelpDesk.');
  });

  it('prints headed AI summaries as sections without emoji or Markdown markers', () => {
    const pdf = buildComparisonPdf({
      runs: [{
        run: run('current', '🧭 **Overall:** Most checks passed.\n\n⚠️ **Needs attention:** One request failed.'),
        model: 'GPT-4.1',
      }],
      rows: [],
    }).output();
    for (const text of ['Overall', 'Most checks passed.', 'Needs attention', 'One request failed.']) {
      expect(pdf).toContain(`(${text})`);
    }
    expect(pdf).not.toContain('**');
    expect(pdf).not.toContain('Key findings');
  });

  it('adds a Credits column only when a run reports Copilot Credits', () => {
    const withCredits = buildComparisonPdf({
      runs: [{ run: { ...run('current'), credits: { conversation: 0.16, evaluators: 1.2426 } }, model: 'GPT-6 Luna' }],
      rows: [],
    }).output();
    expect(withCredits).toContain('(Credits)');
    expect(withCredits).toContain('(1.40)');
    expect(withCredits).toContain('GPT-6 Luna: 0.16 to answer');

    const without = buildComparisonPdf({ runs: [{ run: run('previous'), model: 'GPT-4.1' }], rows: [] }).output();
    expect(without).not.toContain('Credits');
  });

  it('prints credit cells as plain amounts instead of status badges', () => {
    const pdf = buildComparisonPdf({
      runs: [{ run: run('current'), model: 'GPT-6 Luna' }],
      rows: [{ testSet: 'Set A', caseKey: 'a', questions: ['Hi'], metric: 'Copilot Credits', cells: [{ text: '0.68' }] }],
    }).output();
    expect(pdf).toContain('(0.68)');
    expect(pdf).not.toContain('Not run');
  });

  it('prints the model recommendation only when one was generated', () => {
    const runs = [
      { run: run('previous'), model: 'GPT-4.1' },
      { run: run('current'), model: 'GPT-5 Chat' },
    ];
    const pdf = buildComparisonPdf({
      runs,
      rows: [],
      recommendation: {
        winner: 'GPT-5 Chat',
        verdictLabel: 'Recommended',
        confidenceLabel: 'Medium confidence',
        headline: 'Use GPT-5 Chat.',
        evidence: '12 results scored in both runs',
        reasons: ['Same quality.'],
        tradeoffs: ['Slower.'],
        caveats: [],
      },
    }).output();
    for (const text of [
      'Model recommendation', 'GPT-5 Chat  |  Recommended  |  Medium confidence', 'Use GPT-5 Chat.',
      '12 results scored in both runs', 'Same quality.', 'Trade-offs', 'Slower.',
    ]) {
      expect(pdf).toContain(`(${text})`);
    }
    expect(pdf).not.toContain('(Keep in mind)');

    expect(buildComparisonPdf({ runs, rows: [] }).output()).not.toContain('Model recommendation');
  });
});