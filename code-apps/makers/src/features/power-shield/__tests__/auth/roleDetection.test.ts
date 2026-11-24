import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkIsAdmin, checkIsMaker } from '../../shared/services/dataverse/authService';
import { SystemuserrolescollectionService } from '../../../../generated/services/SystemuserrolescollectionService';
import { RolesService } from '../../../../generated/services/RolesService';

const dvUserId = 'aaaaaaaa-0000-0000-0000-000000000001';

function mockRoleAssignments(
  data: { systemuserroleid: string; roleid: string; systemuserid: string }[],
  success = true,
) {
  return vi.spyOn(SystemuserrolescollectionService, 'getAll').mockResolvedValue({
    success,
    data,
  } as Awaited<ReturnType<typeof SystemuserrolescollectionService.getAll>>);
}

function mockRoleNames(data: { roleid: string; name: string }[], success = true) {
  return vi.spyOn(RolesService, 'getAll').mockResolvedValue({
    success,
    data,
  } as Awaited<ReturnType<typeof RolesService.getAll>>);
}

describe('checkIsAdmin — role detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when the user has "PowerShield Admin" role', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-1', roleid: 'role-guid-1', systemuserid: dvUserId }]);
    mockRoleNames([{ roleid: 'role-guid-1', name: 'PowerShield Admin' }]);
    expect(await checkIsAdmin(dvUserId)).toBe(true);
  });

  it('returns false when the user has "System Administrator" role (no longer treated as admin)', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-2', roleid: 'role-guid-2', systemuserid: dvUserId }]);
    mockRoleNames([{ roleid: 'role-guid-2', name: 'System Administrator' }]);
    expect(await checkIsAdmin(dvUserId)).toBe(false);
  });

  it('returns false when user has roles but neither is an admin role', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-3', roleid: 'role-guid-3', systemuserid: dvUserId }]);
    mockRoleNames([{ roleid: 'role-guid-3', name: 'Basic User' }]);
    expect(await checkIsAdmin(dvUserId)).toBe(false);
  });

  it('returns false when no role assignments are found', async () => {
    mockRoleAssignments([]);
    expect(await checkIsAdmin(dvUserId)).toBe(false);
  });

  it('returns false when the role assignments SDK call fails', async () => {
    mockRoleAssignments([], false);
    expect(await checkIsAdmin(dvUserId)).toBe(false);
  });

  it('returns false when the roles name lookup SDK call fails', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-1', roleid: 'role-guid-1', systemuserid: dvUserId }]);
    mockRoleNames([], false);
    expect(await checkIsAdmin(dvUserId)).toBe(false);
  });

  it('queries systemuserrolescollection filtered by dvUserId only', async () => {
    const spy = mockRoleAssignments([]);
    await checkIsAdmin(dvUserId);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: `systemuserid eq ${dvUserId}`,
        select: ['roleid'],
      }),
    );
  });

  it('queries roles table with collected role IDs', async () => {
    mockRoleAssignments([
      { systemuserroleid: 'surl-1', roleid: 'role-guid-1', systemuserid: dvUserId },
      { systemuserroleid: 'surl-2', roleid: 'role-guid-2', systemuserid: dvUserId },
    ]);
    const rolesSpy = mockRoleNames([{ roleid: 'role-guid-1', name: 'Basic User' }]);
    await checkIsAdmin(dvUserId);
    expect(rolesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "roleid eq 'role-guid-1' or roleid eq 'role-guid-2'",
        select: ['name'],
      }),
    );
  });
});

describe('checkIsMaker — role detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when the user has "CSK - Maker" role', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-1', roleid: 'role-guid-1', systemuserid: dvUserId }]);
    mockRoleNames([{ roleid: 'role-guid-1', name: 'CSK - Maker' }]);
    expect(await checkIsMaker(dvUserId)).toBe(true);
  });

  it('returns false when user has "Basic User" role (not a maker role)', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-2', roleid: 'role-guid-2', systemuserid: dvUserId }]);
    mockRoleNames([{ roleid: 'role-guid-2', name: 'Basic User' }]);
    expect(await checkIsMaker(dvUserId)).toBe(false);
  });

  it('returns false when no role assignments are found', async () => {
    mockRoleAssignments([]);
    expect(await checkIsMaker(dvUserId)).toBe(false);
  });

  it('returns false when the role assignments SDK call fails', async () => {
    mockRoleAssignments([], false);
    expect(await checkIsMaker(dvUserId)).toBe(false);
  });

  it('returns false when the roles name lookup SDK call fails', async () => {
    mockRoleAssignments([{ systemuserroleid: 'surl-1', roleid: 'role-guid-1', systemuserid: dvUserId }]);
    mockRoleNames([], false);
    expect(await checkIsMaker(dvUserId)).toBe(false);
  });
});
