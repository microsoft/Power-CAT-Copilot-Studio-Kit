/**
 * DeclarativeDownloadComplete — Step 3 of the declarative agent flow.
 *
 * Displays Teams installation instructions after the modified ZIP has been downloaded.
 *
 * NOTE: This component renders content INSIDE a parent Dialog — it does NOT
 * own the Dialog/DialogSurface wrapper.
 */

import React from 'react';
import {
  Body2,
  Button,
  makeStyles,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeft24Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import type { AgentTemplate } from '../contracts/types';

export interface DeclarativeDownloadCompleteProps {
  template: AgentTemplate;
  agentName: string;
  onBack: () => void;
  onDone: () => void;
  onDismiss: () => void;
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
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingHorizontalXS,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingHorizontalM,
  },
});

export const DeclarativeDownloadComplete: React.FC<DeclarativeDownloadCompleteProps> = ({
  template,
  agentName,
  onBack,
  onDone,
  onDismiss,
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerRow}>
        <Button
          appearance="subtle"
          size="large"
          icon={<ArrowLeft24Regular />}
          onClick={onBack}
          aria-label="Back"
        />
        <SquircleIcon
          iconGradient={template.iconGradient}
          iconSvg={template.iconSvg}
          iconName={template.icon}
          iconColor={template.iconColor}
          size={48}
        />
        <Text className={styles.titleText}>{agentName}</Text>
        <AgentTypeBadge />
        <Button
          appearance="subtle"
          shape="circular"
          size="small"
          icon={<Dismiss20Regular />}
          onClick={onDismiss}
          aria-label="Close dialog"
        />
      </div>

      {/* Body — Teams installation instructions */}
      <div className={styles.body}>
        <Body2>
          Your modified zip has been downloaded! Install it in teams
        </Body2>
        <Body2>&nbsp;</Body2>
        <Body2>1. Open Microsoft Teams (desktop app or teams.microsoft.com).</Body2>
        <Body2>2. Click Apps in the left sidebar.</Body2>
        <Body2>3. Click Manage your apps (bottom of the page).</Body2>
        <Body2>4. Click Upload an app → Upload a custom app.</Body2>
        <Body2>5. Select the {agentName}.zip file from your computer.</Body2>
        <Body2>6. Click Add when the app details appear.</Body2>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <Button appearance="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
};
