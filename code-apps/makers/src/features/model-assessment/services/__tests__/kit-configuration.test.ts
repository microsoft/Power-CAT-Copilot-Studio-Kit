import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));

import { getKitOptions, getKitProgress } from '../model-assessment-service';
import type { TrackedAgentVM } from '../../contracts/model-assessment';

describe('getKitProgress', () => {
  const RUN = '11111111-1111-1111-1111-111111111111';
  const SET = '22222222-2222-2222-2222-222222222222';
  beforeEach(() => mocks.list.mockReset());

  it('counts multi-turn tests once, not each of their steps', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {
      // Kit's cat_tests counts every step result (3 conversation steps here).
      cat_copilottestruns: [{ _cat_copilottestsetid_value: SET, cat_tests: 5 }],
      cat_copilottestresults: [{ cat_resultcode: 1 }],
      cat_copilottests: [{ cat_copilottestid: 'a' }, { cat_copilottestid: 'b' }],
    };
    mocks.list.mockImplementation(async (_org: string, entitySet: string) => ({ success: true, data: { value: rows[entitySet] ?? [] } }));
    expect(await getKitProgress(RUN)).toEqual({ total: 2, done: 1 });
    const testsCall = mocks.list.mock.calls.find(([, entitySet]) => entitySet === 'cat_copilottests');
    expect(JSON.stringify(testsCall)).toContain(`_cat_copilottestsetid_value eq ${SET} and _cat_parent_value eq null`);
  });
});

describe('getKitOptions', () => {
  const BOT = '33333333-3333-3333-3333-333333333333';
  const agent = { id: 'a1', name: 'Docs', schema: 'cr37d_docs', copilotAgentId: BOT } as TrackedAgentVM;
  const withBot = (bot: Record<string, unknown> | undefined) => mocks.list.mockImplementation(
    async (_org: string, entitySet: string) => ({
      success: true,
      data: { value: entitySet === 'bots' ? (bot ? [bot] : []) : [] },
    }));

  beforeEach(() => mocks.list.mockReset());

  it('flags an agent that has never been published', async () => {
    withBot({ configuration: '{}', publishedon: null });
    expect(await getKitOptions(agent)).toMatchObject({ harness: false, published: false });
  });

  it('treats a published agent as reachable', async () => {
    withBot({ configuration: '{}', publishedon: '2026-09-30T10:00:00Z' });
    expect((await getKitOptions(agent)).published).toBe(true);
  });

  it('offers only active, pipeline-enabled Agent Configurations for the agent', async () => {
    withBot({ configuration: '{}', publishedon: '2026-09-30T10:00:00Z' });
    await getKitOptions(agent);
    const call = mocks.list.mock.calls.find(([, entitySet]) => entitySet === 'cat_copilotconfigurations');
    expect(JSON.stringify(call)).toContain("cat_agentidentifier eq 'cr37d_docs' and cat_ispipelineenabled eq true and statecode eq 0");
  });

  it('does not warn when the agent row cannot be read', async () => {
    withBot(undefined);
    expect((await getKitOptions(agent)).published).toBe(true);
  });
});