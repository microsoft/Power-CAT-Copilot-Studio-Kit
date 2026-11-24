/**
 * The two Standard rules over the embedded child-agent inventory.
 *
 * Three things here look wrong and are not:
 *
 * - **They score into Orchestration while the CON-* rules next door are
 *   `Connected agents`.** These two read `childAgents` — agents embedded in this
 *   agent's own hierarchy — and ask how much structure a maker has to maintain,
 *   not whether an external connection is sound. The hand-written rules declared
 *   `family: 'Orchestration'` while living in `connectedAgentRules.ts`, and that
 *   placement is load-bearing: the family string selects the pillar an ART score
 *   lands in, and `assessStandard` branches on `family === 'Skills'` for
 *   topic-scope handling, which must stay off for both of these.
 * - **One builder serves two rules.** `buildStandardChildPatterns` is plural
 *   because the applicability test is shared: either both patterns are emitted or
 *   neither is. Each rule's `build` takes its own slot out of the returned array
 *   — index 0 is `local-pattern-9`, index 1 is `local-pattern-10` — so an empty
 *   population that is also fully captured yields `undefined` for both, which is
 *   the legacy empty-population omission `assessStandard` turns into
 *   `not-applicable`. Splitting it into two builders would duplicate that gate
 *   and let the two rules disagree about whether they apply.
 * - **The builder lives in this file.** It is the rules' algorithm, so keeping it
 *   next to the declarations is what makes "one file to touch" true for them. It
 *   also keeps the import direction one-way: the adapter imports this file, and
 *   this file imports nothing from the adapter.
 */

import type { LocalPattern, ParsedBotData } from '../../contracts/ServiceContracts';
import { getPatternSeverity, isPopulationIncomplete } from '../../utils/patternUtils';
import { standardResourceItems } from '../../agents-experience/services/rules/standardResourceEvidence';
import type { Rule } from '../rule';
import { standardRule, type CoreStandardOptions } from './standard';

/** Embedded children retain their own applicability and legacy empty-population omissions. */
export function buildStandardChildPatterns(data: ParsedBotData): LocalPattern[] {
  const patterns: LocalPattern[] = [];
  const incompletePopulation = isPopulationIncomplete(data);
  const agents = data.childAgents ?? [];
  if (agents.length || incompletePopulation) {
    const missing = agents.filter(a => !a.description?.trim());
    const mode = data.orchestrationMode;
    const status = mode === 'classic' ? 'not-applicable'
      : mode !== 'generative' ? 'not-assessed'
        : missing.length ? 'fail' : incompletePopulation ? 'not-assessed' : 'pass';
    patterns.push({
      patternId: 'local-pattern-9', patternName: 'Missing Child Agent Description',
      description: status === 'not-assessed' ? 'Child-agent descriptions could not be fully assessed.'
        : `${missing.length} reviewed child agent(s) have no nonblank description.`,
      recommendation: 'Describe each child agent purpose and supported requests. Descriptions help selection; this static check does not prove routing failure.',
      status: status === 'pass', assessmentStatus: status,
      assessmentReason: mode === 'classic' ? 'Generative agent selection does not apply in classic orchestration.'
        : mode !== 'generative' ? 'The orchestration mode could not be established.'
          : incompletePopulation ? 'Unclassified or unavailable components prevent a complete child-agent assessment.'
            : 'The agent uses generative orchestration.',
      topics: missing.map(a => a.name),
      affectedItems: missing.map(a => {
        const identified = !!(a.componentId?.trim() || a.schemaName?.trim());
        return {
          item: a.name, componentId: a.componentId, schemaName: a.schemaName,
          setting: 'Child agent description', current: a.description,
          evidence: {
            source: 'configuration', status: identified ? 'verified' : 'unavailable',
            setting: 'Child agent description', quote: a.description,
            reason: identified ? 'The reviewed child-agent description has no nonblank text.'
              : 'The child-agent reference has no stable resource identity.',
          },
        };
      }),
      category: 'Architecture', severity: getPatternSeverity('Missing Child Agent Description'),
      evidenceKind: 'configuration-fact',
    });
    const excessiveChildren = agents.length > 5;
    const childCountUnknown = !excessiveChildren && incompletePopulation;
    patterns.push({
      patternId: 'local-pattern-10', patternName: 'Child Agent Architecture Sprawl',
      description: `${incompletePopulation ? 'A complete count is unavailable. ' : ''}${agents.length} child agents were identified. A large agent hierarchy can increase maintenance complexity.`,
      recommendation: 'Review whether each child agent has a distinct purpose; consider combining small or overlapping responsibilities.',
      status: !excessiveChildren && !childCountUnknown,
      assessmentStatus: excessiveChildren ? 'fail' : childCountUnknown ? 'not-assessed' : 'pass',
      assessmentReason: childCountUnknown ? 'Unclassified or unavailable components prevent a complete child-agent count.'
        : 'Authoring guidance threshold: more than 5 child agents. No runtime failure is asserted.',
      topics: excessiveChildren ? agents.map(a => a.name) : [],
      affectedItems: excessiveChildren ? standardResourceItems(agents, [], 'Child agent inventory') : [],
      category: 'Architecture',
      severity: getPatternSeverity('Child Agent Architecture Sprawl'), evidenceKind: 'authoring-guidance',
    });
  }
  return patterns;
}

export const LOCAL_PATTERN_9_OPTIONS: CoreStandardOptions = {
  family: 'Orchestration', fieldPath: 'childAgents.description',
  build: model => buildStandardChildPatterns(model)[0],
};

export const LOCAL_PATTERN_9: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-9',
  title: 'Missing Child Agent Description',
  harnesses: ['standard'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-connected-agent'],
  prose: {
    question: 'Does every embedded child agent carry a description the orchestrator can select on?',
    summary: 'Inspect embedded child-agent descriptions in generative orchestration.',
    why: 'Descriptions guide selection of child agents; this static check does not establish routing failures.',
    fix: 'Describe each embedded child agent purpose and supported requests.',
    passWhen: ['Every reviewed child agent has a nonblank description.'],
    failWhen: ['At least one reviewed child agent has no nonblank description.'],
    notApplicableWhen: ['The agent uses classic orchestration, where generative agent selection does not apply.'],
  },
  evidence: { fieldPaths: ['childAgents.description'] },
}, LOCAL_PATTERN_9_OPTIONS);

export const LOCAL_PATTERN_10_OPTIONS: CoreStandardOptions = {
  family: 'Orchestration', fieldPath: 'childAgents',
  build: model => buildStandardChildPatterns(model)[1],
};

export const LOCAL_PATTERN_10: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-10',
  title: 'Child Agent Architecture Sprawl',
  harnesses: ['standard'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-connected-agent'],
  prose: {
    question: 'Is the embedded child-agent hierarchy small enough to maintain?',
    summary: 'Compare the embedded-child inventory against the authoring guidance threshold of five.',
    why: 'Large child-agent hierarchies can increase maintenance complexity.',
    fix: 'Review distinct responsibilities and consider combining overlapping children.',
    passWhen: ['Five or fewer embedded child agents were identified.'],
    failWhen: ['More than five embedded child agents were identified.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['childAgents'] },
}, LOCAL_PATTERN_10_OPTIONS);

export const standardConnectedAgentCoreRules: readonly Rule<ParsedBotData>[] =
  [LOCAL_PATTERN_9, LOCAL_PATTERN_10];
