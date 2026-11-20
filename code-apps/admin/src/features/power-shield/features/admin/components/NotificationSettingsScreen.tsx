import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Field,
  Input,
  Checkbox,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useLayoutStyles } from '../../../shared/styles';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  getNotificationSettings,
  saveNotificationSettings,
} from '../services/notificationSettingsService';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '6px',
    padding: '24px',
    maxWidth: '600px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationSettingsScreenProps {
  /**
   * When true, render only the inner content (no breadcrumb, page header, or
   * outer pageContainer wrapper). Use this when embedding inside a parent
   * screen that already provides the page chrome (e.g., a tabbed container).
   * In embedded mode, Save success stays on the screen instead of navigating
   * back, and Cancel returns to the Settings hub.
   */
  embedded?: boolean;
}

export function NotificationSettingsScreen({ embedded = false }: NotificationSettingsScreenProps = {}) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const navigate = useNavigate();
  const { notifySuccess, notifyError } = useNotify();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const [senderMailbox, setSenderMailbox] = useState('');
  const [adminDL, setAdminDL] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getNotificationSettings();
        setSenderMailbox(settings.senderMailbox);
        setAdminDL(settings.adminDL);
        setAppUrl(settings.appUrl);
        setEnabled(settings.enabled);
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Failed to load notification settings.');
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validation
  const senderInvalid = !senderMailbox.trim() || !senderMailbox.includes('@');
  const adminDLInvalid = adminDL.trim() !== '' && !adminDL.includes('@');
  const appUrlInvalid = appUrl.trim() !== '' && !appUrl.trim().startsWith('https://');

  const showSenderError = hasAttemptedSave && senderInvalid;
  const showAdminDLError = hasAttemptedSave && adminDLInvalid;
  const showAppUrlError = hasAttemptedSave && appUrlInvalid;

  async function handleSave() {
    setHasAttemptedSave(true);
    if (senderInvalid || adminDLInvalid || appUrlInvalid) return;

    setIsSaving(true);
    try {
      await saveNotificationSettings({
        senderMailbox: senderMailbox.trim(),
        adminDL: adminDL.trim(),
        appUrl: appUrl.trim(),
        enabled,
      });
      notifySuccess('Notification settings saved successfully.');
      if (!embedded) navigate(-1);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to save notification settings.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    const loading = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL }}>
        <Spinner label="Loading notification settings..." />
      </div>
    );
    if (embedded) return loading;
    return <div className={layoutStyles.pageContainer}>{loading}</div>;
  }

  const body = (
    <>
      {!embedded && (
        <>
          <PowerShieldBreadcrumb segments={[{ label: 'Settings', route: '/settings' }, { label: 'Notification Settings' }]} />

          <div className={styles.header}>
            <Text as="h1" size={700} weight="semibold">
              Notification Settings
            </Text>
            <Text style={{ color: tokens.colorNeutralForeground3 }}>
              Configure email notification delivery for Request Center policy requests
            </Text>
          </div>
        </>
      )}

      <MessageBar intent="info">
        <MessageBarBody>
          Server-side synchronization must be enabled for the sender mailbox in Exchange Online.
        </MessageBarBody>
      </MessageBar>

      <div className={styles.card}>
        <div className={styles.form}>
          <Field
            label="Sender Email Address"
            required
            validationState={showSenderError ? 'error' : 'none'}
            validationMessage={showSenderError ? 'A valid email address is required.' : undefined}
          >
            <Input
              value={senderMailbox}
              onChange={(_, data) => setSenderMailbox(data.value)}
              placeholder="powershield@contoso.com"
              type="email"
            />
            <span className={styles.hint}>
              Email address of a queue or user with server-side sync enabled
            </span>
          </Field>

          <Field
            label="Admin Distribution List"
            validationState={showAdminDLError ? 'error' : 'none'}
            validationMessage={showAdminDLError ? 'Please enter a valid email address.' : undefined}
          >
            <Input
              value={adminDL}
              onChange={(_, data) => setAdminDL(data.value)}
              placeholder="powershield-admins@contoso.com"
              type="email"
            />
            <span className={styles.hint}>
              Distribution list or shared mailbox for admin notifications
            </span>
          </Field>

          <Field
            label="Request Center App URL"
            validationState={showAppUrlError ? 'error' : 'none'}
            validationMessage={showAppUrlError ? 'Please enter a valid HTTPS URL.' : undefined}
          >
            <Input
              value={appUrl}
              onChange={(_, data) => setAppUrl(data.value)}
              placeholder="https://apps.powerapps.com/play/e/..."
              type="url"
            />
            <span className={styles.hint}>
              Copy the complete URL from your browser's address bar and paste it here (used for deep links in notification emails)
            </span>
          </Field>

          <Field label="Notifications Enabled">
            <Checkbox
              checked={enabled}
              onChange={(_, data) => setEnabled(!!data.checked)}
              label="Enable email notifications"
            />
          </Field>

          <div className={styles.actions}>
            <Button
              appearance="primary"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              appearance="secondary"
              onClick={() => navigate(embedded ? '/settings' : -1)}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) return body;
  return <div className={layoutStyles.pageContainer}>{body}</div>;
}
