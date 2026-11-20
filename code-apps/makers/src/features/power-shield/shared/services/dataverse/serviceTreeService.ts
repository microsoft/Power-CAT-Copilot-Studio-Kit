import { Cat_servicetreesService } from '../../../../../generated/services/Cat_servicetreesService';
import type { Cat_servicetrees, Cat_servicetreesBase } from '../../../../../generated/models/Cat_servicetreesModel';
import type { ServiceTree } from '../../../models/serviceTree';
import type { ServiceTreeMemberEntry } from '../../../models/serviceTreeMember';

function toServiceTree(r: Cat_servicetrees): ServiceTree {
  return {
    id: r.cat_servicetreeid,
    name: r.cat_servicetreename ?? '',
    organization: r.cat_organization,
    description: r.cat_description,
    createdOn: r.createdon,
  };
}

/**
 * Retrieves all active Service Trees ordered by name.
 * @deprecated Prefer getServiceTreesForUser() which scopes to membership.
 */
export async function getServiceTrees(): Promise<ServiceTree[]> {
  const result = await Cat_servicetreesService.getAll({
    select: ['cat_servicetreeid', 'cat_servicetreename', 'cat_organization'],
    orderBy: ['cat_servicetreename asc'],
  });
  return (result.data ?? []).map(toServiceTree);
}

/**
 * Retrieves Service Trees where the given user is a member.
 * Parses cat_membersinfo JSON client-side to filter by the user's dvUserId.
 */
export async function getServiceTreesForUser(dvUserId: string): Promise<ServiceTree[]> {
  const result = await Cat_servicetreesService.getAll({
    select: ['cat_servicetreeid', 'cat_servicetreename', 'cat_organization', 'cat_description', 'cat_membersinfo', 'createdon'],
    orderBy: ['createdon desc'],
  });
  return (result.data ?? [])
    .filter((t) => {
      if (!t.cat_membersinfo) return false;
      try {
        const members = JSON.parse(t.cat_membersinfo) as { dvUserId: string }[];
        return members.some((m) => m.dvUserId === dvUserId);
      } catch {
        return false;
      }
    })
    .map(toServiceTree);
}

/**
 * Retrieves a single Service Tree with all detail fields (for the detail popup).
 */
export async function getServiceTreeDetail(id: string): Promise<ServiceTree> {
  const result = await Cat_servicetreesService.get(id, {
    select: ['cat_servicetreeid', 'cat_servicetreename', 'cat_organization', 'cat_description'],
  });
  if (!result.success || !result.data) throw new Error('Service Tree not found.');
  return toServiceTree(result.data);
}

/**
 * Retrieves a Service Tree together with its current member list, parsed from cat_membersinfo.
 * Used by ManageMembersDialog to load the editable member list.
 */
export async function getServiceTreeWithMembers(
  treeId: string,
): Promise<{ tree: ServiceTree; members: ServiceTreeMemberEntry[] }> {
  const result = await Cat_servicetreesService.get(treeId, {
    select: [
      'cat_servicetreeid',
      'cat_servicetreename',
      'cat_organization',
      'cat_description',
      'cat_membersinfo',
    ],
  });
  if (!result.success || !result.data) throw new Error('Service Tree not found.');
  const tree = toServiceTree(result.data);
  let members: ServiceTreeMemberEntry[] = [];
  if (result.data.cat_membersinfo) {
    try {
      members = JSON.parse(result.data.cat_membersinfo) as ServiceTreeMemberEntry[];
    } catch {
      // Treat as empty — plugin will handle any reconciliation
    }
  }
  return { tree, members };
}

/**
 * Updates the member list on a Service Tree by writing to cat_membersinfo.
 * The synchronous Post-Update plugin replaces cat_powershieldservicetreemembers accordingly.
 * Throws on failure, which is surfaced to the caller.
 */
export async function updateServiceTreeMembers(
  treeId: string,
  members: ServiceTreeMemberEntry[],
): Promise<void> {
  const result = await Cat_servicetreesService.update(treeId, {
    cat_membersinfo: JSON.stringify(members),
  } as Partial<Cat_servicetreesBase>);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to update Service Tree members.');
  }
}

/**
 * Updates a Service Tree's fields and member list in a single Dataverse update.
 * Writes name, organization, description, and cat_membersinfo together.
 * The synchronous Post-Update plugin reconciles cat_powershieldservicetreemembers.
 */
export async function updateServiceTree(
  treeId: string,
  data: { name: string; organization?: string; description?: string },
  members: ServiceTreeMemberEntry[],
): Promise<void> {
  const result = await Cat_servicetreesService.update(treeId, {
    cat_servicetreename: data.name,
    cat_organization: data.organization ?? null,
    cat_description: data.description ?? null,
    cat_membersinfo: JSON.stringify(members),
  } as Partial<Cat_servicetreesBase>);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to update Service Tree.');
  }
}

/**
 * Creates a new Service Tree record and returns the new record's GUID.
 * Members (creator + additionalMembers) are serialized to cat_membersinfo so the
 * synchronous Post-Create plugin can create cat_powershieldservicetreemembers records
 * atomically — avoiding the 0x80040217 timing error that affected direct writes.
 * Throws on tree creation failure. memberErrors is always empty (plugin handles members).
 */
export async function createServiceTree(
  data: { name: string; organization?: string; description?: string },
  creator: ServiceTreeMemberEntry,
  additionalMembers: ServiceTreeMemberEntry[],
): Promise<{ id: string; memberErrors: string[] }> {
  const allMembers = [creator, ...additionalMembers];

  const result = await Cat_servicetreesService.create({
    cat_servicetreename: data.name,
    ...(data.organization ? { cat_organization: data.organization } : {}),
    ...(data.description ? { cat_description: data.description } : {}),
    cat_membersinfo: JSON.stringify(allMembers),
  } as Omit<Cat_servicetreesBase, 'cat_servicetreeid'>);

  const newId = result.data?.cat_servicetreeid;
  if (!result.success || !newId) {
    throw new Error(result.error?.message ?? 'Failed to create Service Tree.');
  }

  return { id: newId, memberErrors: [] };
}

/**
 * Delete a Service Tree record. Callers must verify that no environment
 * containers are associated with the tree before calling this function.
 */
export async function deleteServiceTree(treeId: string): Promise<void> {
  await Cat_servicetreesService.delete(treeId);
}
