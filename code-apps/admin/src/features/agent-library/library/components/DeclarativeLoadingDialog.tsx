/**
 * DeclarativeLoadingDialog — Deep-link loading step for declarative agents.
 *
 * Shown only when the user deep-links to a declarative agent via `templateId`.
 * Displays while the solution ZIP downloads and the manifest parses; on success
 * the parent transitions directly to the Edit Form (bypassing Build Options).
 * On error, a Retry button re-runs the fetch.
 *
 * No dismiss (×) button — deep-link entries do not offer an in-dialog close.
 */

import React from 'react';
import {
  Body1,
  Button,
  Spinner,
  Text,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import type { AgentTemplate } from '../contracts/types';

export interface DeclarativeLoadingDialogProps {
  template: AgentTemplate;
  zipError: string | null;
  onRetry: () => void;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
    height: '54px',
    flexShrink: 0,
  },
  titleText: {
    fontSize: '24px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '32px',
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1 1 0',
    minWidth: 0,
  },
  statusBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    paddingTop: '40px',
    paddingBottom: '40px',
    paddingLeft: '24px',
    paddingRight: '24px',
    minHeight: '180px',
  },
  statusLabel: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
  statusSubtext: {
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    textAlign: 'center',
    fontWeight: tokens.fontWeightSemibold,
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});

export const DeclarativeLoadingDialog: React.FC<DeclarativeLoadingDialogProps> = ({
  template,
  zipError,
  onRetry,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.headerRow}>
        <SquircleIcon
          iconGradient={template.iconGradient}
          iconSvg={template.iconSvg}
          iconName={template.icon}
          iconColor={template.iconColor}
          size={48}
        />
        <Text className={styles.titleText}>{template.name}</Text>
        <AgentTypeBadge />
      </div>

      {zipError ? (
        <>
          <div className={styles.statusBlock}>
            <Text as="p" className={styles.errorText}>
              Couldn't load {template.name}.
            </Text>
            <Body1 className={styles.statusSubtext}>{zipError}</Body1>
          </div>
          <div className={styles.footerRow}>
            <Button appearance="primary" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.statusBlock}>
          <Spinner size="large" aria-label={`Loading ${template.name}`} />
          <Subtitle2 className={styles.statusLabel}>Loading {template.name}...</Subtitle2>
          <Body1 className={styles.statusSubtext}>This might take a few seconds.</Body1>
        </div>
      )}
    </div>
  );
};
