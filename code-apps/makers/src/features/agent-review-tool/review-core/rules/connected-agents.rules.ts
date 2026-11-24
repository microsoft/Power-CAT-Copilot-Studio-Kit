/**
 * Connected agents — two rules: one check and one record.
 *
 * CON-03 asks whether each connected agent says *when* the primary agent should
 * delegate to it, and answers once per offending agent: one rule, many rows. The
 * fifteen-character floor is the base-rule threshold ART has always applied, kept
 * verbatim rather than re-reasoned, because a relocation that moves a threshold
 * silently rescores every agent that sat near it.
 *
 * CON-04 is a record. "This agent delegates to three others, two of which receive
 * conversation history" is context a reviewer needs in order to read CON-03's
 * answer, not a verdict of its own, so it is `severity: 'info'` and the scorer
 * excludes it from both sides of the ratio.
 *
 * Neither rule decides what happens when no connected agents were captured at
 * all. That is ART's availability cascade — an empty optional population is
 * not-applicable when the capture was complete and could-not-run when it was not
 * — and it stays in the adapter (`optionalPopulation: 'connectedAgents'`) rather
 * than being re-derived here, because "no connected agents" and "we could not
 * read the connected agents" are not the same answer and only the host knows
 * which one it is holding.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { failWith, pass, notApplicable, record, rule, type Rule } from '../rule';

/** The base-rule floor for a delegation description, in trimmed characters. */
const MINIMUM_DESCRIPTION_LENGTH = 15;

export const CON_03: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'CON-03',
  title: 'Connected agents have delegation descriptions',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-connected-agent'],
  prose: {
    question: 'Does every connected agent describe when the primary agent should delegate to it?',
    summary: 'Inspect connected-agent descriptions against the fifteen-character base-rule threshold.',
    why: 'Descriptions tell the primary agent when delegation is intended.',
    fix: 'Describe when the primary agent should delegate to each connected agent.',
    passWhen: ['Every captured connected agent has a description of at least fifteen trimmed characters.'],
    failWhen: [
      'A captured connected agent has no description.',
      'A captured connected agent has a description shorter than fifteen trimmed characters.',
    ],
    notApplicableWhen: ['No connected agents were captured.'],
  },
  evidence: {
    fieldPaths: ['connectedAgents.description'],
    populations: ['connectedAgents'],
  },
  check(model) {
    const weak = model.connectedAgents.filter(
      a => !a.description || a.description.trim().length < MINIMUM_DESCRIPTION_LENGTH,
    );
    if (weak.length === 0) return pass();
    return failWith(weak.map(a => ({
      subjectId: a.componentIdUnique,
      subject: a.name,
      subjectRef: {
        id: a.componentIdUnique?.trim() || a.componentId?.trim() || undefined,
        schemaName: a.schemaname,
        quote: a.description ?? '',
      },
      title: `Connected agent "${a.name}" has no delegation description`,
      detail: `description: ${a.description ? `"${a.description}"` : 'missing'}`,
      why: 'The orchestrator delegates to a connected agent based on a clear description of when it should be used.',
      makerAction: 'Add a description stating when the primary agent should delegate to this connected agent.',
    })));
  },
});

export const CON_04: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'CON-04',
  title: 'Connected-agent inventory',
  harnesses: ['copilot'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-connected-agent'],
  prose: {
    question: 'Which connected agents can this agent delegate to, and what conversation history does each receive?',
    summary: 'Record captured targets and conversation-history settings.',
    why: 'Delegation configuration is review context, not a quality verdict.',
    fix: 'No action required — keep the connected-agent inventory current.',
    passWhen: ['At least one connected agent is captured.'],
    failWhen: [],
    notApplicableWhen: ['No connected agents were captured.'],
  },
  evidence: {
    fieldPaths: ['connectedAgents'],
    populations: ['connectedAgents'],
  },
  check(model) {
    if (model.connectedAgents.length === 0) {
      return notApplicable('No connected agents were captured, so there is no inventory to record.');
    }
    return record([{
      title: `Connected agents: ${model.connectedAgents.length}`,
      detail: model.connectedAgents.map(a =>
        `${a.name} → ${a.botSchemaName ?? '?'} (history: ${a.historyTypeKind ?? 'none'})`).join('\n'),
      why: 'Connected agents let the primary agent delegate specialized tasks; conversation history passing is surfaced for review.',
      makerAction: 'No action required — inventory shown for the review record.',
    }]);
  },
});

export const connectedAgentRules: readonly Rule<AgentsExperienceModel>[] =
  Object.freeze([CON_03, CON_04]);
