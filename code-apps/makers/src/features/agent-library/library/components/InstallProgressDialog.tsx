/**
 * InstallProgressDialog — Shows install progress and completion for both
 * agent templates and component installs.
 *
 * States:
 *   - installing (template): "Setting up your agent..." + progress bar
 *   - installed (template): "Your agent is ready!" + "Launch Copilot Studio"
 *   - installing (component): "Importing components..." + progress bar
 *   - installed (component): "Components installed!" + "Open component"
 *   - error: Shows error message with dismiss
 */

import React from 'react';
import {
  Dialog,
  DialogSurface,
  Body1,
  Button,
  ProgressBar,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss20Regular, Open20Regular } from '@fluentui/react-icons';

export interface InstallProgressDialogProps {
  open: boolean;
  type: 'template' | 'component';
  status: 'installing' | 'installed' | 'error';
  progress?: number; // 0-100
  errorMessage?: string;
  onClose: () => void;
  onLaunch?: () => void;
}

const useStyles = makeStyles({
  surface: {
    maxWidth: '720px',
    width: '720px',
    borderRadius: tokens.borderRadiusXLarge,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
  },
  installingContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  doneContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  title: {
    flex: '1 1 0',
    fontSize: '20px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '28px',
    color: tokens.colorNeutralForeground1,
    margin: 0,
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: '4px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    borderRadius: tokens.borderRadiusSmall,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  body: {
    color: tokens.colorNeutralForeground1,
    lineHeight: '20px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: '4px',
  },
  footerLeft: {
    width: '116px',
  },
  footerRight: {
    display: 'flex',
    gap: '8px',
  },
  percentText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
});

const InstallProgressDialog: React.FC<InstallProgressDialogProps> = ({
  open,
  type,
  status,
  progress = 0,
  errorMessage,
  onClose,
  onLaunch,
}) => {
  const styles = useStyles();

  if (!open) return null;

  const isInstalling = status === 'installing';
  const isTemplate = type === 'template';

  const title = isInstalling
    ? (isTemplate ? 'Setting up your agent. This might take a few minutes...' : 'Importing components...')
    : status === 'error'
      ? 'Installation failed'
      : (isTemplate ? 'Your agent is ready!' : 'Components installed!');

  const bodyText = isInstalling
    ? (isTemplate
        ? "We're creating your agent from the template. You'll be redirected to Copilot Studio to customize and publish it."
        : "We're adding the component collection to this environment. You'll be taken to the component library where you can add these components to an existing agent.")
    : status === 'error'
      ? (errorMessage || 'An error occurred during installation.')
      : (isTemplate
          ? "We've created your agent from the template. Open it in Copilot Studio to customize and publish."
          : 'The collection has been added to your environment. Open it to add these components to an agent.');

  const launchLabel = isTemplate ? 'Launch Copilot Studio' : 'Open component';

  return (
    <Dialog open>
      <DialogSurface className={styles.surface}>
        <div className={isInstalling ? styles.installingContent : styles.doneContent}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            {!isInstalling && (
              <button
                className={styles.dismissBtn}
                onClick={onClose}
                aria-label="Close"
                type="button"
              >
                <Dismiss20Regular />
              </button>
            )}
          </div>

          {/* Progress bar + percentage — only during install */}
          {isInstalling && (
            <>
              <ProgressBar
                value={progress / 100}
                max={1}
                thickness="medium"
              />
              <Body1 className={styles.percentText}>
                {Math.round(progress)}% complete
              </Body1>
            </>
          )}

          {/* Body text */}
          <Body1 className={status === 'error' ? styles.errorText : styles.body}>
            {bodyText}
          </Body1>

          {/* Footer — only when done */}
          {!isInstalling && status !== 'error' && (
            <div className={styles.footer}>
              <div className={styles.footerLeft} />
              <div className={styles.footerRight}>
                <Button
                  appearance="primary"
                  icon={<Open20Regular />}
                  onClick={onLaunch}
                >
                  {launchLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Error footer — close button */}
          {status === 'error' && (
            <div className={styles.footer}>
              <div className={styles.footerLeft} />
              <div className={styles.footerRight}>
                <Button appearance="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogSurface>
    </Dialog>
  );
};

export default InstallProgressDialog;
