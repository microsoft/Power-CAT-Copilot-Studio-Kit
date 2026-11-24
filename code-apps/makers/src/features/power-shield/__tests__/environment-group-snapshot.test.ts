import { describe, it, expect } from 'vitest';
import { buildEnvironmentGroupSnapshot } from '../shared/components/environmentGroupSnapshot';
import type { PpEnvironment } from '../models/environment';
import type { EnvironmentGroupMember } from '../models/environmentGroup';

/**
 * Spec 018 FR-010 — the shared selector emits a canonical snapshot so neither
 * wizard has to re-map members, re-run eligibility matching, or recompute counts.
 * These tests pin that mapping. (The transaction ordering and stale-response
 * discards are async/DOM behaviors; this repo's power-shield suites run in the
 * node env without a DOM, so they are covered by the request-token design and the
 * app-validator walkthrough rather than here.)
 */
function env(name: string, displayName: string): PpEnvironment {
  return {
    id: `/arm/${name}`,
    name,
    type: 'microsoft.powerplatform/environments',
    location: 'unitedstates',
    displayName,
    environmentSku: 'Production',
  };
}

function member(environmentGuid: string): EnvironmentGroupMember {
  return { environmentGuid, environmentName: `name-${environmentGuid}` };
}

const group = { id: 'g1', name: 'Group One' };

describe('buildEnvironmentGroupSnapshot', () => {
  it('maps members that match an eligible environment to id + displayName', () => {
    const environments = [env('e1', 'Env One'), env('e2', 'Env Two')];
    const snapshot = buildEnvironmentGroupSnapshot(group, [member('e1'), member('e2')], environments);

    expect(snapshot.group).toEqual(group);
    expect(snapshot.environments).toEqual([
      { environmentId: 'e1', displayName: 'Env One' },
      { environmentId: 'e2', displayName: 'Env Two' },
    ]);
    expect(snapshot.totalMemberCount).toBe(2);
    expect(snapshot.unavailableMemberCount).toBe(0);
  });

  it('counts members with no eligible match as unavailable and excludes them', () => {
    const environments = [env('e1', 'Env One')];
    const snapshot = buildEnvironmentGroupSnapshot(
      group,
      [member('e1'), member('e2'), member('e3')],
      environments,
    );

    expect(snapshot.environments).toEqual([{ environmentId: 'e1', displayName: 'Env One' }]);
    expect(snapshot.totalMemberCount).toBe(3);
    expect(snapshot.unavailableMemberCount).toBe(2);
  });

  it('treats a group with no members as empty, not unavailable', () => {
    const snapshot = buildEnvironmentGroupSnapshot(group, [], [env('e1', 'Env One')]);

    expect(snapshot.environments).toEqual([]);
    expect(snapshot.totalMemberCount).toBe(0);
    expect(snapshot.unavailableMemberCount).toBe(0);
  });

  it('counts every member unavailable when the eligible set is empty', () => {
    const snapshot = buildEnvironmentGroupSnapshot(group, [member('e1'), member('e2')], []);

    expect(snapshot.environments).toEqual([]);
    expect(snapshot.totalMemberCount).toBe(2);
    expect(snapshot.unavailableMemberCount).toBe(2);
  });
});
