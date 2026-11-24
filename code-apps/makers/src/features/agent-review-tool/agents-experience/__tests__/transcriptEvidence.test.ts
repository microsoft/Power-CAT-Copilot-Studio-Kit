import { describe, expect, it } from 'vitest';
import {
  isRetainableToolCall,
  parseAvailableSources,
  parseSearchedSources,
  parseToolCallTraces,
} from '../services/transcript/parseToolCallTraces';
import {
  buildEvidenceState,
  buildKnowledgeCoverage,
  buildObservedTools,
  buildSkillCoverage,
} from '../services/transcript/buildCoverage';
import type { ObservationWindow } from '../contracts/TranscriptEvidence';
import {
  NO_EVIDENCE_REASON,
  UPLOAD_NO_EVIDENCE_REASON,
} from '../contracts/TranscriptEvidence';

/**
 * Spec 019 FR-9: an unavailable-evidence reason explains the situation and never
 * tells the maker to obtain a role, because `CSK - Maker` already grants
 * transcript read at organization depth. A message that blames permissions would
 * send makers to an admin for a problem an admin cannot fix.
 */
describe('no-evidence reasons (FR-9)', () => {
  const REASONS: ReadonlyArray<[string, string]> = [
    ['generic', NO_EVIDENCE_REASON],
    ['upload', UPLOAD_NO_EVIDENCE_REASON],
  ];

  it.each(REASONS)('%s reason never blames permissions or a role', (_label, reason) => {
    expect(reason.toLowerCase()).not.toMatch(
      /permission|role|access denied|unauthori[sz]ed|forbidden|administrator|contact your admin/,
    );
  });

  it.each(REASONS)('%s reason states no credit, token, or currency figure', (_label, reason) => {
    expect(reason).not.toMatch(/\$|credit|token/i);
  });

  it('the upload reason names the upload as the cause, not a missing field', () => {
    // The generic wording refers to a review that "records its source
    // environment", which is internal vocabulary to a maker who simply uploaded
    // a file. The upload wording must instead name the real cause.
    expect(UPLOAD_NO_EVIDENCE_REASON).toMatch(/uploaded file/i);
    expect(UPLOAD_NO_EVIDENCE_REASON).not.toMatch(/source environment/i);
  });

  it('the upload reason tells the maker how to get observed use', () => {
    expect(UPLOAD_NO_EVIDENCE_REASON).toMatch(/review an agent from its environment/i);
  });

  it('the two reasons are distinct, so the upload case is not silently generic', () => {
    expect(UPLOAD_NO_EVIDENCE_REASON).not.toBe(NO_EVIDENCE_REASON);
  });
});

/**
 * The configured catalogue block, in the exact shape verified on live CSK-Dev
 * transcripts: a `Available search sources:` marker, then one bullet per
 * source, each carrying a `(Type)` qualifier and an optional description.
 */
const AVAILABLE_BLOCK = [
  'Search the configured knowledge for an answer.',
  '',
  'Available search sources:',
  '- React Reference (Website): Reference documentation for React',
  '- Coffee Gear (1).docx (Uploaded file)',
  '- MDN Web Docs (Website): Web platform documentation',
  '- Home.aspx (SharePoint)',
  '- Product Catalog (Dataverse)',
  '- Support Runbook (Uploaded file)',
  '- Pricing FAQ (Website)',
  '- Onboarding Guide (Uploaded file)',
  '- Release Notes (Website)',
].join('\n');

const CONFIGURED_SOURCE_COUNT = 9;

function searchCall(id: string, sources: string[]) {
  return {
    name: 'ToolCallTrace:Started',
    value: {
      toolCallId: id,
      toolName: 'KnowledgeSearch',
      toolDisplayName: 'Knowledge search',
      toolKind: 'search',
      description: AVAILABLE_BLOCK,
      hiddenFilledParameters: { sources: JSON.stringify(sources) },
    },
  };
}

/** An empty streaming frame — over 99% of ToolCallTrace events look like this. */
function emptyFrame() {
  return { name: 'ToolCallTrace:Started', value: { status: '' } };
}

const WINDOW: ObservationWindow = {
  startIso: '2026-07-11T00:00:00.000Z',
  endIso: '2026-08-10T00:00:00.000Z',
  days: 30,
  conversations: 3,
  truncated: false,
};

describe('parseAvailableSources', () => {
  it('parses every configured source from the live block format', () => {
    const items = parseAvailableSources(AVAILABLE_BLOCK);
    expect(items).toHaveLength(CONFIGURED_SOURCE_COUNT);
    expect(items.map((item) => item.name)).toContain('React Reference');
    expect(items.map((item) => item.name)).toContain('Coffee Gear (1).docx');
  });

  it('separates the type qualifier from the source name', () => {
    const items = parseAvailableSources(AVAILABLE_BLOCK);
    const react = items.find((item) => item.name === 'React Reference');
    const docx = items.find((item) => item.name === 'Coffee Gear (1).docx');
    expect(react?.sourceType).toBe('Website');
    expect(docx?.sourceType).toBe('Uploaded file');
  });

  it('starts every source as not observed with a zero count', () => {
    for (const item of parseAvailableSources(AVAILABLE_BLOCK)) {
      expect(item.state).toBe('not-observed');
      expect(item.invocations).toBe(0);
    }
  });

  it('returns nothing when the marker is absent', () => {
    expect(parseAvailableSources('Search the knowledge base.')).toEqual([]);
    expect(parseAvailableSources(undefined)).toEqual([]);
    expect(parseAvailableSources(42)).toEqual([]);
  });

  it('stops at the first line that is not a bullet', () => {
    const block = [
      'Available search sources:',
      '- Alpha (Website)',
      '',
      'Do not treat this trailing prose as a source.',
      '- Beta (Website)',
    ].join('\n');
    expect(parseAvailableSources(block).map((item) => item.name)).toEqual(['Alpha']);
  });
});

describe('parseSearchedSources', () => {
  it('decodes the JSON-encoded source array', () => {
    const value = { hiddenFilledParameters: { sources: '["MDN Web Docs","React Reference"]' } };
    expect(parseSearchedSources(value)).toEqual(['MDN Web Docs', 'React Reference']);
  });

  it('treats an unparseable value as a single literal source', () => {
    const value = { hiddenFilledParameters: { sources: 'MDN Web Docs' } };
    expect(parseSearchedSources(value)).toEqual(['MDN Web Docs']);
  });

  it('returns nothing when the payload carries no sources', () => {
    expect(parseSearchedSources({})).toEqual([]);
    expect(parseSearchedSources({ hiddenFilledParameters: {} })).toEqual([]);
    expect(parseSearchedSources({ hiddenFilledParameters: { sources: '   ' } })).toEqual([]);
  });
});

describe('isRetainableToolCall', () => {
  it('discards empty streaming frames', () => {
    expect(isRetainableToolCall('ToolCallTrace:Started', { status: '' })).toBe(false);
    expect(isRetainableToolCall('ToolCallTrace:Started', { toolName: '  ' })).toBe(false);
  });

  it('retains a frame carrying a tool name or a status', () => {
    expect(isRetainableToolCall('ToolCallTrace:Started', { toolName: 'KnowledgeSearch' })).toBe(true);
    expect(isRetainableToolCall('ToolCallTrace:Completed', { status: 'Completed' })).toBe(true);
  });

  it('ignores activities that are not tool call traces', () => {
    expect(isRetainableToolCall('ThinkingTrace', { toolName: 'KnowledgeSearch' })).toBe(false);
  });
});

describe('parseToolCallTraces', () => {
  it('keeps real calls and drops empty frames from the same transcript', () => {
    const content = JSON.stringify({
      activities: [
        emptyFrame(),
        emptyFrame(),
        searchCall('call-1', ['MDN Web Docs']),
        emptyFrame(),
      ],
    });
    const parsed = parseToolCallTraces(content);
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0].toolName).toBe('KnowledgeSearch');
    expect(parsed.blocked).toBe(false);
  });

  it('collapses a Started and Completed pair into one call', () => {
    const content = JSON.stringify({
      activities: [
        searchCall('call-1', ['MDN Web Docs']),
        {
          name: 'ToolCallTrace:Completed',
          value: { toolCallId: 'call-1', toolName: 'KnowledgeSearch', status: 'Completed' },
        },
      ],
    });
    expect(parseToolCallTraces(content).calls).toHaveLength(1);
  });

  it('reports a conversation that only produced an AgentBlocked trace', () => {
    const content = JSON.stringify({
      activities: [{ name: 'ErrorTraceData', value: { errorCode: 'AgentBlocked' } }],
    });
    const parsed = parseToolCallTraces(content);
    expect(parsed.blocked).toBe(true);
    expect(parsed.calls).toEqual([]);
  });

  it('does not mark a conversation blocked when tools also ran', () => {
    const content = JSON.stringify({
      activities: [
        searchCall('call-1', ['MDN Web Docs']),
        { name: 'ErrorTraceData', value: { errorCode: 'AgentBlocked' } },
      ],
    });
    expect(parseToolCallTraces(content).blocked).toBe(false);
  });

  // Regression: empty streaming ToolCallTrace frames carry no toolName or status
  // and are the majority of events. Counting them as "reached tool selection"
  // hid the blocked flag, so the conversation was scored as real evidence of
  // nothing being used — the exact false finding the parser exists to prevent.
  it('stays blocked when the only traces are empty streaming frames', () => {
    const content = JSON.stringify({
      activities: [
        { name: 'ToolCallTrace:Started', value: {} },
        { name: 'ToolCallTrace', value: { toolName: '   ' } },
        { name: 'ErrorTraceData', value: { errorCode: 'AgentBlocked' } },
      ],
    });
    const parsed = parseToolCallTraces(content);
    expect(parsed.calls).toEqual([]);
    expect(parsed.blocked).toBe(true);
  });

  it('survives malformed and empty payloads', () => {
    expect(parseToolCallTraces('not json').calls).toEqual([]);
    expect(parseToolCallTraces('').calls).toEqual([]);
    expect(parseToolCallTraces(undefined).calls).toEqual([]);
    expect(parseToolCallTraces({ activities: 'nope' }).calls).toEqual([]);
  });

  it('classifies a loaded skill by tool name', () => {
    const content = JSON.stringify({
      activities: [
        {
          name: 'ToolCallTrace:Started',
          value: {
            toolCallId: 'skill-1',
            toolName: 'skill',
            toolDisplayName: 'Refund policy',
            filledParameters: { skill: 'Refund policy' },
          },
        },
      ],
    });
    const call = parseToolCallTraces(content).calls[0];
    expect(call.toolKind).toBe('skill');
    expect(call.skill).toBe('Refund policy');
  });
});

describe('buildKnowledgeCoverage', () => {
  /**
   * Reproduces the finding measured on live data: agent 8daaaaaa, three
   * conversations, four KnowledgeSearch calls, nine configured sources, two of
   * which were actually searched.
   */
  it('reproduces the live 9 configured / 2 observed finding', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({
          activities: [searchCall('c1', ['MDN Web Docs']), emptyFrame()],
        }),
      ),
      parseToolCallTraces(
        JSON.stringify({
          activities: [
            searchCall('c2', ['MDN Web Docs']),
            searchCall('c3', ['React Reference']),
          ],
        }),
      ),
      parseToolCallTraces(
        JSON.stringify({ activities: [searchCall('c4', ['React Reference'])] }),
      ),
    ];

    const coverage = buildKnowledgeCoverage(parsed);
    expect(coverage?.configured).toBe(9);
    expect(coverage?.observed).toBe(2);
    expect(coverage?.items.filter((item) => item.state === 'not-observed')).toHaveLength(7);
  });

  it('counts every invocation of an observed source', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({
          activities: [searchCall('c1', ['MDN Web Docs']), searchCall('c2', ['MDN Web Docs'])],
        }),
      ),
    ];
    const mdn = buildKnowledgeCoverage(parsed)?.items.find((i) => i.name === 'MDN Web Docs');
    expect(mdn?.invocations).toBe(2);
    expect(mdn?.state).toBe('observed');
  });

  it('lists observed sources before sources that were not observed', () => {
    const parsed = [
      parseToolCallTraces(JSON.stringify({ activities: [searchCall('c1', ['Release Notes'])] })),
    ];
    expect(buildKnowledgeCoverage(parsed)?.items[0].name).toBe('Release Notes');
  });

  it('records a searched name the catalogue never enumerated as an aggregate, not a configured source', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({
          activities: [
            {
              name: 'ToolCallTrace:Started',
              value: {
                toolCallId: 'c1',
                toolName: 'KnowledgeSearch',
                toolKind: 'search',
                hiddenFilledParameters: { sources: '["Undocumented Source"]' },
              },
            },
          ],
        }),
      ),
    ];
    const coverage = buildKnowledgeCoverage(parsed);
    // A name the maker never configured must not be counted as configured, or it
    // inflates the denominator of every finding built from this coverage.
    expect(coverage?.configured).toBe(0);
    expect(coverage?.observed).toBe(0);
    expect(coverage?.aggregateObservations).toEqual([
      { name: 'Undocumented Source', invocations: 1 },
    ]);
  });

  it('returns nothing when no knowledge signal exists', () => {
    expect(buildKnowledgeCoverage([{ calls: [], blocked: false }])).toBeUndefined();
  });
});

/**
 * Regression suite for the live defect measured on agent 8daaaaaa: the card
 * reported "353 of 358 configured knowledge sources were not observed (99%)"
 * and advised removing them, while the same transcripts proved those files had
 * been searched.
 *
 * Root cause: the catalogue and the searched set use different vocabularies.
 * `Available search sources:` names uploaded files individually by filename;
 * `hiddenFilledParameters.sources` records the search under the group name
 * `Uploaded Files`. The join key therefore never matches for that class, so
 * every uploaded file reads "not observed" forever no matter how heavily used.
 */
describe('buildKnowledgeCoverage — attribution across two naming vocabularies', () => {
  const MIXED_BLOCK = [
    'Available search sources:',
    '- React Reference (Website)',
    '- MDN Web Docs (Website)',
    '- Barista Handbook.pdf (Uploaded file)',
    '- Coffee Gear.docx (Uploaded file)',
    '- Roasting Notes.docx (Uploaded file)',
  ].join('\n');

  function call(id: string, sources: string[], block = MIXED_BLOCK) {
    return {
      name: 'ToolCallTrace:Started',
      value: {
        toolCallId: id,
        toolName: 'KnowledgeSearch',
        toolKind: 'search',
        description: block,
        hiddenFilledParameters: { sources: JSON.stringify(sources) },
      },
    };
  }

  /** The live shape: websites named individually, files only ever named as a group. */
  function liveShaped() {
    return [
      parseToolCallTraces(
        JSON.stringify({ activities: [call('c1', ['React Reference', 'Uploaded Files'])] }),
      ),
      parseToolCallTraces(JSON.stringify({ activities: [call('c2', ['Uploaded Files'])] })),
    ];
  }

  it('never counts a group name as a configured source', () => {
    const coverage = buildKnowledgeCoverage(liveShaped());
    // 5 catalogue entries. "Uploaded Files" is not one of them, so the
    // denominator must stay 5 — the old fallback inflated it to 6.
    expect(coverage?.configured).toBe(5);
    expect(coverage?.items.map((item) => item.name)).not.toContain('Uploaded Files');
  });

  it('reports the group name separately, with its own invocation count', () => {
    const coverage = buildKnowledgeCoverage(liveShaped());
    expect(coverage?.aggregateObservations).toEqual([{ name: 'Uploaded Files', invocations: 2 }]);
  });

  it('marks a class the transcript never names individually as not-attributable', () => {
    const coverage = buildKnowledgeCoverage(liveShaped());
    const files = coverage?.items.filter((item) => item.sourceType === 'Uploaded file') ?? [];
    expect(files).toHaveLength(3);
    // Silence about these is not evidence of disuse — the harness cannot name them.
    expect(files.every((item) => item.state === 'not-attributable')).toBe(true);
    expect(coverage?.notAttributable).toBe(3);
  });

  it('still reads a class the transcript does name individually', () => {
    const coverage = buildKnowledgeCoverage(liveShaped());
    const react = coverage?.items.find((item) => item.name === 'React Reference');
    const mdn = coverage?.items.find((item) => item.name === 'MDN Web Docs');
    expect(react?.state).toBe('observed');
    // One website matched by name, so silence about the other website is real.
    expect(mdn?.state).toBe('not-observed');
    expect(coverage?.observed).toBe(1);
  });

  it('restores a class to plain not-observed once one member is named', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({ activities: [call('c1', ['Uploaded Files', 'Coffee Gear.docx'])] }),
      ),
    ];
    const coverage = buildKnowledgeCoverage(parsed);
    // A single name match proves the harness does name members of this type,
    // so silence about the rest of that type becomes real information again.
    const handbook = coverage?.items.find((item) => item.name === 'Barista Handbook.pdf');
    const roasting = coverage?.items.find((item) => item.name === 'Roasting Notes.docx');
    expect(handbook?.state).toBe('not-observed');
    expect(roasting?.state).toBe('not-observed');
  });

  it('suppresses every class the group name could plausibly cover', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({ activities: [call('c1', ['Uploaded Files', 'Coffee Gear.docx'])] }),
      ),
    ];
    const coverage = buildKnowledgeCoverage(parsed);
    // Neither website was named, and the transcript never says which class
    // "Uploaded Files" stands for, so it could be hiding the websites too.
    // Withholding a finding is the safe error; telling a maker to delete a
    // source they actually use is not. Deliberately conservative.
    const websites = coverage?.items.filter((item) => item.sourceType === 'Website') ?? [];
    expect(websites).toHaveLength(2);
    expect(websites.every((item) => item.state === 'not-attributable')).toBe(true);
    expect(coverage?.notAttributable).toBe(2);
  });

  it('changes nothing when the transcript names no groups at all', () => {
    const parsed = [
      parseToolCallTraces(JSON.stringify({ activities: [call('c1', ['React Reference'])] })),
    ];
    const coverage = buildKnowledgeCoverage(parsed);
    // Regression guard for the short-circuit: with nothing hidden, every
    // unmatched source keeps its plain not-observed reading.
    expect(coverage?.aggregateObservations).toEqual([]);
    expect(coverage?.notAttributable).toBe(0);
    expect(coverage?.items.filter((item) => item.state === 'not-observed')).toHaveLength(4);
  });

  it('sorts observed, then not observed, then not attributable', () => {
    const states = buildKnowledgeCoverage(liveShaped())?.items.map((item) => item.state);
    expect(states).toEqual([
      'observed',
      'not-observed',
      'not-attributable',
      'not-attributable',
      'not-attributable',
    ]);
  });
});

describe('buildSkillCoverage', () => {
  const skillTranscript = parseToolCallTraces(
    JSON.stringify({
      activities: [
        {
          name: 'ToolCallTrace:Started',
          value: {
            toolCallId: 's1',
            toolName: 'skill',
            toolDisplayName: 'Refund policy',
            filledParameters: { skill: 'Refund policy' },
          },
        },
      ],
    }),
  );

  it('marks configured skills observed only when they were invoked', () => {
    const coverage = buildSkillCoverage([skillTranscript], ['Refund policy', 'Escalation path']);
    expect(coverage?.configured).toBe(2);
    expect(coverage?.observed).toBe(1);
    expect(coverage?.items.find((i) => i.name === 'Escalation path')?.state).toBe('not-observed');
  });

  it('renders nothing when the agent configures no skills', () => {
    expect(buildSkillCoverage([skillTranscript], [])).toBeUndefined();
  });
});

describe('buildObservedTools', () => {
  it('aggregates invocations per tool, busiest first', () => {
    const parsed = [
      parseToolCallTraces(
        JSON.stringify({
          activities: [
            searchCall('c1', ['MDN Web Docs']),
            searchCall('c2', ['MDN Web Docs']),
            {
              name: 'ToolCallTrace:Started',
              value: { toolCallId: 's1', toolName: 'skill', toolDisplayName: 'Refund policy' },
            },
          ],
        }),
      ),
    ];
    const tools = buildObservedTools(parsed);
    expect(tools[0].toolName).toBe('KnowledgeSearch');
    expect(tools[0].invocations).toBe(2);
    expect(tools[1].invocations).toBe(1);
  });
});

describe('buildEvidenceState', () => {
  it('reports no-transcripts when the window returned nothing', () => {
    const state = buildEvidenceState({ parsed: [], window: WINDOW, configuredSkills: [] });
    expect(state.status).toBe('no-transcripts');
  });

  it('reports no-signal without any counts when nothing ran', () => {
    const state = buildEvidenceState({
      parsed: [{ calls: [], blocked: false }],
      window: WINDOW,
      configuredSkills: [],
    });
    expect(state.status).toBe('no-signal');
    expect(state).not.toHaveProperty('coverage');
  });

  it('excludes blocked conversations from the observation base', () => {
    const state = buildEvidenceState({
      parsed: [
        parseToolCallTraces(JSON.stringify({ activities: [searchCall('c1', ['MDN Web Docs'])] })),
        { calls: [], blocked: true },
      ],
      window: WINDOW,
      configuredSkills: [],
    });
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.blockedConversations).toBe(1);
  });

  it('carries the observation window through to the ready state', () => {
    const state = buildEvidenceState({
      parsed: [parseToolCallTraces(JSON.stringify({ activities: [searchCall('c1', ['MDN Web Docs'])] }))],
      window: WINDOW,
      configuredSkills: [],
    });
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.window.days).toBe(30);
    expect(state.window.conversations).toBe(3);
  });

  it('never exposes a credit, token, or cost field', () => {
    const state = buildEvidenceState({
      parsed: [parseToolCallTraces(JSON.stringify({ activities: [searchCall('c1', ['MDN Web Docs'])] }))],
      window: WINDOW,
      configuredSkills: [],
    });
    const serialized = JSON.stringify(state).toLowerCase();
    for (const forbidden of ['credit', 'token', 'cost', 'usd', 'billing']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
