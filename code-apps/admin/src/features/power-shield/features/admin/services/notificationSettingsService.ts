import { Cat_powershieldsettingsesService } from '../../../../../generated/services/Cat_powershieldsettingsesService';
import type { Cat_powershieldsettingsesBase } from '../../../../../generated/models/Cat_powershieldsettingsesModel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationSettings {
  senderMailbox: string;
  adminDL: string;
  appUrl: string;
  enabled: boolean;
}

export interface SettingsValidation {
  isValid: boolean;
  missingSettings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SETTING_KEYS = {
  senderMailbox: 'Notification.SenderMailbox',
  adminDL: 'Notification.AdminDL',
  appUrl: 'Notification.AppUrl',
  enabled: 'Notification.Enabled',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const result = await Cat_powershieldsettingsesService.getAll({
    filter: "statecode eq 0 and startswith(cat_settingkey, 'Notification.')",
    select: ['cat_powershieldsettingsid', 'cat_settingkey', 'cat_settingvalue'],
    top: 20,
  });

  const records = (result.data ?? []).reduce<Record<string, string>>((map, r) => {
    if (r.cat_settingkey) {
      map[r.cat_settingkey] = r.cat_settingvalue ?? '';
    }
    return map;
  }, {});

  return {
    senderMailbox: records[SETTING_KEYS.senderMailbox] ?? '',
    adminDL: records[SETTING_KEYS.adminDL] ?? '',
    appUrl: records[SETTING_KEYS.appUrl] ?? '',
    enabled: records[SETTING_KEYS.enabled] !== 'false',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE — Upsert all notification settings
// ─────────────────────────────────────────────────────────────────────────────

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const existingResult = await Cat_powershieldsettingsesService.getAll({
    filter: "statecode eq 0 and startswith(cat_settingkey, 'Notification.')",
    select: ['cat_powershieldsettingsid', 'cat_settingkey'],
    top: 20,
  });

  const existingMap = (existingResult.data ?? []).reduce<Record<string, string>>((map, r) => {
    if (r.cat_settingkey) {
      map[r.cat_settingkey] = r.cat_powershieldsettingsid;
    }
    return map;
  }, {});

  const settingsToWrite = [
    {
      key: SETTING_KEYS.senderMailbox,
      value: settings.senderMailbox.trim(),
      description: 'Email address of the sender mailbox for notification emails (queue or user with SSS).',
    },
    {
      key: SETTING_KEYS.adminDL,
      value: settings.adminDL.trim(),
      description: 'Distribution list or shared mailbox for admin notifications.',
    },
    {
      key: SETTING_KEYS.appUrl,
      value: settings.appUrl.trim(),
      description: 'Base URL of the Request Center code app for deep links in emails.',
    },
    {
      key: SETTING_KEYS.enabled,
      value: settings.enabled ? 'true' : 'false',
      description: 'Main switch - set to false to disable all notification emails.',
    },
  ];

  for (const setting of settingsToWrite) {
    const existingId = existingMap[setting.key];

    if (existingId) {
      const updateResult = await Cat_powershieldsettingsesService.update(existingId, {
        cat_settingvalue: setting.value,
        cat_description: setting.description,
      } as Partial<Cat_powershieldsettingsesBase>);
      if (!updateResult.success) {
        throw new Error(updateResult.error?.message ?? `Failed to update setting '${setting.key}'.`);
      }
    } else {
      const createResult = await Cat_powershieldsettingsesService.create({
        cat_settingkey: setting.key,
        cat_settingvalue: setting.value,
        cat_description: setting.description,
      } as Omit<Cat_powershieldsettingsesBase, 'cat_powershieldsettingsid'>);
      if (!createResult.success) {
        throw new Error(createResult.error?.message ?? `Failed to create setting '${setting.key}'.`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export async function validateNotificationSettings(): Promise<SettingsValidation> {
  const settings = await getNotificationSettings();
  const missing: string[] = [];

  if (!settings.senderMailbox) missing.push('Sender Email Address');

  return {
    isValid: missing.length === 0,
    missingSettings: missing,
  };
}
