import { Cat_powershieldenvironmentgroupsService } from '../../../../../generated/services/Cat_powershieldenvironmentgroupsService';
import { Cat_powershieldenvironmentgroupmembersService } from '../../../../../generated/services/Cat_powershieldenvironmentgroupmembersService';
import type { Cat_powershieldenvironmentgroupsBase } from '../../../../../generated/models/Cat_powershieldenvironmentgroupsModel';
import type { Cat_powershieldenvironmentgroupmembersBase } from '../../../../../generated/models/Cat_powershieldenvironmentgroupmembersModel';
import type { EnvironmentGroup, EnvironmentGroupMember } from '../../../models/environmentGroup';

/**
 * Fetch all environment containers for a given service tree (org-wide, active only).
 */
export async function getContainersByServiceTree(serviceTreeId: string): Promise<EnvironmentGroup[]> {
  const result = await Cat_powershieldenvironmentgroupsService.getAll({
    filter: `_cat_servicetree_value eq ${serviceTreeId} and statecode eq 0`,
    select: ['cat_powershieldenvironmentgroupid', 'cat_name', 'cat_description', 'cat_ownerupn', 'createdon'],
    orderBy: ['createdon desc'],
  });

  const groups = result.data ?? [];

  const withCounts = await Promise.all(
    groups.map(async (g) => {
      const members = await Cat_powershieldenvironmentgroupmembersService.getAll({
        filter: `_cat_parentgroup_value eq ${g.cat_powershieldenvironmentgroupid}`,
        select: ['cat_powershieldenvironmentgroupmemberid'],
      });
      return {
        id: g.cat_powershieldenvironmentgroupid,
        name: g.cat_name ?? '',
        description: g.cat_description,
        ownerUpn: g.cat_ownerupn,
        memberCount: (members.data ?? []).length,
        createdOn: g.createdon,
      } satisfies EnvironmentGroup;
    }),
  );

  return withCounts;
}

/**
 * Fetch all environment groups owned by the current user.
 */
export async function getMyGroups(aadObjectId: string): Promise<EnvironmentGroup[]> {
  const result = await Cat_powershieldenvironmentgroupsService.getAll({
    filter: `cat_owneraadobjectid eq '${aadObjectId}'`,
    select: ['cat_powershieldenvironmentgroupid', 'cat_name', 'cat_description'],
    orderBy: ['cat_name asc'],
  });

  const groups = result.data ?? [];

  // Fetch member counts for each group in parallel
  const withCounts = await Promise.all(
    groups.map(async (g) => {
      const members = await Cat_powershieldenvironmentgroupmembersService.getAll({
        filter: `_cat_parentgroup_value eq ${g.cat_powershieldenvironmentgroupid}`,
        select: ['cat_powershieldenvironmentgroupmemberid'],
      });
      return {
        id: g.cat_powershieldenvironmentgroupid,
        name: g.cat_name ?? '',
        description: g.cat_description,
        memberCount: (members.data ?? []).length,
      } satisfies EnvironmentGroup;
    }),
  );

  return withCounts;
}

/**
 * Retrieves full detail for a single environment group including member environments
 * (used for the detail popup on the request summary screen).
 */
export async function getEnvironmentGroupDetail(id: string): Promise<{
  id: string;
  name: string;
  description?: string;
  ownerUpn?: string;
  members: EnvironmentGroupMember[];
}> {
  const [headerResult, members] = await Promise.all([
    Cat_powershieldenvironmentgroupsService.get(id, {
      select: ['cat_powershieldenvironmentgroupid', 'cat_name', 'cat_description', 'cat_ownerupn'],
    }),
    getGroupMembers(id),
  ]);
  if (!headerResult.success || !headerResult.data) throw new Error('Environment Group not found.');
  const h = headerResult.data;
  return {
    id: h.cat_powershieldenvironmentgroupid,
    name: h.cat_name ?? '',
    description: h.cat_description,
    ownerUpn: h.cat_ownerupn,
    members,
  };
}

/**
 * Fetch all members of a specific environment group.
 */
export async function getGroupMembers(groupId: string): Promise<EnvironmentGroupMember[]> {
  const result = await Cat_powershieldenvironmentgroupmembersService.getAll({
    filter: `_cat_parentgroup_value eq ${groupId}`,
    select: ['cat_environmentguid', 'cat_environmentname'],
  });

  return (result.data ?? []).map((m) => ({
    environmentGuid: m.cat_environmentguid ?? '',
    environmentName: m.cat_environmentname ?? '',
  }));
}

/**
 * Create a new environment container linked to a service tree, with its member environments.
 * Returns the new container's ID.
 */
export async function createGroup(data: {
  name: string;
  description?: string;
  serviceTreeId: string;
  ownerAadObjectId: string;
  ownerUpn: string;
  members: Array<{ environmentGuid: string; environmentName: string }>;
}): Promise<string> {
  // 1. Create the header record — must include service tree bind to satisfy required lookup
  const headerResult = await Cat_powershieldenvironmentgroupsService.create({
    cat_name: data.name,
    ...(data.description ? { cat_description: data.description } : {}),
    cat_owneraadobjectid: data.ownerAadObjectId,
    cat_ownerupn: data.ownerUpn,
    'cat_ServiceTree@odata.bind': `/cat_servicetrees(${data.serviceTreeId})`,
  } as Omit<Cat_powershieldenvironmentgroupsBase, 'cat_powershieldenvironmentgroupid'>);

  const groupId = headerResult.data?.cat_powershieldenvironmentgroupid;
  if (!headerResult.success || !groupId) {
    throw new Error(headerResult.error?.message ?? 'Failed to create environment group.');
  }

  // 2. Create each member record linked to the header
  await Promise.all(
    data.members.map((m) =>
      Cat_powershieldenvironmentgroupmembersService.create({
        cat_name: m.environmentName,
        cat_environmentguid: m.environmentGuid,
        cat_environmentname: m.environmentName,
        'cat_ParentGroup@odata.bind': `/cat_powershieldenvironmentgroups(${groupId})`,
      } as Omit<Cat_powershieldenvironmentgroupmembersBase, 'cat_powershieldenvironmentgroupmemberid'>),
    ),
  );

  return groupId;
}

/**
 * Fetch all members of a group including their Dataverse record IDs (needed for deletion).
 */
async function getGroupMembersWithIds(groupId: string): Promise<Array<{
  id: string;
  environmentGuid: string;
  environmentName: string;
}>> {
  const result = await Cat_powershieldenvironmentgroupmembersService.getAll({
    filter: `_cat_parentgroup_value eq ${groupId}`,
    select: ['cat_powershieldenvironmentgroupmemberid', 'cat_environmentguid', 'cat_environmentname'],
  });
  return (result.data ?? []).map((m) => ({
    id: m.cat_powershieldenvironmentgroupmemberid,
    environmentGuid: m.cat_environmentguid ?? '',
    environmentName: m.cat_environmentname ?? '',
  }));
}

/**
 * Fetch the container count for each service tree ID in a single pass.
 * Returns a Map from serviceTreeId → number of containers.
 */
export async function getContainerCountsByServiceTreeIds(
  serviceTreeIds: string[],
): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();
  if (serviceTreeIds.length === 0) return countMap;

  // Fetch all active containers for the given trees in one query
  const filter = serviceTreeIds
    .map((id) => `_cat_servicetree_value eq ${id}`)
    .join(' or ');

  const result = await Cat_powershieldenvironmentgroupsService.getAll({
    filter: `(${filter}) and statecode eq 0`,
    select: ['cat_powershieldenvironmentgroupid', '_cat_servicetree_value'],
  });

  // Count per service tree
  for (const g of result.data ?? []) {
    const treeId = g._cat_servicetree_value;
    if (treeId) {
      countMap.set(treeId, (countMap.get(treeId) ?? 0) + 1);
    }
  }

  return countMap;
}

/**
 * Delete an environment container and all its member records.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  // 1. Delete all member records first
  const members = await getGroupMembersWithIds(groupId);
  await Promise.all(members.map((m) =>
    Cat_powershieldenvironmentgroupmembersService.delete(m.id),
  ));

  // 2. Delete the group header
  await Cat_powershieldenvironmentgroupsService.delete(groupId);
}

/**
 * Replace all members of an existing environment group (full sync).
 * Deletes all current members and creates new ones from the provided list.
 */
export async function updateGroupMembers(
  groupId: string,
  newMembers: Array<{ environmentGuid: string; environmentName: string }>,
): Promise<void> {
  // 1. Fetch existing members with their record IDs
  const existing = await getGroupMembersWithIds(groupId);

  // 2. Delete all existing members
  await Promise.all(existing.map((m) =>
    Cat_powershieldenvironmentgroupmembersService.delete(m.id),
  ));

  // 3. Create new member records
  await Promise.all(newMembers.map((m) =>
    Cat_powershieldenvironmentgroupmembersService.create({
      cat_name: m.environmentName,
      cat_environmentguid: m.environmentGuid,
      cat_environmentname: m.environmentName,
      'cat_ParentGroup@odata.bind': `/cat_powershieldenvironmentgroups(${groupId})`,
    } as Omit<Cat_powershieldenvironmentgroupmembersBase, 'cat_powershieldenvironmentgroupmemberid'>),
  ));
}

/**
 * Update an existing environment container's name and replace its members.
 */
export async function updateGroup(data: {
  groupId: string;
  name: string;
  description?: string;
  members: Array<{ environmentGuid: string; environmentName: string }>;
}): Promise<void> {
  await Promise.all([
    Cat_powershieldenvironmentgroupsService.update(data.groupId, {
      cat_name: data.name,
      cat_description: data.description ?? '',
    } as Partial<Cat_powershieldenvironmentgroupsBase>),
    updateGroupMembers(data.groupId, data.members),
  ]);
}
