/**
 * Model configuration — one rule, and it is a record.
 *
 * MDL-01 reports which model the agent was configured with. It never fails,
 * because "this agent uses GPT-4o" is not a finding; it is context the reviewer
 * needs in order to read every other finding. `severity: 'info'` is what makes
 * that expressible: the scorer excludes info rules from both sides of the ratio,
 * so a record is published without diluting the pillar it sits in.
 *
 * Its `pillar` is therefore inert — nothing reads it — but the field is required
 * and a lie is worse than an arbitrary truth, so it names the pillar the model
 * most affects. ART's own grouping is unchanged: the adapter still publishes
 * `family: 'Model'`, which is what the UI groups and what Dataverse has stored.
 */
import { prettyModelSeries } from '../../agents-experience/services/modelDisplay';
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { notApplicable, record, type Rule } from '../rule';

export const MDL_01: Rule<AgentsExperienceModel> = {
  id: 'MDL-01',
  title: 'Selected model configuration',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality'],
  references: ['ms-select-model'],
  prose: {
    question: 'Which model series is this agent configured to reason with?',
    summary: 'Record the explicitly captured model series.',
    why: 'Model selection is configuration context, not a measured reasoning or performance result.',
    fix: 'No action required — review the selected model against the intended workload.',
    passWhen: ['A model series is explicitly captured in the agent configuration.'],
    failWhen: [],
    notApplicableWhen: ['No model series is explicitly configured.'],
  },
  evidence: {
    fieldPaths: ['agentSettings.modelSeries'],
    populations: ['configuration'],
  },
  check(model) {
    const series = model.agentSettings.modelSeries;
    if (!series) return notApplicable('No model series is explicitly configured.');
    return record([{
      title: `Model: ${prettyModelSeries(series)}`,
      detail: `agentSettings.model.series: ${series}`,
      why: 'The selected model affects reasoning depth, response quality, and speed.',
      makerAction: 'No action required — surfaced for the review record.',
    }]);
  },
};

export const modelRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([MDL_01]);
