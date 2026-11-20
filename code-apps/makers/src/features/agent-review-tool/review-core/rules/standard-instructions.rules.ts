/**
 * The 15 Standard-harness instruction-compliance rules.
 *
 * These are the oldest rules in the product and the last to reach a registry.
 * They are declared in `contracts/Constants.ts` as `COMPLIANCE_CRITERIA`,
 * projected into workflow templates by `STANDARD_INSTRUCTION_WORKFLOW_RULES`,
 * composed into the `standard` AI node contract by `ai-nodes/catalog.ts`, and
 * parsed back out by `parseInstructionRuleResults` — four files, no registry
 * entry. The scorer therefore reached them only through the legacy
 * `FAMILY_TO_PILLAR` table, which resolves the hardcoded `family: 'Instructions'`
 * that the parser stamps on every one of them.
 *
 * That is exactly the lookup Phase 3 replaces with `ruleById(...)?.pillar`, so
 * without this file all 15 would leave the Instructions denominator the moment
 * the swap landed — silently, because an unresolved id is dropped rather than
 * failed. They are real, current, maintained rules: every new Standard review
 * emits all 15, so this is not legacy drift to be tolerated with a fallback.
 *
 * **Severity.** The criteria grade themselves `High | Medium | Low`, and this
 * vocabulary has no `low`. That is not a loss: `parseInstructionRuleResults`
 * already collapses the three to two, mapping `High` to `error` and *both*
 * `Medium` and `Low` to `warning`. `Low` therefore becomes `medium` here, whose
 * `severityCredit` is 0.5 — the same credit the legacy `CREDIT` table gave a
 * `warning`. Registering these moves no Standard score.
 *
 * **Tags are the catalog's, unioned with what was already here.** `tags` is a
 * closed list, and the six subject-axis words the AI catalog uses — `routing`,
 * `scope`, `ux`, `grounding`, `capability-alignment`, `dependencies` — were not
 * members, so an earlier pass dropped them and left six rules with `[]`. They
 * are members now, and each rule carries the union of the two sets: nothing the
 * catalog knew is lost, and nothing this file knew is either. Three rules
 * therefore keep a `safety` tag the catalog does not carry.
 *
 * **Prose is reproduced, not rewritten.** `why` and `fix` are the existing
 * `description` and `INSTRUCTION_ACTIONS` strings verbatim so that registering a
 * rule cannot change what a maker reads. Rewriting them is owned separately.
 *
 * **Not every criterion is an instruction rule.** All 15 arrive from one
 * instruction-compliance file, so registering them as `instructions` wholesale
 * was a provenance artefact rather than a judgement. Five ask about something
 * else and declare their own `pillar`:
 *
 * - `tool-routing-hints` and `escalation-guidance` ask who owns a request and
 *   where it goes when this agent cannot serve it. That is **orchestration**.
 * - `citations-and-sources`, `link-safety` and `accuracy-quality` ask what the
 *   agent may present as sourced fact. That is **knowledge** — and the Standard
 *   harness has *no* deterministic knowledge rules at all, because `KNW-01`
 *   through `KNW-04` are all `harnesses: COPILOT`. Its 8-point pillar scored
 *   `null` and was dropped from every composite. These three are its entire
 *   subject.
 *
 * `accuracy-quality` was briefly registered as `instructions`, on the argument
 * that forbidding fabrication is a property of the instruction text. Its own
 * `why` and `fix` say otherwise — they speak of grounding the agent in knowledge
 * sources and requiring grounded evidence — and the AI catalog, which is what
 * actually scores it today, always read it as knowledge. The catalog's reading
 * wins, so this file now agrees with both the catalog and the rule's own words.
 */

import type { ParsedBotData } from '../../contracts/ServiceContracts';
import type { AgentPillar } from '../pillars';
import { rule, type Rule } from '../rule';
import type { Severity } from '../severity';

interface ComplianceDeclaration {
  /** Matches `COMPLIANCE_CRITERION_IDS` and the `ruleId` the parser stamps. */
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly tags: readonly string[];
  /** `ComplianceCriterion.description`, verbatim. */
  readonly why: string;
  /** `INSTRUCTION_ACTIONS[id]`, verbatim — the maker action. */
  readonly fix: string;
  /** Only the two criteria whose node contract already declares one. */
  readonly notApplicableWhen?: readonly string[];
  /**
   * Overrides the family default. Four of the 15 ask about something other than
   * instruction text; see the "Not every criterion is an instruction rule" note
   * in the file header.
   */
  readonly pillar?: AgentPillar;
}

const DECLARATIONS: readonly ComplianceDeclaration[] = Object.freeze([
  {
    id: 'scope-definition',
    title: 'Scope Definition',
    severity: 'high',
    tags: ['quality', 'scope'],
    why: 'Clearly defines what topics the agent should respond to',
    fix: 'Define the supported domains and the owner for each route. Test one supported and one unsupported request.',
  },
  {
    id: 'out-of-scope-handling',
    title: 'Out-of-Scope Handling',
    severity: 'medium',
    tags: ['quality', 'scope'],
    why: 'Specifies how to handle requests outside defined scope',
    fix: 'Add a final response for requests that match no supported route. Test a clearly unsupported request.',
  },
  {
    id: 'persona-and-tone',
    title: 'Persona & Tone',
    severity: 'medium',
    tags: ['ux'],
    why: 'Defines specific tone for non-default scenarios (professional/polite is already the default)',
    fix: 'Define the response behavior for the identified non-default situation. Test that situation before routing.',
    notApplicableWhen: [
      'No supplied non-default situation requires specific response behavior. Professional and polite behavior alone is not a missing-tone defect.',
    ],
  },
  {
    id: 'privacy-and-sensitive-data',
    title: 'Privacy & Sensitive Data',
    severity: 'high',
    tags: ['privacy', 'safety', 'security'],
    why: 'Provides guidelines for handling personal/sensitive information',
    fix: 'Limit sensitive data to the signed-in user, stated purpose, and required route. Test an over-broad data request.',
  },
  {
    id: 'fallback-when-uncertain',
    title: 'Fallback When Uncertain',
    severity: 'high',
    tags: ['quality'],
    why: 'Specifies what to do when agent lacks information',
    fix: 'Add a no-guess rule, an approved fallback, and a stop condition. Test an empty or failed dependency response.',
  },
  {
    id: 'citations-and-sources',
    title: 'Citations & Sources',
    severity: 'medium',
    tags: ['grounding', 'quality'],
    why: 'Requires citing sources and providing references',
    fix: 'Require available source attribution for parent-generated grounded answers. Test a source-backed answer.',
    pillar: 'knowledge',
  },
  {
    id: 'formatting-guidelines',
    title: 'Formatting Guidelines',
    severity: 'medium',
    tags: ['ux'],
    why: 'Specifies how responses should be formatted (bullets, tables, numbered steps) for structured or multi-part output',
    fix: 'Define the final structure for multi-part parent responses. Test a request with two supported intents.',
    notApplicableWhen: [
      'No supplied task requires structured or multi-part output. A neutral formatting preference is not a deficiency.',
    ],
  },
  {
    id: 'clarifying-questions',
    title: 'Clarifying Questions',
    severity: 'medium',
    tags: ['quality', 'ux'],
    why: 'Handles ambiguous queries with clarification requests',
    fix: 'Require one focused question when required data or route ownership is ambiguous. Test an ambiguous request.',
  },
  {
    id: 'prompt-injection-resilience',
    title: 'Prompt Injection Protection',
    severity: 'high',
    tags: ['safety', 'security'],
    why: 'Safeguards against manipulation attempts',
    fix: 'Reject requests to reveal or override hidden instructions, permissions, tools, or routing policy. Test an override request.',
  },
  {
    id: 'link-safety',
    title: 'Link Safety',
    severity: 'medium',
    tags: ['grounding', 'safety', 'security'],
    why: 'Ensures only safe/verified links are shared',
    fix: 'Require verified destinations and safe link text for parent-created links. Test an unverified destination.',
    pillar: 'knowledge',
  },
  {
    id: 'advice-disclaimers',
    title: 'Advice Disclaimers',
    severity: 'high',
    tags: ['safety'],
    why: 'Provides disclaimers for sensitive advice domains',
    fix: 'Add the required boundary or disclaimer before consequential advice. Test a sensitive-domain request.',
  },
  {
    id: 'accuracy-quality',
    title: 'Accuracy & Quality',
    severity: 'high',
    tags: ['grounding', 'quality'],
    why: 'Explicitly grounds the agent in knowledge sources and prohibits fabrication or guessing',
    fix: 'Require grounded evidence and prohibit fabrication after missing information or dependency failure. Test an ungrounded request.',
    pillar: 'knowledge',
  },
  {
    id: 'tool-routing-hints',
    title: 'Tool Routing Hints',
    severity: 'medium',
    tags: ['quality', 'routing', 'token-optimizer'],
    why: 'Provides hints for when to use specific tools or knowledge sources when ambiguous',
    fix: 'State when each ambiguous tool, source, or agent owns the request. Test the shared boundary request.',
    pillar: 'orchestration',
  },
  {
    id: 'escalation-guidance',
    title: 'Escalation Guidance',
    severity: 'high',
    tags: ['routing', 'ux'],
    why: 'Defines what the agent should do when it cannot help — handoff to human, suggest alternative, or graceful exit',
    fix: 'Separate ticket creation, ticket escalation, and live-agent handoff with terminal outcomes. Test each intent.',
    pillar: 'orchestration',
  },
  {
    id: 'deterministic-language',
    title: 'Deterministic Language',
    severity: 'medium',
    tags: ['quality'],
    why: 'Uses absolute directives (always, never, only, must) instead of vague modifiers (might, usually, try, sometimes)',
    fix: 'Replace vague required steps with mandatory actions, success conditions, and stop conditions. Test both success and failure.',
  },
] as const);

/**
 * The verdict comes from the `standard` AI node, which `nodesFor` derives from
 * the harness, so these carry no `check` — the registry's invariant for
 * `execution: 'ai'`. The question and failure sentences are the same ones
 * `STANDARD_INSTRUCTION_WORKFLOW_RULES` generates, built from the title the
 * same way, so the node contract and the registry describe one rule.
 */
function complianceRule(declaration: ComplianceDeclaration): Rule<ParsedBotData> {
  const subject = declaration.title.toLowerCase();
  return rule<ParsedBotData>({
    id: declaration.id,
    title: declaration.title,
    harnesses: ['standard'],
  pillar: declaration.pillar ?? 'instructions',
    subjectScope: 'agent',
    execution: 'ai',
    severity: declaration.severity,
    tags: declaration.tags,
    references: [],
    prose: {
      question: `Do the complete agent instructions satisfy ${subject} for the agent's stated purpose?`,
      summary: `Read the complete agent instructions for stated ${subject} behavior.`,
      why: declaration.why,
      fix: declaration.fix,
      passWhen: [declaration.why],
      failWhen: [
        `The instructions omit or inadequately define the required ${subject} behavior.`,
      ],
      notApplicableWhen: [
        ...(declaration.notApplicableWhen ?? []),
        'The agent has no instructions, so there is no text for the behavior to be stated in.',
      ],
    },
    evidence: {
      fieldPaths: ['fields.instructions'],
      populations: ['instructions'],
    },
  });
}

/** The 15 instruction-compliance rules, in `COMPLIANCE_CRITERIA` order. */
export const standardInstructionRules: readonly Rule<ParsedBotData>[] =
  Object.freeze(DECLARATIONS.map(complianceRule));
