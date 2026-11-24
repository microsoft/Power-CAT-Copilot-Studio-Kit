import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CopyRegular,
  CheckmarkRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import { useNotify } from '../../../shared/hooks/useNotify';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectionHelperSetting {
  label: string;
  value: string;
}

export interface ConnectionHelperDialogProps {
  open: boolean;
  /** Display name of the connection reference being configured (e.g., "PowerShield APIFlow"). */
  displayName: string;
  /** Setting/value pairs to surface as copyable rows. */
  settings: ReadonlyArray<ConnectionHelperSetting>;
  /** URL of the Power Apps "new connection" screen — launched by the primary action. */
  makerPortalUrl: string;
  /** Closes the dialog. */
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  surface: {
    maxWidth: '90vw',
    width: '640px',
  },
  intro: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalL,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: 'hidden',
  },
  valueText: {
    flex: 1,
    minWidth: 0,
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM}`,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    userSelect: 'all',
    cursor: 'text',
  },
  copyButton: {
    borderRadius: 0,
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomRightRadius: tokens.borderRadiusMedium,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    minWidth: '40px',
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const COPY_FEEDBACK_MS = 1500;

/**
 * Compact helper dialog that surfaces the URL values needed to configure a
 * Power Shield HTTP-with-Entra-ID connection reference. Inspired by Azure
 * Portal "Access keys" / "Connection strings" and GitHub "Clone URL" — the
 * values are presented as copyable artifacts, not as form fields, with a
 * single primary action that launches the Power Apps connection screen in a
 * new tab. The dialog stays open after launch so the user can alt-tab back
 * and copy the second value as needed.
 */
export function ConnectionHelperDialog({
  open,
  displayName,
  settings,
  makerPortalUrl,
  onClose,
}: ConnectionHelperDialogProps) {
  const styles = useStyles();
  const { notifySuccess, notifyError } = useNotify();
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [recentlyCopied, setRecentlyCopied] = useState<Record<number, boolean>>({});
  const [liveAnnouncements, setLiveAnnouncements] = useState<Record<number, string>>({});

  // Focus the dialog title on open so screen reader / keyboard users hear the
  // dialog purpose before any actionable control.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => titleRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transient feedback reset tied to the open prop transition.
    setRecentlyCopied({});
    setLiveAnnouncements({});
    return undefined;
  }, [open]);

  const handleCopy = async (index: number, setting: ConnectionHelperSetting) => {
    try {
      await navigator.clipboard.writeText(setting.value);
      setRecentlyCopied((prev) => ({ ...prev, [index]: true }));
      setLiveAnnouncements((prev) => ({ ...prev, [index]: `${setting.label} copied` }));
      notifySuccess(`${setting.label} copied`);
      window.setTimeout(() => {
        setRecentlyCopied((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      }, COPY_FEEDBACK_MS);
    } catch {
      notifyError('Copy failed. Select the value and copy it manually.');
    }
  };

  const handleOpenConnectionScreen = () => {
    window.open(makerPortalUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <span ref={titleRef} tabIndex={-1}>
              Set up {displayName} connection
            </span>
          </DialogTitle>
          <DialogContent>
            <Text as="p" size={300} className={styles.intro}>
              Copy these values into the Power Apps connection screen.
            </Text>

            <div className={styles.list}>
              {settings.map((setting, index) => {
                const copied = !!recentlyCopied[index];
                const liveId = `helper-live-${index}`;
                return (
                  <div key={setting.label} className={styles.fieldGroup}>
                    <Text size={200} className={styles.label}>
                      {setting.label}
                    </Text>
                    <div className={styles.valueRow}>
                      <span
                        className={styles.valueText}
                        title={setting.value}
                        aria-describedby={liveId}
                      >
                        {setting.value}
                      </span>
                      <Tooltip
                        content={copied ? 'Copied' : `Copy ${setting.label}`}
                        relationship="label"
                        withArrow
                      >
                        <Button
                          appearance="subtle"
                          className={styles.copyButton}
                          icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
                          aria-label={`Copy ${setting.label}`}
                          onClick={() => void handleCopy(index, setting)}
                        />
                      </Tooltip>
                      <span
                        id={liveId}
                        role="status"
                        aria-live="polite"
                        className={styles.visuallyHidden}
                      >
                        {liveAnnouncements[index] ?? ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
            <Tooltip content="Opens in a new tab" relationship="label" withArrow>
              <Button
                appearance="primary"
                icon={<OpenRegular />}
                onClick={handleOpenConnectionScreen}
                style={{ whiteSpace: 'nowrap' }}
              >
                Open Power Apps connection screen
              </Button>
            </Tooltip>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default ConnectionHelperDialog;
