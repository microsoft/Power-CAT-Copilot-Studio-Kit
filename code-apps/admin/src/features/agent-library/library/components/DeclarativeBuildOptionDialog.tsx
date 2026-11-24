/**
 * DeclarativeBuildOptionDialog — Step 1 of the declarative agent flow.
 *
 * Presents build options: Customize & download, Use Agent Builder, Build with VS Code.
 * All options are selectable; the first is selected by default.
 * Navigation is driven by the Continue button, not by clicking tiles directly.
 *
 * NOTE: This component renders content INSIDE a parent Dialog — it does NOT
 * own the Dialog/DialogSurface wrapper.
 */

import React, { useState } from 'react';
import {
  Body1,
  Button,
  Link,
  makeStyles,
  mergeClasses,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  Connected16Regular,
  Dismiss20Regular,
  TextDescription16Regular,
} from '@fluentui/react-icons';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import { HelpMenu } from './HelpMenu';
import type { AgentTemplate } from '../contracts/types';

type BuildOption = 'customize' | 'agent-builder' | 'vs-code';

export interface DeclarativeBuildOptionDialogProps {
  template: AgentTemplate;
  isZipLoading: boolean;
  zipError: string | null;
  onEditTemplate: () => void;
  onAgentBuilder: () => void;
  onVsCode: () => void;
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
  badge: {
    flexShrink: 0,
  },
  dismissButton: {
    flexShrink: 0,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    height: '21px',
    position: 'relative',
  },
  sectionIcon: {
    position: 'absolute',
    left: '3px',
    top: '2px',
    width: '16px',
    height: '16px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    backgroundImage: 'linear-gradient(135deg, #6264A7 0%, #464EB8 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#6264A7',
  },
  sectionLabel: {
    position: 'absolute',
    left: '24px',
    top: '0',
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '21px',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  descriptionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  descriptionContent: {
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  buildSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flexShrink: 0,
  },
  buildButtonsRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    height: '118px',
    alignItems: 'center',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  buildTile: {
    flex: '1 0 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    paddingLeft: '47.17px',
    paddingRight: '33px',
    paddingTop: '12px',
    paddingBottom: '12px',
    borderRadius: '4px',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    height: '100%',
    minWidth: 0,
    fontFamily: tokens.fontFamilyBase,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  buildTileSelected: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Selected,
    },
  },
  buildTileDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  buildTileContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  buildTileTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase300,
    width: '100%',
  },
  buildTileTitleSelected: {
    color: tokens.colorNeutralForeground1Selected,
  },
  buildTileDescription: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
    width: '100%',
  },
  buildTileDescriptionSelected: {
    color: tokens.colorNeutralForeground2Selected,
  },
  errorText: {
    paddingLeft: '24px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

const BUILD_OPTIONS: { id: BuildOption; title: string; description: string }[] = [
  {
    id: 'customize',
    title: 'Customize & download',
    description: 'Configure template and download solution zip file',
  },
  {
    id: 'agent-builder',
    title: 'Use Agent Builder',
    description: 'Download and follow setup steps for M365 Agent Builder',
  },
  {
    id: 'vs-code',
    title: 'Build with VS Code',
    description: 'Clone the repo and follow the developer setup guide',
  },
];

export const DeclarativeBuildOptionDialog: React.FC<DeclarativeBuildOptionDialogProps> = ({
  template,
  isZipLoading,
  zipError,
  onEditTemplate,
  onAgentBuilder,
  onVsCode,
  onDismiss,
}) => {
  const styles = useStyles();
  const [selectedBuild, setSelectedBuild] = useState<BuildOption>('customize');

  // Agent Builder and VS Code options need a setup guide to follow — disable
  // them when the template has no setup guide URL.
  const setupGuideMissing = !template.setupGuideUrl?.trim();

  const handleContinue = () => {
    if (selectedBuild === 'customize') {
      onEditTemplate();
    } else if (selectedBuild === 'agent-builder') {
      onAgentBuilder();
    } else {
      onVsCode();
    }
  };

  const isContinueDisabled = selectedBuild === 'customize' && isZipLoading;

  return (
    <div className={styles.container}>
      {/* Header — Figma: flex row, gap 16px, height 54px */}
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
        <Button
          className={styles.dismissButton}
          appearance="subtle"
          shape="circular"
          size="small"
          icon={<Dismiss20Regular />}
          onClick={onDismiss}
          aria-label="Close dialog"
        />
      </div>

      {/* Description section — Figma: gap 10px */}
      <div className={styles.descriptionSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon} aria-hidden="true">
            <TextDescription16Regular />
          </div>
          <span className={styles.sectionLabel}>Description</span>
        </div>
        <div className={styles.descriptionContent}>
          <Body1>
            {template.description}
            {template.learnMoreUrl && (
              <>
                {' '}
                <Link href={template.learnMoreUrl} target="_blank" rel="noopener noreferrer" inline>
                  Learn more
                </Link>
              </>
            )}
          </Body1>
        </div>
      </div>

      {/* Build section — Figma: gap 16px */}
      <div className={styles.buildSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon} aria-hidden="true">
            <Connected16Regular />
          </div>
          <span className={styles.sectionLabel}>Build (select one)</span>
        </div>
        <div className={styles.buildButtonsRow}>
          {BUILD_OPTIONS.map((option) => {
            const isSelected = selectedBuild === option.id;
            const isDisabled =
              (option.id === 'agent-builder' || option.id === 'vs-code') && setupGuideMissing;
            return (
              <button
                key={option.id}
                className={mergeClasses(
                  styles.buildTile,
                  isSelected && styles.buildTileSelected,
                  isDisabled && styles.buildTileDisabled,
                )}
                onClick={() => setSelectedBuild(option.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                title={isDisabled ? 'A setup guide URL is required for this option.' : undefined}
              >
                <div className={styles.buildTileContent}>
                  <span className={mergeClasses(
                    styles.buildTileTitle,
                    isSelected && styles.buildTileTitleSelected,
                  )}>{option.title}</span>
                  <span className={mergeClasses(
                    styles.buildTileDescription,
                    isSelected && styles.buildTileDescriptionSelected,
                  )}>{option.description}</span>
                </div>
              </button>
            );
          })}
        </div>
        {zipError && selectedBuild === 'customize' && (
          <Text className={styles.errorText}>{zipError}</Text>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footerRow}>
        <HelpMenu />
        <Button
          appearance="primary"
          onClick={handleContinue}
          disabled={isContinueDisabled}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};
