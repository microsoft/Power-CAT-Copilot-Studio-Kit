/**
 * McpAppDialog — Details dialog for an MCP (Model Context Protocol) app.
 *
 * READ-ONLY display of a single McpApp. MCP apps are not installed into the
 * environment. Layout mirrors Figma node 2546:30907:
 *   icon + title + "MCP App" badge + dismiss
 *   → short description paragraph
 *   → category tags
 *   → "About this app" section
 *   → footer: Learn more (secondary) + Download (primary)
 *
 * Learn more opens the source repo; Download opens the GitHub ZIP — both in a
 * new tab.
 */

import React from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  Body1,
  Button,
  Tag,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Dismiss20Regular,
  ArrowDownload20Regular,
  Apps16Regular,
  Info20Regular,
} from '@fluentui/react-icons';

import { DialogSection } from './DialogSection';
import { SquircleIcon } from './SquircleIcon';
import type { McpApp } from '../contracts/types';

interface McpAppDialogProps {
  item: McpApp;
  onClose: () => void;
}

const useStyles = makeStyles({
  surface: {
    borderRadius: tokens.borderRadiusXLarge,
    maxWidth: '682px',
    width: '682px',
    padding: tokens.spacingHorizontalXXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    paddingBottom: '16px',
    flex: '1 1 auto',
    overflowY: 'auto',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '28px',
    flex: '1 1 0',
    minWidth: 0,
    color: tokens.colorNeutralForeground1,
    margin: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    backgroundColor: tokens.colorNeutralBackground5,
    borderRadius: '9999px',
    paddingLeft: '8px',
    paddingRight: '8px',
    height: '24px',
    minWidth: '24px',
    flexShrink: 0,
  },
  badgeText: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: '16px',
    color: tokens.colorNeutralForeground3,
    paddingLeft: '2px',
    paddingRight: '2px',
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusSmall,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: '4px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  descriptionArea: {
    color: tokens.colorNeutralForeground2,
    lineHeight: '20px',
    paddingTop: '8px',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
});

const McpAppDialog: React.FC<McpAppDialogProps> = ({ item, onClose }) => {
  const styles = useStyles();
  const categories = item.categories ?? [];

  const openInNewTab = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface} aria-labelledby="mcp-app-dialog-title">
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden' }}>
          <div className={styles.content}>

            {/* Header: icon + title + badge + dismiss */}
            <div>
              <div className={styles.headerRow}>
                <SquircleIcon
                  iconName={item.icon}
                  iconGradient={item.iconGradient}
                  iconSvg={item.iconSvg}
                  iconColor={item.iconColor}
                  size={48}
                />
                <h2 id="mcp-app-dialog-title" className={styles.title}>
                  {item.name}
                </h2>
                <span className={styles.badge}>
                  <Apps16Regular style={{ fontSize: '16px', color: tokens.colorNeutralForeground3 }} />
                  <span className={styles.badgeText}>MCP App</span>
                </span>
                <button
                  className={styles.dismissBtn}
                  onClick={onClose}
                  aria-label="Close"
                  type="button"
                >
                  <Dismiss20Regular />
                </button>
              </div>

              {/* Short description */}
              <div className={styles.descriptionArea}>
                <Body1>{item.description}</Body1>
              </div>
            </div>

            {/* Category tags */}
            {categories.length > 0 && (
              <div className={styles.tagRow} role="list" aria-label="Categories">
                {categories.map((cat) => (
                  <Tag key={cat} role="listitem" appearance="outline" size="small" shape="rounded">
                    {cat}
                  </Tag>
                ))}
              </div>
            )}

            {/* About this app */}
            {(item.aboutApp || item.description) && (
              <DialogSection icon={<Info20Regular />} label="About this app" isLast>
                <Body1>{item.aboutApp ?? item.description}</Body1>
              </DialogSection>
            )}
          </div>

          {/* Footer — Learn more (secondary) + Download (primary) */}
          <div className={styles.footer}>
            {item.learnMoreUrl && (
              <Button
                appearance="secondary"
                onClick={() => openInNewTab(item.learnMoreUrl)}
              >
                Learn more
              </Button>
            )}
            <Button
              appearance="primary"
              icon={<ArrowDownload20Regular />}
              onClick={() => openInNewTab(item.downloadUrl)}
              disabled={!item.downloadUrl}
            >
              Download
            </Button>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default McpAppDialog;
