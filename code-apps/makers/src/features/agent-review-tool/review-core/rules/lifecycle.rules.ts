/**
 * Lifecycle context — two rules, and both are records.
 *
 * LCY-01 states which harness the agent runs on; LCY-02 states what it is made
 * of. Neither is a judgement: "this agent has three tools" is not a finding, it
 * is the context a reviewer needs in order to read every other finding.
 * `severity: 'info'` is what makes that expressible — the scorer excludes info
 * rules from both sides of the ratio, so a record is published without diluting
 * the pillar it sits in.
 *
 * Their `pillar` is therefore inert — nothing reads it — but the field is
 * required and there is no Lifecycle pillar to name: `AGENT_PILLAR_WEIGHTS` sums
 * to exactly 100 across six pillars and a seventh would break that arithmetic.
 * `orchestration` is the pillar these facts most describe. ART's own grouping is
 * unchanged: the adapter still publishes `family: 'Lifecycle'`, which is what the
 * UI groups by and what Dataverse has stored.
 *
 * Both rules carry a per-instance `why` that is narrower than the rule's own —
 * the rule-level `why` explains why the record exists at all, the instance's
 * explains what the recorded fact means. That split is what the hand-written
 * findings already published, so it is preserved rather than reconciled.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { record, type Rule } from '../rule';

export const LCY_01: Rule<AgentsExperienceModel> = {
  id: 'LCY-01',
  title: 'Copilot harness configuration',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality'],
  references: ['ms-classic-vs-new'],
  prose: {
    question: 'Which harness is this agent configured to run on?',
    summary: 'The review context selects the Copilot harness.',
    why: 'Harness selection determines the supported rule catalog and configuration capabilities.',
    fix: 'No action required — consult harness guidance when planning capabilities.',
    passWhen: ['The captured configuration identifies the harness the agent runs on.'],
    failWhen: [],
    notApplicableWhen: [],
  },
  evidence: {
    fieldPaths: ['agentSettings'],
    populations: ['configuration'],
  },
  check() {
    return record([{
      title: 'This agent runs on the Microsoft Copilot harness',
      detail: 'bot.configuration contains agentSettings',
      why: 'The Microsoft Copilot and standard harnesses expose different capabilities. '
        + 'You can upgrade a standard agent to a copy on the Microsoft Copilot harness (preview). '
        + 'The upgrade creates a copy and does not migrate knowledge sources, Power Fx expressions, or child agents.',
      makerAction: 'Check the harness comparison before you depend on a capability the standard harness provides.',
    }]);
  },
};

export const LCY_02: Rule<AgentsExperienceModel> = {
  id: 'LCY-02',
  title: 'Agent composition',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-agents-overview'],
  prose: {
    question: 'What tools, skills, connected agents, knowledge sources and evaluation sets does this agent hold?',
    summary: 'Record the captured tool, skill, connected-agent, knowledge and evaluation inventory.',
    why: 'Composition is configuration context and does not count as a successful quality check.',
    fix: 'No action required — keep the captured inventory current.',
    passWhen: ['The captured component inventory is recorded.'],
    failWhen: [],
    notApplicableWhen: [],
  },
  evidence: {
    fieldPaths: ['components'],
    populations: ['tools', 'skills', 'connectedAgents', 'knowledge', 'evaluation'],
  },
  check(model) {
    const counts = [
      `${model.tools.length} tools`, `${model.skills.length} skills`,
      `${model.connectedAgents.length} connected agents`, `${model.knowledge.length} knowledge sources`,
      `${model.evaluationSets.length} evaluation sets`,
    ];
    return record([{
      title: 'Agent composition',
      detail: counts.join(' · '),
      why: 'A Microsoft Copilot agent is organized around instructions, knowledge, tools, skills, model, and connected agents.',
      makerAction: 'No action required — surfaced for the review record.',
    }]);
  },
};

export const lifecycleRules: readonly Rule<AgentsExperienceModel>[] =
  Object.freeze([LCY_01, LCY_02]);
