import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';

import {
  ObservedEvidenceCard,
  type ObservedEvidenceCardProps,
} from '../components/cost-efficiency/ObservedEvidenceCard';
import type {
  EvidenceState,
  ObservationWindow,
  ToolCoverage,
} from '../contracts/TranscriptEvidence';

function render(
  state: EvidenceState,
  options: Omit<ObservedEvidenceCardProps, 'state'> = {},
): string {
  const content: ReactNode = createElement(ObservedEvidenceCard, { state, ...options });
  return renderToStaticMarkup(
    createElement(FluentProvider, { theme: webLightTheme }, content),
  );
}

function makeWindow(overrides: Partial<ObservationWindow> = {}): ObservationWindow {
  return {
    startIso: '2026-07-09T00:00:00.000Z',
    endIso: '2026-08-08T00:00:00.000Z',
    days: 30,
    conversations: 12,
    truncated: false,
    ...overrides,
  };
}

/** Mirrors the live-verified 9-source knowledge block from the transcript fixture. */
function knowledgeCoverage(): ToolCoverage {
  return {
    kind: 'knowledge',
    configured: 4,
    observed: 2,
    notAttributable: 0,
    items: [
      { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 6 },
      { name: 'Coffee Gear (1).docx', sourceType: 'Uploaded file', state: 'observed', invocations: 2 },
      { name: 'Barista Handbook.pdf', sourceType: 'Uploaded file', state: 'not-observed', invocations: 0 },
      { name: 'Roasting SharePoint', sourceType: 'SharePoint', state: 'not-observed', invocations: 0 },
    ],
    aggregateObservations: [],
  };
}

function readyState(overrides: Partial<Extract<EvidenceState, { status: 'ready' }>> = {}): EvidenceState {
  return {
    status: 'ready',
    window: makeWindow(),
    coverage: [knowledgeCoverage()],
    observedTools: [
      { toolName: 'KnowledgeSearch', displayName: 'Knowledge search', toolKind: 'search', invocations: 8 },
    ],
    blockedConversations: 0,
    ...overrides,
  };
}

/**
 * Words that would turn a bounded observation into an unsupported claim about
 * the agent. Spec 019 FR-5 forbids all of them in every state.
 *
 * "unused" is handled separately: the card is allowed to say a capability is
 * *not* unused, which is a safeguard rather than a claim.
 */
const FORBIDDEN_WORDS = ['wasted', 'dead code', 'never used', 'redundant'];

describe('ObservedEvidenceCard - forbidden wording', () => {
  const states: Array<[string, EvidenceState]> = [
    ['loading', { status: 'loading' }],
    ['no-access', { status: 'no-access', reason: 'Transcripts could not be read.' }],
    ['no-transcripts', { status: 'no-transcripts', window: makeWindow({ conversations: 0 }) }],
    ['no-signal', { status: 'no-signal', window: makeWindow(), blockedConversations: 0 }],
    ['ready', readyState()],
  ];

  it.each(states)('never says a capability is wasted in the %s state', (_label, state) => {
    const html = render(state).toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      expect(html).not.toContain(word);
    }
  });

  it.each(states)('only ever uses "unused" to deny it, in the %s state', (_label, state) => {
    const text = render(state).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const claims = text.match(/[^.]*\bunused\b[^.]*/gi) ?? [];
    for (const claim of claims) {
      // The only permitted use is the disclosure that denies the conclusion.
      expect(claim).toMatch(/does not mean the capability is unused/i);
    }
  });

  it.each(states)('always names the section in the %s state', (_label, state) => {
    expect(render(state)).toContain('Observed capability use');
  });
});

describe('ObservedEvidenceCard - empty states report no counts', () => {
  it('shows no coverage digits when transcripts exist but nothing ran', () => {
    const html = render({ status: 'no-signal', window: makeWindow(), blockedConversations: 0 });

    expect(html).toContain('No capability use recorded');
    expect(html).toContain('Zero is not reported as a result');
    // A "0 of N" or "N of N" fraction would read as a finding.
    expect(html).not.toMatch(/\d+\s+of\s+\d+/);
    expect(html).not.toContain('not observed in this window');
  });

  it('separates no activity from no signal, because they mean different things', () => {
    const noTranscripts = render({ status: 'no-transcripts', window: makeWindow({ conversations: 0 }) });
    const noSignal = render({ status: 'no-signal', window: makeWindow(), blockedConversations: 0 });

    expect(noTranscripts).toContain('No conversation activity');
    expect(noSignal).toContain('No capability use recorded');
    expect(noTranscripts).not.toBe(noSignal);
  });

  it('states plainly that an empty window is not a finding about the agent', () => {
    const html = render({ status: 'no-signal', window: makeWindow(), blockedConversations: 0 });
    expect(html).toContain('not a finding about the agent');
  });

  it('keeps the planning section credible when transcripts cannot be read', () => {
    const html = render({ status: 'no-access', reason: 'Transcripts could not be read.' });

    expect(html).toContain('Unavailable');
    expect(html).toContain('The budget planning section below still works');
    // FR-9: the maker must never be told to go and obtain a security role.
    expect(html.toLowerCase()).not.toContain('security role');
    expect(html.toLowerCase()).not.toContain('permission');
  });
});

describe('ObservedEvidenceCard - ready state', () => {
  it('names every configured capability, not just a count (SC-8)', () => {
    const html = render(readyState());

    expect(html).toContain('React Reference');
    expect(html).toContain('Coffee Gear (1).docx');
    expect(html).toContain('Barista Handbook.pdf');
    expect(html).toContain('Roasting SharePoint');
  });

  it('reports the source type parsed from the transcript', () => {
    const html = render(readyState());

    expect(html).toContain('Website');
    expect(html).toContain('Uploaded file');
    expect(html).toContain('SharePoint');
  });

  it('marks each row observed or not observed', () => {
    const html = render(readyState());

    expect(html).toContain('Observed');
    expect(html).toContain('Not observed');
  });

  it('leads with the size of the provisioning gap', () => {
    const html = render(readyState());

    // 4 configured, 2 observed, so 2 were not observed - 50%.
    expect(html).toContain('2 of 4');
    expect(html).toContain('50%');
  });

  it('shows no gap headline when every capability was observed', () => {
    const html = render(
      readyState({
        coverage: [
          {
            kind: 'skill',
            configured: 2,
            observed: 2,
            items: [
              { name: 'Create ticket', state: 'observed', invocations: 3 },
              { name: 'Look up order', state: 'observed', invocations: 1 },
            ],
          },
        ],
      }),
    );

    expect(html).not.toMatch(/\d+\s+of\s+\d+\b[^<]*<\/span>/);
    expect(html).toContain('Create ticket');
  });

  it('describes the window so the reviewer can judge the sample', () => {
    const html = render(readyState());

    expect(html).toContain('12 conversations');
    expect(html).toContain('last 30 days');
  });

  it('uses singular wording for a single conversation', () => {
    const html = render(readyState({ window: makeWindow({ conversations: 1 }) }));
    expect(html).toContain('1 conversation ');
  });

  it('labels knowledge and skill coverage as separate sections', () => {
    const html = render(readyState({
      coverage: [
        knowledgeCoverage(),
        {
          kind: 'skill',
          configured: 1,
          observed: 1,
          notAttributable: 0,
          items: [{ name: 'Create ticket', state: 'observed', invocations: 2 }],
          aggregateObservations: [],
        },
      ],
    }));

    expect(html).toMatch(/<h4[^>]*>Knowledge sources<\/h4>/);
    expect(html).toMatch(/<h4[^>]*>Skills<\/h4>/);
    expect(html).toContain(
      'Knowledge sources and skills are separate because transcripts identify them differently.',
    );
  });

  it('offers a control to collapse the complete observed-use section', () => {
    const html = render(readyState());

    expect(html).toContain('Collapse details');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="observed-evidence-details"');
  });

  it('uses the outer accordion as the only whole-section disclosure when embedded', () => {
    const html = render(readyState(), {
      collapsible: false,
      headingLevel: 'h4',
    });

    expect(html).not.toContain('Collapse details');
    expect(html).not.toContain('Expand details');
    expect(html).toMatch(/<h4[^>]*id="observed-evidence-heading"/);
    expect(html).toMatch(/<h5[^>]*>Knowledge sources<\/h5>/);
    expect(html).toContain('observed-evidence-details');
  });

  it('does not turn a bounded observation into removal advice', () => {
    const html = render(readyState());

    expect(html).toContain('This is a review lead, not a removal decision.');
    expect(html).not.toContain('Removing a capability that is never invoked');
  });
});

describe('ObservedEvidenceCard - required disclosures', () => {
  it('always discloses the three standing limits', () => {
    const html = render(readyState());

    // A bounded window cannot prove a capability is never used.
    expect(html).toContain('a longer window may show different results');
    // Built-in harness actions are not maker-configurable.
    expect(html).toContain('are not counted here');
    // The permanent reason no per-agent cost is shown.
    expect(html).toContain('do not contain credit or token data');
  });

  it('discloses a truncated read, because it can fake a gap', () => {
    const complete = render(readyState());
    const truncated = render(readyState({ window: makeWindow({ truncated: true }) }));

    expect(complete).not.toContain('stopped at the page limit');
    expect(truncated).toContain('stopped at the page limit');
    expect(truncated).toContain('may appear in transcripts that were not read');
  });

  it('discloses excluded blocked conversations with correct grammar', () => {
    const none = render(readyState({ blockedConversations: 0 }));
    const one = render(readyState({ blockedConversations: 1 }));
    const many = render(readyState({ blockedConversations: 4 }));

    expect(none).not.toContain('blocked');
    expect(one).toContain('1 blocked conversation was');
    expect(many).toContain('4 blocked conversations were');
  });

  it('never shows a currency amount or a credit figure', () => {
    const html = render(readyState());

    expect(html).not.toContain('$');
    expect(html).not.toMatch(/\bcredits?\b(?!\sor\stoken)/i);
  });
});

/**
 * When every configured capability produced a signal there is no "Not observed"
 * row on screen. Defining a term the reader cannot see reads as a defect, and
 * the fully-covered outcome deserves to be stated rather than implied.
 */
describe('ObservedEvidenceCard - fully observed', () => {
  function fullyObservedState(truncated = false): EvidenceState {
    return readyState({
      window: makeWindow({ truncated }),
      coverage: [
        {
          kind: 'knowledge',
          configured: 2,
          observed: 2,
          items: [
            { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 6 },
            { name: 'Barista Handbook.pdf', sourceType: 'Uploaded file', state: 'observed', invocations: 3 },
          ],
        },
      ],
    });
  }

  it('states there is no provisioning gap', () => {
    const html = render(fullyObservedState());

    expect(html).toContain('no provisioning gap to act on');
  });

  it('does not define a term that is absent from the table', () => {
    const html = render(fullyObservedState());

    expect(html).not.toContain('a longer window may show different results');
    expect(html).not.toContain('Not observed');
  });

  it('keeps the standing limits that still apply', () => {
    const html = render(fullyObservedState());

    expect(html).toContain('are not counted here');
    expect(html).toContain('do not contain credit or token data');
  });

  it('describes truncation as a lower bound rather than a hidden gap', () => {
    const html = render(fullyObservedState(true));

    expect(html).toContain('stopped at the page limit');
    expect(html).toContain('lower bound');
    expect(html).not.toContain('may appear in transcripts that were not read');
  });

  it('still shows the not-observed explanation when a gap exists', () => {
    const html = render(readyState());

    expect(html).toContain('a longer window may show different results');
    expect(html).not.toContain('no provisioning gap to act on');
  });
});

describe('ObservedEvidenceCard - accessibility', () => {
  it('labels the section with its heading', () => {
    const html = render(readyState());

    expect(html).toContain('aria-labelledby="observed-evidence-heading"');
    expect(html).toContain('id="observed-evidence-heading"');
  });

  it('exposes the coverage grid with table semantics', () => {
    const html = render(readyState());

    expect(html).toContain('role="table"');
    expect(html).toContain('role="row"');
    expect(html).toContain('role="columnheader"');
    expect(html).toContain('role="cell"');
    expect(html).toContain('aria-label="Knowledge source observation"');
  });

  it('marks the loading state as busy for assistive technology', () => {
    const html = render({ status: 'loading' });
    expect(html).toContain('aria-busy');
  });
});

/**
 * Regression suite for the live defect on agent 8daaaaaa: the card announced
 * "353 of 358 configured knowledge sources were not observed (99%)" and told
 * the maker to remove them, while the same transcripts showed those files had
 * been searched under the group name "Uploaded Files".
 */
describe('ObservedEvidenceCard - not-attributable capabilities', () => {
  /** 353 uploaded files + 4 websites, all files hidden behind one group name. */
  function liveShapedState(): EvidenceState {
    const files = Array.from({ length: 353 }, (_, index) => ({
      name: `file-${index}.docx`,
      sourceType: 'Uploaded file',
      state: 'not-attributable' as const,
      invocations: 0,
    }));
    return {
      status: 'ready',
      window: { ...makeWindow(), conversations: 113 },
      blockedConversations: 0,
      observedTools: [
        { toolName: 'KnowledgeSearch', displayName: 'Knowledge search', toolKind: 'search', invocations: 12 },
      ],
      coverage: [
        {
          kind: 'knowledge',
          configured: 357,
          observed: 1,
          notAttributable: 353,
          items: [
            { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 4 },
            { name: 'MDN Web Docs', sourceType: 'Website', state: 'not-observed', invocations: 0 },
            { name: 'Pricing FAQ', sourceType: 'Website', state: 'not-observed', invocations: 0 },
            { name: 'Release Notes', sourceType: 'Website', state: 'not-observed', invocations: 0 },
            ...files,
          ],
          aggregateObservations: [{ name: 'Uploaded Files', invocations: 4 }],
        },
      ],
    };
  }

  it('never quotes the not-attributable items in the gap headline', () => {
    const html = render(liveShapedState());
    // The defect read "353 of 358". Only the 4 websites can be judged.
    expect(html).toContain('3 of 4');
    expect(html).not.toContain('353 of 358');
    expect(html).not.toContain('of 357');
  });

  it('discloses how many capabilities were excluded, and why', () => {
    const html = render(liveShapedState());
    expect(html).toContain('353');
    expect(html).toContain('Uploaded Files');
  });

  it('never tells the maker to remove a capability it could not judge', () => {
    const text = render(liveShapedState()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    // The harmful advice the defect produced. It must not attach to items
    // whose use the transcript is structurally unable to report.
    const forbidden = ['wasted', 'dead', 'delete these', 'remove them'];
    forbidden.forEach((phrase) => expect(text.toLowerCase()).not.toContain(phrase));
    // "unused" is permitted only in the sentence that denies the conclusion.
    for (const claim of text.match(/[^.]*\bunused\b[^.]*/gi) ?? []) {
      expect(claim).toMatch(/does not mean the capability is unused/i);
    }
  });

  it('collapses unattributable names by default instead of rendering hundreds of rows', () => {
    const html = render(liveShapedState());

    expect(html).toContain('Not attributable');
    expect(html).toContain('Show 353 names');
    expect(html).toContain('353 knowledge source names are hidden');
    expect(html).not.toContain('file-0.docx');
  });

  it('lists the group name as its own row so the search is not lost', () => {
    const html = render(liveShapedState());
    expect(html).toContain('Uploaded Files');
    expect(html).toContain('Group');
  });

  it('survives coverage that predates the not-attributable fields', () => {
    // The card is a module boundary. Losing the whole Cost & efficiency tab to
    // a missing array would be far worse than omitting one disclosure line.
    const legacy = {
      status: 'ready',
      window: makeWindow(),
      blockedConversations: 0,
      observedTools: [],
      coverage: [
        {
          kind: 'knowledge',
          configured: 2,
          observed: 1,
          items: [
            { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 3 },
            { name: 'MDN Web Docs', sourceType: 'Website', state: 'not-observed', invocations: 0 },
          ],
        },
      ],
    } as unknown as EvidenceState;
    expect(() => render(legacy)).not.toThrow();
  });
});
