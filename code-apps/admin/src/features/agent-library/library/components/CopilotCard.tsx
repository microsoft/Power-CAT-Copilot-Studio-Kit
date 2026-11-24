import React from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  Caption1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Sparkle16Regular, Apps16Regular, Edit16Regular } from '@fluentui/react-icons';
import type { CopilotCardProps } from '../contracts/types';
import { useAgentLibrary, useUserRole } from '../provider/AgentLibraryProvider';
import { SquircleIcon } from './SquircleIcon';
import { TemplateBadge } from './TemplateBadge';
import { PublishStatusBadge } from './PublishStatusBadge';

/**
 * CopilotCard — gallery card for the Agent Library.
 *
 * Figma (node 1687:17850):
 * - Card: padding 16px, border-radius 8px, shadow04, white bg
 * - Content: flex column, gap 12px
 * - Header: flex row, gap 12px, align-items center, height 48px
 * - Description: 3-line clamp for templates, none for components
 */
const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.14), 0px 0px 2px rgba(0,0,0,0.12)',
    cursor: 'pointer',
    overflow: 'hidden',
    width: '100%',
    ':hover': {
      boxShadow: tokens.shadow8,
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: '2px',
    },
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    alignSelf: 'stretch',
  },
  coreItems: {
    display: 'flex',
    flex: '1 0 0',
    gap: '12px',
    alignItems: 'center',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  nameColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flex: '1 0 0',
    paddingBottom: '4px',
  },
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    color: tokens.colorNeutralForeground4,
  },
  description: {
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    lineHeight: '20px',
    height: '60px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    width: '100%',
  },
  editButton: {
    flexShrink: 0,
  },
});

export const CopilotCard: React.FC<CopilotCardProps> = React.memo(({ item, onClick, onEdit }) => {
  const styles = useStyles();
  const { host } = useAgentLibrary();
  const isAdmin = useUserRole() === 'admin';
  const isTemplate = item.type === 'template';
  const isMcpApp = item.type === 'mcp-app';
  const subtitle = isTemplate
    ? (item.agentType === 'declarative' ? 'Declarative agent' : 'Custom agent')
    : isMcpApp
      ? 'MCP App'
      : 'Component collection';
  // Template origin chip — defaults to 'system' until custom authoring ships.
  const isCustom = isTemplate && item.source === 'custom';
  // Publish status applies to custom templates only; system templates omit it.
  // Visible to admins only — makers don't see publish status.
  const publishStatus = isCustom ? (item.publishStatus ?? 'active') : undefined;
  const showStatus = isCustom && isAdmin;

  return (
    <div
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}, ${subtitle}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.coreItems}>
            <SquircleIcon
              iconName={item.icon}
              iconGradient={item.iconGradient}
              iconSvg={item.iconSvg}
              iconColor={item.iconColor}
              size={48}
            />
            <div className={styles.nameColumn}>
              <Body1Strong className={styles.title}>{item.name}</Body1Strong>
              <Caption1 className={styles.subtitle}>
                {subtitle}
              </Caption1>
            </div>
          </div>
          {isCustom && onEdit && (
            <Button
              className={styles.editButton}
              appearance="subtle"
              size="small"
              icon={<Edit16Regular />}
              aria-label={`Edit ${item.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            />
          )}
        </div>

        {(isTemplate || isMcpApp) && (
          <Body1 className={styles.description}>
            {item.cardDescription || item.description}
          </Body1>
        )}

        {/* Source badge is hidden for the `hpa` host. */}
        {isTemplate && host !== 'hpa' && (
          <div className={styles.chipRow}>
            {isCustom ? (
              <TemplateBadge label="Custom" icon={<Sparkle16Regular />} />
            ) : (
              <TemplateBadge label="System" icon={<Apps16Regular />} />
            )}
            {/* Active/Inactive status is shown for custom templates to admins only. */}
            {showStatus && publishStatus && <PublishStatusBadge status={publishStatus} />}
          </div>
        )}

        {/* MCP apps show all of their categories as outline tags. */}
        {item.type === 'mcp-app' && item.categories && item.categories.length > 0 && (
          <div className={styles.chipRow} style={{ justifyContent: 'flex-start' }}>
            {item.categories.map((cat) => (
              <TemplateBadge key={cat} label={cat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

CopilotCard.displayName = 'CopilotCard';
