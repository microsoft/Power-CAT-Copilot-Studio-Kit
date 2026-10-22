import type { Rule } from './ruleTypes.js';
import { norm } from './ruleTypes.js';

const FAMILY = 'Knowledge';

export const knowledgeRules: Rule[] = [
  {
    id: 'KNW-01', family: FAMILY, severity: 'info', referenceId: 'ms-knowledge-add', kind: 'record',
    check(model) {
      if (model.knowledge.length === 0 && model.agentSettings.enableWebSearch === undefined) return null;
      return {
        id: 'KNW-01', family: FAMILY, severity: 'info', referenceId: 'ms-knowledge-add', ai: false,
        title: `Knowledge inventory: ${model.knowledge.length} sources`,
        fact: [...model.knowledge.map(k => `${k.name} (${k.sourceKind ?? '?'})`),
          `webSearch: ${model.agentSettings.enableWebSearch ?? false}`].join('\n'),
        why: 'Knowledge sources define what the agent can reference when answering.',
        fix: 'No action required — inventory shown for the review record.',
      };
    },
  },
  {
    id: 'KNW-02', family: FAMILY, severity: 'warning', referenceId: 'ms-knowledge-add',
    check(model) {
      const text = norm(model.agentSettings.instructions);
      const promises = /\bknowledge base\b|\bdocumentation\b|\bour docs\b|\bknowledge sources?\b/.test(text);
      const hasKnowledge = model.knowledge.length > 0 || model.agentSettings.enableWebSearch === true;
      if (!promises || hasKnowledge) return null;
      return {
        id: 'KNW-02', family: FAMILY, severity: 'warning', referenceId: 'ms-knowledge-add', ai: false,
        title: 'Instructions promise knowledge the agent does not have',
        fact: `instructions reference knowledge; configured sources: 0; web search: ${model.agentSettings.enableWebSearch ?? false}`,
        why: 'The agent cannot answer from a knowledge base it is not connected to.',
        fix: 'Add the knowledge source, enable web search, or remove the promise from the instructions.',
      };
    },
  },
  {
    id: 'KNW-03', family: FAMILY, severity: 'info', referenceId: 'ms-work-iq',
    check(model) {
      const workIq = model.tools.filter(t => /a365/i.test(t.connectorId ?? ''));
      if (workIq.length === 0) return null;
      return {
        id: 'KNW-03', family: FAMILY, severity: 'info', referenceId: 'ms-work-iq', ai: false,
        title: `${workIq.length} Work IQ preview tools in use`,
        fact: workIq.map(t => `${t.name} → ${t.connectorId}`).join('\n'),
        why: 'Work IQ MCP is a preview feature and not intended for production use.',
        fix: 'Track the Work IQ MCP release status before promoting this agent to production.',
      };
    },
  },
  {
    id: 'KNW-04', family: FAMILY, severity: 'info', referenceId: 'ms-memory',
    check(model) {
      if (model.agentSettings.enableMemory !== true) return null;
      return {
        id: 'KNW-04', family: FAMILY, severity: 'info', referenceId: 'ms-memory', ai: false,
        title: 'Memory is enabled',
        fact: 'agentSettings.enableMemory: true',
        why: 'Memory persists user preferences per user across sessions.',
        fix: 'Confirm memory\'s per-user persistence fits your data-handling requirements.',
      };
    },
  },
];
