/**
 * Progress stages for the Declarative Agent review dialog.
 *
 * The DA review renders the shared `ReviewProgressDialog`, which carries the
 * "Agent node" mark. The rule pinned here is the same one the other review
 * types pin: the mark names only the stage the durable workflow serves. Every
 * other DA stage runs in the browser, or on the prompt backend, and must never
 * claim the workflow.
 */
import { describe, expect, it } from 'vitest';
import {
  DA_WORKFLOW_SERVED_STAGE,
  buildDAProgressStages,
  hasDACustomSkillStage,
  isDAReviewWorkflowBacked,
} from '../components/daProgressStages';
import type {
  DAReviewExecutionInput,
  DAReviewProgress,
} from '../hooks/useDAReviewMutation';

type Stage = DAReviewProgress['stage'];

const AI_ROW = 'Running AI evaluation';
const SKILL_ROW = 'Evaluating custom skills';

/** Rows that never reach the workflow, at any point in the run. */
const UNMARKED_ROWS = [
  'Preparing manifest',
  'Checking health',
  SKILL_ROW,
  'Saving results',
  'Complete',
];

const ALL_STAGES: Stage[] = [
  'parsing',
  'health-check',
  'skill-evaluation',
  'ai-evaluation',
  'saving',
  'complete',
];

function at(stage: Stage, label = `label for ${stage}`): DAReviewProgress {
  return { stage, label };
}

const WORKFLOW = { workflowBacked: true, hasCustomSkills: true };

function row(stages: ReturnType<typeof buildDAProgressStages>, name: string) {
  const found = stages.find((stage) => stage.stageName === name);
  expect(found, `${name} should exist`).toBeDefined();
  return found!;
}

describe('DA progress stages — rows', () => {
  it('lists the existing DA stages when the run has no custom skills', () => {
    const stages = buildDAProgressStages(at('health-check'), {
      workflowBacked: true,
      hasCustomSkills: false,
    });

    expect(stages.map((stage) => stage.stageName)).toEqual([
      'Preparing manifest',
      'Checking health',
      AI_ROW,
      'Saving results',
      'Complete',
    ]);
  });

  it('adds the custom-skill row before the AI row when the run has custom skills', () => {
    const stages = buildDAProgressStages(at('health-check'), WORKFLOW);

    expect(stages.map((stage) => stage.stageName)).toEqual([
      'Preparing manifest',
      'Checking health',
      SKILL_ROW,
      AI_ROW,
      'Saving results',
      'Complete',
    ]);
  });

  // Before this adapter existed, the dialog had no row for this stage. While
  // custom skills were evaluated, every row showed "not started" and the bar
  // showed 0%, which read as a review that had gone backwards.
  it('shows the custom-skill row as active while that stage runs', () => {
    const stages = buildDAProgressStages(at('skill-evaluation'), {
      workflowBacked: true,
      hasCustomSkills: false,
    });

    expect(row(stages, SKILL_ROW).status).toBe('active');
    expect(row(stages, 'Checking health').status).toBe('completed');
    expect(row(stages, AI_ROW).status).toBe('pending');
  });

  it.each([true, false])('shows the run steps at zero before progress, custom skills: %s', (hasCustomSkills) => {
    const options = { workflowBacked: true, hasCustomSkills };
    const initial = buildDAProgressStages(null, options);
    const reported = buildDAProgressStages(at('parsing'), options);

    expect(initial.map(stage => stage.stageName)).toEqual(reported.map(stage => stage.stageName));
    expect(initial[0]?.status).toBe('active');
    expect(initial[0]?.progress).toBe(0);
    expect(initial.slice(1).every(stage => stage.status === 'pending')).toBe(true);
    expect(initial.some(stage => stage.detail)).toBe(false);
    expect(reported[0].progress).toBe(5);
  });

  it('shows a failed first step and no completed or active steps on an early error', () => {
    const stages = buildDAProgressStages(null, { ...WORKFLOW, failed: true });

    expect(stages).toHaveLength(6);
    expect(stages[0].status).toBe('error');
    expect(stages[0].progress).toBe(0);
    expect(stages.slice(1).every(stage => stage.status === 'pending')).toBe(true);
    expect(stages.some(stage => stage.status === 'active' || stage.status === 'completed')).toBe(false);
  });
});

describe('DA progress stages — which rows may claim the workflow', () => {
  it('marks exactly one row, the AI evaluation', () => {
    const marked = buildDAProgressStages(at('ai-evaluation'), WORKFLOW)
      .filter((stage) => stage.attribution === 'workflow-agent')
      .map((stage) => stage.stageName);

    expect(marked).toEqual([AI_ROW]);
  });

  // The custom-skill row runs on the prompt backend, and the other rows run in
  // the browser. Crediting the workflow for any of them would misdescribe
  // where the work happens.
  it('never marks a row that the workflow does not serve, at any point in the run', () => {
    ALL_STAGES.forEach((stage) => {
      const stages = buildDAProgressStages(at(stage), WORKFLOW);
      UNMARKED_ROWS.forEach((name) => {
        expect(row(stages, name).attribution, `${name} at ${stage}`).toBeUndefined();
      });
    });
  });

  it('removes the mark when the AI evaluation does not use the workflow', () => {
    ALL_STAGES.forEach((stage) => {
      const stages = buildDAProgressStages(at(stage), {
        workflowBacked: false,
        hasCustomSkills: true,
      });
      expect(stages.some((entry) => entry.attribution), `at ${stage}`).toBe(false);
    });
  });

  // If the mark appeared only when a row completed, the mark would do the
  // tick's job, and "done" would rest on colour alone (WCAG 1.4.1).
  it('keeps the mark while pending, active, and completed alike', () => {
    const seen = new Set<string>();

    (['health-check', 'ai-evaluation', 'saving'] as const).forEach((stage) => {
      const aiRow = row(buildDAProgressStages(at(stage), WORKFLOW), AI_ROW);
      expect(aiRow.attribution, `at ${stage}`).toBe('workflow-agent');
      seen.add(aiRow.status);
    });

    expect([...seen].sort()).toEqual(['active', 'completed', 'pending']);
  });

  it('keeps the mark on a failed AI evaluation', () => {
    const aiRow = row(
      buildDAProgressStages(at('ai-evaluation'), { ...WORKFLOW, failed: true }),
      AI_ROW,
    );

    expect(aiRow.status).toBe('error');
    expect(aiRow.attribution).toBe('workflow-agent');
  });

  it('exports the served stage so the mark and the adapter cannot drift apart', () => {
    expect(DA_WORKFLOW_SERVED_STAGE).toBe('ai-evaluation');
  });
});

describe('DA progress stages — status and detail', () => {
  it('marks earlier rows completed, the current row active, and later rows pending', () => {
    const stages = buildDAProgressStages(at('ai-evaluation'), WORKFLOW);

    expect(stages.map((stage) => stage.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'active',
      'pending',
      'pending',
    ]);
  });

  it('reports the final row as completed rather than active', () => {
    const stages = buildDAProgressStages(at('complete'), WORKFLOW);

    expect(stages.every((stage) => stage.status === 'completed')).toBe(true);
    expect(stages.some((stage) => stage.detail)).toBe(false);
  });

  it('shows the live label only on the row it describes', () => {
    const stages = buildDAProgressStages(
      at('ai-evaluation', 'Running quality evaluation: 4 rules reviewed'),
      WORKFLOW,
    );

    expect(row(stages, AI_ROW).detail).toBe('Running quality evaluation: 4 rules reviewed');
    expect(stages.filter((stage) => stage.detail)).toHaveLength(1);
  });

  it('turns the current row red and drops its live label when the review failed there', () => {
    const stages = buildDAProgressStages(at('skill-evaluation'), {
      ...WORKFLOW,
      failed: true,
    });

    expect(row(stages, SKILL_ROW).status).toBe('error');
    expect(stages.some((stage) => stage.detail)).toBe(false);
    expect(stages.filter((stage) => stage.status === 'error')).toHaveLength(1);
    expect(row(stages, AI_ROW).status).toBe('pending');
  });

  it('never moves the bar backwards along the rows', () => {
    const stages = buildDAProgressStages(at('parsing'), WORKFLOW);
    const percents = stages.map((stage) => stage.progress);

    percents.forEach((percent, index) => {
      if (index > 0) expect(percent).toBeGreaterThan(percents[index - 1]);
    });
    expect(percents[0]).toBeGreaterThanOrEqual(0);
    expect(percents[percents.length - 1]).toBe(100);
  });

  it('keeps the same percent for a stage whether or not the skill row is shown', () => {
    const withSkills = buildDAProgressStages(at('ai-evaluation'), WORKFLOW);
    const withoutSkills = buildDAProgressStages(at('ai-evaluation'), {
      workflowBacked: true,
      hasCustomSkills: false,
    });

    expect(row(withSkills, AI_ROW).progress).toBe(row(withoutSkills, AI_ROW).progress);
  });
});

describe('DA progress stages — review input helpers', () => {
  const packageEvidence = {} as NonNullable<DAReviewExecutionInput['packageEvidence']>;
  const workflowRequest = {} as NonNullable<DAReviewExecutionInput['workflowRequest']>;
  const skillBundle = {} as NonNullable<DAReviewExecutionInput['skillBundles']>[number];
  const skillReview = {} as NonNullable<DAReviewExecutionInput['customSkillReviews']>[number];

  // A ZIP upload always carries package evidence, and a resumed run always
  // carries its prepared request. Either one sends the AI evaluation to the
  // durable workflow; without both, the pipeline uses the older prompt path.
  it('detects when the AI evaluation is served by the workflow', () => {
    expect(isDAReviewWorkflowBacked({ packageEvidence })).toBe(true);
    expect(isDAReviewWorkflowBacked({ workflowRequest })).toBe(true);
    expect(isDAReviewWorkflowBacked({})).toBe(false);
  });

  it('shows the custom-skill row for new and already reviewed custom skills only', () => {
    expect(hasDACustomSkillStage({ skillBundles: [skillBundle] })).toBe(true);
    expect(hasDACustomSkillStage({ customSkillReviews: [skillReview] })).toBe(true);
    expect(hasDACustomSkillStage({ skillBundles: [], customSkillReviews: [] })).toBe(false);
    expect(hasDACustomSkillStage({})).toBe(false);
  });
});
