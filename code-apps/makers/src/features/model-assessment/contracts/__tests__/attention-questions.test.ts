import { describe, expect, it } from 'vitest';
import { attentionQuestions, resultsWithBaseline } from '../attention-questions';
import type { EvaluationResultVM } from '../model-assessment';

const result = (values: Partial<EvaluationResultVM> = {}): EvaluationResultVM => ({
  id: 'result-1', name: '', status: 'Fail', testCaseId: 'case-1',
  question: 'How do I get access?', testSet: 'Access tests', metric: 'Quality',
  ...values,
});

describe('attention questions', () => {
  it('matches the recorded baseline by test set, case and metric, case-insensitively', () => {
    const rows = resultsWithBaseline([
      result({ runId: 'current' }),
      result({ id: 'prior', runId: 'BASELINE', status: 'Pass', testCaseId: 'CASE-1' }),
      result({ id: 'different-set', runId: 'baseline', status: 'Fail', testSet: 'Other' }),
      result({ id: 'unrelated', runId: 'other-run', status: 'Fail' }),
    ], 'CURRENT', 'baseline');
    expect(rows).toHaveLength(1);
    expect(rows[0].previousStatus).toBe('Pass');
    expect(attentionQuestions(rows)[0].regressed).toBe(true);
  });

  it('does not guess a baseline when missing or ambiguous', () => {
    const rows = [
      result({ runId: 'current' }),
      result({ id: 'prior1', runId: 'baseline', status: 'Pass' }),
      result({ id: 'prior2', runId: 'baseline', status: 'Fail' }),
    ];
    expect(resultsWithBaseline(rows, 'current', 'baseline')[0].previousStatus).toBeUndefined();
    expect(resultsWithBaseline(rows, 'current')[0].previousStatus).toBeUndefined();
  });
  it('puts regressions first and groups failed metrics for the same question', () => {
    const rows = attentionQuestions([
      result({ id: 'persistent', testCaseId: 'case-2', previousStatus: 'Fail' }),
      result({ previousStatus: 'Pass' }),
      result({ id: 'metric-2', metric: 'Relevance', previousStatus: 'Fail' }),
      result({ id: 'passed', testCaseId: 'case-3', status: 'Pass' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].regressed).toBe(true);
    expect(rows[0].metrics.map((metric) => metric.finding)).toEqual(['Regressed', 'Still failing']);
    expect(rows[0].metrics[0].transition).toBe('Pass → Fail');
    expect(rows[1].regressed).toBe(false);
  });

  it('keeps questions in different test sets separate', () => {
    expect(attentionQuestions([result(), result({ id: 'other', testSet: 'Other tests' })])).toHaveLength(2);
  });

  it('does not invent a comparison or question when missing', () => {
    const rows = attentionQuestions([result({ question: '', previousStatus: 'Not run' })]);
    expect(rows[0].question).toBe('Question text unavailable');
    expect(rows[0].metrics[0].finding).toBe('Failed — no comparison');
    expect(rows[0].metrics[0].transition).toBe('No prior result → Fail');
  });

  it('includes errors, distinguishes regressions, and ignores passed/excluded results', () => {
    const rows = attentionQuestions([
      result({ status: ' Error ', previousStatus: ' PASS ' }),
      result({ id: 'error', testCaseId: 'case-2', status: 'Error' }),
      result({ id: 'excluded', testCaseId: 'case-3', status: 'Excluded' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].metrics[0].finding).toBe('Regressed');
    expect(rows[1].metrics[0].finding).toBe('Evaluation error');
  });

  it('does not merge unrelated results with missing case IDs', () => {
    expect(attentionQuestions([
      result({ testCaseId: undefined }),
      result({ id: 'other', testCaseId: undefined }),
    ])).toHaveLength(2);
  });
});
