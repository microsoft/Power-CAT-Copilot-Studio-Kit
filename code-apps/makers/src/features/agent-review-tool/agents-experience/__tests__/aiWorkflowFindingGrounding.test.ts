import { describe, expect, it } from 'vitest';

import {
  ARC2_NODE_CONTRACT,
  arc2ToAgentComponentResult,
  parseArc2NodeOutput,
} from '../services/jobs/aiWorkflowNodeOutput';
import { toStandardEvaluation } from '../services/ai-providers/WorkflowReviewAiProviderCore';
import { validateStandardEvaluation } from '../services/skill/SkillEvaluationValidator';

/**
 * Every per-skill AI finding the ARC2 v4 nodes produced was reaching the
 * validator and being discarded as `fabricated-evidence`, so the UI showed none
 * of them while the backend payload plainly contained them.
 *
 * The cause was that one string was doing two jobs. `flattenArc2Evidence` builds
 * a readable narrative — model prose interleaved with component ids and field
 * paths — and that one value was used both as the finding's `fact` (correct) and
 * as its grounding `evidence` (impossible, since grounding is a literal
 * substring test against the reviewed source, and a sentence *about* the source
 * is never *in* it).
 *
 * These tests run the real chain end to end, from a raw node payload in the
 * shape the flow actually returns, so a regression anywhere along it fails here
 * rather than silently emptying the findings list in the app.
 */

/** The reviewed text for `react-email-v2`, carrying both quotes verbatim. */
const REACT_EMAIL_MARKDOWN = `# React Email v2

## Instructions

1. [First step or action the agent should take]
2. [Second step]

## Guidelines

- [Key guideline or constraint]
`;

/** The reviewed text for `pdf`. Deliberately holds only the skill's own words. */
const PDF_MARKDOWN = `# PDF

Generate a report, invoice, resume, proposal, contract, letter, or similar document as a PDF.
`;

const RUBRIC = [
  { key: 'Clarity', score: 82, rationale: 'Sections are named and ordered.' },
  { key: 'Actionability', score: 68, rationale: 'Steps remain template placeholders.' },
  { key: 'Scope discipline', score: 45, rationale: 'Scope is asserted but not bounded.' },
  { key: 'Composability', score: 85, rationale: 'No hidden dependency on sibling skills.' },
];

function nodePayload(exception: Record<string, unknown>, skillName: string): unknown {
  return {
    contract: ARC2_NODE_CONTRACT,
    schemaVersion: 4,
    node: 'copilot-skill',
    unitId: skillName,
    subjectId: skillName,
    attempt: 1,
    status: 'complete',
    result: {
      exceptions: [exception],
      notAssessed: [],
      dimensions: RUBRIC,
    },
  };
}

/** Both quotes sit in the skill's own markdown, so the first one grounds. */
const ACTIONABILITY_EXCEPTION = {
  ruleId: 'SKL-AI-ACTIONABILITY',
  findingTitle: 'Instructions are unfilled placeholders',
  fact: 'The instruction steps are template placeholders rather than actions.',
  whyItMatters: 'An agent cannot act on a bracketed placeholder.',
  makerAction: 'Replace each bracketed placeholder with the concrete step to take.',
  acceptanceCheck: 'No bracketed placeholder text remains in the instructions.',
  evidence: [
    {
      componentId: '2caaaaaa-aaaa-4aaa-aaaa-00000000001d',
      fieldPath: 'skill_markdown',
      quote: '1. [First step or action the agent should take]',
    },
    {
      componentId: '2caaaaaa-aaaa-4aaa-aaaa-00000000001d',
      fieldPath: 'skill_markdown',
      quote: '- [Key guideline or constraint]',
    },
  ],
};

/**
 * The second quote is the *parent agent's* instructions, which a per-skill
 * review never submits. Only the first quote can ground here.
 */
const SCOPE_EXCEPTION = {
  ruleId: 'SKL-AI-SCOPE',
  findingTitle: 'Skill scope is broader than its stated purpose',
  fact: 'The skill claims document generation while the agent is scoped to code.',
  whyItMatters: 'A skill whose scope exceeds the agent invites misrouting.',
  makerAction: 'Narrow the skill description to the document types it truly handles.',
  acceptanceCheck: 'The skill description names only supported document types.',
  evidence: [
    {
      componentId: '48aaaaaa-aaaa-4aaa-aaaa-00000000001f',
      fieldPath: 'skill_markdown',
      quote:
        'Generate a report, invoice, resume, proposal, contract, letter, or similar document as a PDF.',
    },
    {
      componentId: '48aaaaaa-aaaa-4aaa-aaaa-00000000001f',
      fieldPath: 'agent_instructions',
      quote:
        'You are DevDocs Assistant, a helpful coding companion for developers working with React, JavaScript, and TypeScript.',
    },
  ],
};

function runChain(exception: Record<string, unknown>, skillName: string, corpus: string) {
  const parsed = parseArc2NodeOutput(nodePayload(exception, skillName));
  expect(parsed, 'payload must be recognised as v4').not.toBeNull();

  const component = arc2ToAgentComponentResult(parsed!, skillName);
  const evaluation = toStandardEvaluation(component, corpus);
  const validation = validateStandardEvaluation(evaluation, corpus);
  return { parsed: parsed!, component, evaluation, validation };
}

describe('ARC2 per-skill AI findings survive validation', () => {
  it('keeps a finding whose quotes are all in the reviewed source', () => {
    const { evaluation, validation } = runChain(
      ACTIONABILITY_EXCEPTION,
      'react-email-v2',
      REACT_EMAIL_MARKDOWN,
    );

    expect(evaluation.findings).toHaveLength(1);
    expect(validation.evaluation.findings).toHaveLength(1);
    expect(validation.evaluation.findings[0].ruleId).toBe('SKL-AI-ACTIONABILITY');
    expect(validation.issues.map((i) => i.code)).not.toContain('fabricated-evidence');
  });

  it('grounds on the first quote that is actually present, not merely the first', () => {
    const { validation } = runChain(SCOPE_EXCEPTION, 'pdf', PDF_MARKDOWN);

    expect(validation.evaluation.findings).toHaveLength(1);
    // The agent-instructions quote is real but outside this review's corpus.
    expect(validation.evaluation.findings[0].evidence).toContain('Generate a report, invoice');
    expect(validation.issues.map((i) => i.code)).not.toContain('fabricated-evidence');
  });

  it('renders the narrative as the fact while grounding on the quote', () => {
    const { evaluation } = runChain(
      ACTIONABILITY_EXCEPTION,
      'react-email-v2',
      REACT_EMAIL_MARKDOWN,
    );
    const finding = evaluation.findings[0];

    // `fact` keeps the per-instance narrative, which is the UI headline.
    expect(finding.fact).toContain('template placeholders');
    expect(finding.fact).toContain('2caaaaaa-aaaa-4aaa-aaaa-00000000001d');
    // `evidence` is the bare verbatim quote the validator can test.
    expect(finding.evidence).not.toContain('2caaaaaa-aaaa-4aaa-aaaa-00000000001d');
    expect(REACT_EMAIL_MARKDOWN).toContain(finding.evidence);
  });

  it('is dropped again if the narrative is used for grounding', () => {
    // Guards the regression directly: the composite can never be a substring of
    // the source, so grounding on it is always a silent total loss.
    const { component } = runChain(
      ACTIONABILITY_EXCEPTION,
      'react-email-v2',
      REACT_EMAIL_MARKDOWN,
    );
    expect(REACT_EMAIL_MARKDOWN).not.toContain(component.findings[0].evidence);
    expect(component.findings[0].evidenceQuotes?.length).toBe(2);
  });
});

describe('rubric dimensions reach the evaluation', () => {
  it('preserves the dimensions the skill nodes return', () => {
    const { parsed, component, evaluation, validation } = runChain(
      ACTIONABILITY_EXCEPTION,
      'react-email-v2',
      REACT_EMAIL_MARKDOWN,
    );

    expect(parsed.result.dimensions).toHaveLength(4);
    expect(component.dimensions).toHaveLength(4);
    expect(evaluation.dimensions.map((d) => d.key)).toEqual([
      'Clarity',
      'Actionability',
      'Scope discipline',
      'Composability',
    ]);
    expect(validation.issues.map((i) => i.code)).not.toContain('missing-dimensions');
  });

  it('leaves a node that scores no rubric with an empty list rather than a number', () => {
    const parsed = parseArc2NodeOutput({
      contract: ARC2_NODE_CONTRACT,
      schemaVersion: 4,
      node: 'cross-skill',
      status: 'complete',
      result: { exceptions: [], notAssessed: [] },
    });

    expect(parsed!.result.dimensions).toEqual([]);
    expect(arc2ToAgentComponentResult(parsed!, 'bundle').dimensions).toEqual([]);
  });
});
