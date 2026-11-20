/**
 * DeclarativeVsCodeView — "Build with VS Code" step.
 *
 * Shows after the user selects "Build with VS Code" from the build option dialog.
 * A new tab has already been opened with the GitHub repo. This view provides
 * the clone URL, a copy button, and a Download button for the repo ZIP.
 *
 * Figma node: 1905:30092
 */

import React, { useCallback, useState } from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  makeStyles,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  ArrowLeft24Regular,
  Copy20Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import type { AgentTemplate } from '../contracts/types';

const GITHUB_CLONE_URL = 'https://github.com/microsoft/m365-agent-templates.git';

export interface DeclarativeVsCodeViewProps {
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
    gap: '16px',
  },
  cloneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '4px',
  },
});

export const DeclarativeVsCodeView: React.FC<DeclarativeVsCodeViewProps> = ({
  template,
  onBack,
  onDismiss,
}) => {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(GITHUB_CLONE_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

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
          Clone the repo, customize, and deploy — using VS Code with the M365 Agents Toolkit extension.
        </Body1>

        <div className={styles.cloneRow}>
          <Body1Strong>Github Clone URL: {GITHUB_CLONE_URL}</Body1Strong>
          <Button
            appearance="subtle"
            size="small"
            icon={<Copy20Regular />}
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy clone URL'}
          />
        </div>

        <Body1>
          Your setup guide should have opened in a new tab. If not, download it below.
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
