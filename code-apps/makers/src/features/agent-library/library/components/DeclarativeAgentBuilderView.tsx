/**
 * DeclarativeAgentBuilderView — "Use Agent Builder" step.
 *
 * Shows after the user selects "Use Agent Builder" from the build option dialog.
 * A new tab has already been opened with the setup guide. This view provides
 * a fallback Download button and context message.
 *
 * Figma node: 1905:30534
 */

import React from 'react';
import {
  Body1,
  Button,
  makeStyles,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  ArrowLeft24Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import type { AgentTemplate } from '../contracts/types';

export interface DeclarativeAgentBuilderViewProps {
  template: AgentTemplate;
  onBack: () => void;
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
    gap: '4px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '4px',
  },
});

export const DeclarativeAgentBuilderView: React.FC<DeclarativeAgentBuilderViewProps> = ({
  template,
  onBack,
  onDismiss,
}) => {
  const styles = useStyles();

  const handleDownload = () => {
    if (template.downloadUrl) {
      window.open(template.downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

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
        <Text className={styles.titleText}>{template.name}</Text>
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

      {/* Body */}
      <div className={styles.body}>
        <Body1>
          No zip upload needed. Agent Builder lets you create this agent directly in Microsoft 365 Copilot, no coding required.
        </Body1>
        <Body1>&nbsp;</Body1>
        <Body1>
          A new tab should have opened with your setup guide. If you don&apos;t see it, you can download a copy here.
        </Body1>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <Button
          appearance="primary"
          icon={<ArrowDownload20Regular />}
          onClick={handleDownload}
        >
          Download
        </Button>
      </div>
    </div>
  );
};
