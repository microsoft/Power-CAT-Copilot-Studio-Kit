import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Systemusers } from '../../../../generated/models/SystemusersModel';
import { resolveDataverseUserIdByUpn } from '../../shared/services/dataverse/authService';

const { getAllUsers } = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
}));

vi.mock('../../../../generated/services/SystemusersService', () => ({
  SystemusersService: {
    getAll: getAllUsers,
    get: vi.fn(),
  },
}));

vi.mock('../../../../generated/services/SystemuserrolescollectionService', () => ({
  SystemuserrolescollectionService: {
    getAll: vi.fn(),
  },
}));

vi.mock('../../../../generated/services/RolesService', () => ({
  RolesService: {
    get: vi.fn(),
  },
}));

function mockUsers(data: Partial<Systemusers>[], success = true, message?: string) {
  getAllUsers.mockResolvedValue({
    success,
    data: data as Systemusers[],
    error: message ? { message } : undefined,
  });
  return getAllUsers;
}

describe('resolveDataverseUserIdByUpn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries domainname and resolves the active Entra user', async () => {
    const spy = mockUsers([
      {
        systemuserid: 'user-1',
        domainname: 'maker@contoso.com',
        internalemailaddress: 'maker.alias@contoso.com',
        isdisabled: 0,
        systemmanagedusertype: 0,
      },
    ]);

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com')).resolves.toBe('user-1');
    expect(spy).toHaveBeenCalledWith({
      filter: "domainname eq 'maker@contoso.com'",
      select: ['systemuserid', 'domainname', 'isdisabled', 'systemmanagedusertype'],
      top: 5,
    });
  });

  it('escapes apostrophes in the UPN', async () => {
    const spy = mockUsers([
      {
        systemuserid: 'user-1',
        domainname: "o'brien@contoso.com",
        isdisabled: 0,
        systemmanagedusertype: 0,
      },
    ]);

    await resolveDataverseUserIdByUpn("o'brien@contoso.com");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "domainname eq 'o''brien@contoso.com'" }),
    );
  });

  it('ignores disabled and non-Entra users', async () => {
    mockUsers([
      { systemuserid: 'disabled', isdisabled: 1, systemmanagedusertype: 0 },
      { systemuserid: 'stub', isdisabled: 0, systemmanagedusertype: 2 },
      { systemuserid: 'active', isdisabled: 0, systemmanagedusertype: 0 },
    ]);

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com')).resolves.toBe('active');
  });

  it('reports an unsuccessful Dataverse query separately', async () => {
    mockUsers([], false, 'Dataverse request failed.');

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com'))
      .rejects.toThrow('Dataverse request failed.');
  });

  it('rejects when no active user matches', async () => {
    mockUsers([{ systemuserid: 'disabled', isdisabled: 1, systemmanagedusertype: 0 }]);

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com'))
      .rejects.toThrow('No active Dataverse user found for UPN "maker@contoso.com".');
  });

  it('rejects ambiguous active-user matches', async () => {
    mockUsers([
      { systemuserid: 'user-1', isdisabled: 0, systemmanagedusertype: 0 },
      { systemuserid: 'user-2', isdisabled: 0, systemmanagedusertype: 0 },
    ]);

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com'))
      .rejects.toThrow('Multiple active Dataverse users found for UPN "maker@contoso.com".');
  });

  it('propagates service exceptions', async () => {
    getAllUsers.mockRejectedValue(new Error('Network unavailable.'));

    await expect(resolveDataverseUserIdByUpn('maker@contoso.com'))
      .rejects.toThrow('Network unavailable.');
  });
});
