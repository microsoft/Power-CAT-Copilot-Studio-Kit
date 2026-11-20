import React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { ICON_MAP, ICON_COLOR_TOKEN_MAP } from '../utils/iconMap';

interface SquircleIconProps {
  /**
   * CSS gradient for the squircle background. When set, iconSvg is rendered
   * at 65% on top of the gradient. When omitted *and* iconSvg is provided,
   * the icon is treated as a full-bleed self-contained tile (the image is
   * its own squircle) and rendered at full container size.
   */
  iconGradient?: string;
  /** Fluent icon name key from ICON_MAP */
  iconName?: string;
  /** SVG/PNG image URL for the icon (takes precedence over iconName) */
  iconSvg?: string;
  /** Fallback flat color key (used when iconGradient is not provided) */
  iconColor?: string;
  /** Icon size in px (default 48) */
  size?: number;
}

const useStyles = makeStyles({
  container: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: '12px',
    overflow: 'hidden',
  },
  fluentIcon: {
    color: 'white',
    position: 'relative',
    zIndex: 1,
  },
  svgIcon: {
    position: 'relative',
    zIndex: 1,
  },
});

export const SquircleIcon: React.FC<SquircleIconProps> = React.memo(({
  iconGradient,
  iconName,
  iconSvg,
  iconColor = 'Blue',
  size = 48,
}) => {
  const styles = useStyles();
  const IconComponent = iconName ? ICON_MAP[iconName] : undefined;
  const bgColor = ICON_COLOR_TOKEN_MAP[iconColor] || tokens.colorBrandBackground;

  // Full-bleed mode: caller provided an iconSvg but no gradient — the image
  // is a self-contained tile, so render it at full size with no wrapper bg.
  const fullBleed = Boolean(iconSvg) && !iconGradient;
  const innerSize = fullBleed ? size : Math.round(size * 0.65);

  return (
    <div
      className={styles.container}
      style={{
        width: size,
        height: size,
        backgroundImage: iconGradient || undefined,
        backgroundColor: fullBleed ? 'transparent' : (iconGradient ? '#FFFFFF' : bgColor),
      }}
      aria-hidden="true"
    >
      {iconSvg ? (
        <img
          src={iconSvg}
          alt=""
          className={styles.svgIcon}
          style={{ width: innerSize, height: innerSize }}
        />
      ) : IconComponent ? (
        <IconComponent
          className={styles.fluentIcon}
          style={{ fontSize: innerSize }}
        />
      ) : null}
    </div>
  );
});

SquircleIcon.displayName = 'SquircleIcon';
