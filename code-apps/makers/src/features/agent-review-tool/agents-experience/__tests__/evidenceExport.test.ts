import { describe, expect, it } from 'vitest';
import {
  buildEvidenceExportRows,
  buildEvidenceWindowRows,
} from '../utils/copilotReviewExport';
import type {
  EvidenceState,
  ObservationWindow,
} from '../contracts/TranscriptEvidence';

/**
 * Covers spec 019 FR-10: an export must carry the observed evidence and the
 * window it came from, and must never carry conversation content or an
 * invented credit figure.
 */

const WINDOW: ObservationWindow = {
  startIso: '2026-07-09T00:00:00.000Z',
  endIso: '2026-08-08T00:00:00.000Z',
  days: 30,
  conversations: 14,
  truncated: false,
};

function readyState(overrides: Partial<Extract<EvidenceState, { status: 'ready' }>> = {}) {
  const base: Extract<EvidenceState, { status: 'ready' }> = {
    status: 'ready',
    window: WINDOW,
    blockedConversations: 2,
    observedTools: [
      { toolName: 'search', displayName: 'Search', toolKind: 'search', invocations: 9 },
    ],
    coverage: [
      {
        kind: 'knowledge',
        configured: 3,
        observed: 1,
        notAttributable: 0,
        items: [
          { name: 'React Reference', sourceType: 'Website', state: 'observed', invocations: 9 },
          { name: 'Coffee Gear (1).docx', sourceType: 'Uploaded file', state: 'not-observed', invocations: 0 },
          { name: 'Policy handbook', state: 'not-observed', invocations: 0 },
        ],
        aggregateObservations: [],
      },
      {
        kind: 'skill',
        configured: 2,
        observed: 1,
        notAttributable: 0,
        items: [
          { name: 'summarise', state: 'observed', invocations: 4 },
          { name: 'escalate', state: 'not-observed', invocations: 0 },
        ],
        aggregateObservations: [],
      },
    ],
  };
  return { ...base, ...overrides };
}

describe('buildEvidenceExportRows', () => {
  it('exports no rows when evidence was never read', () => {
    expect(buildEvidenceExportRows(undefined)).toEqual([]);
  });

  it.each([
    ['loading', { status: 'loading' } as EvidenceState],
    ['no-access', { status: 'no-access', reason: 'unavailable' } as EvidenceState],
    ['no-transcripts', { status: 'no-transcripts', window: WINDOW } as EvidenceState],
    [
      'no-signal',
      { status: 'no-signal', window: WINDOW, blockedConversations: 0 } as EvidenceState,
    ],
  ])('exports no rows for the %s state', (_label, state) => {
    // A table of zeros would read as a finding when nothing was measured.
    expect(buildEvidenceExportRows(state)).toEqual([]);
  });

  it('names every configured capability once when evidence is ready', () => {
    const rows = buildEvidenceExportRows(readyState());
    expect(rows).toHaveLength(5);
    expect(rows.map(row => row.name)).toEqual([
      'React Reference',
      'Coffee Gear (1).docx',
      'Policy handbook',
      'summarise',
      'escalate',
    ]);
  });

  it('labels each capability class in reader-facing words', () => {
    const rows = buildEvidenceExportRows(readyState());
    expect(rows.slice(0, 3).every(row => row.capabilityClass === 'Knowledge source')).toBe(true);
    expect(rows.slice(3).every(row => row.capabilityClass === 'Skill')).toBe(true);
  });

  it('reports state as observed or not observed, never as unused', () => {
    const rows = buildEvidenceExportRows(readyState());
    expect(rows.map(row => row.status)).toEqual([
      'Observed',
      'Not observed',
      'Not observed',
      'Observed',
      'Not observed',
    ]);
    const words = rows.map(row => row.status.toLowerCase()).join(' ');
    for (const forbidden of ['unused', 'dead', 'wasted', 'redundant']) {
      expect(words).not.toContain(forbidden);
    }
  });

  it('carries invocation counts through unchanged', () => {
    const rows = buildEvidenceExportRows(readyState());
    expect(rows[0].invocations).toBe(9);
    expect(rows[1].invocations).toBe(0);
    expect(rows[3].invocations).toBe(4);
  });

  it('leaves source type blank rather than inventing one', () => {
    const rows = buildEvidenceExportRows(readyState());
    expect(rows[2].sourceType).toBe('');
  });

  it('exports no conversation content and no credit figure', () => {
    const serialised = JSON.stringify(buildEvidenceExportRows(readyState())).toLowerCase();
    for (const forbidden of ['credit', 'token', 'usd', '$', 'message', 'transcript text']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('buildEvidenceWindowRows', () => {
  it('states plainly that evidence was not read when it is absent', () => {
    expect(buildEvidenceWindowRows(undefined)).toEqual([
      ['Observed capability use', 'Not read'],
    ]);
  });

  it('omits window figures while still loading', () => {
    const rows = buildEvidenceWindowRows({ status: 'loading' });
    expect(rows).toEqual([['Observed capability use', 'Still reading transcripts']]);
  });

  it('omits window figures when transcripts are unavailable', () => {
    const rows = buildEvidenceWindowRows({ status: 'no-access', reason: 'x' });
    expect(rows).toEqual([['Observed capability use', 'Transcripts unavailable']]);
  });

  it('reports the window length when there was no activity', () => {
    const rows = buildEvidenceWindowRows({ status: 'no-transcripts', window: WINDOW });
    expect(rows).toContainEqual(['Observation window (days)', '30']);
    expect(rows.map(row => row[1]).join(' ')).not.toMatch(/\d+ of \d+/);
  });

  it('reports conversations read but no coverage fraction for no-signal', () => {
    const rows = buildEvidenceWindowRows({
      status: 'no-signal',
      window: WINDOW,
      blockedConversations: 1,
    });
    expect(rows).toContainEqual(['Conversations read', '14']);
    expect(JSON.stringify(rows)).not.toMatch(/\d+ of \d+/);
  });

  it('reports the full window, completeness, and blocked count when ready', () => {
    const rows = buildEvidenceWindowRows(readyState());
    const map = new Map(rows);
    expect(map.get('Observation window (days)')).toBe('30');
    expect(map.get('Observation window start')).toBe(WINDOW.startIso);
    expect(map.get('Observation window end')).toBe(WINDOW.endIso);
    expect(map.get('Conversations read')).toBe('14');
    expect(map.get('Window complete')).toBe('Yes');
    expect(map.get('Blocked conversations excluded')).toBe('2');
  });

  it('discloses a truncated read, because it can hide real use', () => {
    const rows = buildEvidenceWindowRows(
      readyState({ window: { ...WINDOW, truncated: true } }),
    );
    expect(new Map(rows).get('Window complete')).toBe('No - stopped at page limit');
  });

  it('never tells the maker to obtain a role', () => {
    const states: EvidenceState[] = [
      { status: 'loading' },
      { status: 'no-access', reason: 'x' },
      { status: 'no-transcripts', window: WINDOW },
      { status: 'no-signal', window: WINDOW, blockedConversations: 0 },
      readyState(),
    ];
    for (const state of states) {
      const text = JSON.stringify(buildEvidenceWindowRows(state)).toLowerCase();
      expect(text).not.toContain('security role');
      expect(text).not.toContain('permission');
    }
  });
});
