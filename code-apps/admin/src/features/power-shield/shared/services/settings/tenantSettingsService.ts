import { Cat_powershieldsettingsesService } from '../../../../../generated/services/Cat_powershieldsettingsesService';
import type { Cat_powershieldsettingsesBase } from '../../../../../generated/models/Cat_powershieldsettingsesModel';

const TENANT_ID_KEY = 'System.TenantId';

/**
 * Ensures the tenant ID is stored in the PowerShield settings table.
 * Creates the setting if missing, updates if the value has changed.
 * Follows the key-value pattern used by notificationSettingsService.
 */
export async function ensureTenantId(tenantId: string): Promise<void> {
  if (!tenantId) return;

  const result = await Cat_powershieldsettingsesService.getAll({
    filter: `statecode eq 0 and cat_settingkey eq '${TENANT_ID_KEY}'`,
    select: ['cat_powershieldsettingsid', 'cat_settingvalue'],
    top: 1,
  });

  const existing = result.data?.[0];

  if (!existing) {
    const createResult = await Cat_powershieldsettingsesService.create({
      cat_settingkey: TENANT_ID_KEY,
      cat_settingvalue: tenantId,
      cat_description: 'Azure AD Tenant ID - auto-populated by Code App on admin login.',
    } as Omit<Cat_powershieldsettingsesBase, 'cat_powershieldsettingsid'>);
    if (!createResult.success) {
      throw new Error(createResult.error?.message ?? 'Failed to create System.TenantId setting.');
    }
    console.log('[PowerShield:Settings] ensureTenantId: created System.TenantId setting');
  } else if (existing.cat_settingvalue !== tenantId) {
    const updateResult = await Cat_powershieldsettingsesService.update(
      existing.cat_powershieldsettingsid,
      { cat_settingvalue: tenantId } as Partial<Cat_powershieldsettingsesBase>,
    );
    if (!updateResult.success) {
      throw new Error(updateResult.error?.message ?? 'Failed to update System.TenantId setting.');
    }
    console.log('[PowerShield:Settings] ensureTenantId: updated System.TenantId setting');
  }
  // Already exists with correct value — no-op
}
