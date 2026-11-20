import { describe, expect, it } from 'vitest';
import {
  arc2ToInstructionCoverage,
  arc2ToOrchestrationEvaluation,
  harnessForNode,
  parseArc2NodeOutput,
} from '../services/jobs/aiWorkflowNodeOutput';
import { validateOrchestrationEvaluation } from '../services/skill/SkillEvaluationValidator';
import {
  classifyInstructionCoverage,
  validateInstructionCoverage,
} from '../services/skill/InstructionCoverageValidator';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';

/**
 * The 2 agent-level payloads have the shape of the review workflow output,
 * with placeholder IDs. The quotes are byte-identical to the workflow output.
 * Grounding is a plain substring test, so a tidied-up fixture would pass here
 * and still be dropped in production.
 */
const UNSLOP_ID = '8eaaaaaa-aaaa-4aaa-aaaa-000000000027';
const REACT_EMAIL_ID = 'a9aaaaaa-aaaa-4aaa-aaaa-00000000002b';

const UNSLOP_QUOTE =
  '20. **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.';
const REACT_EMAIL_QUOTE = 'Please let me know if you need any additional resources or examples.';

const CROSS_SKILL_PAYLOAD = {
  contract: 'arc2-node-output-v4',
  schemaVersion: 4,
  node: 'cross-skill',
  unitId: 'skill-set',
  subjectId: '8daaaaaa-aaaa-4aaa-aaaa-00000000000d',
  attempt: 1,
  status: 'complete',
  result: {
    exceptions: [
      {
        ruleId: 'XSK-03',
        findingTitle:
          'unslop orders removal of "Let me know if..." while react-email-v2\'s mandated template ends with exactly that phrase',
        fact: 'The unslop skill declares itself always-applicable and lists "Let me know if..." among chatbot phrases to remove, while react-email-v2 prescribes a fixed email template whose closing line is "Please let me know if you need any additional resources or examples."',
        whyItMatters:
          'When both skills are in play the agent gets contradictory instructions about the same drafted email text.',
        makerAction:
          'Decide which skill owns final email wording: either rewrite the react-email-v2 template closing, or add an explicit carve-out in unslop.',
        acceptanceCheck:
          'Re-read both SKILL.md files and confirm the template closing no longer matches any banned phrase.',
        evidence: [
          { componentId: UNSLOP_ID, fieldPath: 'skill_markdown', quote: UNSLOP_QUOTE },
          { componentId: REACT_EMAIL_ID, fieldPath: 'skill_markdown', quote: REACT_EMAIL_QUOTE },
        ],
        suggestedText: 'Reach out if you would like more resources or examples.',
      },
    ],
    notAssessed: [],
  },
};

const COVERAGE_PAYLOAD = {
  contract: 'arc2-node-output-v4',
  schemaVersion: 4,
  node: 'copilot-instructions',
  unitId: 'coverage',
  subjectId: '8daaaaaa-aaaa-4aaa-aaaa-00000000000d',
  attempt: 1,
  status: 'partial',
  result: {
    exceptions: [
      {
        ruleId: 'INS-06',
        findingTitle: 'No human handoff path - only a routing line to Python Expert Agent',
        fact: 'The instructions cover knowledge-source routing, email drafting and a single routing directive, but never state when or how to hand the developer off to a human.',
        whyItMatters:
          'When DevDocs Assistant hits a question outside its docs the conversation dead-ends with no route to a person.',
        makerAction: 'Add an escalation section stating the triggers and the exact handoff action.',
        acceptanceCheck:
          'The instruction text contains an explicit escalation clause naming trigger conditions and destination.',
        evidence: [
          {
            componentId: '95aaaaaa-aaaa-4aaa-aaaa-00000000002a',
            fieldPath: 'agent_instructions',
            quote: 'For Pythin related queries use Python Expert Agent',
          },
        ],
        suggestedText: 'Escalation: If the connected knowledge sources cannot answer after one attempt, hand off.',
      },
    ],
    notAssessed: [
      {
        ruleId: 'INS-07',
        reason: 'The directive has no exact inventory match, so a failure cannot be confirmed.',
        scopeStatus: 'unavailable',
      },
    ],
  },
};

const KNOWN_SKILLS = ['unslop', 'react-email-v2'];
const SKILL_NAME_BY_ID = new Map([
  [UNSLOP_ID, 'unslop'],
  [REACT_EMAIL_ID, 'react-email-v2'],
]);
const CORPUS = [
  '# unslop',
  UNSLOP_QUOTE,
  '',
  '# react-email-v2',
  `Closing line: ${REACT_EMAIL_QUOTE}`,
].join('\n');

function parsed(payload: unknown) {
  const output = parseArc2NodeOutput(payload);
  if (!output) throw new Error('fixture is not a valid v4 payload');
  return output;
}

describe('harnessForNode', () => {
  it('maps every node the flow stamps to the harness whose rules it ran', () => {
    expect(harnessForNode('copilot-skill')).toBe('copilot-skill');
    expect(harnessForNode('standalone-skill')).toBe('standalone-skill');
    expect(harnessForNode('standard')).toBe('standard');
  });

  it('maps both agent-level nodes to the copilot harness', () => {
    // 9000 and 9001 judge the agent, not a skill, so a shared skill rule must
    // not resolve to a skill pillar from them.
    expect(harnessForNode('cross-skill')).toBe('copilot');
    expect(harnessForNode('copilot-instructions')).toBe('copilot');
  });

  it('returns undefined for an unknown or missing node rather than guessing', () => {
    expect(harnessForNode('declarative-agent')).toBeUndefined();
    expect(harnessForNode(undefined)).toBeUndefined();
  });
});

describe('arc2ToOrchestrationEvaluation', () => {
  it('survives the orchestration validator end to end on the measured payload', () => {
    // This is the assertion the seam exists for: the untranslated v4 payload is
    // dropped by this validator, so a green result here is what keeps the
    // cross-skill stage from silently falling back to the prompt backend.
    const { evaluation, issues } = validateOrchestrationEvaluation(
      arc2ToOrchestrationEvaluation(parsed(CROSS_SKILL_PAYLOAD), SKILL_NAME_BY_ID, KNOWN_SKILLS, CORPUS),
      KNOWN_SKILLS,
      CORPUS,
    );

    expect(issues).toEqual([]);
    expect(evaluation.findings).toHaveLength(1);
    expect(evaluation.findings[0].ruleId).toBe('XSK-03');
    expect(evaluation.findings[0].skills).toEqual(['unslop', 'react-email-v2']);
  });

  it('resolves cited component GUIDs to the skill names the validator checks', () => {
    const result = arc2ToOrchestrationEvaluation(
      parsed(CROSS_SKILL_PAYLOAD),
      SKILL_NAME_BY_ID,
      KNOWN_SKILLS,
      CORPUS,
    );

    expect(result.status).toBe('complete');
    expect(result.findings[0].skills).toEqual(['unslop', 'react-email-v2']);
  });

  it('names the whole known set when no cited component maps to a skill', () => {
    // A set-level finding cites nothing resolvable; naming no skill at all would
    // be dropped by the validator's "at least one real skill" guard, and XSK-03
    // is pairwise so it also needs two.
    const result = arc2ToOrchestrationEvaluation(
      parsed(CROSS_SKILL_PAYLOAD),
      new Map(),
      KNOWN_SKILLS,
      CORPUS,
    );

    expect(result.findings[0].skills).toEqual(KNOWN_SKILLS);
    expect(validateOrchestrationEvaluation(result, KNOWN_SKILLS, CORPUS).issues).toEqual([]);
  });

  it('carries one grounded quote rather than joining the evidence list', () => {
    // Grounding is a plain substring test, so a joined string grounds nothing.
    const result = arc2ToOrchestrationEvaluation(
      parsed(CROSS_SKILL_PAYLOAD),
      SKILL_NAME_BY_ID,
      KNOWN_SKILLS,
      CORPUS,
    );

    expect(CORPUS).toContain(result.findings[0].evidence);
    expect(result.findings[0].evidence).toBe(UNSLOP_QUOTE);
  });

  it('prefers the quote that is actually in the corpus over the longest one', () => {
    const payload = structuredClone(CROSS_SKILL_PAYLOAD);
    payload.result.exceptions[0].evidence = [
      { componentId: UNSLOP_ID, fieldPath: 'skill_markdown', quote: `${UNSLOP_QUOTE} and some text the model invented` },
      { componentId: REACT_EMAIL_ID, fieldPath: 'skill_markdown', quote: REACT_EMAIL_QUOTE },
    ];

    const result = arc2ToOrchestrationEvaluation(parsed(payload), SKILL_NAME_BY_ID, KNOWN_SKILLS, CORPUS);

    expect(result.findings[0].evidence).toBe(REACT_EMAIL_QUOTE);
  });

  it('drops an unregistered rule id instead of passing it to the validator', () => {
    const payload = structuredClone(CROSS_SKILL_PAYLOAD);
    payload.result.exceptions[0].ruleId = 'XSK-99';

    const result = arc2ToOrchestrationEvaluation(parsed(payload), SKILL_NAME_BY_ID, KNOWN_SKILLS, CORPUS);

    expect(result.findings).toEqual([]);
    expect(validateOrchestrationEvaluation(result, KNOWN_SKILLS, CORPUS).issues).toEqual([]);
  });
});

describe('arc2ToInstructionCoverage', () => {
  it('marks the raised rule absent and leaves the unassessed rule out', () => {
    const result = arc2ToInstructionCoverage(parsed(COVERAGE_PAYLOAD));
    const byKey = new Map(result.elements.map((el) => [el.key, el]));

    // INS-06 is escalation; INS-07 is not a coverage key, so nothing is omitted.
    expect(result.elements).toHaveLength(INSTRUCTION_COVERAGE_KEYS.length);
    expect(byKey.get('escalation')).toMatchObject({ present: false });
    expect(byKey.get('escalation')?.inferredPass).toBeUndefined();
    expect(byKey.get('role')).toMatchObject({ present: true, inferredPass: true });
  });

  it('keeps the measured payload classifiable as a complete stage', () => {
    const classified = classifyInstructionCoverage(arc2ToInstructionCoverage(parsed(COVERAGE_PAYLOAD)), '');

    expect(classified.status.state).toBe('complete');
    expect(classified.elements).toHaveLength(INSTRUCTION_COVERAGE_KEYS.length);
    expect(classified.elements.filter((el) => !el.present).map((el) => el.key)).toEqual(['escalation']);
  });

  it('reports a clean agent as complete, which is what `inferredPass` is for', () => {
    // Without the marker every passing element would be dropped for having no
    // quote, and a flawless agent would be reported as a failed stage.
    const payload = structuredClone(COVERAGE_PAYLOAD);
    payload.result.exceptions = [];
    payload.result.notAssessed = [];

    const classified = classifyInstructionCoverage(arc2ToInstructionCoverage(parsed(payload)), '');

    expect(classified.status.state).toBe('complete');
    expect(classified.elements.every((el) => el.present)).toBe(true);
  });

  it('omits an unassessed coverage rule, leaving the stage partial', () => {
    const payload = structuredClone(COVERAGE_PAYLOAD);
    payload.result.notAssessed = [
      { ruleId: 'INS-04', reason: 'no boundary statements to judge', scopeStatus: 'unavailable' },
    ];

    const result = arc2ToInstructionCoverage(parsed(payload));
    const classified = classifyInstructionCoverage(result, '');

    expect(result.elements.map((el) => el.key)).not.toContain('boundaries');
    expect(classified.status.state).toBe('partial');
  });

  it('is rejected by the strict validator, which only ever sees model output', () => {
    // `inferredPass` is host-derived. If a model could set it, it could claim an
    // unevidenced pass, so the model-facing gate refuses the flag outright.
    expect(() => validateInstructionCoverage(arc2ToInstructionCoverage(parsed(COVERAGE_PAYLOAD)), '')).toThrow(
      /inferredPass/,
    );
  });
});
