/**
 * The Instructions pillar — four rules over the instruction text.
 *
 * These moved out of `agents-experience/services/rules/instructionRules.ts`,
 * which is now a publication adapter. The forty-character threshold and the
 * citation heuristic are the same predicates over the same field, declared once
 * here. INS-07 no longer carries a predicate at all: it is an AI rule, and the
 * mechanical half of the named-capability detector it used to run is declared
 * separately as INS-09 rather than left inside it.
 *
 * All four read `agentSettings.instructions` — INS-09 also reads the capability
 * inventory — but they are separate rules rather than one with four branches
 * because they fail for different reasons, cite different evidence and are
 * scored independently. INS-08 and INS-09 opt out when the text is empty rather
 * than piling a second failure on an agent that already failed INS-01.
 */

import { norm } from '../../agents-experience/services/rules/ruleTypes';
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { configuredCapabilityNames, missingCapabilityReferences } from './capability-references';
import { rule, pass, failWith, notApplicable, type Rule } from '../rule';

/** The base-rule threshold below which instruction text is treated as a stub. */
const MINIMUM_INSTRUCTION_LENGTH = 40;

const CITATION_TERM = /\bcitations?\b|\breferences?\b/;
const CITATION_VERB = /\b(format|structure|display|show|hide|remove|suppress)\b/;

export const INS_01: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'INS-01',
  title: 'Instructions define more than a trivial prompt',
  harnesses: ['copilot'],
  pillar: 'instructions',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-authoring-instructions'],
  prose: {
    question: 'Do the instructions say enough to govern how the agent behaves?',
    summary: 'Inspect the configured instruction text against the forty-character base-rule threshold.',
    why: 'Instructions establish the agent role, boundaries, ambiguity handling and escalation guidance.',
    fix: 'Write instructions covering the role, boundaries, ambiguous-input handling and escalation.',
    passWhen: ['The trimmed instruction text is at least forty characters long.'],
    failWhen: [
      'No instruction text is configured at all.',
      'The trimmed instruction text is shorter than forty characters.',
    ],
    notApplicableWhen: [],
  },
  evidence: {
    fieldPaths: ['agentSettings.instructions'],
    populations: ['instructions'],
    completeForFailure: ['instructions'],
  },
  check(model) {
    const text = model.agentSettings.instructions.trim();
    if (text.length === 0) {
      return failWith([{
        title: 'No instructions are configured',
        detail: 'instructions are empty',
        why: 'Instructions are required to define the agent\'s role, behavior, boundaries, ambiguity handling, and escalation guidance.',
        makerAction: 'Add instructions that define the agent\'s role, tone, boundaries, ambiguity handling, and escalation.',
      }]);
    }
    if (text.length >= MINIMUM_INSTRUCTION_LENGTH) return pass();
    return failWith([{
      title: 'Instructions are missing or trivial',
      detail: `instructions length: ${text.length} characters`,
      why: 'Instructions are the primary control over a Microsoft Copilot agent — role, tone, boundaries, and escalation all come from them.',
      makerAction: 'Write instructions covering the agent\'s role, tone, boundaries, ambiguous-input handling, and escalation.',
    }]);
  },
});

export const INS_07: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'INS-07',
  title: 'Named instruction capabilities are configured',
  harnesses: ['copilot'],
  pillar: 'instructions',
  subjectScope: 'agent',
  execution: 'ai',
  severity: 'high',
  tags: ['capability-alignment', 'quality'],
  references: ['ms-authoring-instructions', 'ms-tools-skills'],
  prose: {
    question: 'Does every capability the instructions name by hand actually exist on the agent?',
    summary: 'Compare detected named instruction references with captured capabilities.',
    // `title` above is the catalogue label — "this is configured correctly".
    // The skill registry publishes a failure headline instead, so the rule
    // states both rather than letting a second registry state one of them.
    failTitle: 'Agent Instructions Name a Capability the Agent Does Not Have',
    why: 'Instructions that direct the agent to use a tool or knowledge source it was never given set an expectation the runtime cannot meet.',
    fix: "Align the instructions with the agent's actual configuration: add the capability, or stop referring to it.",
    fixSteps: [
      'List every capability named in the agent instructions and check each against the configured capability list.',
      'Add the missing capability to the agent, or remove the instruction that depends on it.',
    ],
    passWhen: ['Every named capability reference matches a captured tool, skill, connected agent or knowledge source.'],
    failWhen: ['The instructions name a capability that is not in the captured inventory.'],
    notApplicableWhen: [
      'No instruction text is configured — INS-01 assesses that prerequisite.',
      'The instruction text contains no named capability reference this detector recognises.',
    ],
  },
  evidence: {
    fieldPaths: ['agentSettings.instructions'],
    populations: ['instructions', 'tools', 'skills', 'connectedAgents', 'knowledge'],
    completeForFailure: ['tools', 'skills', 'connectedAgents', 'knowledge'],
  },
  // `execution: 'ai'` with no `check`, which is the registry's invariant for that
  // case. The deterministic detector this rule used to carry required the literal
  // form "use X tool", so a skill whose referenced capabilities were all missing
  // passed the scanner silently (observed in production, job 969ddf01). Judging a
  // named reference against the captured inventory is a reading task, and the
  // `copilot-instructions` node already owns it; a second, narrower copy here only
  // produced disagreements the reviewer had to adjudicate.
});

export const INS_08: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'INS-08',
  title: 'Instructions leave system citation behavior intact',
  harnesses: ['copilot'],
  pillar: 'instructions',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality', 'security'],
  references: ['ms-authoring-instructions'],
  prose: {
    question: 'Do the instructions try to reformat, hide or suppress system citations?',
    summary: 'Inspect citation/reference terms together with formatting or visibility verbs.',
    why: 'Citation-format changes can conflict with grounding behavior; this static heuristic does not observe response rejection.',
    fix: 'Remove instructions that change system citation generation, structure or visibility.',
    passWhen: [
      'The instructions never mention citations or references.',
      'Citations are mentioned without any formatting or visibility verb.',
    ],
    failWhen: ['The instructions pair a citation or reference term with a formatting or visibility verb.'],
    notApplicableWhen: ['No instruction text is configured — INS-01 assesses that prerequisite.'],
  },
  evidence: {
    fieldPaths: ['agentSettings.instructions'],
    populations: ['instructions'],
  },
  check(model) {
    const text = norm(model.agentSettings.instructions);
    if (!text) return notApplicable('No instruction text is configured; INS-01 assesses that prerequisite.');
    if (!CITATION_TERM.test(text)) return pass();
    if (!CITATION_VERB.test(text)) return pass();
    return failWith([{
      title: 'Instructions attempt to alter citation behavior',
      detail: 'instructions mention citations/references together with a formatting/visibility verb',
      why: 'Modifying or suppressing the system citation format can make the orchestrator treat responses as ungrounded and discard them.',
      makerAction: 'Remove instructions that change how citations are generated, structured, or displayed.',
    }]);
  },
});

/**
 * The named-capability detector INS-07 used to carry, restored under its own id.
 *
 * INS-07 became an AI rule because deciding whether a phrase *means* a capability
 * is a reading task. The mechanical half of that question is not: an instruction
 * that names a capability in quotes, backticks or Title Case, in a "use the X
 * tool" frame, either matches the captured inventory or it does not. That half is
 * cheap, runs with no workflow, and survives the workflow being unreachable.
 *
 * The detector itself lives in `capability-references.ts` because SKL-15 asks the
 * same question of skill bodies, and the two must not drift apart.
 *
 * It is `medium` rather than `high` on purpose. INS-07 judges the same text from
 * the other side, so a stop-list miss here must not cost the pillar twice.
 */
const INS_09_FAIL_TITLE = 'Instructions reference a capability the agent does not have';

const INS_09_WHY =
  'An agent cannot act on an instruction to use a tool, skill, connected agent or knowledge source it is not configured with.';

const INS_09_FIX =
  'Add the referenced capability to the agent, or remove the reference from the instructions.';

export const INS_09: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'INS-09',
  title: 'Instructions name only capabilities the agent has',
  harnesses: ['copilot'],
  pillar: 'instructions',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['capability-alignment', 'quality'],
  references: ['ms-authoring-instructions'],
  prose: {
    question: 'Does every capability the instructions name in an invocation frame exist on the agent?',
    summary: 'Match quoted, backticked and Title-Case capability names against the captured inventory.',
    why: INS_09_WHY,
    fix: INS_09_FIX,
    failTitle: INS_09_FAIL_TITLE,
    passWhen: ['Every name the instructions invoke resolves to a configured capability.'],
    failWhen: ['The instructions invoke a name that matches no configured tool, skill, connected agent or knowledge source.'],
    notApplicableWhen: ['No instruction text is configured, so there is nothing to resolve.'],
  },
  evidence: {
    fieldPaths: ['agentSettings.instructions'],
    populations: ['instructions', 'tools', 'skills', 'connectedAgents', 'knowledge'],
    completeForFailure: ['tools', 'skills', 'connectedAgents', 'knowledge'],
  },
  check(model) {
    const text = model.agentSettings.instructions;
    // INS-01 already fails an empty agent; passing here would credit the emptiness.
    if (!text.trim()) return notApplicable('no instruction text is configured');
    const missing = missingCapabilityReferences(text, configuredCapabilityNames(model));
    if (missing.length === 0) return pass();
    return failWith([{
      title: INS_09_FAIL_TITLE,
      detail: `named but not configured: ${missing.join(', ')}`,
      why: INS_09_WHY,
      makerAction: INS_09_FIX,
    }]);
  },
});

export const instructionRules: readonly Rule<AgentsExperienceModel>[] =
  Object.freeze([INS_01, INS_07, INS_08, INS_09]);
