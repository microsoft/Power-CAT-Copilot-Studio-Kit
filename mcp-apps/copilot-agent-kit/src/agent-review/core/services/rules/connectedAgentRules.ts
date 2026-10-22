import type { Rule } from './ruleTypes.js';
import type { GroundedFinding } from '../../contracts/Findings.js';

const FAMILY = 'Connected agents';

// CON-01/CON-02 (env bot existence + publish state) require the environment bot
// list and run in the orchestrator (Task 10), not in this pure engine.
export const connectedAgentRules: Rule[] = [
  {
    id: 'CON-03', family: FAMILY, severity: 'warning', referenceId: 'ms-connected-agent',
    check(model) {
      return model.connectedAgents
        .filter(a => !a.description || a.description.trim().length < 15)
        .map<GroundedFinding>(a => ({
          componentIdUnique: a.componentIdUnique,
          id: 'CON-03', family: FAMILY, severity: 'warning', referenceId: 'ms-connected-agent', ai: false,
          title: `Connected agent "${a.name}" has no delegation description`,
          fact: `description: ${a.description ? `"${a.description}"` : 'missing'}`,
          why: 'The orchestrator delegates to a connected agent based on a clear description of when it should be used.',
          fix: 'Add a description stating when the primary agent should delegate to this connected agent.',
        }));
    },
  },
  {
    id: 'CON-04', family: FAMILY, severity: 'info', referenceId: 'ms-connected-agent', kind: 'record',
    check(model) {
      if (model.connectedAgents.length === 0) return null;
      return {
        id: 'CON-04', family: FAMILY, severity: 'info', referenceId: 'ms-connected-agent', ai: false,
        title: `Connected agents: ${model.connectedAgents.length}`,
        fact: model.connectedAgents.map(a =>
          `${a.name} → ${a.botSchemaName ?? '?'} (history: ${a.historyTypeKind ?? 'none'})`).join('\n'),
        why: 'Connected agents let the primary agent delegate specialized tasks; conversation history passing is surfaced for review.',
        fix: 'No action required — inventory shown for the review record.',
      };
    },
  },
];
