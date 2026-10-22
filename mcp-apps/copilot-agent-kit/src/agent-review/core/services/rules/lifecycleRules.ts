import type { Rule } from './ruleTypes.js';

const FAMILY = 'Lifecycle';

export const lifecycleRules: Rule[] = [
  {
    id: 'LCY-01', family: FAMILY, severity: 'info', referenceId: 'ms-classic-vs-new', kind: 'record',
    check(model) {
      if (model.harness === 'standard') {
        return {
          id: 'LCY-01', family: FAMILY, severity: 'info', referenceId: 'ms-classic-vs-new', ai: false,
          title: 'This agent runs on the Standard harness',
          fact: 'The reviewed model records harness="standard".',
          why: 'The Standard and GitHub Copilot harnesses expose different capabilities. The review worker does not determine the target harness.',
          fix: 'Check the harness comparison for Standard target capabilities, not the inline review worker.',
        };
      }
      return {
        id: 'LCY-01', family: FAMILY, severity: 'info', referenceId: 'ms-classic-vs-new', ai: false,
        title: 'This agent runs on the GitHub Copilot harness',
        fact: 'bot.configuration contains agentSettings',
        why: 'The GitHub Copilot and standard harnesses expose different capabilities, and an agent cannot be moved between them.',
        fix: 'Check the harness comparison before you depend on a capability the standard harness provides.',
      };
    },
  },
  {
    id: 'LCY-02', family: FAMILY, severity: 'info', referenceId: 'ms-agents-overview', kind: 'record',
    check(model) {
      const standard = model.harness === 'standard';
      const topics = model.topics ?? [];
      const counts = [
        ...(standard ? [
          `${topics.length} Standard topics`,
          `${topics.reduce((total, topic) => total + topic.actions.length, 0)} executable actions`,
        ] : []),
        `${model.tools.length} tools`, `${model.skills.length} skills`,
        `${model.connectedAgents.length} connected agents`, `${model.knowledge.length} knowledge sources`,
        `${model.evaluationSets.length} evaluation sets`,
      ];
      return {
        id: 'LCY-02', family: FAMILY, severity: 'info', referenceId: 'ms-agents-overview', ai: false,
        title: 'Agent composition',
        fact: counts.join(' · '),
        why: standard
          ? 'A Standard agent uses its retained topics and executable actions alongside instructions, knowledge, tools, skills, and connected agents.'
          : 'A GitHub Copilot agent is organized around instructions, knowledge, tools, skills, model, and connected agents.',
        fix: 'No action required — surfaced for the review record.',
      };
    },
  },
];
