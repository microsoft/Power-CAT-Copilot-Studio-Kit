/**
 * The transcript read itself: paging, truncation, the OData filter, and the
 * never-throws contract.
 *
 * `parseToolCallTraces` and `buildCoverage` are covered by
 * `transcriptEvidence.test.ts`. This file covers the layer between them and
 * Dataverse, which is the only part that can silently return a *wrong* window
 * — a short read makes a used capability look unobserved, which is exactly the
 * false finding spec 019 FR-5 forbids.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const listWithOrg = vi.fn();

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    ListRecordsWithOrganization: (...args: unknown[]) => listWithOrg(...args),
  },
}));

const {
  CURRENT_ORGANIZATION,
  DEFAULT_WINDOW_DAYS,
  MAX_PAGES,
  MAX_RECORDS,
  PAGE_SIZE,
  buildObservationWindow,
  extractSkiptoken,
  loadTranscriptEvidence,
  resolveEvidenceOrganization,
} = await import('../services/transcript/transcriptEvidenceService');

/** Positional index of each argument in the generated wrapper's signature. */
const ARG = {
  organizationUrl: 0,
  entity: 1,
  prefer: 2,
  select: 6,
  filter: 7,
  orderBy: 8,
  top: 11,
  skiptoken: 12,
} as const;

const NOW = new Date('2026-08-10T00:00:00.000Z');

/** A transcript that observes one knowledge source out of two configured. */
function transcriptContent(): string {
  return JSON.stringify({
    activities: [
      {
        name: 'ToolCallTrace:Started',
        value: {
          toolCallId: 'call-1',
          toolName: 'KnowledgeSearch',
          toolDisplayName: 'Knowledge search',
          toolKind: 'search',
          description: [
            'Available search sources:',
            '- React Reference (Website)',
            '- Pricing FAQ (Website)',
          ].join('\n'),
          hiddenFilledParameters: { sources: JSON.stringify(['React Reference']) },
        },
      },
    ],
  });
}

function page(rows: unknown[], nextLink?: string) {
  return {
    success: true,
    data: nextLink ? { value: rows, '@odata.nextLink': nextLink } : { value: rows },
  };
}

/** A connector-shaped nextLink carrying the token nested inside `next`. */
function nextLink(token: string): string {
  const inner = encodeURIComponent(`conversationtranscripts?$skiptoken=${token}`);
  return `https://host/nextLink?organization=https://org.crm.dynamics.com&next=${inner}`;
}

function row(id: string) {
  return {
    conversationtranscriptid: id,
    content: transcriptContent(),
    createdon: '2026-08-01T00:00:00Z',
  };
}

beforeEach(() => {
  listWithOrg.mockReset();
});

describe('extractSkiptoken', () => {
  it('reads the token nested inside the connector nextLink `next` parameter', () => {
    expect(extractSkiptoken(nextLink('abc123'))).toBe('abc123');
  });

  it('reads a token from a native Web API nextLink', () => {
    expect(
      extractSkiptoken('https://org.crm.dynamics.com/api/data/v9.2/x?$skiptoken=tok42'),
    ).toBe('tok42');
  });

  it('percent-decodes a token from the native form', () => {
    expect(extractSkiptoken('https://host/x?$skiptoken=a%20b')).toBe('a b');
  });

  it('returns undefined for a link with no token', () => {
    expect(extractSkiptoken('https://host/x?$top=25')).toBeUndefined();
  });

  it('returns undefined for non-string and empty input', () => {
    expect(extractSkiptoken(undefined)).toBeUndefined();
    expect(extractSkiptoken(null)).toBeUndefined();
    expect(extractSkiptoken('')).toBeUndefined();
    expect(extractSkiptoken(42)).toBeUndefined();
  });

  it('falls back to the direct match when the link is not a parsable URL', () => {
    expect(extractSkiptoken('not a url at all ?$skiptoken=fallback')).toBe('fallback');
  });
});

describe('buildObservationWindow', () => {
  it('anchors the window on the supplied clock', () => {
    const window = buildObservationWindow({
      days: 30,
      now: NOW,
      conversations: 7,
      truncated: false,
    });
    expect(window.endIso).toBe('2026-08-10T00:00:00.000Z');
    expect(window.startIso).toBe('2026-07-11T00:00:00.000Z');
    expect(window.days).toBe(30);
    expect(window.conversations).toBe(7);
    expect(window.truncated).toBe(false);
  });

  it('passes truncation through so the UI can disclose a short read', () => {
    const window = buildObservationWindow({
      days: 7,
      now: NOW,
      conversations: 200,
      truncated: true,
    });
    expect(window.truncated).toBe(true);
    expect(window.startIso).toBe('2026-08-03T00:00:00.000Z');
  });
});

describe('loadTranscriptEvidence — inputs it refuses to act on', () => {
  it('reports no-access without calling Dataverse when the bot id is blank', async () => {
    const state = await loadTranscriptEvidence({
      botId: '   ',
      organizationUrl: 'https://org.crm.dynamics.com',
    });
    expect(state.status).toBe('no-access');
    expect(listWithOrg).not.toHaveBeenCalled();
  });

  it('reports no-access without calling Dataverse when the org url is blank', async () => {
    const state = await loadTranscriptEvidence({ botId: 'bot-1', organizationUrl: '' });
    expect(state.status).toBe('no-access');
    expect(listWithOrg).not.toHaveBeenCalled();
  });
});

describe('loadTranscriptEvidence — the Dataverse request', () => {
  it('filters on the bot lookup and the window start, newest first', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    const args = listWithOrg.mock.calls[0];
    expect(args[ARG.organizationUrl]).toBe('https://org.crm.dynamics.com');
    expect(args[ARG.entity]).toBe('conversationtranscripts');
    expect(args[ARG.filter]).toBe(
      "_bot_conversationtranscriptid_value eq 'bot-1' and createdon ge 2026-07-11T00:00:00.000Z",
    );
    expect(args[ARG.orderBy]).toBe('createdon desc');
    expect(args[ARG.select]).toContain('content');
    expect(args[ARG.skiptoken]).toBeUndefined();
  });

  it('passes the current-environment sentinel straight through to the connector', async () => {
    // The blank-organization guard must not reject 'current': that sentinel is
    // how this app addresses its own environment, and it is what an ordinary
    // same-environment review resolves to.
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: CURRENT_ORGANIZATION,
      now: NOW,
    });

    expect(listWithOrg).toHaveBeenCalled();
    expect(listWithOrg.mock.calls[0][ARG.organizationUrl]).toBe('current');
    expect(state.status).not.toBe('no-access');
  });

  it('honours a caller-supplied window length', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      windowDays: 7,
      now: NOW,
    });

    expect(listWithOrg.mock.calls[0][ARG.filter]).toContain('2026-08-03T00:00:00.000Z');
    if (state.status === 'no-access' || state.status === 'loading') throw new Error('unexpected');
    expect(state.window.days).toBe(7);
  });

  it('defaults to a 30-day window', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));
    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });
    if (state.status === 'no-access' || state.status === 'loading') throw new Error('unexpected');
    expect(state.window.days).toBe(DEFAULT_WINDOW_DAYS);
    expect(DEFAULT_WINDOW_DAYS).toBe(30);
  });

  it('escapes an apostrophe in the bot id so the filter cannot be broken', async () => {
    listWithOrg.mockResolvedValueOnce(page([]));

    await loadTranscriptEvidence({
      botId: "o'brien",
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(listWithOrg.mock.calls[0][ARG.filter]).toContain("o''brien");
  });
});

describe('loadTranscriptEvidence — paging', () => {
  it('follows the skiptoken across pages and stops when it runs out', async () => {
    listWithOrg
      .mockResolvedValueOnce(page([row('t1')], nextLink('p2')))
      .mockResolvedValueOnce(page([row('t2')], nextLink('p3')))
      .mockResolvedValueOnce(page([row('t3')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(listWithOrg).toHaveBeenCalledTimes(3);
    expect(listWithOrg.mock.calls[1][ARG.skiptoken]).toBe('p2');
    expect(listWithOrg.mock.calls[2][ARG.skiptoken]).toBe('p3');
    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.conversations).toBe(3);
    expect(state.window.truncated).toBe(false);
  });

  it('stops on an empty page even when a skiptoken is offered', async () => {
    listWithOrg
      .mockResolvedValueOnce(page([row('t1')], nextLink('p2')))
      .mockResolvedValueOnce(page([], nextLink('p3')));

    await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(listWithOrg).toHaveBeenCalledTimes(2);
  });

  it('marks the window truncated once the record cap is reached', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => row(`t${i}`));
    listWithOrg.mockResolvedValue(page(full, nextLink('more')));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.truncated).toBe(true);
    expect(state.window.conversations).toBe(MAX_RECORDS);
    expect(listWithOrg).toHaveBeenCalledTimes(MAX_RECORDS / PAGE_SIZE);
  });

  it('discloses truncation at the cap even when no nextLink is offered', async () => {
    // The regression this guards: the connector can stop offering a nextLink
    // because it applied the ceiling itself. Treating that as a complete window
    // is what turned a 25-of-113 read into "not observed" findings.
    const full = Array.from({ length: MAX_RECORDS }, (_, i) => row(`t${i}`));
    listWithOrg.mockResolvedValueOnce(page(full));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.truncated).toBe(true);
  });

  it('does not pass $top, relying on MAX_RECORDS guard instead', async () => {
    // Dataverse documents that $top and Prefer: odata.maxpagesize must not be
    // combined. The MAX_RECORDS guard enforces the ceiling client-side.
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(listWithOrg.mock.calls[0][ARG.top]).toBeUndefined();
  });

  it('reads a realistic live window in full without reporting truncation', async () => {
    // 113 transcripts in a 30-day window. Every one must be
    // read before any capability is called "not observed".
    const LIVE_ROWS = 113;
    let remaining = LIVE_ROWS;
    listWithOrg.mockImplementation(() => {
      const take = Math.min(PAGE_SIZE, remaining);
      remaining -= take;
      const rows = Array.from({ length: take }, (_, i) => row(`t${remaining}-${i}`));
      return Promise.resolve(remaining > 0 ? page(rows, nextLink('more')) : page(rows));
    });

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.conversations).toBe(LIVE_ROWS);
    expect(state.window.truncated).toBe(false);
  });

  it('stops at the page budget even when pages stay small', async () => {
    listWithOrg.mockResolvedValue(page([row('t1')], nextLink('more')));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(listWithOrg).toHaveBeenCalledTimes(MAX_PAGES);
    expect(state.window.truncated).toBe(true);
    expect(state.window.conversations).toBe(MAX_PAGES);
  });
});

describe('loadTranscriptEvidence — failure handling', () => {
  it('reports no-access when the very first page fails', async () => {
    listWithOrg.mockResolvedValueOnce({ success: false });

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(state.status).toBe('no-access');
  });

  it('never blames the maker for a missing role (FR-9)', async () => {
    listWithOrg.mockResolvedValueOnce({ success: false });

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'no-access') throw new Error('expected no-access');
    expect(state.reason.toLowerCase()).not.toContain('role');
    expect(state.reason.toLowerCase()).not.toContain('permission');
    expect(state.reason.toLowerCase()).toContain('transcript');
  });

  it('keeps the rows it already has when a later page fails, and says so', async () => {
    listWithOrg
      .mockResolvedValueOnce(page([row('t1')], nextLink('p2')))
      .mockResolvedValueOnce({ success: false });

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.conversations).toBe(1);
    expect(state.window.truncated).toBe(true);
  });

  it('resolves rather than throwing when the connector throws', async () => {
    listWithOrg.mockRejectedValueOnce(new Error('network down'));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(state.status).toBe('no-access');
  });

  it('treats a success with no payload as a failed read', async () => {
    listWithOrg.mockResolvedValueOnce({ success: true, data: undefined });

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(state.status).toBe('no-access');
  });
});

describe('loadTranscriptEvidence — evidence it produces', () => {
  it('reports no-transcripts when the window is genuinely empty', async () => {
    listWithOrg.mockResolvedValueOnce(page([]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    expect(state.status).toBe('no-transcripts');
  });

  it('separates observed from not-observed knowledge sources', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    const knowledge = state.coverage.find((c) => c.kind === 'knowledge');
    expect(knowledge?.configured).toBe(2);
    expect(knowledge?.observed).toBe(1);
    expect(knowledge?.items.find((i) => i.name === 'React Reference')?.state).toBe('observed');
    expect(knowledge?.items.find((i) => i.name === 'Pricing FAQ')?.state).toBe('not-observed');
  });

  it('compares configured skills against observation', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      configuredSkills: ['Create ticket'],
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    const skills = state.coverage.find((c) => c.kind === 'skill');
    expect(skills?.configured).toBe(1);
    expect(skills?.observed).toBe(0);
    expect(skills?.items[0]?.state).toBe('not-observed');
  });

  it('counts every transcript row it read as a conversation', async () => {
    listWithOrg.mockResolvedValueOnce(page([row('t1'), row('t2'), row('t3')]));

    const state = await loadTranscriptEvidence({
      botId: 'bot-1',
      organizationUrl: 'https://org.crm.dynamics.com',
      now: NOW,
    });

    if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
    expect(state.window.conversations).toBe(3);
  });
});

/**
 * Regression cover for the defect found on the first live run: an ordinary
 * same-environment review stores an EMPTY `cat_sourceenvironment`, which the
 * page treated as "unknown" and so never read any transcript. Every one of
 * these cases is a review that must still produce evidence.
 */
describe('resolveEvidenceOrganization', () => {
  const base = { isZipReview: false, isSavedReviewLoading: false };

  it('uses the current-environment sentinel when the saved review has no source environment', () => {
    // ReviewService stores `orgUrl ?? ''`, so '' means "this environment".
    expect(resolveEvidenceOrganization({ ...base, savedSourceEnvironment: '' }))
      .toBe(CURRENT_ORGANIZATION);
    expect(resolveEvidenceOrganization({ ...base, savedSourceEnvironment: null }))
      .toBe(CURRENT_ORGANIZATION);
    expect(resolveEvidenceOrganization({ ...base })).toBe(CURRENT_ORGANIZATION);
  });

  it('prefers an explicit cross-environment organization over the sentinel', () => {
    expect(
      resolveEvidenceOrganization({
        ...base,
        routeOrgUrl: 'https://other.crm.dynamics.com',
        savedSourceEnvironment: 'https://saved.crm.dynamics.com',
      }),
    ).toBe('https://other.crm.dynamics.com');
  });

  it('falls back to the saved source environment when the route carries none', () => {
    expect(
      resolveEvidenceOrganization({ ...base, savedSourceEnvironment: 'https://saved.crm.dynamics.com' }),
    ).toBe('https://saved.crm.dynamics.com');
  });

  it('reads nothing for an uploaded file, which has no environment at all', () => {
    expect(resolveEvidenceOrganization({ ...base, isZipReview: true })).toBeNull();
  });

  it('reads nothing until the saved review has loaded, so it cannot target the wrong org', () => {
    expect(
      resolveEvidenceOrganization({ isZipReview: false, isSavedReviewLoading: true }),
    ).toBeNull();
  });

  it('ignores whitespace-only values rather than querying an org named " "', () => {
    expect(
      resolveEvidenceOrganization({ ...base, routeOrgUrl: '   ', savedSourceEnvironment: '  ' }),
    ).toBe(CURRENT_ORGANIZATION);
  });
});
