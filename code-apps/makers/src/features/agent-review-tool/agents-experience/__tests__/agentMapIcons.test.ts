/**
 * Per-agent map icons.
 *
 * The reviewed agent and each connected agent carry their own maker-chosen
 * icon in `bots.iconbase64` — the same mark the review grids show. These tests
 * pin the two properties that matter: the icon reaches the right node, and a
 * failure to fetch never blocks the map.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getAll = vi.fn();
const listWithOrg = vi.fn();

vi.mock('../../../../generated/services/BotsService', () => ({
  BotsService: { getAll: (...args: unknown[]) => getAll(...args) },
}));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    ListRecordsWithOrganization: (...args: unknown[]) => listWithOrg(...args),
  },
}));

import { loadAgentMapIcons } from '../services/agent-map/agentMapIcons';

const ROOT = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  getAll.mockReset();
  listWithOrg.mockReset();
});

describe('agent map icons', () => {
  it('keys the reviewed agent as root and connected agents by schema name', () => {
    getAll.mockResolvedValue({
      success: true,
      data: [
        { botid: ROOT, schemaname: 'cr306_visualmerch', iconbase64: 'AAA' },
        { botid: 'other', schemaname: 'cr306_storeops', iconbase64: 'BBB' },
      ],
    });
    return loadAgentMapIcons(ROOT, ['cr306_storeops']).then(icons => {
      expect(icons.root).toBe('data:image/png;base64,AAA');
      // Lower-cased so the lookup is not defeated by casing differences between
      // the botSchemaName on the component and the bots table.
      expect(icons['cr306_storeops']).toBe('data:image/png;base64,BBB');
    });
  });

  it('does not double-wrap a value that is already a data URL', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{ botid: ROOT, schemaname: 's', iconbase64: 'data:image/png;base64,AAA' }],
    });
    const icons = await loadAgentMapIcons(ROOT, []);
    expect(icons.root).toBe('data:image/png;base64,AAA');
  });

  it('skips a row with no icon rather than emitting an empty src', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{ botid: ROOT, schemaname: 's', iconbase64: '   ' }],
    });
    expect(await loadAgentMapIcons(ROOT, [])).toEqual({});
  });

  it('returns nothing rather than throwing when the query fails', async () => {
    // Icons are decoration; a fetch failure must never stop the map rendering.
    getAll.mockRejectedValue(new Error('network'));
    await expect(loadAgentMapIcons(ROOT, [])).resolves.toEqual({});
  });

  it('returns nothing when the service reports failure', async () => {
    getAll.mockResolvedValue({ success: false });
    expect(await loadAgentMapIcons(ROOT, [])).toEqual({});
  });

  it('makes no call at all when there is nothing to look up', async () => {
    expect(await loadAgentMapIcons(undefined, [])).toEqual({});
    expect(getAll).not.toHaveBeenCalled();
    expect(listWithOrg).not.toHaveBeenCalled();
  });

  it('goes cross-environment when an org URL is supplied', async () => {
    listWithOrg.mockResolvedValue({
      success: true,
      data: { value: [{ botid: ROOT, schemaname: 's', iconbase64: 'AAA' }] },
    });
    const icons = await loadAgentMapIcons(ROOT, [], 'https://contoso.crm.dynamics.com');
    expect(icons.root).toBe('data:image/png;base64,AAA');
    expect(getAll).not.toHaveBeenCalled();
  });

  it('escapes a quote in a schema name rather than breaking the filter', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    await loadAgentMapIcons(undefined, ["o'brien"]);
    const filter = (getAll.mock.calls[0][0] as { filter: string }).filter;
    expect(filter).toContain("o''brien");
  });

  it('de-duplicates repeated schema names', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    await loadAgentMapIcons(undefined, ['a', 'a', 'b']);
    const filter = (getAll.mock.calls[0][0] as { filter: string }).filter;
    expect(filter.match(/schemaname eq/g)).toHaveLength(2);
  });
});
