/**
 * ComponentCard — compact horizontal gallery card for the Component Library.
 *
 * Implements the compact horizontal layout from ui-spec-gallery-view.json:
 *   - Card with appearance="filled" and borderRadiusLarge (Cards.md Layout 1 / custom compact)
 *   - Row layout: icon image (40px) left, info column (title + description) right
 *   - Entire card is clickable (no footer button) per Cards.md §IF FOOTER HAS ONLY 1 CTA
 *   - Icon uses PNG image from assets, falls back to Fluent UI icon with palette background
 */

import React from 'react';
import {
  Card,
  Subtitle2,
  Caption1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  DocumentText24Regular,
  Search24Regular,
  DocumentBulletList24Regular,
  PlugConnected24Regular,
  Hexagon24Regular,
  BrainCircuit24Regular,
  ChatHistory24Regular,
} from '@fluentui/react-icons';
import type { ComponentWithInstallState } from '../contracts/types';

// ---------------------------------------------------------------------------
// Static icon lookup — fallback when no iconImage is provided.
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  DocumentText24Regular,
  Search24Regular,
  DocumentBulletList24Regular,
  PlugConnected24Regular,
  Hexagon24Regular,
  BrainCircuit24Regular,
  ChatHistory24Regular,
};

// ---------------------------------------------------------------------------
// Icon color palette token map — fallback for Fluent UI icon circle.
// ---------------------------------------------------------------------------
const iconColorTokenMap: Record<string, string> = {
  Teal: tokens.colorPaletteTealBackground2,
  Green: tokens.colorPaletteGreenBackground2,
  Orange: tokens.colorPaletteMarigoldBackground2,
  Blue: tokens.colorPaletteRoyalBlueBackground2,
  Purple: tokens.colorPaletteLavenderBackground2,
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  /** Filled card — fixed height for uniform grid alignment. */
  card: {
    borderRadius: tokens.borderRadiusLarge,
    cursor: 'pointer',
    width: '100%',
    padding: '0',
    height: '120px',
  },

  bodyRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    height: '100%',
  },

  /** Icon container — 40×40px for both image and Fluent UI icon fallback. */
  iconCircle: {
    width: '40px',
    height: '40px',
    minWidth: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },

  iconImage: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },

  icon: {
    fontSize: '20px',
    width: '20px',
    height: '20px',
    color: tokens.colorNeutralForegroundOnBrand,
  },

  infoColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: '1 1 0',
    minWidth: 0,
  },

  titleRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },

  title: {
    color: tokens.colorNeutralForeground1,
  },

  description: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ComponentCardProps {
  component: ComponentWithInstallState;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ComponentCard: React.FC<ComponentCardProps> = ({ component, onClick }) => {
  const styles = useStyles();

  const IconComponent = ICON_MAP[component.icon] ?? Hexagon24Regular;
  const iconBgColor =
    iconColorTokenMap[component.iconColor] ?? tokens.colorNeutralBackground3;

  return (
    <Card
      appearance="filled"
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={component.name}
    >
      <div className={styles.bodyRow}>
        {/* Icon — PNG image or Fluent UI icon fallback */}
        {component.iconImage ? (
          <img
            src={component.iconImage}
            alt=""
            className={styles.iconImage}
            aria-hidden="true"
          />
        ) : (
          <div
            className={styles.iconCircle}
            style={{ backgroundColor: iconBgColor }}
            aria-hidden="true"
          >
            <IconComponent className={styles.icon} />
          </div>
        )}

        <div className={styles.infoColumn}>
          <div className={styles.titleRow}>
            <Subtitle2 className={styles.title}>{component.name}</Subtitle2>
          </div>
          <Caption1 className={styles.description}>
            {component.description}
          </Caption1>
        </div>
      </div>
    </Card>
  );
};

export default React.memo(ComponentCard);
