import type { PpEnvironment } from '../../models/environment';
import type { EnvironmentGroupMember } from '../../models/environmentGroup';

/** Canonical snapshot emitted once an Environment Group's members are resolved. */
export interface EnvironmentGroupSnapshot {
  group: { id: string; name: string };
  environments: readonly { environmentId: string; displayName: string }[];
  /** Members returned by getGroupMembers, before eligibility filtering. */
  totalMemberCount: number;
  /** Members not present in the caller's eligible-environment set. */
  unavailableMemberCount: number;
}

/**
 * Builds the canonical {@link EnvironmentGroupSnapshot} from a group's raw members
 * and the current user's eligible environments (spec 018 FR-010). A member matches
 * an eligible environment when its `environmentGuid` equals the environment's
 * `name` (the environment's unique id). Unavailable members — those with no
 * eligible match — are excluded from `environments` and counted separately so the
 * caller never has to re-map, re-filter, or recompute the counts.
 */
export function buildEnvironmentGroupSnapshot(
  group: { id: string; name: string },
  members: readonly EnvironmentGroupMember[],
  environments: readonly PpEnvironment[],
): EnvironmentGroupSnapshot {
  const envById = new Map(environments.map((e) => [e.name, e]));
  const matched = members
    .map((m) => envById.get(m.environmentGuid))
    .filter((e): e is PpEnvironment => !!e);
  return {
    group,
    environments: matched.map((e) => ({
      environmentId: e.name,
      displayName: e.displayName,
    })),
    totalMemberCount: members.length,
    unavailableMemberCount: members.length - matched.length,
  };
}
